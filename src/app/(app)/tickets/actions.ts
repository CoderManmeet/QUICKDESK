"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prepareFiles } from "@/lib/attachments";
import { requireUser, toActor } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { TicketError } from "@/lib/tickets/errors";
import {
  addMessage,
  assignTicket,
  changePriority,
  changeStatus,
  claimTicket,
  createTicket,
  updateTicket,
} from "@/lib/tickets/service";
import { field } from "@/lib/validation/auth";
import {
  assignSchema,
  createTicketSchema,
  prioritySchema,
  replySchema,
  statusSchema,
  ticketIdSchema,
  updateTicketSchema,
} from "@/lib/validation/tickets";

/** Turns expected failures into a form message. Anything else is a real error. */
function failure(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof TicketError || error instanceof ForbiddenError) {
    return { error: error.message, values };
  }
  if (error instanceof NotFoundError) {
    return { error: "This ticket could not be found.", values };
  }
  throw error;
}

function firstError(fieldErrors: Record<string, string[] | undefined>): string {
  for (const messages of Object.values(fieldErrors)) {
    if (messages && messages.length > 0) return messages[0];
  }
  return "That request was not valid.";
}

function refresh(ticketId: string) {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
}

export async function createTicketAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const raw = {
    subject: field(formData, "subject"),
    description: field(formData, "description"),
    categoryId: field(formData, "categoryId"),
    followUpOfId: field(formData, "followUpOfId"),
  };
  const values = {
    subject: raw.subject,
    description: raw.description,
    categoryId: raw.categoryId,
  };

  const parsed = createTicketSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    if (fieldErrors.categoryId) fieldErrors.categoryId = ["Choose a category."];
    return { fieldErrors, values };
  }

  if (!(await rateLimit(`ticket:create:user:${user.id}`, 20, 60 * 60))) {
    return {
      error: "You have created a lot of tickets in the last hour. Please try again later.",
      values,
    };
  }

  let ticketId: string;
  try {
    const files = await prepareFiles(formData);
    const ticket = await createTicket(toActor(user), parsed.data, files);
    ticketId = ticket.id;
  } catch (error) {
    return failure(error, values);
  }

  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticketId}`);
}

export async function replyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = replySchema.safeParse({
    ticketId: field(formData, "ticketId"),
    type: field(formData, "type"),
    body: field(formData, "body"),
  });
  if (!parsed.success) {
    return { error: firstError(parsed.error.flatten().fieldErrors) };
  }

  const { ticketId, type, body } = parsed.data;
  try {
    const files = await prepareFiles(formData);
    await addMessage(toActor(user), ticketId, { type, body }, files);
  } catch (error) {
    return failure(error);
  }

  refresh(ticketId);
  return { success: type === "INTERNAL_NOTE" ? "Note added." : "Reply sent." };
}

export async function changeStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = statusSchema.safeParse({
    ticketId: field(formData, "ticketId"),
    status: field(formData, "status"),
  });
  if (!parsed.success) return { error: "Choose a status." };

  try {
    await changeStatus(toActor(user), parsed.data.ticketId, parsed.data.status);
  } catch (error) {
    return failure(error);
  }

  refresh(parsed.data.ticketId);
  return {};
}

export async function changePriorityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = prioritySchema.safeParse({
    ticketId: field(formData, "ticketId"),
    priority: field(formData, "priority"),
  });
  if (!parsed.success) return { error: "Choose a priority." };

  try {
    await changePriority(toActor(user), parsed.data.ticketId, parsed.data.priority);
  } catch (error) {
    return failure(error);
  }

  refresh(parsed.data.ticketId);
  return {};
}

export async function assignAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = assignSchema.safeParse({
    ticketId: field(formData, "ticketId"),
    target: field(formData, "target"),
  });
  if (!parsed.success) return { error: "Choose who to assign this to." };

  try {
    await assignTicket(toActor(user), parsed.data.ticketId, parsed.data.target);
  } catch (error) {
    return failure(error);
  }

  refresh(parsed.data.ticketId);
  return {};
}

export async function assignToMeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const parsed = ticketIdSchema.safeParse({ ticketId: field(formData, "ticketId") });
  if (!parsed.success) return { error: "This ticket could not be found." };

  try {
    await claimTicket(toActor(user), parsed.data.ticketId);
  } catch (error) {
    return failure(error);
  }

  refresh(parsed.data.ticketId);
  return {};
}

export async function updateTicketAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const raw = {
    ticketId: field(formData, "ticketId"),
    subject: field(formData, "subject"),
    description: field(formData, "description"),
    categoryId: field(formData, "categoryId"),
    tagIds: formData.getAll("tagIds").filter((v): v is string => typeof v === "string"),
  };
  const values = { subject: raw.subject, description: raw.description, categoryId: raw.categoryId };

  const parsed = updateTicketSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  const { ticketId, ...input } = parsed.data;
  try {
    await updateTicket(toActor(user), ticketId, input);
  } catch (error) {
    return failure(error, values);
  }

  refresh(ticketId);
  redirect(`/tickets/${ticketId}`);
}
