# QuickDesk

Helpdesk ticketing system. This folder contains **Phase 1 (Foundation)** of the build.

Stack: Next.js 15 (App Router), TypeScript, Tailwind, PostgreSQL + Prisma, Zod, Brevo.

## What is in Phase 1

- Full database schema for all 7 phases (`prisma/schema.prisma`)
- Seed script: 1 admin, 1 team lead, 4 agents, 5 requesters, 2 teams, 40 tickets across every status
- Register, log in, log out, forgot password, reset password
- Profile page with contact info and change password
- Hashed passwords (bcrypt), httpOnly session cookies, sessions stored hashed in the database
- Rate limiting on login, registration and password reset
- Route protection and one server-side permission helper (`src/lib/permissions.ts`)
- App shell: sidebar, top bar, role-aware navigation, light and dark mode, responsive
- Read-only dashboard, ticket list and admin user list, all scoped by the permission helper

Not built yet: creating and working tickets (Phase 2), queues, search and bulk actions (Phase 3),
notifications (Phase 4), SLA and automation (Phase 5), knowledge base and CSAT (Phase 6),
admin screens, reports and audit log (Phase 7).

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

## Email

Password reset emails go through Brevo. With `BREVO_API_KEY` empty in development, the email
(including the reset link) is printed in the terminal running `npm run dev`.

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
