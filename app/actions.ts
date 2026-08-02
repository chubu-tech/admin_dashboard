"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorMessage } from "@/lib/format";
import type {
  PlanName,
  ReviewHours,
  ReviewInfo,
  TopSalonRow,
  TrendPoint,
  TrendRange,
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
