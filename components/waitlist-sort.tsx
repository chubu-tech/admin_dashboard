"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "newest", label: "Newest first", icon: ArrowDown },
  { value: "oldest", label: "Oldest first", icon: ArrowUp },
] as const;

/**
 * Sort the waitlist by date joined.
 *
 * Real links, same reasoning as `StatusFilter`: the sorted view is a shareable
 * URL that survives a refresh. Unlike that component this one *drops* the page
 * param while preserving everything else — reversing the order makes "page 4"
 * meaningless, so it resets to the first page rather than landing somebody in
 * the middle of a list they have not seen the top of.
 */
export function WaitlistSort({ active }: { active: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    if (value === "newest") next.delete("sort");
    else next.set("sort", value);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <nav aria-label="Sort by date joined" className="flex flex-wrap gap-1.5">
      {OPTIONS.map((option) => {
        const isActive = active === option.value;
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <option.icon className="size-3.5" aria-hidden />
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
