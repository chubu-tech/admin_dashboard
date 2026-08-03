"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAY_NAMES, type ReviewHours } from "@/lib/types";

/**
 * The opening-hours week, shared by the review and add-salon wizards.
 *
 * `p_hours` is a full replace on the server, not a patch — sending a non-empty
 * array deletes every existing row for the salon and reinserts. So this always
 * renders all seven days, with the ones that have no row marked closed.
 */
export function HoursEditor({
  hours,
  errors,
  onChange,
}: {
  hours: ReviewHours[];
  /** Keyed `day-0` … `day-6`, matching the wizards' error records. */
  errors: Record<string, string>;
  onChange: (day: number, patch: Partial<ReviewHours>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {hours.map((day) => {
        const error = errors[`day-${day.day_of_week}`];
        return (
          <div
            key={day.day_of_week}
            className="grid gap-3 border-b pb-3 last:border-0 last:pb-0 sm:grid-cols-[9rem_1fr_1fr_auto] sm:items-center"
          >
            <span className="text-sm font-medium">
              {DAY_NAMES[day.day_of_week]}
            </span>

            <div className="grid gap-1.5">
              <Label
                htmlFor={`open-${day.day_of_week}`}
                className="text-muted-foreground text-xs"
              >
                Opens
              </Label>
              <Input
                id={`open-${day.day_of_week}`}
                type="time"
                value={day.open_time}
                disabled={day.closed}
                aria-invalid={Boolean(error)}
                onChange={(e) =>
                  onChange(day.day_of_week, { open_time: e.target.value })
                }
              />
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor={`close-${day.day_of_week}`}
                className="text-muted-foreground text-xs"
              >
                Closes
              </Label>
              <Input
                id={`close-${day.day_of_week}`}
                type="time"
                value={day.close_time}
                disabled={day.closed}
                aria-invalid={Boolean(error)}
                onChange={(e) =>
                  onChange(day.day_of_week, { close_time: e.target.value })
                }
              />
            </div>

            <label className="flex items-center gap-2 text-sm sm:pt-5">
              <Checkbox
                checked={day.closed}
                onCheckedChange={(checked: boolean | "indeterminate") =>
                  onChange(day.day_of_week, { closed: checked === true })
                }
              />
              Closed
            </label>

            {error && (
              <p className="text-destructive text-xs sm:col-span-4">{error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Validate the week the way `admin_create_salon` / `admin_review_salon` do. */
export function validateHours(hours: ReviewHours[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const day of hours) {
    if (day.closed) continue;
    if (!day.open_time || !day.close_time) {
      errors[`day-${day.day_of_week}`] =
        "Set both times, or mark the day closed.";
    } else if (day.open_time >= day.close_time) {
      errors[`day-${day.day_of_week}`] = "Closing time must be after opening.";
    }
  }
  return errors;
}

/** A fresh week: every day closed, with sensible times ready behind the box. */
export function blankWeek(): ReviewHours[] {
  return DAY_NAMES.map((_, day) => ({
    day_of_week: day,
    open_time: "09:00",
    close_time: "18:00",
    closed: true,
  }));
}
