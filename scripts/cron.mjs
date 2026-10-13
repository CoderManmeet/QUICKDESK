// Local stand-in for a cron service: calls the scheduled job every minute.
// Run alongside `npm run dev` with: npm run jobs
// In production use a real scheduler (Vercel Cron, cron-job.org, GitHub Actions, crontab).

const url = `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/api/cron/run`;
const secret = process.env.CRON_SECRET;
const everyMs = Number(process.env.JOBS_INTERVAL_SECONDS || 60) * 1000;

if (!secret) {
  console.error("Set CRON_SECRET in .env first (any random string of 16+ characters).");
  process.exit(1);
}

async function tick() {
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    const body = await response.text();
    console.log(`[${new Date().toLocaleTimeString()}] ${response.status} ${body}`);
  } catch (error) {
    console.log(`[${new Date().toLocaleTimeString()}] could not reach ${url}: ${error.message}`);
  }
}

console.log(`Calling ${url} every ${everyMs / 1000}s. Press Ctrl+C to stop.`);
await tick();
setInterval(tick, everyMs);
