import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CalendarCheck, Clock, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import {
  BookingStatusChart,
  BookingsTrendChart,
  SalonStatusChart,
  TopSalonsChart,
  UsersByRoleChart,
} from "@/components/dashboard-charts";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, relativeDays } from "@/lib/format";
import type { DashboardData, TopSalonRow, TrendPoint } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

const KPIS = [
  { key: "total_salons", label: "Salons", icon: Building2 },
  { key: "pending_approvals", label: "Awaiting review", icon: Clock },
  { key: "total_users", label: "Accounts", icon: Users },
  { key: "total_bookings", label: "Bookings", icon: CalendarCheck },
] as const;

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: trend }, { data: topSalons }] =
    await Promise.all([
      supabase.rpc("admin_dashboard"),
      supabase.rpc("admin_bookings_trend", { p_range: "14d" }),
      supabase.rpc("admin_top_salons", { p_metric: "turnout", p_limit: 8 }),
    ]);

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <CardContent className="text-destructive pt-6 text-sm">
            Could not load the dashboard: {error.message}
          </CardContent>
        </Card>
      </>
    );
  }

  const d = data as DashboardData;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Platform activity across every salon on Bhutan Salons."
      >
        {d.pending_approvals > 0 && (
          <Button asChild>
            <Link href="/approvals?status=pending">
              Review {d.pending_approvals} pending
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        )}
      </PageHeader>

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <Card key={kpi.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {kpi.label}
              </CardTitle>
              <kpi.icon className="text-muted-foreground size-4" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {d[kpi.key]}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-label="Analytics" className="grid gap-4 lg:grid-cols-3">
        <BookingsTrendChart initialData={(trend ?? []) as TrendPoint[]} />
        <SalonStatusChart data={d.salons_by_status} />
        <UsersByRoleChart data={d.users_by_role} />
        <BookingStatusChart data={d.bookings_by_status} />
        <TopSalonsChart initialData={(topSalons ?? []) as TopSalonRow[]} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Latest submissions</CardTitle>
          <CardDescription>
            Salons waiting on a decision, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.recent_pending.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nothing waiting for review. Good place to be.
            </p>
          ) : (
            <ul className="divide-y">
              {d.recent_pending.map((salon) => (
                <li
                  key={salon.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/approvals/${salon.id}`}
                      className="font-medium hover:underline"
                    >
                      {salon.name}
                    </Link>
                    <p className="text-muted-foreground text-sm">
                      {[salon.city, salon.gender_focus, salon.owner_name]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm">
                      <time dateTime={salon.submitted_at ?? undefined}>
                        {formatDate(salon.submitted_at)}
                      </time>{" "}
                      ({relativeDays(salon.submitted_at)})
                    </span>
                    <StatusBadge status="pending" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
