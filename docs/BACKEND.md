# Backend contract

The schema this console talks to lives in **`github.com/chubu-tech/tho`**, not
here. This file is the checked-in contract so admin can be worked on without
that repo open.

Derived from tho at commit **`47fb86f`** — *feat(db): admin console backend —
operator role, review lifecycle, admin RPCs*. Source files:

| File | What it adds |
| --- | --- |
| `supabase/migrations/20260802000003_admin_role_enum.sql` | `'admin'` on the `user_role` enum |
| `supabase/migrations/20260802000004_admin_foundation.sql` | `business_status`, application columns on `businesses`, `business_documents`, the `private.is_admin()` guards, admin SELECT policies |
| `supabase/migrations/20260802000005_admin_rpcs.sql` | 12 core `admin_*` RPCs |
| `supabase/migrations/20260802000006_user_block_window.sql` | `suspended_until`, time-boxed block RPCs, `admin_customers_at_risk` |
| `supabase/migrations/20260802000007_admin_email_cast_fix.sql` | `auth.users.email::text` cast — fixes a `42804` that broke three RPCs |
| `supabase/migrations/20260802000008_admin_insights_and_plans.sql` | trend / leaderboard / plan RPCs |
| `supabase/tests/admin_test.sql` | pgTAP guard coverage |

> **Keep this in step.** Any migration that changes an `admin_*` signature or a
> return shape should update this file and `lib/types.ts` in the same PR.

Terminology note: tho's prose calls an admin an "operator", but there is no
`operator` value anywhere in the schema — the role is `admin`. Likewise "review
lifecycle" means the **salon application** lifecycle (`business_status`), not
moderation of customer reviews. There is no moderation status on `reviews`.

---

## RPCs

All 19 are `SECURITY DEFINER … set search_path = ''` and open with
`private.require_admin()`. The console never decides who is an admin.

### Reads

| RPC | Signature | Returns | Used by |
| --- | --- | --- | --- |
| `admin_dashboard` | `()` | `jsonb` — see below | `app/(console)/page.tsx` |
| `admin_salons` | `(p_status text default 'all')` | `setof` `id, name, city, gender_focus, status, submitted_at, reviewed_at, rating numeric, review_count, owner_id, owner_name, staff_count, service_count` | approvals + salons pages |
| `admin_salon_detail` | `(p_business uuid)` | `jsonb` — see below | approvals detail + review |
| `admin_owners` | `()` | `setof` `id, full_name, phone, email, avatar_url, suspended_at, created_at, salon_count, salons jsonb` | users page |
| `admin_customers_at_risk` | `()` | `setof` `id, full_name, email, phone, avatar_url, no_show_count, booking_count, last_no_show_at, suspended_at, suspended_until, is_blocked, created_at` | users page |
| `admin_bookings_trend` | `(p_range text default '14d')` | `setof` `bucket date, label text, bookings int, revenue numeric` | dashboard chart |
| `admin_top_salons` | `(p_metric text default 'turnout', p_limit int default 8)` | `setof` `id, name, city, plan, customers, completed_bookings, revenue` | dashboard chart |
| `admin_plan_requests` | `()` | `setof` `id, business_id, business_name, city, current_plan, requested_plan, note, requested_by_name, created_at` | approvals detail |
| `admin_users` | `()` | `setof` `id, full_name, phone, email, avatar_url, role, suspended_at, created_at, salon_count, booking_count, is_self` | **unused** — `UserRow` exists in `lib/types.ts`, nothing calls it |

`admin_dashboard()` keys: `total_users`, `total_salons`, `pending_approvals`,
`total_bookings`, `salons_by_status[]`, `users_by_role[]`, `bookings_by_day[]`
(fixed 14 days), `bookings_by_status[]`, `recent_pending[]` (limit 5).

`admin_salon_detail(p_business)` keys: `salon` (20 fields), `owner` (nullable),
`documents[]`, `staff[]`, `services[]`, `hours[]`. Mirrored exactly by
`SalonDetail` in `lib/types.ts`.

Argument validation: `p_status` ∈ `all | pending | approved | rejected |
suspended` (or null); `p_range` ∈ `week | 14d | month | year`; `p_metric` ∈
`turnout | revenue`; `p_limit` ∈ 1..50. Anything else raises `22023`.

`revenue` throughout = `sum(bookings.total_price)` over `status='completed'`
only, matching the owner-side `analytics_dashboard()`. `bookings` counts every
status.

