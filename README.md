# QuickDesk

Helpdesk ticketing system. This folder contains **Phases 1 to 5** of the build.

Stack: Next.js 15 (App Router), TypeScript, Tailwind, PostgreSQL + Prisma, Zod, Brevo.

## What is built so far

**Phase 1 - Foundation**

- Full database schema for all 7 phases (`prisma/schema.prisma`)
- Seed script: 1 admin, 1 team lead, 4 agents, 5 requesters, 2 teams, 40 tickets across every status, 4 canned responses
- Register, log in, log out, forgot password, reset password
- Profile page with contact info and change password
- Hashed passwords (bcrypt), httpOnly session cookies, sessions stored hashed in the database
- Rate limiting on login, registration, password reset and ticket creation
- Route protection and one server-side permission helper (`src/lib/permissions.ts`)
- App shell: sidebar, top bar, role-aware navigation, light and dark mode, responsive

**Phase 2 - Tickets and conversation**

- Create ticket: subject, description, category, attachments. Routed to the category's team, numbered QD-000123
- Ticket page: conversation thread, public reply, internal notes (staff only, visually distinct), attachments on replies
- Right panel: status, priority, assignee, team, category, tags, SLA timers
- Activity timeline: every status, priority, assignment, team, category and tag change with who and when
- Status changes follow the lifecycle rules on the server, including reopen, cancel and the SLA pause while waiting on the customer
- Assign, reassign, "Assign to me", edit subject / description / category / tags
- Canned response picker with `{{requester_name}}`, `{{ticket_number}}`, `{{ticket_subject}}`, `{{agent_name}}`
- Closed tickets are frozen; the requester can create a linked follow-up ticket
- Attachments: 10 MB per file, 5 per message, allowlisted types checked by content, served only through an
  authorized route

**Phase 3 - Queues and dashboard**

- Dashboard cards: total, open, waiting, resolved, overdue, unassigned, assigned to me. Each card opens the matching list
- Saved views: All, My tickets, Unassigned, My team, High priority, Overdue, Recently updated
- Server-side search (ticket number, subject, description, public replies, requester), sorting, filters
  (status, priority, category, assignee, team, tag, created date range) and pagination. Everything lives in the URL
- Global search in the top bar
- Bulk actions for team leads and admins: assign, change status, change priority, add tag. Every ticket is
  checked against the normal permission and lifecycle rules; tickets that fail are skipped and listed
- Requester portal: a simpler dashboard and list showing only their own tickets

**Phase 4 - Notifications**

- Notification bell in the top bar with an unread count, refreshed every 30 seconds while the tab is visible
- Dropdown with the latest notifications, "Mark all as read", and a full notifications page
- Brevo emails for: ticket created (confirmation to the requester, alert to the team), new public reply,
  assigned to you, ticket resolved. The SLA warning email is built and is sent by the Phase 5 SLA job
- Per-user email preferences on the profile page. In-app notifications are always on
- Internal notes never notify anyone and never send email. Nobody is notified about their own action
- Emails are sent after the response, so a slow or failing email provider never slows down or breaks a ticket action

**Phase 5 - SLA, escalation, automation**

- SLA timers per priority, paused while waiting on the customer, amber under 25 percent left, red when breached
- SLA warning (in-app + email) before a target is missed
- Escalation: the first missed target escalates to the team leads, a second missed target escalates to the admins.
  Escalated tickets get a badge (staff only) and a timeline entry
- Resolved tickets close automatically after 7 days without a reply
- Automation rules: trigger (ticket created, ticket updated, time elapsed) + conditions (category, priority,
  status, keyword in subject) + actions (move to team, assign to agent, round-robin in team, set priority,
  add tag, send notification). Admin screen to create, edit, order, enable, disable and delete rules
- Three example rules are seeded

Not built yet: knowledge base, duplicate detection, merge and CSAT (Phase 6), admin screens for users, teams,
categories, tags, SLA policies and canned responses, reports and audit log (Phase 7).

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer

## Setup

1. Create an empty PostgreSQL database named `quickdesk`.

2. Copy the environment file and set `DATABASE_URL` to your database:

   ```
   cp .env.example .env
   ```

   On Windows use `copy .env.example .env`.

3. Install, create the tables, seed, run:

   ```
   npm install
   npx prisma migrate dev --name init
   npm run db:seed
   npm run dev
   ```

4. Open http://localhost:3000

## Seeded accounts

Every account uses the password in `SEED_PASSWORD` (default `QuickDesk@123`).

