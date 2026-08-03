"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateSalon } from "@/app/actions";
import { HoursEditor, validateHours } from "@/components/hours-editor";
import {
  SalonDetailsFields,
  validateSalonDetails,
} from "@/components/salon-details-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BUSINESS_TYPES,
  DAY_NAMES,
  type BusinessType,
  type ReviewHours,
  type SalonDetail,
  type UpdateSalonInfo,
} from "@/lib/types";

/**
 * Edit an existing salon.
 *
 * A flat form, not a wizard — the wizards exist because creating and reviewing
 * are sequential decisions, whereas editing is usually one field. Everything is
 * on screen and one Save writes it.
 *
 * The payload posts **every** field, empty ones included. `admin_update_salon`
 * reads key presence, so an empty box is what clears a column — and since every
 * box is seeded from the current row, an empty one is always deliberate.
 *
 * It cannot change status, plan or the owner: status is `SalonActions`, plan is
 * `PlanControl` (which also closes plan-change requests), and renaming a person
 * is not editing a salon.
 */
export function SalonEditForm({ detail }: { detail: SalonDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { salon } = detail;

  const [info, setInfo] = useState({
    name: salon.name ?? "",
    description: salon.description ?? "",
    gender_focus: (salon.gender_focus ?? "") as string,
    business_type: (salon.business_type ?? "salon") as BusinessType,
    address_text: salon.address_text ?? "",
    city: salon.city ?? "",
    phone: salon.phone ?? "",
    email: salon.email ?? "",
    lat: salon.lat != null ? String(salon.lat) : "",
    lng: salon.lng != null ? String(salon.lng) : "",
  });

  // Times arrive as "09:00:00"; <input type="time"> wants "09:00". A day with
  // no row is closed.
  const [hours, setHours] = useState<ReviewHours[]>(() => {
    const existing = new Map(detail.hours.map((h) => [h.day_of_week, h]));
    return DAY_NAMES.map((_, day) => {
      const found = existing.get(day);
      return {
        day_of_week: day,
        open_time: found?.open_time?.slice(0, 5) ?? "09:00",
        close_time: found?.close_time?.slice(0, 5) ?? "18:00",
        closed: !found,
      };
    });
  });

  function setField(key: keyof typeof info, value: string) {
    setInfo((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function setDay(day: number, patch: Partial<ReviewHours>) {
    setHours((prev) =>
      prev.map((h) => (h.day_of_week === day ? { ...h, ...patch } : h)),
    );
    setErrors((prev) => ({ ...prev, [`day-${day}`]: "" }));
  }

  function save() {
    const next = { ...validateSalonDetails(info), ...validateHours(hours) };
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error("Fix the highlighted fields first.");
      return;
    }

    startTransition(async () => {
      // Every key, always — including the empty ones. That is the clear.
      const payload: UpdateSalonInfo = {
        name: info.name.trim(),
        description: info.description.trim(),
        gender_focus: info.gender_focus as UpdateSalonInfo["gender_focus"],
        business_type: info.business_type,
        address_text: info.address_text.trim(),
        city: info.city.trim(),
        phone: info.phone.trim(),
        email: info.email.trim(),
        lat: info.lat.trim(),
        lng: info.lng.trim(),
      };

      const result = await updateSalon(salon.id, payload, hours);

      if (result.ok) {
        toast.success(`${payload.name} updated.`);
        router.push(`/approvals/${salon.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Salon details</CardTitle>
          <CardDescription>
            Clearing a box removes the value. Status and plan are changed from
            the salon page, not here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <SalonDetailsFields
            value={info}
            errors={errors}
            onField={setField}
            onCoords={({ lat, lng }) => {
              setInfo((prev) => ({ ...prev, lat, lng }));
              setErrors((prev) => ({ ...prev, coords: "" }));
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="business_type">Business type</Label>
              <Select
                value={info.business_type}
                onValueChange={(v: string) => setField("business_type", v)}
              >
                <SelectTrigger id="business_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SalonDetailsFields>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opening hours</CardTitle>
          <CardDescription>
            Saving replaces the whole week. Mark every day closed to clear the
            hours entirely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HoursEditor hours={hours} errors={errors} onChange={setDay} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => router.push(`/approvals/${salon.id}`)}
        >
          Cancel
        </Button>
        <Button disabled={pending} onClick={save}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