### Writes

| RPC | Signature | Used by |
| --- | --- | --- |
| `admin_review_salon` | `(p_business uuid, p_decision text, p_reason text default null, p_info jsonb default '{}', p_hours jsonb default '[]')` → `jsonb` (the fresh `admin_salon_detail`) | `review-wizard.tsx` |
| `admin_set_salon_status` | `(p_business uuid, p_status text)` — `suspended \| approved` only | `salon-actions.tsx` |
| `admin_delete_salon` | `(p_business uuid)` — soft delete | `salon-actions.tsx` |
| `admin_set_salon_plan` | `(p_business uuid, p_plan text)` — `basic \| growth \| pro` | `plan-control.tsx` |
| `admin_block_user` | `(p_user uuid, p_days int default 7)` — `p_days` 1..365 | `user-actions.tsx` |
| `admin_unblock_user` | `(p_user uuid)` | `user-actions.tsx` |
| `admin_verify_document` | `(p_document uuid, p_verified boolean default true)` | **no UI** — action exists, nothing calls it |
| `admin_set_user_role` | `(p_user uuid, p_role text)` — `customer \| owner` only | **no UI** — action exists |
| `admin_delete_user` | `(p_user uuid)` — soft delete + PII scrub | **no UI** — action exists |
| `admin_set_user_suspended` | `(p_user uuid, p_suspended boolean)` | **not wired** — prefer the block/unblock pair |

`admin_review_salon` state machine: sets `status`, `is_active`, clears
`suspended_at`, writes `rejection_reason`, stamps `reviewed_at`/`reviewed_by`,
and updates the owner's `full_name`/`avatar_url` from `p_info`.

`p_info` keys (all optional except `name`, each `coalesce`d onto the existing
value): `name`, `description`, `gender_focus`, `address_text`, `city`, `phone`,
`email`, `owner_name`, `owner_avatar_url`.

`p_hours` element: `{day_of_week: 0-6, open_time: "HH:MM", close_time: "HH:MM",
closed: bool}`.

### Known gaps

`admin_users`, `admin_verify_document`, `admin_set_user_role` and
`admin_delete_user` all work server-side but no UI reaches them. Most visible:
the salon detail page renders a Verified / Unverified badge on each document
with no way to toggle it.

---

## Allowed values

| Thing | Values | Where |
| --- | --- | --- |
| `user_role` enum | `customer`, `staff`, `owner`, `admin` | base migration + `…0003` |
| `business_status` enum | `pending`, `approved`, `rejected`, `suspended` | `…0004` |
| `businesses.plan` | `basic`, `growth`, `pro` — a **CHECK on text**, not an enum | `20260721000002` |
| `plan_change_requests.requested_plan` | `growth`, `pro` — **`basic` is not allowed** | `20260721000003` |
| `plan_change_requests.status` | `pending`, `done`, `cancelled` | `20260721000003` |
| `businesses.gender_focus` | `male`, `female`, `unisex`, or null | `…0004` |
| `booking_status` | `pending`, `confirmed`, `completed`, `cancelled`, `no_show` | base migration |
| Block state | no enum — the `profiles.suspended_at` + `suspended_until` pair | `…0004`, `…0006` |

Block states derive as: **not blocked** (`suspended_at` null) · **indefinite**
(`suspended_at` set, `suspended_until` null) · **timed** (`suspended_until >
now()`) · **lapsed** (`suspended_until <= now()` — `is_blocked` reads false
while `suspended_at` is still set).

---

## Error codes

| Code | Meaning |
| --- | --- |
| `28000` | authentication required — `auth.uid()` is null |
| `42501` | three distinct causes share this code: signed-in non-admin, `admin accounts cannot be re-roled / suspended / deleted`, and raw Postgres `permission denied for function` |
| `22023` | bad argument — status, decision, role, plan, metric, range, limit, days, gender, `day_of_week`, rejection reason too short, missing name |
| `P0002` | `salon not found` / `user not found` / `document not found` |
| `P0001` | state-machine violation — `only an approved salon can be suspended`, `only a suspended salon can be reactivated`, `this owner still has N salon(s)…` |