| Role      | Email                                                     | Sees                                |
| --------- | --------------------------------------------------------- | ----------------------------------- |
| Admin     | admin@quickdesk.local                                     | all 40 tickets, Users page          |
| Team lead | lead@quickdesk.local                                      | both teams (40 tickets)             |
| Agent     | agent1@quickdesk.local, agent2@quickdesk.local            | Technical Support team (20 tickets) |
| Agent     | agent3@quickdesk.local, agent4@quickdesk.local            | Billing team (20 tickets)           |
| Requester | requester1@quickdesk.local ... requester5@quickdesk.local | own tickets only (8 each)           |

Change these passwords, or reseed with your own `SEED_PASSWORD`, before any real deployment.

## Upgrading from an earlier zip

Phase 5 changes the database schema. Copy your `.env` into this folder, add `CRON_SECRET`, then:

```
npm install
npx prisma migrate dev --name phase5
npm run dev
```

To also get the example automation rules and canned responses, reseed instead (this wipes all data):
`npm run db:reset`

## Scheduled job (SLA warnings, escalation, auto-close, time rules)

These run in one job at `GET /api/cron/run`, protected by `CRON_SECRET`
(send `Authorization: Bearer <CRON_SECRET>`). Call it every 5 minutes.

- **Locally:** run `npm run jobs` in a second terminal next to `npm run dev`. It calls the job every minute.
- **Vercel:** add a cron in `vercel.json` (`{"crons":[{"path":"/api/cron/run","schedule":"*/5 * * * *"}]}`)
  and set `CRON_SECRET` in the project settings; Vercel sends the header itself. Frequent crons need a paid plan.
- **Anywhere else:** any scheduler that can make an HTTP request with that header (cron-job.org,
  GitHub Actions, a server crontab with curl).

Running it twice at once is safe: overlapping runs are skipped and every warning or escalation is sent once.

## Attachments

By default files are stored on disk in `./storage` (`STORAGE_DRIVER="local"`), which is fine for development.
For production set `STORAGE_DRIVER="s3"` and fill in the `S3_*` values in `.env` for any S3-compatible
service (AWS S3, Cloudflare R2, MinIO). The bucket must be private. Files are never linked directly:
every download goes through `/api/attachments/[id]`, which checks ticket access and then redirects to a
signed URL that expires after 60 seconds.

## Email

All email goes through Brevo's transactional API. Set `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` and
`EMAIL_FROM_NAME` in `.env`; the sender address must be verified in your Brevo account.
With `BREVO_API_KEY` empty in development, every email (including password reset links) is printed
in the terminal running `npm run dev` instead of being sent.

## Scripts

| Command              | What it does                                |
| -------------------- | ------------------------------------------- |
| `npm run dev`        | Start the dev server                        |
| `npm run build`      | Generate the Prisma client and build        |
| `npm run start`      | Run the production build                    |
| `npm run typecheck`  | Type-check the project                      |
| `npm run db:migrate` | Create and apply a migration (development)  |
| `npm run db:deploy`  | Apply existing migrations (production)      |
| `npm run db:seed`    | Seed the database (skips if users exist)    |
| `npm run db:reset`   | Drop everything, re-run migrations and seed |
| `npm run db:studio`  | Open Prisma Studio                          |

## Where things are

```
prisma/schema.prisma            database schema
prisma/seed.ts                  seed script
src/middleware.ts               redirects visitors without a session cookie
src/lib/permissions.ts          the single permission helper
src/lib/auth/                   sessions, passwords, tokens
src/lib/tickets/service.ts      every ticket mutation (create, reply, status, assign, edit)
src/lib/tickets/queries.ts      ticket reads, with internal notes filtered in SQL
src/lib/tickets/list.ts         queue: views, search, filters, sorting, pagination, dashboard counts
src/lib/attachments.ts          upload validation
src/lib/storage.ts              local and S3 storage drivers
src/app/api/attachments/[id]/   authorized download route
src/lib/notifications/          who gets notified, email templates, bell queries
src/lib/automation/             rule schema, rule engine, admin helpers
src/lib/jobs/scheduled.ts       SLA warnings, escalation, auto-close, time rules
src/app/api/cron/run/           the scheduled job endpoint
src/lib/rate-limit.ts           Postgres-backed rate limiter
src/lib/email.ts                Brevo client
src/lib/validation/             Zod schemas
src/app/(auth)/                 login, register, forgot and reset password
src/app/(app)/                  signed-in pages (dashboard, tickets, profile, admin)
src/components/                 UI components and the app shell
```

## Notes

- Rate limits are keyed by IP from the `x-forwarded-for` header. In production, run the app
  behind a proxy you control or a host that sets this header.
- Self-registration always creates a REQUESTER. Staff roles are assigned by an admin.
