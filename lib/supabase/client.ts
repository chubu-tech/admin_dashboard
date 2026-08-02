import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Uses the publishable (anon) key — safe to ship, because
 * every admin RPC calls `private.require_admin()` server-side and RLS guards
 * every table. The key grants nothing on its own.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
