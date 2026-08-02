import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatusFilter } from "@/components/status-filter";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, relativeDays } from "@/lib/format";
import type { SalonRow, SalonStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Salon approval" };

const VALID = ["pending", "approved", "rejected", "suspended", "all"];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = status && VALID.includes(status) ? status : "pending";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_salons", {
    p_status: active,
  });

  // Counts for the filter chips come from one unfiltered read.
  const { data: allRows } = await supabase.rpc("admin_salons", {
    p_status: "all",
  });

  const salons = (data ?? []) as SalonRow[];
  const counts = ((allRows ?? []) as SalonRow[]).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      acc.all = (acc.all ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <>
      <PageHeader
        title="Salon approval"
        description="Every salon that has applied to join the platform."
      />

      <StatusFilter active={active} counts={counts} />

      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="text-destructive p-6 text-sm">
              Could not load salons: {error.message}
            </p>
          ) : salons.length === 0 ? (
            <p className="text-muted-foreground p-10 text-center text-sm">
              No salons with this status.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salon</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Focus</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salons.map((salon) => (
                  <TableRow key={salon.id}>
                    <TableCell>
                      <Link
                        href={`/approvals/${salon.id}`}
                        className="font-medium hover:underline"
                      >
                        {salon.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {salon.owner_name ?? "No owner"} · {salon.staff_count}{" "}
                        staff · {salon.service_count} services
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {salon.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {salon.gender_focus ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {salon.review_count > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Star
                            className="size-3.5 fill-amber-400 text-amber-400"
                            aria-hidden
                          />
                          {salon.rating}
                          <span className="text-muted-foreground">
                            ({salon.review_count})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      <time dateTime={salon.submitted_at ?? undefined}>
                        {formatDate(salon.submitted_at)}
                      </time>
                      <span className="block text-xs">
                        {relativeDays(salon.submitted_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={salon.status as SalonStatus} />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/approvals/${salon.id}`}
                        aria-label={`Open ${salon.name}`}
                        className="text-muted-foreground hover:text-foreground inline-flex"
                      >
                        <ArrowUpRight className="size-4" aria-hidden />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
