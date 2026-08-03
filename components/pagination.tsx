"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Page navigation for a listing.
 *
 * Real links, not buttons — the same reasoning as `StatusFilter`: a page of a
 * queue is a shareable URL that survives a refresh. The server does the
 * slicing and passes the numbers down, so this stays a near-zero-JS component.
 *
 * Unlike `StatusFilter`, this preserves the rest of the query string: changing
 * page must keep the status filter, whereas changing the filter should reset
 * to page 1 (which `StatusFilter` gets for free by rebuilding the URL).
 *
 * Written by hand rather than pulled from the shadcn registry because this
 * repo has no `components.json`, and the registry version renders plain `<a>`
 * tags — every page change would be a full document load.
 */
export function Pagination({
  page,
  totalPages,
  total,
  param = "page",
  label = "rows",
}: {
  page: number;
  totalPages: number;
  total: number;
  /** Query key to drive. Pages with several tables give each its own. */
  param?: string;
  /** Plural noun for the count line, e.g. "salons". */
  label?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function hrefFor(target: number) {
    const next = new URLSearchParams(searchParams.toString());
    if (target <= 1) next.delete(param);
    else next.set(param, String(target));
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
    >
      <p className="text-muted-foreground text-sm">
        Page {page} of {totalPages}
        <span className="hidden sm:inline">
          {" "}
          · {total} {label}
        </span>
      </p>

      <div className="flex items-center gap-1">
        <Step
          href={hrefFor(page - 1)}
          disabled={page <= 1}
          rel="prev"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </Step>

        {pageWindow(page, totalPages).map((entry, i) =>
          entry === "gap" ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="text-muted-foreground px-1.5 text-sm"
            >
              …
            </span>
          ) : (
            <Link
              key={entry}
              href={hrefFor(entry)}
              aria-current={entry === page ? "page" : undefined}
              aria-label={`Page ${entry}`}
              className={cn(
                buttonVariants({
                  variant: entry === page ? "default" : "ghost",
                  size: "icon",
                }),
                "size-9 tabular-nums",
              )}
            >
              {entry}
            </Link>
          ),
        )}

        <Step
          href={hrefFor(page + 1)}
          disabled={page >= totalPages}
          rel="next"
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" aria-hidden />
        </Step>
      </div>
    </nav>
  );
}

/**
 * A prev/next control. At the ends it becomes a real disabled `<span>` rather
 * than a styled link, so it is not focusable and not announced as clickable.
 */
function Step({
  href,
  disabled,
  children,
  ...props
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
  rel?: string;
  "aria-label"?: string;
}) {
  const className = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "gap-1",
    disabled && "pointer-events-none opacity-50",
  );

  if (disabled) {
    return (
      <span aria-disabled className={className}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={className} {...props}>
      {children}
    </Link>
  );
}

/**
 * Page numbers to render: always the first and last, plus a window around the
 * current page, with gaps collapsed. Keeps the control a fixed width however
 * many pages there are.
 */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page]);
  if (page - 1 > 1) pages.add(page - 1);
  if (page + 1 < totalPages) pages.add(page + 1);
  if (page <= 3) pages.add(2).add(3);
  if (page >= totalPages - 2) pages.add(totalPages - 1).add(totalPages - 2);

  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const n of sorted) {
    if (previous && n - previous > 1) out.push("gap");
    out.push(n);
    previous = n;
  }
  return out;
}
