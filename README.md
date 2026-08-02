# Bhutan Salons — Admin

Internal operator console for the Bhutan Salons marketplace. Approve salon
applications, manage owners and customers, set membership plans, and watch
platform activity.

Next.js 16 (App Router) · React 19 · Tailwind 4 · shadcn/ui · Supabase.

## The backend lives elsewhere

Schema, RPCs and migrations are in **[chubu-tech/tho](https://github.com/chubu-tech/tho)**
under `supabase/migrations/`. This repo is a client — it contains no SQL.

Read [`docs/BACKEND.md`](docs/BACKEND.md) before touching anything that talks to
the database. It documents the `admin_*` RPC contract, the allowed enum values,
the error codes, which tables you must *not* read directly, and the traps.

## Setup

Requires Node 20+ and access to the `bsalons` Supabase project.

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

`.env.local` needs two variables, both already in `.env.example`:

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://izlyevebmxqlxinigote.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The publishable key — safe in a client. RLS plus `private.require_admin()` are the real gate. |

There is no service-role key in this app, and there should never be one.

## You need an admin account

The console rejects any other role at the door. There is no UI or RPC that can
grant it: `admin_set_user_role` refuses `'admin'`, and the signup trigger
ignores `role=admin` in user metadata. Sign up normally, then promote yourself
with direct SQL against the project:

```sql
update public.profiles set role = 'admin' where id = '<your-auth-user-uuid>';
```

Suspending an admin revokes access immediately — `private.is_admin()` requires
`suspended_at is null`.

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # eslint
```

No test framework is installed; a clean `build` and `lint` is the bar.

## Layout

| Path | What's in it |
| --- | --- |
| `app/(console)/` | The console routes, behind the role gate in `layout.tsx` |
| `app/actions.ts` | Every server action — all mutations go through an `admin_*` RPC |
| `app/login/` | The only public route |
| `lib/types.ts` | TypeScript shapes mirroring the RPC return values |
| `lib/supabase/` | `server.ts` (cookie-bound) and `client.ts` (browser) |
| `lib/format.ts` | Ngultrum + date helpers, and the Postgres error mapper |
| `components/ui/` | shadcn primitives — regenerate rather than hand-edit |
| `proxy.ts` | Session refresh + an optimistic redirect. Not the auth boundary. |

Agent-facing conventions are in [`AGENTS.md`](AGENTS.md).
