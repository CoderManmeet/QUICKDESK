// QuickDesk - src/lib/notifications/notify.ts
//
// Notifications for ticket events. Called by the ticket service after its
// database transaction has committed.
//
//   - In-app notifications are written immediately, so the bell is accurate.
//   - Emails go out after the response has been sent (next/server `after`),
//     so a slow email provider never slows the user down.
//   - Emails respect each user's preferences. In-app notifications always appear.
//   - Nobody is notified about their own action.
//   - Internal notes never notify anyone, so they can never reach a requester.
//   - Failures are logged and swallowed: a notification problem must never
//     undo or block the ticket change that caused it.

import "server-only";
import { after } from "next/server";
import { NotificationType, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { renderTicketEmail } from "@/lib/notifications/email-template";

type PreferenceKey =
  | "emailTicketCreated"
  | "emailPublicReply"
  | "emailAssigned"
  | "emailResolved"
  | "emailSlaWarning";

const recipientSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  deletedAt: true,
  notificationPreference: {
    select: {
      emailTicketCreated: true,
      emailPublicReply: true,
      emailAssigned: true,
      emailResolved: true,
      emailSlaWarning: true,
    },
  },
} as const;

type Recipient = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  deletedAt: Date | null;
  notificationPreference: Record<PreferenceKey, boolean> | null;
};

type EmailSpec = {
  preference: PreferenceKey;
  subject: string;
  heading: string;
  intro: string;
  quote?: string;
};

type TicketInfo = NonNullable<Awaited<ReturnType<typeof loadTicket>>>;

function loadTicket(ticketId: string) {
  return db.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      teamId: true,
      deletedAt: true,
      requester: { select: recipientSelect },
      assignee: { select: recipientSelect },
    },
  });
}

/** Active staff in a team, or every admin when the ticket has no team. */
function teamStaff(teamId: string | null): Promise<Recipient[]> {
  return db.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(teamId
        ? {
            role: { not: Role.REQUESTER },
            teamMemberships: { some: { teamId, team: { deletedAt: null } } },
          }
        : { role: Role.ADMIN }),
    },
    select: recipientSelect,
  });
}

function wantsEmail(recipient: Recipient, key: PreferenceKey): boolean {
  // No saved preferences yet means every email is on.
  return recipient.notificationPreference ? recipient.notificationPreference[key] : true;
}

function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    // Outside a request (scripts, tests): run it without blocking the caller.
    void task();
  }
}

async function deliver(
  ticket: TicketInfo,
  recipients: (Recipient | null)[],
  actorId: string | null,
  notification: { type: NotificationType; title: string; body?: string },
  email: EmailSpec | null,
): Promise<void> {
  const seen = new Set<string>();
  const list = recipients.filter((recipient): recipient is Recipient => {
    if (!recipient || recipient.id === actorId || seen.has(recipient.id)) return false;
    if (!recipient.isActive || recipient.deletedAt) return false;
    seen.add(recipient.id);
    return true;
  });
  if (list.length === 0) return;

  await db.notification.createMany({
    data: list.map((recipient) => ({
      userId: recipient.id,
      type: notification.type,
      title: notification.title,
      body: notification.body ? notification.body.slice(0, 300) : null,
      ticketId: ticket.id,
    })),
  });

  if (email) sendTicketEmails(ticket, list, email);
}

function sendTicketEmails(ticket: TicketInfo, recipients: Recipient[], email: EmailSpec): void {
  const targets = recipients.filter((recipient) => wantsEmail(recipient, email.preference));
  if (targets.length === 0) return;

  runAfterResponse(async () => {
    for (const recipient of targets) {
      const body = renderTicketEmail({
        recipientName: recipient.name,
        subject: email.subject,
        heading: email.heading,
        intro: email.intro,
        quote: email.quote,
        ticketNumber: ticket.ticketNumber,
        ticketSubject: ticket.subject,
        ticketId: ticket.id,
      });
      await sendEmail({
        to: { email: recipient.email, name: recipient.name },
        subject: email.subject,
        html: body.html,
        text: body.text,
      });
    }
  });
}

async function safely(label: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error(`Notification "${label}" failed:`, error);
  }
}

