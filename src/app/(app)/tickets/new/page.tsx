import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, toActor } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getActiveCategories } from "@/lib/tickets/queries";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ followUpOf?: string | string[] }>;
}) {
  const user = await requireUser();
  if (!can(toActor(user), "ticket.create")) notFound();

  const params = await searchParams;
  const followUpParam = Array.isArray(params.followUpOf) ? params.followUpOf[0] : params.followUpOf;

  // A follow-up may only point at the user's own closed ticket.
  const original =
    followUpParam && /^[a-z0-9]{1,40}$/i.test(followUpParam)
      ? await db.ticket.findFirst({
          where: {
            id: followUpParam,
            requesterId: user.id,
            status: "CLOSED",
            deletedAt: null,
          },
          select: { id: true, ticketNumber: true, subject: true },
        })
      : null;
  if (followUpParam && !original) notFound();

  const categories = await getActiveCategories();

  return (
    <div className="max-w-3xl space-y-4">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to tickets
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{original ? "Create follow-up ticket" : "New ticket"}</CardTitle>
          <CardDescription>
            {original ? (
              <>
                Follow-up to{" "}
                <Link href={`/tickets/${original.id}`} className="text-primary hover:underline">
                  {original.ticketNumber}
                </Link>
                : {original.subject}
              </>
            ) : (
              "Tell us what is going on and we will get back to you."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tickets cannot be created yet because no categories have been set up. Ask an
              administrator to add one.
            </p>
          ) : (
            <NewTicketForm categories={categories} followUpOfId={original?.id} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
