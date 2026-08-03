<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Bhutan Salons — Admin

Internal operator console for the `bsalons` Supabase project: approve salon
applications, manage owners and customers, set membership plans, watch platform
activity. Next.js 16 (App Router, Proxy — not Middleware), React 19, Tailwind 4,
shadcn/ui.

## The backend is not in this repo

Schema, RPCs and migrations live in **`github.com/chubu-tech/tho`** under
`supabase/migrations/`. This repo contains no SQL and never will — it is a
client. For anything about the data model, read `docs/BACKEND.md` first; it is
the checked-in contract. Go to the tho repo only when that doc can't answer it,
and update the doc when it turns out to be stale.

## Architecture rules (non-negotiable)

- **Every mutation goes through an `admin_*` RPC.** Never
  `.from().insert()/.update()/.delete()`. All server actions live in
  `app/actions.ts`.
- **The service role is the one exception, and it carries its own guard.**
  `lib/supabase/admin.ts` bypasses RLS *and* `private.require_admin()` — it is
  not "an admin", it is past the point where roles are checked. It exists only
  to create an owner's `auth.users` row, which no RPC can do. Any action that
  touches it **must call `requireAdmin()` first**, using the caller's own
  cookie-bound session. Never authorize with the service client; it would be
  checking itself.
- **Never `.from()` `businesses`, `profiles` or `plan_change_requests` for a
  listing.** An admin has no RLS SELECT clause on them, so the reads silently
  under-return rather than erroring: `businesses` yields only live+active salons
  (pending, rejected, suspended and deleted are invisible), `profiles` yields
  only your own row, `plan_change_requests` yields nothing. Use
  `admin_salons()` / `admin_users()` / `admin_owners()` / `admin_plan_requests()`.
  The one legitimate direct read is the role gate, filtered to
  `id = auth.uid()` — `app/(console)/layout.tsx` and `components/login-form.tsx`.
- **Authorization is server-side.** Every RPC opens with
  `private.require_admin()`. `proxy.ts` and the layout role check are optimistic
  UX only — never treat either as the boundary.
- **Role is a table column**, `profiles.role`, not a JWT claim. Only `admin`
  gets into the console.
- Match the existing widget and formatting patterns before inventing new ones —
  `lib/format.ts` already has Ngultrum, dates, relative days, initials and the
  Postgres-error mapper.

## Layout

- `app/(console)/` — the console routes (dashboard, `approvals`, `salons`,
  `users`) behind the role gate in `layout.tsx`.
- `app/actions.ts` — every server action. `app/login/` — the only public route.
- `lib/types.ts` — TypeScript shapes mirroring the `admin_*` return values.
  Change a migration, change this file, change `docs/BACKEND.md`.
- `lib/supabase/` — `server.ts` (cookie-bound, used by everything) and
  `client.ts` (browser, used by the login form).
- `lib/format.ts` — display helpers + `rpcErrorMessage`.
- `lib/geo.ts` — coordinate parsing/validation, mirroring the RPCs' own rules.
- `lib/paginate.ts` — `PER_PAGE = 10`, `readPage`, `paginate`. Listings fetch
  everything and slice; the RPCs take no limit/offset.
- `components/ui/` — shadcn primitives. Regenerate rather than hand-editing.
  There is no `components.json`, so the CLI cannot run without scaffolding one.
- Shared form pieces: `components/form-field.tsx` (`Field`, `FieldError`),
  `components/salon-details-fields.tsx` (the details grid + `validateSalonDetails`),
  `components/hours-editor.tsx`, `components/location-fields.tsx`. All three
  salon forms — review, create, edit — use them. Change them there, not in a
  copy. Field ids are global, so render at most one details grid per page.
- **Editing a salon is `admin_update_salon`, never `admin_review_salon`.** The
  review RPC re-decides the application and re-stamps the audit trail; the update
  RPC writes no status field. They also differ on nulls: update treats an empty
  value as "clear this", the other two treat it as "leave it alone".

## Listings

Ten rows a page, driven by a query param so a page is a shareable URL that
survives a refresh. `components/pagination.tsx` renders links; the server
computes the numbers and passes them down, the same split as `StatusFilter`.
Pages with several tables give each its own param (`?ownersPage=`, …), and
`/users` keeps its tab in the URL too — paging is a navigation, so a
client-only tab would snap back on every page change.

## Creating an admin

There is no UI or RPC for it, by design. `admin_set_user_role` refuses `'admin'`,
and the signup trigger ignores `role=admin` in user metadata and falls back to
`customer`. The only way is direct SQL against the project:

```sql
update public.profiles set role = 'admin' where id = '<auth-user-uuid>';
```

Note that suspending an admin revokes their access immediately —
`private.is_admin()` requires `suspended_at is null`.

## Verify

```bash
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

No test framework is installed; a clean `build` + `lint` is the bar.
