"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reviewSalon } from "@/app/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { DAY_NAMES, type ReviewHours, type SalonDetail } from "@/lib/types";

const STEPS = [
  { n: 1, title: "Salon & owner", hint: "Check the details the owner submitted" },
  { n: 2, title: "Opening hours", hint: "Set the week, or mark a day closed" },
  { n: 3, title: "Decision", hint: "Approve, or reject with a reason" },
] as const;

const MIN_REASON = 10;

/**
 * Three-step review. Each step validates before it will let you move on, and
 * the rules mirror `admin_review_salon` exactly — name required, gender from a
 * fixed set, a day is either closed or has open < close, and a rejection needs
 * at least 10 characters. The server re-checks all of it regardless; this just
 * means an admin finds out before submitting rather than after.
 */
export function ReviewWizard({ detail }: { detail: SalonDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { salon, owner } = detail;

  const [info, setInfo] = useState({
    name: salon.name ?? "",
    description: salon.description ?? "",
    gender_focus: (salon.gender_focus ?? "") as string,
    address_text: salon.address_text ?? "",
    city: salon.city ?? "",
    phone: salon.phone ?? "",
    email: salon.email ?? "",
    owner_name: owner?.full_name ?? "",
    owner_avatar_url: owner?.avatar_url ?? "",
  });

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

  const [reason, setReason] = useState(salon.rejection_reason ?? "");

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

  function validateStep(target: number) {
    const next: Record<string, string> = {};

    if (target === 1) {
      if (!info.name.trim()) next.name = "Salon name is required.";
      if (
        info.gender_focus &&
        !["male", "female", "unisex"].includes(info.gender_focus)
      ) {
        next.gender_focus = "Choose male, female or unisex.";
      }
    }

    if (target === 2) {
      for (const day of hours) {
        if (day.closed) continue;
        if (!day.open_time || !day.close_time) {
          next[`day-${day.day_of_week}`] =
            "Set both times, or mark the day closed.";
        } else if (day.open_time >= day.close_time) {
          next[`day-${day.day_of_week}`] = "Closing time must be after opening.";
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (validateStep(step)) setStep((s) => Math.min(3, s + 1));
  }

  function submit(decision: "approve" | "reject") {
    // Re-run the earlier steps so a decision can never skip their rules.
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    if (decision === "reject" && reason.trim().length < MIN_REASON) {
      setErrors({ reason: `Give at least ${MIN_REASON} characters so the owner can fix it.` });
      return;
    }

    startTransition(async () => {
      const result = await reviewSalon(
        salon.id,
        decision,
        decision === "reject" ? reason.trim() : null,
        { ...info, gender_focus: info.gender_focus as never },
        hours,
      );

      if (result.ok) {
        toast.success(
          decision === "approve"
            ? `${info.name} approved and live.`
            : `${info.name} rejected.`,
        );
        router.push(`/approvals/${salon.id}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step rail */}
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        {STEPS.map((s, i) => {
          const state =
            step === s.n ? "current" : step > s.n ? "done" : "upcoming";
          return (
            <li key={s.n} className="flex flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  // Only allow going back, or forward through valid steps.
                  if (s.n < step || validateStep(step)) setStep(s.n);
                }}
                aria-current={state === "current" ? "step" : undefined}
                className="flex items-center gap-2.5 text-left"
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium transition-colors",
                    state === "done" && "bg-primary text-primary-foreground",
                    state === "current" &&
                      "bg-primary text-primary-foreground ring-primary/25 ring-4",
                    state === "upcoming" && "bg-muted text-muted-foreground",
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    s.n
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      state === "upcoming" && "text-muted-foreground",
                    )}
                  >
                    {s.title}
                  </span>
                  <span className="text-muted-foreground hidden text-xs sm:block">
                    {s.hint}
                  </span>
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="bg-border hidden h-px flex-1 sm:block" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {/* Step 1 — salon + owner */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Salon &amp; owner</CardTitle>
            <CardDescription>
              Correct anything the owner mistyped. Saved when you approve or
              reject.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field
              id="name"
              label="Salon name"
              required
              value={info.name}
              onChange={(v) => setField("name", v)}
              error={errors.name}
            />

            <div className="grid gap-2">
              <Label htmlFor="gender_focus">Gender focus</Label>
              <Select
                value={info.gender_focus || undefined}
                onValueChange={(v: string) => setField("gender_focus", v)}
              >
                <SelectTrigger id="gender_focus">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="unisex">Unisex</SelectItem>
                </SelectContent>
              </Select>
              {errors.gender_focus && <FieldError>{errors.gender_focus}</FieldError>}
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                value={info.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>

            <Field
              id="address_text"
              label="Address"
              value={info.address_text}
              onChange={(v) => setField("address_text", v)}
            />
            <Field
              id="city"
              label="City"
              value={info.city}
              onChange={(v) => setField("city", v)}
            />
            <Field
              id="phone"
              label="Phone"
              type="tel"
              value={info.phone}
              onChange={(v) => setField("phone", v)}
            />
            <Field
              id="email"
              label="Email"
              type="email"
              value={info.email}
              onChange={(v) => setField("email", v)}
            />

            <div className="bg-muted/40 grid gap-4 rounded-lg p-4 sm:col-span-2 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
              <div className="flex flex-col items-center gap-2">
                <Avatar className="size-14">
                  {info.owner_avatar_url && (
                    <AvatarImage src={info.owner_avatar_url} alt="" />
                  )}
                  <AvatarFallback>{initials(info.owner_name)}</AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground text-xs">Owner</span>
              </div>
              <Field
                id="owner_name"
                label="Owner name"
                value={info.owner_name}
                onChange={(v) => setField("owner_name", v)}
              />
              <Field
                id="owner_avatar_url"
                label="Owner photo URL"
                placeholder="https://…"
                value={info.owner_avatar_url}
                onChange={(v) => setField("owner_avatar_url", v)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — hours */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Opening hours</CardTitle>
            <CardDescription>
              Every day needs an opening and closing time, or must be marked
              closed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
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
                        setDay(day.day_of_week, { open_time: e.target.value })
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
                        setDay(day.day_of_week, { close_time: e.target.value })
                      }
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm sm:pt-5">
                    <Checkbox
                      checked={day.closed}
                      onCheckedChange={(checked: boolean | "indeterminate") =>
                        setDay(day.day_of_week, { closed: checked === true })
                      }
                    />
                    Closed
                  </label>

                  {error && (
                    <p className="text-destructive text-xs sm:col-span-4">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Step 3 — decision */}
      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-emerald-500/40">
            <CardHeader>
              <CardTitle>Approve</CardTitle>
              <CardDescription>
                Publishes {info.name} to the app and saves the details and hours
                from the previous steps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                disabled={pending}
                onClick={() => submit("approve")}
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Approve salon
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>Reject</CardTitle>
              <CardDescription>
                The owner sees this reason and can resubmit.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason for rejection</Label>
                <Textarea
                  id="reason"
                  rows={4}
                  value={reason}
                  aria-invalid={Boolean(errors.reason)}
                  placeholder="Explain what needs fixing before they resubmit…"
                  onChange={(e) => {
                    setReason(e.target.value);
                    setErrors((prev) => ({ ...prev, reason: "" }));
                  }}
                />
                <p
                  className={cn(
                    "text-xs",
                    reason.trim().length < MIN_REASON
                      ? "text-muted-foreground"
                      : "text-emerald-600",
                  )}
                >
                  {reason.trim().length}/{MIN_REASON} characters minimum
                </p>
                {errors.reason && <FieldError>{errors.reason}</FieldError>}
              </div>
              <Button
                variant="destructive"
                className="w-full"
                disabled={pending}
                onClick={() => submit("reject")}
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Reject salon
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step nav */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || pending}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back
        </Button>
        <span className="text-muted-foreground text-sm">Step {step} of 3</span>
        <Button onClick={goNext} disabled={step === 3 || pending}>
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  required,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

function FieldError({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="text-destructive text-xs">
      {children}
    </p>
  );
}
