import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EditTicketForm } from "@/components/tickets/edit-ticket-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { canOnTicket, ticketRefSelect } from "@/lib/permissions";
import { getActiveCategories, getTags } from "@/lib/tickets/queries";

export const metadata: Metadata = { title: "Edit ticket" };

export default async function EditTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();

  const ticket = await db.ticket.findUnique({
    where: { id },
    select: {
      ...ticketRefSelect,
      ticketNumber: true,
      subject: true,
      description: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      tags: { select: { tagId: true } },
    },
  });
  // Same 404 whether the ticket is missing, hidden, or not editable by this user.
  if (!ticket || !canOnTicket(toActor(user), ticket, "edit")) notFound();

  const [activeCategories, tags] = await Promise.all([getActiveCategories(), getTags()]);

  // Keep the current category selectable even if it has since been deactivated.
  const categories =
    ticket.category && !activeCategories.some((c) => c.id === ticket.category?.id)
      ? [...activeCategories, ticket.category]
      : activeCategories;

  return (
    <div className="max-w-3xl space-y-4">
      <Link
        href={`/tickets/${ticket.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to {ticket.ticketNumber}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit {ticket.ticketNumber}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditTicketForm
            ticket={{
              id: ticket.id,
              subject: ticket.subject,
              description: ticket.description,
              categoryId: ticket.categoryId,
              tagIds: ticket.tags.map((row) => row.tagId),
            }}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            tags={tags}
          />
        </CardContent>
      </Card>
    </div>
  );
}
