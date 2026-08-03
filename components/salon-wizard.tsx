"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { createOwner, createSalon } from "@/app/actions";
import { Field, FieldError } from "@/components/form-field";
import { HoursEditor, blankWeek, validateHours } from "@/components/hours-editor";
import {
  SalonDetailsFields,
  validateSalonDetails,
} from "@/components/salon-details-fields";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import {
  BUSINESS_TYPES,
  PLAN_NAMES,
  type BusinessType,
  type CreateSalonInfo,
  type PlanName,
  type ReviewHours,
  type UserRow,
} from "@/lib/types";

const STEPS = [
  { n: 1, title: "Owner", hint: "Pick an account, or create one" },
  { n: 2, title: "Salon", hint: "Details, type, plan and map pin" },
  { n: 3, title: "Opening hours", hint: "Set the week, or leave it to the owner" },
] as const;

const MIN_PASSWORD = 8;

/**
 * Onboard a salon on an owner's behalf.
 *
 * Mirrors `admin_create_salon`'s validation exactly — name required, gender
 * and type and plan from fixed sets, coordinates paired and in range, and a
 * day either closed or opening before it closes. The server re-checks all of
 * it; this just means the operator finds out before submitting.
 *
 * Unlike an owner's own application this salon is born approved and live, so
 * the last step says so plainly.
 */