function snippet(text: string, length = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

// ───────────────────────── Events ─────────────────────────

/** New ticket: confirmation email to the requester, alert to the team. */
export async function notifyTicketCreated(ticketId: string, actorId: string): Promise<void> {
  await safely("ticket created", async () => {
    const ticket = await loadTicket(ticketId);
    if (!ticket || ticket.deletedAt) return;

    // Requester: email only, they just did this themselves.
    if (ticket.requester.isActive && !ticket.requester.deletedAt) {
      sendTicketEmails(ticket, [ticket.requester], {
        preference: "emailTicketCreated",
        subject: `[${ticket.ticketNumber}] We received your request: ${ticket.subject}`,
        heading: "We received your request",
        intro: "Thanks for getting in touch. Our team will reply here as soon as possible.",
      });
    }

    await deliver(
      ticket,
      await teamStaff(ticket.teamId),
      actorId,
      {
        type: NotificationType.TICKET_CREATED,
        title: `New ticket ${ticket.ticketNumber}`,
        body: ticket.subject,
      },
      {
        preference: "emailTicketCreated",
        subject: `[${ticket.ticketNumber}] New ticket: ${ticket.subject}`,
        heading: "New ticket in your queue",
        intro: `${ticket.requester.name} opened a new ticket.`,
      },
    );
  });
}

/**
 * Public reply. Staff reply → the requester. Requester reply → the assignee,
 * or the whole team while the ticket is unassigned.
 * Never call this for internal notes.
 */
export async function notifyPublicReply(
  ticketId: string,
  messageId: string,
  actorId: string,
  authorSide: "staff" | "requester",
): Promise<void> {
  await safely("public reply", async () => {
    const [ticket, message] = await Promise.all([
      loadTicket(ticketId),
      db.ticketMessage.findUnique({
        where: { id: messageId },
        select: { type: true, body: true, author: { select: { name: true } } },
      }),
    ]);
    if (!ticket || ticket.deletedAt || !message) return;
    // Belt and braces: an internal note must never reach this point.
    if (message.type !== "PUBLIC_REPLY") return;

    if (authorSide === "staff") {
      await deliver(
        ticket,
        [ticket.requester],
        actorId,
        {
          type: NotificationType.PUBLIC_REPLY,
          title: `New reply on ${ticket.ticketNumber}`,
          body: `${message.author.name}: ${snippet(message.body)}`,
        },
        {
          preference: "emailPublicReply",
          subject: `[${ticket.ticketNumber}] New reply: ${ticket.subject}`,
          heading: "You have a new reply",
          intro: `${message.author.name} replied to your ticket.`,
          quote: message.body,
        },
      );
      return;
    }

    const recipients = ticket.assignee ? [ticket.assignee] : await teamStaff(ticket.teamId);
    await deliver(
      ticket,
      recipients,
      actorId,
      {
        type: NotificationType.PUBLIC_REPLY,
        title: `${ticket.requester.name} replied on ${ticket.ticketNumber}`,
        body: snippet(message.body),
      },
      {
        preference: "emailPublicReply",
        subject: `[${ticket.ticketNumber}] New reply from ${ticket.requester.name}: ${ticket.subject}`,
        heading: "The requester replied",
        intro: `${ticket.requester.name} replied to the ticket.`,
        quote: message.body,
      },
    );
  });
}

export async function notifyAssigned(
  ticketId: string,
  assigneeId: string,
  /** null when automation assigned the ticket. */
  actorId: string | null,
): Promise<void> {
  await safely("assigned", async () => {
    const ticket = await loadTicket(ticketId);
    if (!ticket || ticket.deletedAt || !ticket.assignee || ticket.assignee.id !== assigneeId) {
      return;
    }
    await deliver(
      ticket,
      [ticket.assignee],
      actorId,
      {
        type: NotificationType.ASSIGNED,
        title: `${ticket.ticketNumber} was assigned to you`,
        body: ticket.subject,
      },
      {
        preference: "emailAssigned",
        subject: `[${ticket.ticketNumber}] Assigned to you: ${ticket.subject}`,
        heading: "A ticket was assigned to you",
        intro: "This ticket is now yours to work on.",
      },
    );
  });
}

export async function notifyResolved(ticketId: string, actorId: string): Promise<void> {
  await safely("resolved", async () => {
    const ticket = await loadTicket(ticketId);
    if (!ticket || ticket.deletedAt) return;
    await deliver(
      ticket,
      [ticket.requester],
      actorId,
      {
        type: NotificationType.STATUS_RESOLVED,
        title: `${ticket.ticketNumber} was resolved`,
        body: "Reply on the ticket if the problem is not fixed.",
      },
      {
        preference: "emailResolved",
        subject: `[${ticket.ticketNumber}] Resolved: ${ticket.subject}`,
        heading: "Your ticket was resolved",
        intro:
          "We have marked this ticket as resolved. If anything is still wrong, reply on the ticket and it will reopen. Otherwise it closes automatically after 7 days.",
      },
    );
  });
}

/**
 * SLA target about to be missed. Sent to the assignee, or the team when
 * unassigned. Triggered by the scheduled SLA job (Phase 5).
 */
export async function notifySlaWarning(
  ticketId: string,
  target: "first response" | "resolution",
  dueAt: Date,
): Promise<void> {
  await safely("sla warning", async () => {
    const ticket = await loadTicket(ticketId);
    if (!ticket || ticket.deletedAt) return;
    const recipients = ticket.assignee ? [ticket.assignee] : await teamStaff(ticket.teamId);
    const due = dueAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
    await deliver(
      ticket,
      recipients,
      null,
      {
        type: NotificationType.SLA_WARNING,
        title: `${ticket.ticketNumber}: ${target} due soon`,
        body: `Due ${due}`,
      },
      {
        preference: "emailSlaWarning",
        subject: `[${ticket.ticketNumber}] SLA warning: ${target} due ${due}`,
        heading: `The ${target} target is about to be missed`,
        intro: `The ${target} target for this ticket is due ${due}.`,
      },
    );
  });
}

/** Team leads of a team; every admin when the team has none (or there is no team). */
async function teamLeads(teamId: string | null): Promise<Recipient[]> {
  if (teamId) {
    const leads = await db.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: Role.TEAM_LEAD,
        teamMemberships: { some: { teamId } },
      },
      select: recipientSelect,
    });
    if (leads.length > 0) return leads;
  }
  return admins();
}

