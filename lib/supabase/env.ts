/**
 * The two public Supabase values, read in one place and checked once.
 *
 * Both clients used to reach for `process.env.NEXT_PUBLIC_SUPABASE_URL!` with a
 * non-null assertion, which is a lie the type system believes: `!` silences the
 * compiler and does nothing at runtime, so a deploy that forgot the variable handed
 * `undefined` to `createServerClient` and failed several frames deep in the SDK with
 * something like *"Invalid URL"* — a message that names neither the variable nor the
 * fact that it is missing. That is the single most likely way this console breaks on a
 * first deploy, and the one failure worth making legible.
 *
 * **This changes only the failure path.** When the variables are set, the value
 * returned is exactly what the assertions produced before.
 *
 * ## It has to be two direct `process.env.X` reads
 *
 * Next inlines `NEXT_PUBLIC_*` into the browser bundle by **textual substitution of
 * that exact expression**. `process.env[name]` with a computed key, or a destructure,
 * is not substituted — it survives into the bundle as a lookup on an object that does
 * not exist in a browser, and the value is `undefined` at runtime no matter how the
 * host is configured. So the pair below is written out longhand on purpose; do not
 * refactor it into a loop or a helper that takes the name as an argument.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local for local work, or set it ` +
        `on the deploy host. Note it is inlined at build time, so a change needs a ` +
        `rebuild rather than a restart.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
