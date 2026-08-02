import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Mail,
  MapPin,
  Phone,
  Star,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SalonActions } from "@/components/salon-actions";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatNu,
  initials,
} from "@/lib/format";
import { PlanControl } from "@/components/plan-control";
import {
  DAY_NAMES,
  type PlanName,
  type PlanRequestRow,
  type SalonDetail,
} from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_salon_detail", { p_business: id });
  const name = (data as SalonDetail | null)?.salon?.name;
  return { title: name ? `${name} — review` : "Salon" };
}

export default async function SalonDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data, error }, { data: planRequests }] = await Promise.all([
    supabase.rpc("admin_salon_detail", { p_business: id }),
    supabase.rpc("admin_plan_requests"),
  ]);

  if (error?.code === "P0002" || (!error && !data)) notFound();
  if (error) {
    return (
      <Card>
        <CardContent className="text-destructive pt-6 text-sm">
          Could not load this salon: {error.message}
        </CardContent>
      </Card>
    );
  }

  const { salon, owner, staff, services, hours, documents } = data as SalonDetail;
  const activeStaff = staff.filter((s) => s.is_active).length;
  const hoursByDay = new Map(hours.map((h) => [h.day_of_week, h]));
  const planRequest =
    ((planRequests ?? []) as PlanRequestRow[]).find(
      (r) => r.business_id === salon.id,
    ) ?? null;

  return (
    <>
      <Link
        href="/approvals"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to approvals
      </Link>

      <PageHeader title={salon.name} description={salon.description ?? undefined}>
        <SalonActions
          salonId={salon.id}
          salonName={salon.name}
          status={salon.status}
          redirectAfterDelete="/approvals"
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={salon.status} />
        {salon.gender_focus && (
          <Badge variant="outline" className="capitalize">
            {salon.gender_focus}
          </Badge>
        )}
        {salon.plan && (
          <Badge variant="secondary" className="capitalize">
            {salon.plan} plan
          </Badge>
        )}
        {salon.review_count > 0 && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
            <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {salon.rating} ({salon.review_count} reviews)
          </span>
        )}
      </div>

      {salon.status === "rejected" && salon.rejection_reason && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              Rejected
            </CardTitle>
            <CardDescription>
              {formatDateTime(salon.reviewed_at)}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{salon.rejection_reason}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Salon details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Salon details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Detail icon={MapPin} label="Address">
              {[salon.address_text, salon.city].filter(Boolean).join(", ") || "—"}
            </Detail>
            <Detail icon={Phone} label="Phone">
              {salon.phone ?? "—"}
            </Detail>
            <Detail icon={Mail} label="Email">
              {salon.email ?? "—"}
            </Detail>
            <Detail icon={CalendarDays} label="Submitted">
              {formatDate(salon.submitted_at)}
            </Detail>
            <Detail icon={BadgeCheck} label="Bookings taken">
              {salon.booking_count}
            </Detail>
            <Detail icon={CalendarDays} label="Last reviewed">
              {formatDate(salon.reviewed_at)}
            </Detail>
          </CardContent>
        </Card>

        {/* Owner */}
        <Card>
          <CardHeader>
            <CardTitle>Owner</CardTitle>
          </CardHeader>
          <CardContent>
            {owner ? (
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  {owner.avatar_url && (
                    <AvatarImage src={owner.avatar_url} alt="" />
                  )}
                  <AvatarFallback>{initials(owner.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {owner.full_name ?? "Unnamed"}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {owner.email ?? owner.phone ?? "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No owner linked.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <PlanControl
        salonId={salon.id}
        currentPlan={(salon.plan ?? "basic") as PlanName}
        request={planRequest}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Staff */}
        <Card>
          <CardHeader>
            <CardTitle>Staff</CardTitle>
            <CardDescription>
              {staff.length} listed · {activeStaff} active
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {staff.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">
                No staff added yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-7">
                            {member.photo_url && (
                              <AvatarImage src={member.photo_url} alt="" />
                            )}
                            <AvatarFallback className="text-[0.625rem]">
                              {initials(member.display_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {member.display_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {member.role}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={member.is_active ? "secondary" : "outline"}
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>{services.length} on the menu</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {services.length === 0 ? (
              <p className="text-muted-foreground p-6 text-sm">
                No services added yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        <span className="font-medium">{service.name}</span>
                        {!service.is_active && (
                          <Badge variant="outline" className="ml-2">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDuration(service.duration_minutes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNu(service.price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Opening hours</CardTitle>
            <CardDescription>Days with no entry are closed.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {DAY_NAMES.map((day, index) => {
                const entry = hoursByDay.get(index);
                return (
                  <div key={day} className="flex justify-between py-2">
                    <dt>{day}</dt>
                    <dd
                      className={
                        entry ? "tabular-nums" : "text-muted-foreground"
                      }
                    >
                      {entry
                        ? `${entry.open_time?.slice(0, 5)} – ${entry.close_time?.slice(0, 5)}`
                        : "Closed"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {documents.length} uploaded for verification
            </CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No documents uploaded.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {doc.file_name ?? "Document"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(doc.uploaded_at)}
                      </p>
                    </div>
                    {doc.verified_at ? (
                      <Badge variant="secondary" className="shrink-0">
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        Unverified
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="text-sm font-medium break-words">{children}</dd>
      </div>
    </div>
  );
}