`rpcErrorMessage` in `lib/format.ts` deliberately maps only `28000`, `42501` and
`P0002`. `22023` and `P0001` fall through to `error.message` because those RPCs
raise text that is already fit to show an admin ("a rejection reason of at least
10 characters is required"). Keep it that way.

EXECUTE grants are inconsistent across migrations, so an anonymous caller gets
different codes depending on the RPC: the twelve `…0005` functions keep PUBLIC
execute and raise `28000` from the body, while `…0006` and `…0008` revoke to
`authenticated` and fail with `42501` before the body runs.

---

## RLS gotchas

Three tables have no admin SELECT policy. Direct reads don't error — they
**silently under-return**.

| Table | What an admin actually sees with `.from()` | Use instead |
| --- | --- | --- |
| `businesses` | only `is_active and deleted_at is null` — pending, rejected, suspended and deleted salons are invisible | `admin_salons()`, `admin_salon_detail()` |
| `profiles` | only their own row | `admin_users()`, `admin_owners()`, `admin_customers_at_risk()` |
| `plan_change_requests` | zero rows (owner-only policy) | `admin_plan_requests()` |

Tables that *do* have an admin SELECT policy (`…0004`): `bookings`,
`business_hours`, `reviews`, `services`, `staff_members`, `business_documents`.

---

## Sharp edges

- **`admin_review_salon` requires `p_info->>'name'` even on approve.** Calling
  it with the default `p_info = '{}'` always raises `22023 salon name is
  required`. The wizard always sends the full info object; keep it that way.
- **A non-empty `p_hours` is a full replace, not a patch.** It deletes every
  `business_hours` row for the salon and reinserts the non-closed days. Send the
  whole week or send `[]`.
- **Times come back as `"09:00:00"`.** `admin_salon_detail` casts to text, so
  `hours[].open_time` needs `.slice(0, 5)` before it goes into an
  `<input type="time">` — `review-wizard.tsx:73` does this.
- **`private.is_user_blocked()` is declared but unwired.** Nothing consumes it —
  no RLS policy, not `create_booking`, not `join_queue`. Blocking a customer
  records the decision; it does not stop them booking. Don't tell an operator
  otherwise in the UI.
- **Two suspend paths with different semantics.**
  `admin_set_user_suspended(u, true)` sets `suspended_at` but leaves
  `suspended_until` untouched, so a previously-lapsed user ends up suspended with
  `is_blocked` computing false. Only `admin_unblock_user` clears both. Prefer the
  `admin_block_user` / `admin_unblock_user` pair.
- **`admin_set_salon_plan(id, 'basic')` never closes a pending request**, because
  `requested_plan` can't be `'basic'`. A downgrade leaves the request queued.
- **`admin_salon_detail` does not filter `deleted_at`** — a soft-deleted salon
  stays readable by id.
- **Suspending an admin revokes their access immediately** —
  `private.is_admin()` requires `suspended_at is null`.
- **There is no storage bucket for `business_documents`.** `storage_path` is free
  text with a unique constraint; only the `media` and `booking-media` buckets
  exist.

---

## Plan tiers

Source of truth: `tho/app/lib/business/plans/plans_config.dart`. That file notes
**prices are placeholders** until the business sets final pricing, and nothing
else in tho reads pricing. `plan-control.tsx` mirrors it for display only — the
actual feature gate is tho's entitlements layer.

| Plan | Price | Features |
| --- | --- | --- |
| Basic | **Free** | Listed & discoverable, online bookings, day (agenda) calendar, list view, 1 stylist, profile/photos/reviews, today-snapshot numbers |
| Growth | Nu 799/mo | Everything in Basic + unlimited stylists, week view, automatic reminders, full analytics, client book, product storefront, loyalty program, walk-in queue |
| Pro | Nu 1,499/mo | Everything in Growth + priority placement, commissions & payroll, deposits & no-show cover |

Payment is off-app (bank transfer / mBoB); `admin_set_salon_plan` is the switch
an operator flips once money has landed.

---

## Test coverage in tho

`supabase/tests/admin_test.sql` has 16 assertions pinning the `require_admin`
guard on `admin_dashboard`, `admin_delete_user`, `admin_set_user_role`,
`admin_delete_salon`, `admin_users`, `admin_set_user_suspended`, `admin_salons`
and `admin_review_salon`, plus admin-vs-admin protection and immediate
revocation on suspension.

**Not covered:** everything from `…0006` and `…0008` — `admin_block_user`,
`admin_unblock_user`, `admin_customers_at_risk`, `admin_bookings_trend`,
`admin_top_salons`, `admin_set_salon_plan`, `admin_plan_requests`.
