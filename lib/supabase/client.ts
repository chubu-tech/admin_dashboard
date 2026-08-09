import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Browser client. Uses the publishable (anon) key — safe to ship, because
 * every admin RPC calls `private.require_admin()` server-side and RLS guards
 * every table. The key grants nothing on its own.
 */
export function createClient() {
  // Named errors rather than `!` — see `env.ts`. In a browser these read the values
  // Next inlined at build time, so an unset variable surfaces here as a sentence
  // instead of as "Invalid URL" from inside the SDK.
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
