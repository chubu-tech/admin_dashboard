"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpcErrorMessage } from "@/lib/format";
import type {
  CreateSalonInfo,
  NewOwner,
  PlanName,
  ReviewHours,
  ReviewInfo,
  TopSalonRow,
  TrendPoint,
  TrendRange,
  UpdateSalonInfo,
  UserRow,
} from "@/lib/types";

/**
 * Every mutation goes through an `admin_*` RPC — never a direct table write.
 * Each RPC calls `private.require_admin()` itself, so these actions carry no
 * authorization logic of their own; they only shape input and refresh caches.
 */

type Result = { ok: true } | { ok: false; error: string };

async function call(fn: string, args: Record<string, unknown>): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: rpcErrorMessage(error) };
  return { ok: true };
}

export async function reviewSalon(
  businessId: string,
  decision: "approve" | "reject",
  reason: string | null,
  info: ReviewInfo,
  hours: ReviewHours[],
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_salon", {
    p_business: businessId,
    p_decision: decision,
    p_reason: reason,
    p_info: info,
    p_hours: hours,
  });

  if (error) return { ok: false, error: rpcErrorMessage(error) };

  revalidatePath("/approvals");
  revalidatePath(`/approvals/${businessId}`);
  revalidatePath("/salons");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Correct a salon's details, hours and pin — without re-reviewing it.
 *
 * Deliberately not `admin_review_salon`: that one also writes `status`,
 * `is_active`, `suspended_at`, `reviewed_at` and `reviewed_by`, so using it to
 * fix a typo would republish a suspended salon and falsify the audit trail.
 *
 * `admin_update_salon` reads key *presence*, so the form must post every field
 * it owns — including empty ones, which is how a value gets cleared.
 */
export async function updateSalon(
  businessId: string,
  info: UpdateSalonInfo,
  hours: ReviewHours[],
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_salon", {
    p_business: businessId,
    p_info: info,
    p_hours: hours,
  });

  if (error) return { ok: false, error: rpcErrorMessage(error) };

  revalidatePath("/approvals");
  revalidatePath(`/approvals/${businessId}`);
  revalidatePath("/salons");
  revalidatePath("/");
  return { ok: true };
}

export async function setSalonStatus(
  businessId: string,
  status: "suspended" | "approved",
): Promise<Result> {
  const result = await call("admin_set_salon_status", {
    p_business: businessId,
    p_status: status,
  });
  revalidatePath("/approvals");
  revalidatePath(`/approvals/${businessId}`);
  revalidatePath("/salons");
  revalidatePath("/");
  return result;
}

export async function deleteSalon(businessId: string): Promise<Result> {
  const result = await call("admin_delete_salon", { p_business: businessId });
  revalidatePath("/salons");
  revalidatePath("/approvals");
  revalidatePath("/");
  return result;
}

export async function verifyDocument(
  documentId: string,
  verified: boolean,
  businessId: string,
): Promise<Result> {
  const result = await call("admin_verify_document", {
    p_document: documentId,
    p_verified: verified,
  });
  revalidatePath(`/approvals/${businessId}`);
  return result;
}

export async function setUserRole(
  userId: string,
  role: "customer" | "owner",
): Promise<Result> {
  const result = await call("admin_set_user_role", {
    p_user: userId,
    p_role: role,
  });
  revalidatePath("/users");
  return result;
}

/** Time-boxed block — defaults to one week. */
export async function blockUser(userId: string, days = 7): Promise<Result> {
  const result = await call("admin_block_user", {
    p_user: userId,
    p_days: days,
  });
  revalidatePath("/users");
  return result;
}

export async function unblockUser(userId: string): Promise<Result> {
  const result = await call("admin_unblock_user", { p_user: userId });
  revalidatePath("/users");
  return result;
}

export async function deleteUser(userId: string): Promise<Result> {
  const result = await call("admin_delete_user", { p_user: userId });
  revalidatePath("/users");
  revalidatePath("/");
  return result;
}

