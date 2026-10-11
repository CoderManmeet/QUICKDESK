import type { Role, TicketPriority, TicketStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABEL, ROLE_LABEL, STATUS_LABEL } from "@/lib/labels";

const STATUS_CLASS: Record<TicketStatus, string> = {
  OPEN: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  IN_PROGRESS: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  WAITING_ON_CUSTOMER: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  RESOLVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CLOSED: "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  CANCELLED: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  LOW: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  MEDIUM: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  URGENT: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge className={PRIORITY_CLASS[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge className="border-border bg-muted text-muted-foreground">{ROLE_LABEL[role]}</Badge>;
}
