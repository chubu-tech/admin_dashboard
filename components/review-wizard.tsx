"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reviewSalon } from "@/app/actions";
import { Field, FieldError } from "@/components/form-field";
import { HoursEditor, validateHours } from "@/components/hours-editor";
import {
  SalonDetailsFields,
  validateSalonDetails,
} from "@/components/salon-details-fields";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
    // Strings, because the RPC reads them with `p_info->>'lat'` and parses
    // them itself. Empty means "leave whatever pin is already there".
    lat: salon.lat != null ? String(salon.lat) : "",
    lng: salon.lng != null ? String(salon.lng) : "",
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
    let next: Record<string, string> = {};

    if (target === 1) {
      next = { ...next, ...validateSalonDetails(info) };
    }

    if (target === 2) {
      next = { ...next, ...validateHours(hours) };
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
            <SalonDetailsFields
              value={info}
              errors={errors}
              onField={setField}
              onCoords={({ lat, lng }) => {
                setInfo((prev) => ({ ...prev, lat, lng }));
                setErrors((prev) => ({ ...prev, coords: "" }));
              }}
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
          <CardContent>
            <HoursEditor hours={hours} errors={errors} onChange={setDay} />
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
