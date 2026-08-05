"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { rpcErrorMessage } from "@/lib/format";
import type {
  CreateSalonInfo,
  LaunchAnnouncement,
  NewOwner,
  PlanName,
  ReviewHours,
  ReviewInfo,
  SendResult,
  TopSalonRow,
  TrendPoint,
  TrendRange,
  UpdateSalonInfo,
  UserRow,
  WaitlistCampaign,
  WaitlistDelivery,
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
   The app waitlist, and the launch announcement.

   Note what these do NOT use: the service role. Draining an outbox is exactly
   the shape of work that reaches for it, and it does not need to — the claim
   and mark functions are `admin_*` RPCs with `private.require_admin()` inside
   them, so the ordinary cookie-bound client is both sufficient and safer. See
   the migration's header for why that choice was made there rather than here.
   --------------------------------------------------------------------------- */

/**
 * How many emails one press sends.
 *
 * A server action has a wall-clock budget, and a send is one HTTP round trip
 * per recipient. 25 is comfortably inside it while still being a real dent in
 * a list; whatever is left stays `queued` and the page offers "Send remaining".
 * The outbox is what makes that safe — no recipient can be sent twice, and
 * nothing is lost if the page is closed mid-send.
 */
const SEND_BATCH = 25;

/**
 * Create the campaign and send the first batch.
 *
 * Two steps, deliberately separate: `admin_send_waitlist_launch` only fills
 * the outbox, and `drainWaitlistCampaign` does the I/O. If the send half fails
 * completely the campaign still exists with every recipient queued, which is
 * recoverable. The reverse — sending first and recording after — is not.
 */
export async function sendWaitlistLaunch(
  announcement: LaunchAnnouncement,
): Promise<{ ok: true; result: SendResult } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_send_waitlist_launch", {
    p_subject: announcement.subject,
    p_message: announcement.message,
    p_ios_url: announcement.ios_url.trim() || null,
    p_android_url: announcement.android_url.trim() || null,
    p_include_notified: announcement.include_notified,
  });

  if (error) return { ok: false, error: rpcErrorMessage(error) };

  const campaignId = (data as { campaign_id: string }).campaign_id;
  return drainWaitlistCampaign(campaignId);
}

/**
 * Send one batch of a campaign's queued deliveries.
 *
 * Every outcome is recorded per recipient before the next is attempted, so a
 * crash halfway through leaves a truthful ledger rather than an unknown one.
 * A provider failure is a `failed` row with the provider's own error text, not
 * an exception — one bad address must not stop the other twenty-four.
 */
export async function drainWaitlistCampaign(
  campaignId: string,
): Promise<{ ok: true; result: SendResult } | { ok: false; error: string }> {
  const supabase = await createClient();

  // Anything a previous, interrupted pass left mid-flight goes back in the
  // queue first — otherwise those rows are unreachable: not queued, so never
  // claimed; not failed, so never retried.
  await supabase.rpc("admin_release_stuck_waitlist_deliveries", {
    p_campaign: campaignId,
  });

  const { data, error } = await supabase.rpc("admin_claim_waitlist_deliveries", {
    p_campaign: campaignId,
    p_limit: SEND_BATCH,
  });

  if (error) return { ok: false, error: rpcErrorMessage(error) };

  const claimed = (data ?? []) as WaitlistDelivery[];
  let sent = 0;
  let failed = 0;

  for (const delivery of claimed) {
    const result = await sendEmail(delivery);
    if (result.ok) {
      await supabase.rpc("admin_mark_waitlist_delivery_sent", { p_id: delivery.id });
      sent++;
    } else {
      await supabase.rpc("admin_mark_waitlist_delivery_failed", {
        p_id: delivery.id,
        p_error: result.error,
      });
      // Logged as well as stored: the row is what an operator reads, the log is
      // what someone reads when the whole batch fails for one reason.
      console.error(`[waitlist] ${delivery.email} failed: ${result.error}`);
      failed++;
    }
  }

  // Re-read rather than infer. A second operator draining the same campaign
  // would make any arithmetic here wrong.
  const { data: campaigns } = await supabase.rpc("admin_waitlist_campaigns");
  const campaign = ((campaigns ?? []) as WaitlistCampaign[]).find(
    (row) => row.id === campaignId,
  );

  revalidatePath("/waitlist");
  return {
    ok: true,
    result: { campaignId, sent, failed, remaining: campaign?.queued ?? 0 },
  };
}

/** Put a campaign's failures back in the queue, then send them. */
export async function retryWaitlistFailures(
  campaignId: string,
): Promise<{ ok: true; result: SendResult } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_retry_waitlist_failures", {
    p_campaign: campaignId,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error) };
  return drainWaitlistCampaign(campaignId);
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
