/** Shared display helpers. Ngultrum + Bhutan-friendly date formats. */

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return DATE.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return DATE_TIME.format(new Date(value));
}

/** "3 days ago" / "in 5 days" — used for block windows and submissions. */
export function relativeDays(value: string | null | undefined) {
  if (!value) return "—";
  const diffMs = new Date(value).getTime() - Date.now();
  const days = Math.round(diffMs / 86_400_000);
  if (days === 0) return "today";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return rtf.format(days, "day");
}

export function formatNu(value: number | null | undefined) {
  if (value == null) return "—";
  return `Nu ${new Intl.NumberFormat("en-IN").format(value)}`;
}

export function formatDuration(minutes: number | null | undefined) {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * Turn a Postgres error into something an admin can act on. The RPCs raise
 * with specific SQLSTATEs, so map the ones we deliberately throw.
 */
export function rpcErrorMessage(error: { message?: string; code?: string } | null) {
  if (!error) return "Something went wrong.";
  switch (error.code) {
    case "28000":
      return "You are signed out. Sign in again to continue.";
    case "42501":
      return "You do not have permission to do that.";
    case "P0002":
      return "That record no longer exists.";
    default:
      return error.message ?? "Something went wrong.";
  }
}
