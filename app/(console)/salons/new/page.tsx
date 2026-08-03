import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SalonWizard } from "@/components/salon-wizard";
import { rpcErrorMessage } from "@/lib/format";
import type { UserRow } from "@/lib/types";

export const metadata: Metadata = { title: "Add a salon" };

/**
 * Onboarding a salon an operator has vetted off-platform.
 *
 * The account list comes from `admin_users()` rather than `admin_owners()`:
 * `admin_create_salon` promotes a customer to owner, so any account is a valid
 * target and restricting the picker to existing owners would make the common
 * case — a customer who has decided to list their salon — impossible.
 */
export default async function NewSalonPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_users");
  const users = (data ?? []) as UserRow[];

  // Whether this deployment can mint an auth account at all. Checked here so
  // the wizard can say so up front — finding out at submit means an operator
  // has already typed a name, email, phone and password for nothing. Only the
  // boolean crosses to the client; the key never leaves the server.
  const canCreateOwner = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <>
      <Link
        href="/salons"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Salon management
      </Link>

      <PageHeader
        title="Add a salon"
        description="Create a salon on an owner's behalf. It goes live straight away."
      />

      {error ? (
        <p className="text-destructive text-sm">
          Could not load accounts: {rpcErrorMessage(error)}
        </p>
      ) : (
        <SalonWizard users={users} canCreateOwner={canCreateOwner} />
      )}
    </>
  );
}