function admins(): Promise<Recipient[]> {
  return db.user.findMany({
    where: { isActive: true, deletedAt: null, role: Role.ADMIN },
    select: recipientSelect,
  });
}

/**
 * SLA breach escalation. Level 1 (first target missed) goes to the team
 * leads, level 2 (second target missed) goes to the admins.
 * Emails follow each person's "SLA warnings" preference.
 */
export async function notifyEscalation(ticketId: string, level: 1 | 2): Promise<void> {
  await safely("escalation", async () => {
    const ticket = await loadTicket(ticketId);
    if (!ticket || ticket.deletedAt) return;
    const recipients = level === 1 ? await teamLeads(ticket.teamId) : await admins();
    const who = level === 1 ? "team leads" : "admins";
    await deliver(
      ticket,
      recipients,
      null,
      {
        type: NotificationType.ESCALATION,
        title: `${ticket.ticketNumber} escalated (level ${level})`,
        body:
          level === 1
            ? `An SLA target was missed. ${ticket.subject}`
            : `A second SLA target was missed. ${ticket.subject}`,
      },
      {
        preference: "emailSlaWarning",
        subject: `[${ticket.ticketNumber}] Escalated to ${who}: ${ticket.subject}`,
        heading: level === 1 ? "SLA breached: escalated to team leads" : "Second SLA breach: escalated to admins",
        intro:
          level === 1
            ? "This ticket missed an SLA target and has been escalated to you."
            : "This ticket has now missed both of its SLA targets and has been escalated to you.",
      },
    );
  });
}

export type AutomationRecipient = "assignee" | "team" | "team_leads" | "admins";

/** "Send notification" action of an automation rule. In-app only. */
export async function notifyAutomation(
  ticketId: string,
  recipient: AutomationRecipient,
  ruleName: string,
  message: string,
): Promise<void> {
  await safely("automation", async () => {
    const ticket = await loadTicket(ticketId);
    if (!ticket || ticket.deletedAt) return;
    const recipients =
      recipient === "assignee"
        ? [ticket.assignee]
        : recipient === "team"
          ? await teamStaff(ticket.teamId)
          : recipient === "team_leads"
            ? await teamLeads(ticket.teamId)
            : await admins();
    await deliver(
      ticket,
      recipients,
      null,
      {
        type: NotificationType.AUTOMATION,
        title: `${ticket.ticketNumber}: ${ruleName}`,
        body: message,
      },
      null,
    );
  });
}
