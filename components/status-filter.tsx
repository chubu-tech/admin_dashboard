"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
  { value: "all", label: "All" },
] as const;

/**
 * Status filter as real links, not buttons — each state is a shareable URL and
 * survives a refresh, which matters when an admin is working a queue.
 */
export function StatusFilter({
  active,
  counts,
}: {
  active: string;
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
      {OPTIONS.map((option) => {
        const isActive = active === option.value;
        return (
          <Link
            key={option.value}
            href={`${pathname}?status=${option.value}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {option.label}
            {counts?.[option.value] != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  isActive ? "bg-primary-foreground/20" : "bg-background/70",
                )}
              >
                {counts[option.value]}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
