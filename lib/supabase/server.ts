import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Server client bound to the request's cookie jar. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    // Named errors rather than `!`, which asserts to the compiler and checks nothing
    // at runtime. See `env.ts` — this is the failure path only.
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // `proxy.ts` refreshes the session, so this is safe to swallow.
          }
        },
      },
    },
  );
}
