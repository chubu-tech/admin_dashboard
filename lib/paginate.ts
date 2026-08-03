/**
 * Listing pagination.
 *
 * The `admin_*` RPCs take no limit/offset — they return every row and always
 * have. Rather than change five function signatures for a platform that is
 * still pre-launch, pages fetch the full set and slice it here. `/approvals`
 * needs the whole set anyway to count its filter chips.
 *
 * If a listing ever gets big enough that this hurts, the fix is limit/offset
 * plus a total count in the RPC — not a bigger slice.
 */

export const PER_PAGE = 10;

/** Statuses `admin_salons(p_status)` accepts. Anything else raises 22023. */
export const VALID_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "suspended",
  "all",
] as const;

export function readStatus(raw: string | undefined, fallback: string): string {
  return raw && (VALID_STATUSES as readonly string[]).includes(raw)
    ? raw
    : fallback;
}

/** Parse a `?page=` value. Junk and out-of-range low values become page 1. */
export function readPage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export type Paged<T> = {
  rows: T[];
  page: number;
  totalPages: number;
  total: number;
};

/**
 * Slice `rows` to one page.
 *
 * `page` is clamped into range, so a stale or hand-typed `?page=99` shows the
 * last page rather than an empty table — an admin who bookmarked page 4 of a
 * queue that has since drained should still see the queue.
 */
export function paginate<T>(rows: T[], page: number): Paged<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * PER_PAGE;

  return {
    rows: rows.slice(start, start + PER_PAGE),
    page: current,
    totalPages,
    total,
  };
}
