import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Pencil } from "lucide-react";
import {
  assignAction,
  assignToMeAction,
  changePriorityAction,
  changeStatusAction,
} from "@/app/(app)/tickets/actions";
import { PriorityBadge, RoleBadge, StatusBadge } from "@/components/ticket-badges";
import { ActionForm } from "@/components/tickets/action-form";
import { AttachmentList } from "@/components/tickets/attachment-list";
import { ReplyForm } from "@/components/tickets/reply-form";
import { SlaTimer } from "@/components/tickets/sla-timer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser, toActor } from "@/lib/auth/session";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";
import {
  allowedTransitions,
  canAssign,
  canOnTicket,
  NotFoundError,
} from "@/lib/permissions";
import {
  getAssignGroups,
  getCannedResponses,
  getTicketDetail,
  type TicketDetail,
} from "@/lib/tickets/queries";
import { describeEvent } from "@/lib/tickets/timeline";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Ticket" };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const actor = toActor(user);
  const { id } = await params;

  let detail: TicketDetail;
  try {
    // Throws NotFoundError for a missing ticket and for one this user may not see.
    detail = await getTicketDetail(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { ticket, access, messages, descriptionAttachments, events, names } = detail;
  const isStaffView = access === "staff";
  const isOwnTicket = ticket.requesterId === user.id;

  const canReply = canOnTicket(actor, ticket, "reply");
  const canNote = canOnTicket(actor, ticket, "note");
  const canEdit = canOnTicket(actor, ticket, "edit");
  const canSetPriority = canOnTicket(actor, ticket, "setPriority");
  const transitions = allowedTransitions(actor, ticket);

  const canClaim =
    isStaffView &&
    ticket.assigneeId !== user.id &&
    canAssign(actor, ticket, {
      teamId: ticket.teamId,
      assignee: { id: user.id, role: user.role, teamIds: user.teamIds },
    });

  const [assignGroups, canned] = await Promise.all([
    isStaffView ? getAssignGroups(actor, ticket) : [],
    canNote ? getCannedResponses(actor) : [],
  ]);

  const currentAssignValue = `${ticket.teamId ?? ""}:${ticket.assigneeId ?? ""}`;
  const assignValues = assignGroups.flatMap((group) => group.options.map((o) => o.value));

  const ended = ticket.status === "CLOSED" || ticket.status === "CANCELLED";

  return (
    <div className="space-y-4">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to tickets
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="font-mono text-xs text-muted-foreground">{ticket.ticketNumber}</p>
          <h1 className="break-words text-xl font-semibold">{ticket.subject}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {isStaffView && ticket.escalationLevel > 0 ? (
              <Badge className="border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300">
                {ticket.escalationLevel === 2 ? "Escalated to admins" : "Escalated to team leads"}
              </Badge>
            ) : null}
            {ticket.reopenCount > 0 ? (
              <Badge className="border-border bg-muted text-muted-foreground">
                Reopened {ticket.reopenCount === 1 ? "once" : `${ticket.reopenCount} times`}
              </Badge>
            ) : null}
          </div>
        </div>
        {canEdit ? (
          <Link
            href={`/tickets/${ticket.id}/edit`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </Link>
        ) : null}
      </div>

      {ticket.followUpOf ? (
        <p className="text-sm text-muted-foreground">
          Follow-up to{" "}
          <Link href={`/tickets/${ticket.followUpOf.id}`} className="text-primary hover:underline">
            {ticket.followUpOf.ticketNumber}
          </Link>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Conversation ── */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{ticket.requester.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(ticket.createdAt)}
                </p>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                {ticket.description}
              </p>
              <AttachmentList attachments={descriptionAttachments} />
            </CardContent>
          </Card>

          <section aria-label="Conversation" className="space-y-3">
            {messages.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No replies yet.
              </p>
            ) : (
              messages.map((message) => {
                const isNote = message.type === "INTERNAL_NOTE";
                return (
                  <article
                    key={message.id}
                    data-message-type={message.type}
                    className={cn(
                      "rounded-lg border p-4",
                      isNote
                        ? "border-amber-500/50 bg-amber-50 dark:bg-amber-950/30"
                        : "bg-card",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{message.author.name}</p>
                        {message.author.role !== "REQUESTER" ? (
                          <RoleBadge role={message.author.role} />
                        ) : null}
                        {isNote ? (
                          <Badge className="border-amber-500/50 bg-amber-500/20 text-amber-800 dark:text-amber-200">
                            <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                            Internal note
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(message.createdAt)}
                      </p>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm">{message.body}</p>
                    <AttachmentList attachments={message.attachments} />
                  </article>
                );
              })
            )}
          </section>

          {canReply ? (
            <ReplyForm
              ticketId={ticket.id}
              canNote={canNote}
              canned={canned}
              variables={{
                requester_name: ticket.requester.name,
                ticket_number: ticket.ticketNumber,
                ticket_subject: ticket.subject,
                agent_name: user.name,
              }}
            />
          ) : (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p>
                {ticket.status === "CLOSED"
                  ? "This ticket is closed and can no longer be changed."
                  : "This ticket was cancelled and can no longer be changed."}
              </p>
              {ticket.status === "CLOSED" && isOwnTicket ? (
                <Link
                  href={`/tickets/new?followUpOf=${ticket.id}`}
                  className={cn(buttonVariants({ size: "sm" }), "mt-3")}
                >
                  Create follow-up ticket
                </Link>
              ) : null}
            </div>
          )}

          {ticket.followUps.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Follow-up tickets:{" "}
              {ticket.followUps.map((followUp, index) => (
                <span key={followUp.id}>
                  {index > 0 ? ", " : ""}
                  <Link href={`/tickets/${followUp.id}`} className="text-primary hover:underline">
                    {followUp.ticketNumber}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="break-words">
                        <span className="font-medium">
                          {event.actor ? event.actor.name : "System"}
                        </span>{" "}
                        {describeEvent(event, names)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* ── Right panel ── */}
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Row label="Status">
                {isStaffView && transitions.length > 0 ? (
                  <ActionForm action={changeStatusAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <Select
                      name="status"
                      aria-label="Change status"
                      defaultValue=""
                      required
                      className="min-w-0 flex-1"
                    >
                      <option value="" disabled>
                        {STATUS_LABEL[ticket.status]}
                      </option>
                      {transitions.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="sm" variant="outline" className="h-9">
                      Update
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <StatusBadge status={ticket.status} />
                )}
              </Row>

              <Row label="Priority">
                {canSetPriority ? (
                  <ActionForm action={changePriorityAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <Select
                      name="priority"
                      aria-label="Change priority"
                      defaultValue={ticket.priority}
                      key={ticket.priority}
                      className="min-w-0 flex-1"
                    >
                      {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {PRIORITY_LABEL[priority]}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="sm" variant="outline" className="h-9">
                      Update
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <PriorityBadge priority={ticket.priority} />
                )}
              </Row>

              <Row label="Assignee">
                {assignGroups.length > 0 ? (
                  <ActionForm action={assignAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <Select
                      name="target"
                      aria-label="Assign ticket"
                      defaultValue={assignValues.includes(currentAssignValue) ? currentAssignValue : ""}
                      key={currentAssignValue}
                      required
                      className="min-w-0 flex-1"
                    >
                      {assignValues.includes(currentAssignValue) ? null : (
                        <option value="" disabled>
                          {ticket.assignee ? ticket.assignee.name : "Unassigned"}
                        </option>
                      )}
                      {assignGroups.map((group) => (
                        <optgroup key={group.teamId} label={group.teamName}>
                          {group.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                    <SubmitButton size="sm" variant="outline" className="h-9">
                      Assign
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <p>
                    {ticket.assignee ? (
                      ticket.assignee.name
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </p>
                )}
                {canClaim ? (
                  <ActionForm action={assignToMeAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <SubmitButton size="sm" variant="outline">
                      Assign to me
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </Row>

              <Row label="Team">
                {ticket.team ? (
                  ticket.team.name
                ) : (
                  <span className="text-muted-foreground">No team</span>
                )}
              </Row>

              <Row label="Category">
                {ticket.category ? (
                  ticket.category.name
                ) : (
                  <span className="text-muted-foreground">Uncategorised</span>
                )}
              </Row>

              {isStaffView ? (
                <Row label="Tags">
                  {ticket.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ticket.tags.map(({ tag }) => (
                        <Badge key={tag.id} className="border-border bg-muted text-foreground">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No tags</span>
                  )}
                </Row>
              ) : null}

              {isStaffView ? (
                <Row label="Requester">
                  <p>{ticket.requester.name}</p>
                  <p className="break-all text-xs text-muted-foreground">
                    {ticket.requester.email}
                    {ticket.requester.company ? ` · ${ticket.requester.company}` : ""}
                  </p>
                </Row>
              ) : null}

              <Row label="Created">{formatDateTime(ticket.createdAt)}</Row>
              <Row label="Last updated">{formatDateTime(ticket.updatedAt)}</Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SLA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SlaTimer
                label="First response"
                startedAt={ticket.createdAt}
                dueAt={ticket.firstResponseDueAt}
                completedAt={ticket.firstRespondedAt}
                pausedAt={ticket.slaPausedAt}
                stopped={ended || ticket.status === "RESOLVED"}
              />
              <SlaTimer
                label="Resolution"
                startedAt={ticket.createdAt}
                dueAt={ticket.resolutionDueAt}
                completedAt={ticket.resolvedAt}
                pausedAt={ticket.slaPausedAt}
                stopped={ended}
              />
            </CardContent>
          </Card>

          {!isStaffView && transitions.some((s) => s === "CANCELLED" || s === "IN_PROGRESS") ? (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticket.status === "RESOLVED" && transitions.includes("IN_PROGRESS") ? (
                  <ActionForm action={changeStatusAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="status" value="IN_PROGRESS" />
                    <SubmitButton size="sm">Reopen ticket</SubmitButton>
                  </ActionForm>
                ) : null}
                {transitions.includes("CANCELLED") ? (
                  <ActionForm action={changeStatusAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="status" value="CANCELLED" />
                    <SubmitButton size="sm" variant="destructive">
                      Cancel ticket
                    </SubmitButton>
                  </ActionForm>
                ) : null}
                {ticket.status === "WAITING_ON_CUSTOMER" &&
                !transitions.includes("CANCELLED") ? (
                  <p className="text-sm text-muted-foreground">
                    We are waiting for your reply. Replying moves this ticket back to
                    In progress.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
