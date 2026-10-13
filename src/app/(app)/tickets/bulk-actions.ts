"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { can, ForbiddenError, NotFoundError, ticketScope } from "@/lib/permissions";
import { TicketError } from "@/lib/tickets/errors";
import { addTag, assignTicket, changePriority, changeStatus } from "@/lib/tickets/service";
import { field } from "@/lib/validation/auth";

const id = z.string().regex(/^[a-z0-9]{1,40}$/i);

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    value: z.enum(["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CANCELLED"]),
  }),
  z.object({
    action: z.literal("priority"),
    value: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  }),
  z.object({
    action: z.literal("assign"),
    value: z.string().regex(/^[a-z0-9]{0,40}:[a-z0-9]{0,40}$/i),
  }),
  z.object({ action: z.literal("tag"), value: id }),
]);

const idsSchema = z.array(id).min(1).max(50);

/**
 * Applies one change to many tickets. Team leads and admins only.
 * Each ticket goes through the same service function as a single edit, so
 * every permission and lifecycle rule is checked per ticket. Tickets that
 * fail a rule are skipped and reported; the rest are still updated.
 */
export async function bulkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const actor = toActor(user);

  if (!can(actor, "ticket.bulk")) {
    return { error: "You do not have permission to do that." };
  }

  const ids = idsSchema.safeParse(
    [...new Set(formData.getAll("ticketIds").filter((v): v is string => typeof v === "string"))],
  );
  if (!ids.success) return { error: "Select between 1 and 50 tickets." };

  const parsed = bulkSchema.safeParse({
    action: field(formData, "action"),
    value: field(formData, "value"),
  });
  if (!parsed.success) return { error: "Choose an action and a value." };
  const change = parsed.data;

  // Only tickets this user can see. Anything else is treated as not selected.
  const tickets = await db.ticket.findMany({
    where: { AND: [{ id: { in: ids.data } }, ticketScope(actor)] },
    orderBy: { ticketNumber: "asc" },
    select: { id: true, ticketNumber: true },
  });
  if (tickets.length === 0) return { error: "None of the selected tickets could be found." };

  let updated = 0;
  const skipped: string[] = [];

  for (const ticket of tickets) {
    try {
      if (change.action === "status") {
        await changeStatus(actor, ticket.id, change.value);
      } else if (change.action === "priority") {
        await changePriority(actor, ticket.id, change.value);
      } else if (change.action === "tag") {
        await addTag(actor, ticket.id, change.value);
      } else {
        const [teamId, assigneeId] = change.value.split(":");
        await assignTicket(actor, ticket.id, {
          teamId: teamId || null,
          assigneeId: assigneeId || null,
        });
      }
      updated += 1;
    } catch (error) {
      if (error instanceof TicketError || error instanceof ForbiddenError) {
        skipped.push(`${ticket.ticketNumber} (${error.message})`);
      } else if (error instanceof NotFoundError) {
        skipped.push(`${ticket.ticketNumber} (not found)`);
      } else {
        throw error;
      }
    }
  }

  revalidatePath("/tickets");
  revalidatePath("/dashboard");

  const result: FormState = {};
  if (updated > 0) {
    result.success = `Updated ${updated === 1 ? "1 ticket" : `${updated} tickets`}.`;
  }
  if (skipped.length > 0) {
    const shown = skipped.slice(0, 5).join("; ");
    const more = skipped.length > 5 ? `; and ${skipped.length - 5} more` : "";
    result.error = `Skipped ${skipped.length}: ${shown}${more}`;
  }
  return result;
}