export function SalonWizard({
  users,
  canCreateOwner,
}: {
  users: UserRow[];
  /** False when this deployment has no service-role key — see the page. */
  canCreateOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const [newOwner, setNewOwner] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    avatar_url: "",
  });

  const [info, setInfo] = useState({
    name: "",
    description: "",
    gender_focus: "",
    business_type: "salon" as BusinessType,
    plan: "basic" as PlanName,
    address_text: "",
    city: "",
    phone: "",
    email: "",
    lat: "",
    lng: "",
  });

  const [hours, setHours] = useState<ReviewHours[]>(blankWeek);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = users.filter((u) => u.role !== "admin");
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((u) =>
        [u.full_name, u.email, u.phone]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [users, query]);

  const selected = users.find((u) => u.id === ownerId) ?? null;

  function setField(key: keyof typeof info, value: string) {
    setInfo((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function setOwnerField(key: keyof typeof newOwner, value: string) {
    setNewOwner((prev) => ({ ...prev, [key]: value }));
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
      if (mode === "existing") {
        if (!ownerId) next.owner = "Choose the account that will own this salon.";
      } else {
        if (!newOwner.full_name.trim()) next.full_name = "The owner's name is required.";
        if (!newOwner.email.trim()) next.email = "An email address is required.";
        else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newOwner.email.trim())) {
          next.email = "That does not look like an email address.";
        }
        if (newOwner.password.length < MIN_PASSWORD) {
          next.password = `At least ${MIN_PASSWORD} characters.`;
        }
      }
    }

    if (target === 2) {
      next = { ...next, ...validateSalonDetails(info) };
    }

    if (target === 3) {
      next = { ...next, ...validateHours(hours) };
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (validateStep(step)) setStep((s) => Math.min(3, s + 1));
  }

  function submit() {
    for (const target of [1, 2, 3]) {
      if (!validateStep(target)) {
        setStep(target);
        return;
      }
    }

    startTransition(async () => {
      let owner = ownerId;

      // A brand-new owner needs an auth account before a salon can point at
      // it — profiles.id is a foreign key to auth.users(id).
      if (mode === "new") {
        const created = await createOwner({
          email: newOwner.email.trim(),
          password: newOwner.password,
          full_name: newOwner.full_name.trim(),
          phone: newOwner.phone.trim() || undefined,
          avatar_url: newOwner.avatar_url.trim() || undefined,
        });

        if (!created.ok) {
          toast.error(created.error);
          setStep(1);
          return;
        }
        owner = created.id;
      }

      if (!owner) {
        toast.error("No owner selected.");
        setStep(1);
        return;
      }

      const payload: CreateSalonInfo = {
        name: info.name.trim(),
        description: info.description.trim() || undefined,
        gender_focus: (info.gender_focus || undefined) as CreateSalonInfo["gender_focus"],
        address_text: info.address_text.trim() || undefined,
        city: info.city.trim() || undefined,
        phone: info.phone.trim() || undefined,
        email: info.email.trim() || undefined,
        business_type: info.business_type,
        plan: info.plan,
        ...(info.lat.trim() && info.lng.trim()
          ? { lat: info.lat.trim(), lng: info.lng.trim() }
          : {}),
      };

      const result = await createSalon(owner, payload, hours);

      if (result.ok) {
        toast.success(`${payload.name} created and live.`);
        router.push(`/approvals/${result.id}`);
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

      {/* Step 1 — owner */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Who owns this salon?</CardTitle>
            <CardDescription>
              An existing account is promoted to owner automatically. A new one
              gets a confirmed login you can hand over.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                <ModeTab
                  active={mode === "existing"}
                  onClick={() => {
                    setMode("existing");
                    setErrors({});
                  }}
                >
                  Existing account
                </ModeTab>
                <ModeTab
                  active={mode === "new"}
                  disabled={!canCreateOwner}
                  describedBy={
                    canCreateOwner ? undefined : "no-service-role-note"
                  }
                  onClick={() => {
                    setMode("new");
                    setErrors({});
                  }}
                >
                  Create an owner
                </ModeTab>
              </div>

              {!canCreateOwner && (
                <p
                  id="no-service-role-note"
                  className="text-muted-foreground text-xs"
                >
                  Creating an owner needs{" "}
                  <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
                  on this deployment — an owner&apos;s login cannot be made
                  without it. Pick an existing account below, or set the key and
                  restart the server. Any account works: it is promoted to owner
                  automatically.
                </p>
              )}
            </div>

            {mode === "existing" ? (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="owner-search">Search accounts</Label>
                  <div className="relative">
                    <Search
                      className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      id="owner-search"
                      className="pl-9"
                      placeholder="Name, email or phone"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>

                {matches.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    No account matches that. Create one instead.
                  </p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {matches.map((user) => (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOwnerId(user.id);
                            setErrors((prev) => ({ ...prev, owner: "" }));
                          }}
                          aria-pressed={ownerId === user.id}
                          className={cn(
                            "hover:bg-accent flex w-full items-center gap-3 p-3 text-left transition-colors",
                            ownerId === user.id && "bg-primary/5",
                          )}
                        >
                          <Avatar className="size-8">
                            {user.avatar_url && (
                              <AvatarImage src={user.avatar_url} alt="" />
                            )}
                            <AvatarFallback className="text-xs">
                              {initials(user.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {user.full_name ?? "Unnamed"}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">
                              {user.email ?? user.phone ?? "—"}
                            </p>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {user.role}
                          </Badge>
                          {ownerId === user.id && (
                            <Check className="text-primary size-4" aria-hidden />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {errors.owner && <FieldError>{errors.owner}</FieldError>}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="full_name"
                  label="Owner name"
                  required
                  value={newOwner.full_name}
                  onChange={(v) => setOwnerField("full_name", v)}
                  error={errors.full_name}
                />
                <Field
                  id="owner_email"
                  label="Email"
                  type="email"
                  required
                  value={newOwner.email}
                  onChange={(v) => setOwnerField("email", v)}
                  error={errors.email}
                  hint="They sign in with this."
                />
                <Field
                  id="owner_phone"
                  label="Phone"
                  type="tel"
                  value={newOwner.phone}
                  onChange={(v) => setOwnerField("phone", v)}
                />
                <Field
                  id="password"
                  label="Temporary password"
                  type="text"
                  required
                  value={newOwner.password}
                  onChange={(v) => setOwnerField("password", v)}
                  error={errors.password}
                  hint={`At least ${MIN_PASSWORD} characters. Shown in the clear so you can read it out.`}
                />
                <Field
                  id="owner_avatar_url"
                  label="Photo URL"
                  placeholder="https://…"
                  value={newOwner.avatar_url}
                  onChange={(v) => setOwnerField("avatar_url", v)}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 — the salon */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Salon details</CardTitle>
            <CardDescription>
              Only the name is required. Everything else the owner can fill in
              later from the app.
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

              <div className="grid gap-2">
                <Label htmlFor="plan">Membership plan</Label>
                <Select
                  value={info.plan}
                  onValueChange={(v: string) => setField("plan", v)}
                >
                  <SelectTrigger id="plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_NAMES.map((plan) => (
                      <SelectItem key={plan.value} value={plan.value}>
                        {plan.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SalonDetailsFields>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — hours and create */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Opening hours</CardTitle>
              <CardDescription>
                Every day starts closed. Set the ones the salon trades, or leave
                the whole week alone and let the owner do it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HoursEditor hours={hours} errors={errors} onChange={setDay} />
            </CardContent>
          </Card>

          <Card className="border-emerald-500/40">
            <CardHeader>
              <CardTitle>Create the salon</CardTitle>
              <CardDescription>
                {info.name || "This salon"} goes live immediately — an operator
                onboarding is treated as already reviewed, so it skips the
                pending queue.
                {mode === "new" &&
                  " The owner account is created first, with the password from step 1."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <dl className="grid gap-1 text-sm sm:grid-cols-2">
                <Summary label="Owner">
                  {mode === "new"
                    ? `${newOwner.full_name || "New owner"} (new account)`
                    : (selected?.full_name ?? selected?.email ?? "—")}
                </Summary>
                <Summary label="Plan">
                  <span className="capitalize">{info.plan}</span>
                </Summary>
                <Summary label="City">{info.city || "—"}</Summary>
                <Summary label="Map pin">
                  {info.lat && info.lng
                    ? `${info.lat}, ${info.lng}`
                    : "Not pinned"}
                </Summary>
              </dl>
              <Button className="w-full" disabled={pending} onClick={submit}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Create salon
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

function ModeTab({
  active,
  onClick,
  children,
  disabled,
  describedBy,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-describedby={describedBy}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        // Real `disabled`, so it is skipped by the tab order rather than just
        // looking dim.
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function Summary({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 truncate font-medium">{children}</dd>
    </div>
  );
}
