import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * The service-role client. Read the whole comment before using it.
 *
 * This key bypasses RLS and every `private.require_admin()` guard in the
 * database. It is not "an admin" — it is *past* the point where roles are
 * checked at all. Nothing else in this console holds that power: every other
 * mutation goes through an `admin_*` RPC that authorizes the caller itself.
 *
 * It exists for exactly one reason. `profiles.id` is a foreign key to
 * `auth.users(id)`, and profiles are only ever minted by the `handle_new_user`
 * signup trigger, so there is no SQL an operator can run to create a salon
 * owner. The account has to come from the Auth admin API first.
 *
 * Rules:
 *   1. `import "server-only"` above makes importing this from a client
 *      component a build error. Leave it there.
 *   2. Any action that touches this MUST verify the caller is an admin itself,
 *      using the cookie-bound client, before calling in. See `requireAdmin` in
 *      `app/actions.ts`.
 *   3. Use it for auth provisioning only. Reads and writes to application
 *      tables still go through the RPCs, so the guards stay meaningful.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — owner provisioning is unavailable.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
