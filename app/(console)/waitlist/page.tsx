import type { Metadata } from "next";
import {
  CheckCheck,
  Clock,
  Mail,
  MailWarning,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import {
  RetryFailuresButton,
  SendLaunchDialog,
  SendRemainingButton,
} from "@/components/waitlist-send";
import { WaitlistSort } from "@/components/waitlist-sort";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isEmailConfigured } from "@/lib/email";
import { formatDate, formatDateTime, relativeDays } from "@/lib/format";
import { paginate, readPage } from "@/lib/paginate";
import type { WaitlistCampaign, WaitlistRow, WaitlistSort as Sort, WaitlistStats } from "@/lib/types";

export const metadata: Metadata = { title: "App waitlist" };

/**
 * The pre-launch mailing list, and the launch announcement.
 *
 * Three reads, one round trip each, in parallel — the same shape as the
 * dashboard. `admin_waitlist` returns every row and this slices it, matching
 * every other listing in the console (`lib/paginate.ts` explains why).
 *
 * The sort is a URL parameter rather than a client-side re-order because
 * paging is a navigation: sorting in React would put page 3 of "newest" on
 * screen while the pager still thought it was showing "oldest".
 */
export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const params = await searchParams;
  // Narrowed before it reaches the RPC, which raises 22023 on anything else.
  const sort: Sort = params.sort === "oldest" ? "oldest" : "newest";

  const supabase = await createClient();
  const [
    { data: statsData, error: statsError },
    { data: rowData, error: rowError },
    { data: campaignData },
  ] = await Promise.all([
    supabase.rpc("admin_waitlist_stats"),
    supabase.rpc("admin_waitlist", { p_sort: sort }),
    supabase.rpc("admin_waitlist_campaigns"),
  ]);

  if (statsError) {
    return (
      <>
        <PageHeader title="App waitlist" />
        <Card>
          <CardContent className="text-destructive pt-6 text-sm">
            Could not load the waitlist: {statsError.message}
          </CardContent>
        </Card>
      </>
    );
  }

  const stats = statsData as WaitlistStats;
  const rows = (rowData ?? []) as WaitlistRow[];
  const campaigns = (campaignData ?? []) as WaitlistCampaign[];
  const page = paginate(rows, readPage(params.page));
  const emailConfigured = isEmailConfigured();

  const KPIS = [
    {
      key: "total",
      label: "On the waitlist",
      value: stats.total,
      icon: Mail,
      note: stats.latest_signup_at
        ? `Latest ${relativeDays(stats.latest_signup_at)}`
        : "Nobody yet",
    },
    {
      key: "recent",
      label: "Joined this week",
      value: stats.last_7_days,
      icon: TrendingUp,
      note: `${stats.last_30_days} in the last 30 days`,
    },
    {
      key: "notified",
      label: "Emailed at launch",
      value: stats.notified,
      icon: CheckCheck,
      note: `${stats.not_notified} still to hear`,
    },
    {
      key: "outstanding",
      label: "Queued to send",
      value: stats.pending_deliveries,
      icon: stats.failed_deliveries > 0 ? MailWarning : Clock,
      note:
        stats.failed_deliveries > 0
          ? `${stats.failed_deliveries} failed — retry below`
          : "Nothing waiting",
    },
  ] as const;

  return (
    <>
      <PageHeader
        title="App waitlist"
        description="People waiting to hear that the Tho app has launched. They joined from the marketing site — by pressing a download button or scanning the QR."
      >
        <SendLaunchDialog
          recipientCount={stats.not_notified}
          notifiedCount={stats.notified}
          emailConfigured={emailConfigured}
        />
      </PageHeader>

      <section
        aria-label="Waitlist figures"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
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
                {kpi.value}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">{kpi.note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Campaign history. Only rendered once there is one — an empty card
          headed "Announcements" on a pre-launch console is furniture. */}
      {campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Launch announcements</CardTitle>
            <CardDescription>
              Every send, and how much of it landed. A batch is 25 emails; a
              campaign with any left queued was interrupted or is partway through.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{campaign.subject}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatDateTime(campaign.created_at)}
                    {campaign.created_by_name ? ` · ${campaign.created_by_name}` : ""}
                    {` · ${campaign.total} recipient${campaign.total === 1 ? "" : "s"}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="tabular-nums">
                    {campaign.sent} sent
                  </Badge>
                  {campaign.queued > 0 && (
                    <Badge variant="outline" className="tabular-nums">
                      {campaign.queued} queued
                    </Badge>
                  )}
                  {campaign.failed > 0 && (
                    <Badge variant="destructive" className="tabular-nums">
                      {campaign.failed} failed
                    </Badge>
                  )}
                  {campaign.queued > 0 && (
                    <SendRemainingButton
                      campaignId={campaign.id}
                      remaining={campaign.queued}
                      emailConfigured={emailConfigured}
                    />
                  )}
                  {campaign.failed > 0 && (
                    <RetryFailuresButton
                      campaignId={campaign.id}
                      failed={campaign.failed}
                      emailConfigured={emailConfigured}
                    />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Signups</CardTitle>
            <CardDescription>
              {stats.total === 0
                ? "Nobody has joined yet."
                : `${stats.total} ${stats.total === 1 ? "address" : "addresses"}, sorted by when they joined.`}
            </CardDescription>
          </div>
          {rows.length > 1 && <WaitlistSort active={sort} />}
        </CardHeader>

        <CardContent className="p-0">
          {rowError ? (
            <p className="text-destructive p-6 text-sm">
              Could not load the signups: {rowError.message}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-10 text-center text-sm">
              No signups yet. They arrive from the waitlist form on the marketing
              site.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Date joined</TableHead>
                  <TableHead>Came from</TableHead>
                  <TableHead className="text-right">Launch email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium break-all">
                      {row.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      <time dateTime={row.created_at}>
                        {formatDate(row.created_at)}
                      </time>
                      <span className="block text-xs">
                        {relativeDays(row.created_at)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {sourceLabel(row.source)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.notified_at ? (
                        <Badge variant="secondary" className="whitespace-nowrap">
                          Sent {formatDate(row.notified_at)}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not yet</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <Pagination
          page={page.page}
          totalPages={page.totalPages}
          total={page.total}
          label="signups"
        />
      </Card>
    </>
  );
}

/**
 * `source` is free text written by the marketing site, so this maps the values
 * it actually sends and passes anything else through rather than hiding it —
 * an unrecognised source means the site added a call to action, which is worth
 * seeing rather than swallowing.
 */
function sourceLabel(source: string | null): string {
  switch (source) {
    case "download_button":
      return "Download button";
    case "app_store":
      return "App Store badge";
    case "google_play":
      return "Google Play badge";
    case "header":
      return "Header button";
    case "pricing":
      return "Pricing panel";
    case "qr":
      return "QR scan";
    case "waitlist_page":
      return "Waitlist page";
    default:
      return source ?? "—";
  }
}
