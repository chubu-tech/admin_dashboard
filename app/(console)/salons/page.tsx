import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Plus, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { SalonActions } from "@/components/salon-actions";
import { StatusBadge } from "@/components/status-badge";
import { StatusFilter } from "@/components/status-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { paginate, readPage, readStatus } from "@/lib/paginate";
import type { SalonRow, SalonStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Salon management" };

export default async function SalonsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status, page: pageParam } = await searchParams;
  const active = readStatus(status, "all");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_salons", {
    p_status: active,
  });
  const all = (data ?? []) as SalonRow[];
  const { rows: salons, page, totalPages, total } = paginate(
    all,
    readPage(pageParam),
  );

  return (
    <>
      <PageHeader
        title="Salon management"
        description="Every salon on the platform. Suspend, reactivate or remove."
      >
        <Button asChild>
          <Link href="/salons/new">
            <Plus className="size-4" aria-hidden />
            Add salon
          </Link>
        </Button>
      </PageHeader>

      <StatusFilter active={active} />

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
                  <TableHead>Owner</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Rating</TableHead>
                  <TableHead>Reviewed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                        {salon.staff_count} staff · {salon.service_count} services
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {salon.owner_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {salon.city ?? "—"}
                        {salon.lat != null && salon.lng != null && (
                          <MapPin
                            className="text-muted-foreground/70 size-3.5"
                            aria-label="Pinned on the map"
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {salon.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {salon.review_count > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Star
                            className="size-3.5 fill-amber-400 text-amber-400"
                            aria-hidden
                          />
                          {salon.rating}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(salon.reviewed_at)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={salon.status as SalonStatus} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <SalonActions
                          salonId={salon.id}
                          salonName={salon.name}
                          status={salon.status as SalonStatus}
                          showReview={false}
                          compactEdit
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          label="salons"
        />
      </Card>
    </>
  );
}
