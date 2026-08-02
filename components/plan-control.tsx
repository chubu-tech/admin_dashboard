"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setSalonPlan } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { PlanName, PlanRequestRow } from "@/lib/types";

/* Prices mirror the in-app Plans screen. Keep them in step. */
const PLANS: { value: PlanName; label: string; price: string; blurb: string }[] =
  [
    {
      value: "basic",
      label: "Basic",
      price: "Nu 399/mo",
      blurb: "Listed, online bookings, walk-in queue, 1 stylist.",
    },
    {
      value: "growth",
      label: "Growth",
      price: "Nu 799/mo",
      blurb: "Unlimited stylists, week view, reminders, customer list.",
    },
    {
      value: "pro",
      label: "Pro",
      price: "Nu 1,499/mo",
      blurb: "Priority placement, staff pay, deposits & no-show cover.",
    },
  ];

/**
 * Membership plan for one salon.
 *
 * Payment happens off-app (bank transfer / mBoB), so this is the switch an
 * operator flips once money has landed — until now that was a hand-written SQL
 * UPDATE. A pending upgrade request from the owner is surfaced inline so the
 * decision has its context attached.
 */
export function PlanControl({
  salonId,
  currentPlan,
  request,
}: {
  salonId: string;
  currentPlan: PlanName;
  request?: PlanRequestRow | null;
}) {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<PlanName | null>(null);
  const router = useRouter();

  function apply(plan: PlanName) {
    if (plan === currentPlan) return;
    setTarget(plan);
    startTransition(async () => {
      const result = await setSalonPlan(salonId, plan);
      if (result.ok) {
        toast.success(`Plan changed to ${plan}.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setTarget(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membership plan</CardTitle>
        <CardDescription>
          Change once payment has cleared. The salon&apos;s features update
          immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {request && (
          <div className="bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 text-sm">
            <ArrowUpRight className="text-muted-foreground size-4" aria-hidden />
            <span>
              <span className="font-medium">
                {request.requested_by_name ?? "The owner"}
              </span>{" "}
              requested{" "}
              <Badge variant="secondary" className="capitalize">
                {request.requested_plan}
              </Badge>
            </span>
            <span className="text-muted-foreground">
              {formatDate(request.created_at)}
              {request.note ? ` · ${request.note}` : ""}
            </span>
          </div>
        )}

        <ul className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.value === currentPlan;
            const isRequested = request?.requested_plan === plan.value;
            const busy = pending && target === plan.value;

            return (
              <li key={plan.value}>
                <div
                  className={cn(
                    "flex h-full flex-col rounded-lg border p-4 transition-colors",
                    isCurrent && "border-primary bg-primary/5",
                    isRequested && !isCurrent && "border-amber-400",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{plan.label}</span>
                    {isCurrent && (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="size-3" aria-hidden />
                        Current
                      </Badge>
                    )}
                    {isRequested && !isCurrent && (
                      <Badge variant="outline">Requested</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    {plan.price}
                  </p>
                  <p className="text-muted-foreground mt-1.5 flex-1 text-xs leading-relaxed">
                    {plan.blurb}
                  </p>
                  <Button
                    variant={isRequested && !isCurrent ? "default" : "outline"}
                    size="sm"
                    className="mt-3 w-full"
                    disabled={isCurrent || pending}
                    onClick={() => apply(plan.value)}
                  >
                    {busy && (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    )}
                    {isCurrent ? "Active" : `Switch to ${plan.label}`}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
