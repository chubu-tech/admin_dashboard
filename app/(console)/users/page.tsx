import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { BlockActions } from "@/components/user-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, initials, relativeDays } from "@/lib/format";
import type { CustomerRiskRow, OwnerRow } from "@/lib/types";

export const metadata: Metadata = { title: "User management" };

export default async function UsersPage() {
  const supabase = await createClient();

  const [{ data: ownerData }, { data: riskData, error: riskError }] =
    await Promise.all([
      supabase.rpc("admin_owners"),
      supabase.rpc("admin_customers_at_risk"),
    ]);

  const owners = (ownerData ?? []) as OwnerRow[];
  const atRisk = (riskData ?? []) as CustomerRiskRow[];
  const noShows = atRisk.filter((c) => c.no_show_count > 0 && !c.is_blocked);
  const blocked = atRisk.filter((c) => c.is_blocked);

  return (
    <>
      <PageHeader
        title="User management"
        description="Salon owners, customers who miss appointments, and anyone currently blocked."
      />

      <Tabs defaultValue="owners">
        <TabsList>
          <TabsTrigger value="owners">Owners ({owners.length})</TabsTrigger>
          <TabsTrigger value="no-shows">No-shows ({noShows.length})</TabsTrigger>
          <TabsTrigger value="blocked">Blocked ({blocked.length})</TabsTrigger>
        </TabsList>

        {/* Owners + their salons */}
        <TabsContent value="owners">
          <Card>
            <CardContent className="p-0">
              {owners.length === 0 ? (
                <Empty>No owner accounts yet.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Owner</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Salons</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {owners.map((owner) => (
                      <TableRow key={owner.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="size-8">
                              {owner.avatar_url && (
                                <AvatarImage src={owner.avatar_url} alt="" />
                              )}
                              <AvatarFallback className="text-xs">
                                {initials(owner.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {owner.full_name ?? "Unnamed"}
                              </p>
                              {owner.suspended_at && (
                                <Badge variant="destructive" className="mt-0.5">
                                  Suspended
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {owner.email ?? owner.phone ?? "—"}
                        </TableCell>
                        <TableCell>
                          {owner.salons.length === 0 ? (
                            <span className="text-muted-foreground text-sm">
                              None
                            </span>
                          ) : (
                            <ul className="flex flex-wrap gap-1.5">
                              {owner.salons.map((salon) => (
                                <li key={salon.id}>
                                  <Link
                                    href={`/approvals/${salon.id}`}
                                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:underline"
                                  >
                                    {salon.name}
                                    <StatusBadge
                                      status={salon.status}
                                      className="px-1.5 py-0 text-[0.625rem]"
                                    />
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDate(owner.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* No-shows */}
        <TabsContent value="no-shows">
          <Card>
            <CardContent className="p-0">
              {riskError ? (
                <p className="text-destructive p-6 text-sm">
                  Could not load customers: {riskError.message}
                </p>
              ) : noShows.length === 0 ? (
                <Empty>
                  No customer has missed an appointment. Nothing to action.
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">No-shows</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead>Last missed</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {noShows.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <CustomerCell customer={customer} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              customer.no_show_count >= 3
                                ? "destructive"
                                : "secondary"
                            }
                            className="tabular-nums"
                          >
                            {customer.no_show_count >= 3 && (
                              <AlertTriangle className="size-3" aria-hidden />
                            )}
                            {customer.no_show_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right tabular-nums">
                          {customer.booking_count}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDate(customer.last_no_show_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <BlockActions
                              userId={customer.id}
                              name={customer.full_name ?? "This customer"}
                              isBlocked={false}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Blocked */}
        <TabsContent value="blocked">
          <Card>
            <CardContent className="p-0">
              {blocked.length === 0 ? (
                <Empty>Nobody is blocked right now.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">No-shows</TableHead>
                      <TableHead>Blocked on</TableHead>
                      <TableHead>Until</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocked.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <CustomerCell customer={customer} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {customer.no_show_count}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDate(customer.suspended_at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {customer.suspended_until ? (
                            <>
                              {formatDate(customer.suspended_until)}
                              <span className="text-muted-foreground block text-xs">
                                lifts {relativeDays(customer.suspended_until)}
                              </span>
                            </>
                          ) : (
                            <Badge variant="outline">Indefinite</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <BlockActions
                              userId={customer.id}
                              name={customer.full_name ?? "This customer"}
                              isBlocked
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function CustomerCell({ customer }: { customer: CustomerRiskRow }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar className="size-8">
        {customer.avatar_url && <AvatarImage src={customer.avatar_url} alt="" />}
        <AvatarFallback className="text-xs">
          {initials(customer.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">
          {customer.full_name ?? "Unnamed"}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {customer.email ?? customer.phone ?? "—"}
        </p>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground p-10 text-center text-sm">{children}</p>
  );
}
