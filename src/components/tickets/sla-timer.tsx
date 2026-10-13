import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/tickets/format";
import { formatDateTime } from "@/lib/utils";

const TONE = {
  neutral: "border-border bg-muted text-muted-foreground",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
} as const;

/**
 * One SLA target. Calculated when the page is rendered.
 * Amber under 25 percent of the time remaining, red once breached.
 */
export function SlaTimer({
  label,
  startedAt,
  dueAt,
  completedAt,
  pausedAt,
  stopped,
}: {
  label: string;
  startedAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  pausedAt: Date | null;
  /** Ticket ended without this target being completed (closed or cancelled). */
  stopped: boolean;
}) {
  let tone: keyof typeof TONE = "neutral";
  let text = "No target";

  if (dueAt) {
    if (completedAt) {
      const met = completedAt.getTime() <= dueAt.getTime();
      tone = met ? "ok" : "bad";
      text = met ? "Met" : `Missed by ${formatDuration(completedAt.getTime() - dueAt.getTime())}`;
    } else if (stopped) {
      text = "Stopped";
    } else if (pausedAt) {
      text = `Paused, ${formatDuration(dueAt.getTime() - pausedAt.getTime())} left`;
    } else {
      const now = Date.now();
      const remaining = dueAt.getTime() - now;
      const total = dueAt.getTime() - startedAt.getTime();
      if (remaining <= 0) {
        tone = "bad";
        text = `Overdue by ${formatDuration(remaining)}`;
      } else {
        tone = total > 0 && remaining / total < 0.25 ? "warn" : "ok";
        text = `${formatDuration(remaining)} left`;
      }
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {dueAt ? (
          <p className="text-xs text-muted-foreground">Due {formatDateTime(dueAt)}</p>
        ) : null}
      </div>
      <Badge className={TONE[tone]}>{text}</Badge>
    </div>
  );
}
