import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SalonStatus } from "@/lib/types";

/**
 * One vocabulary for salon status across every screen. Colour is never the
 * only signal — the label always spells the status out.
 */
const STYLES: Record<SalonStatus, string> = {
  pending:
    "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  approved:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300",
  suspended:
    "bg-zinc-200 text-zinc-800 dark:bg-zinc-500/20 dark:text-zinc-300",
};

const LABELS: Record<SalonStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export function StatusBadge({
  status,
  className,
}: {
  status: SalonStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-transparent", STYLES[status], className)}
    >
      {LABELS[status]}
    </Badge>
  );
}
