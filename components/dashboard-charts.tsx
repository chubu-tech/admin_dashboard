"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBookingsTrend, getTopSalons } from "@/app/actions";
import { formatNu } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  TREND_RANGES,
  type DashboardData,
  type TopSalonRow,
  type TrendPoint,
  type TrendRange,
} from "@/lib/types";

/* One chart per question, and each answers it without a legend hunt:
   - how busy have we been?      → 14-day area
   - where are salons stuck?     → status bars
   - who is on the platform?     → role donut
   Colours come from the --chart-* tokens so light and dark both hold up. */

const salonConfig = {
  count: { label: "Salons", color: "var(--chart-2)" },
} satisfies ChartConfig;

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--chart-4)",
  approved: "var(--chart-2)",
  rejected: "var(--chart-5)",
  suspended: "var(--chart-3)",
};

const ROLE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

const trendConfig = {
  bookings: { label: "Bookings", color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * Bookings over a selectable window. The range is fetched fresh from
 * `admin_bookings_trend` rather than sliced client-side, because anything
 * longer than the initial 14 days simply isn't on the page yet — and the year
 * view needs monthly buckets, not daily ones.
 */
export function BookingsTrendChart({
  initialData,
  initialRange = "14d",
}: {
  initialData: TrendPoint[];
  initialRange?: TrendRange;
}) {
  const [range, setRange] = useState<TrendRange>(initialRange);
  const [rows, setRows] = useState<TrendPoint[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRange(next: TrendRange) {
    setRange(next);
    setLoading(true);
    setError(null);
    try {
      setRows(await getBookingsTrend(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that range.");
    } finally {
      setLoading(false);
    }
  }

  const total = rows.reduce((sum, r) => sum + r.bookings, 0);
  const revenue = rows.reduce((sum, r) => sum + Number(r.revenue ?? 0), 0);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Bookings over time</CardTitle>
          <CardDescription>
            {total} booking{total === 1 ? "" : "s"} ·{" "}
            {formatNu(Math.round(revenue))} from completed
          </CardDescription>
        </div>
        <Select
          value={range}
          onValueChange={(v: string) => changeRange(v as TrendRange)}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Choose time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TREND_RANGES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-destructive py-16 text-center text-sm">{error}</p>
        ) : (
          <ChartContainer
            config={trendConfig}
            className={cn(
              "h-[240px] w-full transition-opacity",
              loading && "opacity-50",
            )}
          >
            {/* No negative left margin — it clips the Y tick labels ("10"
                renders as "0"). */}
            <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fillBookings" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-bookings)"
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-bookings)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={20}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                allowDecimals={false}
                width={40}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              {/* Linear, not monotone: these are daily counts, and a smoothed
                  curve would imply fractional bookings between points. */}
              <Area
                dataKey="bookings"
                type="linear"
                stroke="var(--color-bookings)"
                strokeWidth={2}
                fill="url(#fillBookings)"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

const TOP_METRICS = [
  { value: "turnout" as const, label: "Customer turnout" },
  { value: "revenue" as const, label: "Revenue" },
];

/**
 * Which salons are actually busy. "Turnout" counts distinct customers with a
 * completed booking — people who showed up, not people who booked.
 */
export function TopSalonsChart({
  initialData,
}: {
  initialData: TopSalonRow[];
}) {
  const [metric, setMetric] = useState<"turnout" | "revenue">("turnout");
  const [rows, setRows] = useState<TopSalonRow[]>(initialData);
  const [loading, setLoading] = useState(false);

  async function changeMetric(next: "turnout" | "revenue") {
    setMetric(next);
    setLoading(true);
    try {
      setRows(await getTopSalons(next));
    } finally {
      setLoading(false);
    }
  }

  const config = {
    value: {
      label: metric === "revenue" ? "Revenue" : "Customers",
      color: metric === "revenue" ? "var(--chart-2)" : "var(--chart-1)",
    },
  } satisfies ChartConfig;

  const data = rows.map((row) => ({
    ...row,
    value: metric === "revenue" ? Number(row.revenue) : row.customers,
  }));

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Busiest salons</CardTitle>
          <CardDescription>
            {metric === "revenue"
              ? "Total from completed bookings."
              : "Customers who showed up for a completed booking."}
          </CardDescription>
        </div>
        <Select
          value={metric}
          onValueChange={(v: string) =>
            changeMetric(v as "turnout" | "revenue")
          }
        >
          <SelectTrigger className="w-[11rem]" aria-label="Rank salons by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOP_METRICS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            No completed bookings yet.
          </p>
        ) : (
          <ChartContainer
            config={config}
            className={cn(
              "w-full transition-opacity",
              loading && "opacity-50",
            )}
            style={{ height: `${Math.max(200, data.length * 38)}px` }}
          >
            {/* Right margin has to clear the widest value label ("Nu 21,750"),
                or the biggest bar's number wraps off the card. */}
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 8, right: 84 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={150}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value) =>
                      metric === "revenue"
                        ? formatNu(Number(value))
                        : `${value} customers`
                    }
                  />
                }
              />
              <Bar dataKey="value" fill="var(--color-value)" radius={[0, 6, 6, 0]}>
                <LabelList
                  dataKey="value"
                  position="right"
                  className="fill-foreground"
                  fontSize={12}
                  formatter={(value: unknown) =>
                    metric === "revenue"
                      ? formatNu(Number(value))
                      : String(value ?? "")
                  }
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function SalonStatusChart({
  data,
}: {
  data: DashboardData["salons_by_status"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Salons by status</CardTitle>
        <CardDescription>Where each salon sits in review.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={salonConfig} className="h-[240px] w-full">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="status"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v: string) => v[0].toUpperCase() + v.slice(1)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
              width={40}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((row) => (
                <Cell
                  key={row.status}
                  fill={STATUS_COLOR[row.status] ?? "var(--chart-1)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function UsersByRoleChart({
  data,
}: {
  data: DashboardData["users_by_role"];
}) {
  const config: ChartConfig = Object.fromEntries(
    data.map((row, i) => [
      row.role,
      { label: row.role[0].toUpperCase() + row.role.slice(1), color: ROLE_COLORS[i % ROLE_COLORS.length] },
    ]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts by role</CardTitle>
        <CardDescription>Who is signed up to the platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[240px] w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="role" hideLabel />} />
            <Pie
              data={data}
              dataKey="count"
              nameKey="role"
              innerRadius={52}
              strokeWidth={4}
            >
              {data.map((row, i) => (
                <Cell
                  key={row.role}
                  fill={ROLE_COLORS[i % ROLE_COLORS.length]}
                />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey="role" />} />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function BookingStatusChart({
  data,
}: {
  data: DashboardData["bookings_by_status"];
}) {
  const config = {
    count: { label: "Bookings", color: "var(--chart-3)" },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bookings by outcome</CardTitle>
        <CardDescription>
          Completed, cancelled and no-show volumes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[240px] w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 16 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="status"
              tickLine={false}
              axisLine={false}
              width={84}
              tickFormatter={(v: string) =>
                v.replace("_", "-").replace(/^./, (c) => c.toUpperCase())
              }
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
