// QuickDesk - prisma/seed.ts
//
// Seeds: 1 admin, 1 team lead, 4 agents, 5 requesters, 2 teams, 4 categories,
// 4 SLA policies, 4 tags and 40 tickets spread across every status.
//
// Run with: npm run db:seed
// Refuses to run on a database that already has users.

import {
  MessageType,
  PrismaClient,
  Role,
  TicketEventType,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const MIN = 60_000;
const HOUR = 60 * MIN;

const SLA: Record<TicketPriority, { first: number; resolution: number }> = {
  URGENT: { first: 30, resolution: 240 },
  HIGH: { first: 60, resolution: 480 },
  MEDIUM: { first: 240, resolution: 1440 },
  LOW: { first: 480, resolution: 4320 },
};

type CategoryKey = "technical" | "account" | "billing" | "refunds";

const TOPICS: { subject: string; category: CategoryKey }[] = [
  { subject: "App crashes when exporting a report to PDF", category: "technical" },
  { subject: "Dashboard charts not loading on Safari", category: "technical" },
  { subject: "File upload stuck at 99 percent", category: "technical" },
  { subject: "Search returns no results for exact matches", category: "technical" },
  { subject: "Mobile app logs me out every few minutes", category: "technical" },
  { subject: "Email notifications arriving hours late", category: "technical" },
  { subject: "CSV import fails with a column mismatch error", category: "technical" },
  { subject: "Page freezes when opening large projects", category: "technical" },
  { subject: "Webhook deliveries failing with a timeout", category: "technical" },
  { subject: "Calendar sync creates duplicate events", category: "technical" },
  { subject: "Cannot reset my password, link says expired", category: "account" },
  { subject: "Two-factor code never arrives by SMS", category: "account" },
  { subject: "Need to change the email on my account", category: "account" },
  { subject: "Locked out after too many login attempts", category: "account" },
  { subject: "Invite link for a new teammate does not work", category: "account" },
  { subject: "Single sign-on redirects back to the login page", category: "account" },
  { subject: "How do I transfer account ownership", category: "account" },
  { subject: "Profile photo will not update", category: "account" },
  { subject: "Deactivated user still appears in the member list", category: "account" },
  { subject: "Request to delete my account data", category: "account" },
  { subject: "Charged twice for the March invoice", category: "billing" },
  { subject: "Need a GST invoice for last quarter", category: "billing" },
  { subject: "Card declined although the bank approved it", category: "billing" },
  { subject: "Upgrade to annual plan not reflected", category: "billing" },
  { subject: "Where can I download past invoices", category: "billing" },
  { subject: "Wrong company name on the invoice", category: "billing" },
  { subject: "Seat count on the bill is higher than our team", category: "billing" },
  { subject: "Payment method update keeps failing", category: "billing" },
  { subject: "Coupon code not applied at checkout", category: "billing" },
  { subject: "Need to change the billing contact", category: "billing" },
  { subject: "Refund request for an accidental renewal", category: "refunds" },
  { subject: "Refund not received after 10 days", category: "refunds" },
  { subject: "Cancel subscription and refund unused months", category: "refunds" },
  { subject: "Partial refund for a downgraded plan", category: "refunds" },
  { subject: "Charged after cancelling the trial", category: "refunds" },
  { subject: "Refund issued to an old card", category: "refunds" },
  { subject: "Duplicate payment needs to be reversed", category: "refunds" },
  { subject: "Refund amount is lower than expected", category: "refunds" },
  { subject: "Request to convert a refund into account credit", category: "refunds" },
  { subject: "Chargeback raised by mistake, how to withdraw it", category: "refunds" },
];

// status + age in hours for each of the 40 tickets
function buildPlan(): { status: TicketStatus; ageHours: number }[] {
  const plan: { status: TicketStatus; ageHours: number }[] = [];
  for (let k = 0; k < 5; k++) {
    plan.push({ status: TicketStatus.CLOSED, ageHours: (20 - k) * 24 });
  }
  for (let k = 0; k < 3; k++) {
    plan.push({ status: TicketStatus.CANCELLED, ageHours: (10 - k) * 24 });
  }
  for (let k = 0; k < 6; k++) {
    plan.push({ status: TicketStatus.RESOLVED, ageHours: (6 - k) * 24 + 12 });
  }
  for (let k = 0; k < 6; k++) {
    plan.push({
      status: TicketStatus.WAITING_ON_CUSTOMER,
      ageHours: 34.5 - k * 4,
    });
  }
  for (let k = 0; k < 10; k++) {
    plan.push({ status: TicketStatus.IN_PROGRESS, ageHours: 30 - k * 3 });
  }
  for (let k = 0; k < 10; k++) {
    plan.push({ status: TicketStatus.OPEN, ageHours: 6 - k * 0.6 });
  }
  return plan.sort((a, b) => b.ageHours - a.ageHours);
}

const PRIORITY_CYCLE: TicketPriority[] = [
  TicketPriority.MEDIUM,
  TicketPriority.HIGH,
  TicketPriority.LOW,
  TicketPriority.URGENT,
  TicketPriority.MEDIUM,
];

async function main() {
  if ((await db.user.count()) > 0) {
    console.log(
      "Seed skipped: the database already has users. Run `npm run db:reset` to wipe and reseed.",
    );
    return;
  }

  const password = process.env.SEED_PASSWORD || "QuickDesk@123";
  const passwordHash = await bcrypt.hash(password, 12);

  const mkUser = (
    email: string,
    name: string,
    role: Role,
    extra: { company?: string; jobTitle?: string; phone?: string } = {},
  ) => db.user.create({ data: { email, name, role, passwordHash, ...extra } });

  // ── Users ──
  const admin = await mkUser("admin@quickdesk.local", "Aarav Mehta", Role.ADMIN, {
    jobTitle: "Support Operations Manager",
  });
  const lead = await mkUser("lead@quickdesk.local", "Priya Nair", Role.TEAM_LEAD, {
    jobTitle: "Support Team Lead",
  });
  const agent1 = await mkUser("agent1@quickdesk.local", "Rohan Verma", Role.AGENT, {
    jobTitle: "Technical Support Agent",
  });
  const agent2 = await mkUser("agent2@quickdesk.local", "Sneha Kapoor", Role.AGENT, {
    jobTitle: "Technical Support Agent",
  });
  const agent3 = await mkUser("agent3@quickdesk.local", "Karan Malhotra", Role.AGENT, {
    jobTitle: "Billing Support Agent",
  });
  const agent4 = await mkUser("agent4@quickdesk.local", "Ananya Iyer", Role.AGENT, {
    jobTitle: "Billing Support Agent",
  });

  const requesters = [
    await mkUser("requester1@quickdesk.local", "Vikram Sethi", Role.REQUESTER, {
      company: "Northwind Traders",
      jobTitle: "Operations Manager",
    }),
    await mkUser("requester2@quickdesk.local", "Meera Joshi", Role.REQUESTER, {
      company: "Bluepeak Studio",
      jobTitle: "Founder",
    }),
    await mkUser("requester3@quickdesk.local", "Daniel Brooks", Role.REQUESTER, {
      company: "Harbor Dental",
      jobTitle: "Practice Manager",
    }),
    await mkUser("requester4@quickdesk.local", "Sara Thomas", Role.REQUESTER, {
      company: "Lumen Interiors",
      jobTitle: "Design Lead",
    }),
    await mkUser("requester5@quickdesk.local", "Imran Qureshi", Role.REQUESTER, {
      company: "Stackline Labs",
      jobTitle: "CTO",
    }),
  ];

  // ── Teams ──
  const techTeam = await db.team.create({
    data: {
      name: "Technical Support",
      description: "Product issues, bugs, account and login problems.",
      members: {
        create: [{ userId: lead.id }, { userId: agent1.id }, { userId: agent2.id }],
      },
    },
  });
  const billingTeam = await db.team.create({
    data: {
      name: "Billing",
      description: "Invoices, payments, plans and refunds.",
      members: {
        create: [{ userId: lead.id }, { userId: agent3.id }, { userId: agent4.id }],
      },
    },
  });

  const teamAgents: Record<string, { id: string }[]> = {
    [techTeam.id]: [agent1, agent2],
    [billingTeam.id]: [agent3, agent4],
  };

  // ── Categories ──
  const categories: Record<CategoryKey, { id: string; defaultTeamId: string | null }> = {
    technical: await db.category.create({
      data: {
        name: "Technical Issue",
        description: "Bugs, errors and performance problems.",
        defaultTeamId: techTeam.id,
      },
    }),
    account: await db.category.create({
      data: {
        name: "Account & Login",
        description: "Access, passwords and account settings.",
        defaultTeamId: techTeam.id,
      },
    }),
    billing: await db.category.create({
      data: {
        name: "Billing",
        description: "Invoices, payments and plans.",
        defaultTeamId: billingTeam.id,
      },
    }),
    refunds: await db.category.create({
      data: {
        name: "Refunds",
        description: "Refund and cancellation requests.",
        defaultTeamId: billingTeam.id,
      },
    }),
  };

  // ── Tags ──
  const tagBug = await db.tag.create({ data: { name: "bug", color: "red" } });
  const tagHowTo = await db.tag.create({ data: { name: "how-to", color: "blue" } });
  const tagRefund = await db.tag.create({ data: { name: "refund", color: "amber" } });
  const tagVip = await db.tag.create({ data: { name: "vip", color: "violet" } });

  const tagForCategory: Record<CategoryKey, string> = {
    technical: tagBug.id,
    account: tagHowTo.id,
    billing: tagHowTo.id,
    refunds: tagRefund.id,
  };

  // ── SLA policies ──
  await db.slaPolicy.createMany({
    data: [
      { name: "Urgent", priority: TicketPriority.URGENT, firstResponseMinutes: SLA.URGENT.first, resolutionMinutes: SLA.URGENT.resolution },
      { name: "High", priority: TicketPriority.HIGH, firstResponseMinutes: SLA.HIGH.first, resolutionMinutes: SLA.HIGH.resolution },
      { name: "Medium", priority: TicketPriority.MEDIUM, firstResponseMinutes: SLA.MEDIUM.first, resolutionMinutes: SLA.MEDIUM.resolution },
      { name: "Low", priority: TicketPriority.LOW, firstResponseMinutes: SLA.LOW.first, resolutionMinutes: SLA.LOW.resolution },
    ],
  });

  // ── Tickets ──
  const now = Date.now();
  const plan = buildPlan();

  for (let i = 0; i < plan.length; i++) {
    const { status, ageHours } = plan[i];
    const topic = TOPICS[(i * 7) % TOPICS.length];
    const category = categories[topic.category];
    const teamId = category.defaultTeamId as string;
    const requester = requesters[i % requesters.length];
    const priority =
      status === TicketStatus.CANCELLED
        ? TicketPriority.MEDIUM
        : PRIORITY_CYCLE[i % PRIORITY_CYCLE.length];
    const sla = SLA[priority];

    const createdAt = new Date(now - ageHours * HOUR);
    const at = (fraction: number) =>
      new Date(createdAt.getTime() + ageHours * HOUR * fraction);

    const isAssigned =
      status !== TicketStatus.OPEN && status !== TicketStatus.CANCELLED;
    const assignee = isAssigned ? teamAgents[teamId][i % 2] : null;

    const assignedAt = isAssigned ? at(0.05) : null;
    const firstRespondedAt = isAssigned
      ? new Date(
          Math.min(
            createdAt.getTime() + sla.first * MIN * 0.5,
            at(0.25).getTime(),
          ),
        )
      : null;
    const waitingAt =
      status === TicketStatus.WAITING_ON_CUSTOMER ? at(0.5) : null;
    const resolvedAt =
      status === TicketStatus.RESOLVED
        ? at(0.5)
        : status === TicketStatus.CLOSED
          ? new Date(createdAt.getTime() + 48 * HOUR)
          : null;
    const closedAt =
      status === TicketStatus.CLOSED && resolvedAt
        ? new Date(resolvedAt.getTime() + 7 * 24 * HOUR)
        : null;
    const cancelledAt = status === TicketStatus.CANCELLED ? at(0.02) : null;

    const messages: {
      authorId: string;
      type: MessageType;
      body: string;
      createdAt: Date;
    }[] = [];
    const events: {
      actorId: string | null;
      type: TicketEventType;
      fromValue: string | null;
      toValue: string | null;
      createdAt: Date;
    }[] = [
      {
        actorId: requester.id,
        type: TicketEventType.CREATED,
        fromValue: null,
        toValue: null,
        createdAt,
      },
    ];

    if (assignee && assignedAt && firstRespondedAt) {
      events.push(
        {
          actorId: lead.id,
          type: TicketEventType.ASSIGNEE_CHANGED,
          fromValue: null,
          toValue: assignee.id,
          createdAt: assignedAt,
        },
        {
          actorId: lead.id,
          type: TicketEventType.STATUS_CHANGED,
          fromValue: TicketStatus.OPEN,
          toValue: TicketStatus.IN_PROGRESS,
          createdAt: assignedAt,
        },
      );
      messages.push({
        authorId: assignee.id,
        type: MessageType.PUBLIC_REPLY,
        body: `Hi ${requester.name.split(" ")[0]}, thanks for reaching out. I am looking into this now and will update you shortly.`,
        createdAt: firstRespondedAt,
      });
      if (i % 2 === 0) {
        messages.push({
          authorId: assignee.id,
          type: MessageType.INTERNAL_NOTE,
          body: "Checked the account history. No earlier tickets about the same problem. Continuing to investigate.",
          createdAt: new Date(firstRespondedAt.getTime() + 5 * MIN),
        });
      }
    }

    if (assignee && waitingAt) {
      messages.push({
        authorId: assignee.id,
        type: MessageType.PUBLIC_REPLY,
        body: "Could you share a screenshot and the exact time this last happened? That will help us narrow it down.",
        createdAt: waitingAt,
      });
      events.push({
        actorId: assignee.id,
        type: TicketEventType.STATUS_CHANGED,
        fromValue: TicketStatus.IN_PROGRESS,
        toValue: TicketStatus.WAITING_ON_CUSTOMER,
        createdAt: waitingAt,
      });
    }

    if (assignee && resolvedAt) {
      messages.push({
        authorId: assignee.id,
        type: MessageType.PUBLIC_REPLY,
        body: "This has been fixed on our side. Please reply to this ticket if you still see the problem.",
        createdAt: resolvedAt,
      });
      events.push({
        actorId: assignee.id,
        type: TicketEventType.STATUS_CHANGED,
        fromValue: TicketStatus.IN_PROGRESS,
        toValue: TicketStatus.RESOLVED,
        createdAt: resolvedAt,
      });
    }

    if (closedAt) {
      events.push({
        actorId: null,
        type: TicketEventType.STATUS_CHANGED,
        fromValue: TicketStatus.RESOLVED,
        toValue: TicketStatus.CLOSED,
        createdAt: closedAt,
      });
    }

    if (cancelledAt) {
      events.push({
        actorId: requester.id,
        type: TicketEventType.STATUS_CHANGED,
        fromValue: TicketStatus.OPEN,
        toValue: TicketStatus.CANCELLED,
        createdAt: cancelledAt,
      });
    }

    const lastActivity = events[events.length - 1].createdAt;
    const tagIds = [tagForCategory[topic.category]];
    if (i % 6 === 0) tagIds.push(tagVip.id);

    await db.ticket.create({
      data: {
        ticketNumber: `QD-${String(i + 1).padStart(6, "0")}`,
        subject: topic.subject,
        description: `${topic.subject}.\n\nThis started recently and is affecting our day-to-day work. Please let me know what details you need from my side.`,
        status,
        priority,
        categoryId: category.id,
        requesterId: requester.id,
        assigneeId: assignee ? assignee.id : null,
        teamId,
        firstResponseDueAt: new Date(createdAt.getTime() + sla.first * MIN),
        resolutionDueAt: new Date(createdAt.getTime() + sla.resolution * MIN),
        firstRespondedAt,
        resolvedAt,
        closedAt,
        slaPausedAt: waitingAt,
        createdAt,
        updatedAt: lastActivity,
        messages: { create: messages },
        events: { create: events },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
  }

  await db.counter.upsert({
    where: { name: "ticket" },
    update: { value: plan.length },
    create: { name: "ticket", value: plan.length },
  });

  console.log("Seed complete.");
  console.log(`  Password for every account: ${password}`);
  console.log(`  Admin:      ${admin.email}`);
  console.log(`  Team lead:  ${lead.email}`);
  console.log("  Agents:     agent1@quickdesk.local ... agent4@quickdesk.local");
  console.log("  Requesters: requester1@quickdesk.local ... requester5@quickdesk.local");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
