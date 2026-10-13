export function formatTicketNumber(value: number): string {
  return `QD-${String(value).padStart(6, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2d 3h", "3h 15m", "12m", "under 1m" */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  if (minutes < 1) return "under 1m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}