/** Move a salon between Basic / Growth / Pro, closing any matching request. */
export async function setSalonPlan(
  businessId: string,
  plan: PlanName,
): Promise<Result> {
  const result = await call("admin_set_salon_plan", {
    p_business: businessId,
    p_plan: plan,
  });
  revalidatePath(`/approvals/${businessId}`);
  revalidatePath("/salons");
  revalidatePath("/");
  return result;
}

/* ---------------------------------------------------------------------------
   Onboarding a salon, and the owner it belongs to.

   Everything above this line is safe by construction: the RPC it calls runs
   `private.require_admin()` itself. The owner path below is the exception —
   creating an `auth.users` row needs the service role, which bypasses RLS and
   every guard in the database. So this section carries its own authorization.
   --------------------------------------------------------------------------- */

/**
 * The gate for anything that uses the service role.
 *
 * Reads the role from `profiles` with the caller's own cookie-bound session,
 * exactly as the console layout does. Never trust a role passed in from the
 * client, and never do this check with the service client — it would be
 * checking itself.
 */
async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "You are not signed in.";

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || data?.role !== "admin") return "You are not authorized.";
  return null;
}

type OwnerResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Provision a salon owner.
 *
 * `handle_new_user` reads only `full_name` and `role` off the metadata, so the
 * profile lands correct on insert and only `avatar_url` needs a follow-up
 * write. The account is created already-confirmed: an operator is sitting with
 * the owner (or on the phone to them), so there is nobody to click a
 * confirmation link.
 */
export async function createOwner(owner: NewOwner): Promise<OwnerResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };

  const email = owner.email.trim().toLowerCase();
  const fullName = owner.full_name.trim();
  const phone = owner.phone?.trim();
  const avatarUrl = owner.avatar_url?.trim();

  if (!email) return { ok: false, error: "An email address is required." };
  if (!fullName) return { ok: false, error: "The owner's name is required." };
  if (owner.password.length < 8) {
    return { ok: false, error: "The password must be at least 8 characters." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error:
        "Owner provisioning is not configured on this deployment (missing service role key).",
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: owner.password,
    phone: phone || undefined,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "owner" },
  });

  if (error || !data.user) {
    return {
      ok: false,
      error: error?.message ?? "Could not create the owner account.",
    };
  }

  // The signup trigger does not carry an avatar, so set it separately.
  if (avatarUrl) {
    await admin
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", data.user.id);
  }

  revalidatePath("/users");
  return { ok: true, id: data.user.id };
}

type CreateSalonResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Onboard a salon for an existing owner.
 *
 * Unlike an owner's own submission this is born `approved` — the operator has
 * already done the vetting the pending queue exists to schedule. The RPC also
 * promotes a `customer` to `owner`, so the picker can offer any account.
 */
export async function createSalon(
  ownerId: string,
  info: CreateSalonInfo,
  hours: ReviewHours[],
): Promise<CreateSalonResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_salon", {
    p_owner: ownerId,
    p_info: info,
    p_hours: hours,
  });

  if (error) return { ok: false, error: rpcErrorMessage(error) };

  const detail = data as { salon?: { id?: string } } | null;
  const id = detail?.salon?.id;
  if (!id) return { ok: false, error: "The salon was created but not returned." };

  revalidatePath("/salons");
  revalidatePath("/approvals");
  revalidatePath("/users");
  revalidatePath("/");
  return { ok: true, id };
}

/** Every account, for the owner picker. Promotion to owner happens in the RPC. */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_users");
  if (error) throw new Error(rpcErrorMessage(error));
  return (data ?? []) as UserRow[];
}

/* Read actions backing the dashboard's interactive controls. Server actions
   rather than browser queries so the RPC call keeps using the request's
   cookie-bound session. */

export async function getBookingsTrend(
  range: TrendRange,
): Promise<TrendPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_bookings_trend", {
    p_range: range,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  return (data ?? []) as TrendPoint[];
}

export async function getTopSalons(
  metric: "turnout" | "revenue",
): Promise<TopSalonRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_top_salons", {
    p_metric: metric,
    p_limit: 8,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  return (data ?? []) as TopSalonRow[];
}
