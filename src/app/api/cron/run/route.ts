import { timingSafeEqual } from "node:crypto";
import { runScheduledJobs } from "@/lib/jobs/scheduled";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled job: SLA warnings, escalation, auto-close and time-based
 * automation. Call it every 5 minutes with "Authorization: Bearer CRON_SECRET".
 * (Vercel Cron sends that header automatically when CRON_SECRET is set.)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // One run at a time: a second call within 50 seconds is skipped.
  if (!(await rateLimit("cron:run", 1, 50))) {
    return Response.json({ skipped: "A run is already in progress or just finished." }, { status: 429 });
  }

  const started = Date.now();
  const summary = await runScheduledJobs();
  return Response.json({ ok: true, ...summary, ms: Date.now() - started });
}
