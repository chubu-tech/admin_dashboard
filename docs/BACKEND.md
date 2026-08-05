# Backend contract

The schema this console talks to lives in **`github.com/chubu-tech/tho`**, not
here. This file is the checked-in contract so admin can be worked on without
that repo open.

Derived from tho at commit **`47fb86f`** plus the three migrations added since.
Source files:

| File | What it adds |
| --- | --- |
| `supabase/migrations/20260802000003_admin_role_enum.sql` | `'admin'` on the `user_role` enum |
| `supabase/migrations/20260802000004_admin_foundation.sql` | `business_status`, application columns on `businesses`, `business_documents`, the `private.is_admin()` guards, admin SELECT policies |
| `supabase/migrations/20260802000005_admin_rpcs.sql` | 12 core `admin_*` RPCs |
| `supabase/migrations/20260802000006_user_block_window.sql` | `suspended_until`, time-boxed block RPCs, `admin_customers_at_risk` |
| `supabase/migrations/20260802000007_admin_email_cast_fix.sql` | `auth.users.email::text` cast — fixes a `42804` that broke three RPCs |
| `supabase/migrations/20260802000008_admin_insights_and_plans.sql` | trend / leaderboard / plan RPCs |
| `supabase/migrations/20260802000009_admin_salon_geo.sql` | `lat`/`lng` on `admin_salon_detail`, and accepted by `admin_review_salon` |
| `supabase/migrations/20260802000010_admin_create_salon.sql` | `admin_create_salon` — onboarding on an owner's behalf |
| `supabase/migrations/20260803000001_admin_salons_plan_and_geo.sql` | `plan`, `lat`, `lng` on `admin_salons` |
| `supabase/migrations/20260803000002_admin_update_salon.sql` | `admin_update_salon`; `business_type` on `admin_salon_detail` |
| `supabase/migrations/20260805000002_app_waitlist.sql` | `app_waitlist`, `waitlist_campaigns`, `waitlist_deliveries`, the public `join_app_waitlist`, and 8 `admin_waitlist*` RPCs |
| `supabase/tests/admin_test.sql` | pgTAP guard coverage |

> **Keep this in step.** Any migration that changes an `admin_*` signature or a
> return shape should update this file and `lib/types.ts` in the same PR.

Terminology note: tho's prose calls an admin an "operator", but there is no
`operator` value anywhere in the schema — the role is `admin`. Likewise "review
lifecycle" means the **salon application** lifecycle (`business_status`), not
moderation of customer reviews. There is no moderation status on `reviews`.

---

## RPCs

All 21 are `SECURITY DEFINER … set search_path = ''` and open with
`private.require_admin()`. The console never decides who is an admin.

### Reads

| RPC | Signature | Returns | Used by |
| --- | --- | --- | --- |
| `admin_dashboard` | `()` | `jsonb` — see below | `app/(console)/page.tsx` |
| `admin_salons` | `(p_status text default 'all')` | `setof` `id, name, city, gender_focus, status, plan, lat, lng, submitted_at, reviewed_at, rating numeric, review_count, owner_id, owner_name, staff_count, service_count` | approvals + salons pages |
| `admin_salon_detail` | `(p_business uuid)` | `jsonb` — see below | approvals detail + review |
| `admin_owners` | `()` | `setof` `id, full_name, phone, email, avatar_url, suspended_at, created_at, salon_count, salons jsonb` | users page |
| `admin_customers_at_risk` | `()` | `setof` `id, full_name, email, phone, avatar_url, no_show_count, booking_count, last_no_show_at, suspended_at, suspended_until, is_blocked, created_at` | users page |
| `admin_bookings_trend` | `(p_range text default '14d')` | `setof` `bucket date, label text, bookings int, revenue numeric` | dashboard chart |
| `admin_top_salons` | `(p_metric text default 'turnout', p_limit int default 8)` | `setof` `id, name, city, plan, customers, completed_bookings, revenue` | dashboard chart |
| `admin_plan_requests` | `()` | `setof` `id, business_id, business_name, city, current_plan, requested_plan, note, requested_by_name, created_at` | approvals detail |
| `admin_users` | `()` | `setof` `id, full_name, phone, email, avatar_url, role, suspended_at, created_at, salon_count, booking_count, is_self` | the owner picker on `/salons/new` |
| `admin_waitlist_stats` | `()` | `jsonb` — see below | `/waitlist` stat cards |
| `admin_waitlist` | `(p_sort text default 'newest')` | `setof` `id, email, source, created_at, notified_at` | `/waitlist` table |
| `admin_waitlist_campaigns` | `()` | `setof` `id, subject, message, ios_url, android_url, created_at, created_by_name, total, queued, sent, failed` | `/waitlist` campaign history |

`admin_waitlist_stats()` keys: `total`, `last_7_days`, `last_30_days`,
`notified`, `not_notified`, `latest_signup_at`, `campaigns`,
`pending_deliveries`, `failed_deliveries`.

`p_sort` ∈ `newest | oldest`; anything else raises `22023`.

`admin_dashboard()` keys: `total_users`, `total_salons`, `pending_approvals`,
`total_bookings`, `salons_by_status[]`, `users_by_role[]`, `bookings_by_day[]`
(fixed 14 days), `bookings_by_status[]`, `recent_pending[]` (limit 5).

`admin_salon_detail(p_business)` keys: `salon` (22 fields, including `lat` and
`lng` as numbers), `owner` (nullable), `documents[]`, `staff[]`, `services[]`,
`hours[]`. Mirrored exactly by `SalonDetail` in `lib/types.ts`.

Argument validation: `p_status` ∈ `all | pending | approved | rejected |
suspended` (or null); `p_range` ∈ `week | 14d | month | year`; `p_metric` ∈
`turnout | revenue`; `p_limit` ∈ 1..50. Anything else raises `22023`.

`revenue` throughout = `sum(bookings.total_price)` over `status='completed'`
only, matching the owner-side `analytics_dashboard()`. `bookings` counts every
status.

### Writes

| RPC | Signature | Used by |
| --- | --- | --- |
| `admin_create_salon` | `(p_owner uuid, p_info jsonb default '{}', p_hours jsonb default '[]')` → `jsonb` (the new `admin_salon_detail`) | `salon-wizard.tsx` |
| `admin_update_salon` | `(p_business uuid, p_info jsonb default '{}', p_hours jsonb default '[]')` → `jsonb` (the fresh `admin_salon_detail`) | `salon-edit-form.tsx` |
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
| `admin_send_waitlist_launch` | `(p_subject text, p_message text, p_ios_url text default null, p_android_url text default null, p_include_notified boolean default false)` → `jsonb {campaign_id, queued}` | `waitlist-send.tsx` |
| `admin_claim_waitlist_deliveries` | `(p_campaign uuid, p_limit int default 25)` → `setof` `id, email, subject, message, ios_url, android_url` | `drainWaitlistCampaign` |
| `admin_mark_waitlist_delivery_sent` | `(p_id uuid)` — also stamps `app_waitlist.notified_at` | `drainWaitlistCampaign` |
| `admin_mark_waitlist_delivery_failed` | `(p_id uuid, p_error text)` — error truncated to 500 chars | `drainWaitlistCampaign` |
| `admin_retry_waitlist_failures` | `(p_campaign uuid)` → `jsonb {requeued}` | `waitlist-send.tsx` |
| `admin_release_stuck_waitlist_deliveries` | `(p_campaign uuid)` → `jsonb {released}` — `sending` older than 15 min back to `queued` | `drainWaitlistCampaign`, on every pass |

### The waitlist send is an outbox, not a loop

`admin_send_waitlist_launch` **sends nothing.** It creates the campaign and
inserts one `waitlist_deliveries` row per recipient, in one transaction; the
console then claims batches of 25 and does the HTTP itself. Three consequences
worth knowing before changing any of it:

- **A double press cannot double-send.** `unique (campaign_id, waitlist_id)` is
  the guarantee, not the button's disabled state.
- **`p_include_notified` defaults to false**, so a second campaign reaches only
  people who joined since the first. `notified_at` is what makes that work, and
  it is stamped by `admin_mark_waitlist_delivery_sent` — not at queue time, so
  an address that never actually received one is not skipped next time.
- **It raises rather than returning zero** when nobody is eligible, which rolls
  the empty campaign back instead of leaving it in the history.

There is deliberately **no service_role queue API** here, unlike
`claim_due_notifications`. An operator is present for every send, so the claim
and mark functions carry `private.require_admin()` and the console uses its
ordinary cookie-bound client. Add a service_role pair only if this ever moves
to cron.

`admin_review_salon` state machine: sets `status`, `is_active`, clears
`suspended_at`, writes `rejection_reason`, stamps `reviewed_at`/`reviewed_by`,
and updates the owner's `full_name`/`avatar_url` from `p_info`.

`p_info` keys (all optional except `name`, each `coalesce`d onto the existing
value): `name`, `description`, `gender_focus`, `address_text`, `city`, `phone`,
`email`, `lat`, `lng`, `owner_name`, `owner_avatar_url`.

`p_hours` element: `{day_of_week: 0-6, open_time: "HH:MM", close_time: "HH:MM",
closed: bool}`.

### `admin_update_salon` reads key *presence*, not value

The one RPC where **an empty value clears the column.** `admin_create_salon`
and `admin_review_salon` both `coalesce(nullif(trim(…),''), existing)`, so an
empty string means "leave it alone" — which makes a mistyped phone number or a
misplaced map pin impossible to remove. Here:

| `p_info` | Result |
| --- | --- |
| key absent | column unchanged |
| key present with a value | column set |
| key present and empty | column set to **NULL** |

`lat: "", lng: ""` therefore **un-pins** a salon — the only way to. Implemented
with `jsonb_exists(p_info, 'phone')` rather than the `?` operator, which some
Postgres drivers read as a bind placeholder.

`name` and `business_type` are `NOT NULL`, so a present-but-empty value there
raises `22023` instead of clearing.

**It writes no status field.** Not `status`, `is_active`, `suspended_at`,
`rejection_reason`, `reviewed_at` or `reviewed_by` — which is precisely why it
exists rather than reusing `admin_review_salon`, whose `UPDATE` sets all six.
Editing a suspended salon with the review RPC would silently republish it. There
is a pgTAP case pinning this. It also does not write the owner's profile.

`admin_create_salon` takes the same `p_info` keys minus `owner_avatar_url`,
plus `business_type` (`salon | barber | home_based | mobile`, default `salon`)
and `plan` (default `basic`). It inserts `status='approved'`, `is_active=true`,
`reviewed_by=auth.uid()`, and promotes the owner's profile from `customer` to
`owner`. It does **not** set `whatsapp_phone`, `service_radius_km`, `timezone`,
`cover_url`, `cancellation_window_hours`, `reminder_channel`, `queue_enabled`
or `queue_join_mode` — all defaulted, all the owner's own settings screen.

### Coordinates

`lat`/`lng` go in as **strings** (`p_info->>'lat'`), because `p_info` is jsonb
from a web form. Both RPCs validate them identically: send both or neither
(a lone one raises `22023`), plain numbers only (`^-?[0-9]+(\.[0-9]+)?$` — no
exponents), lat in [-90, 90], lng in [-180, 180]. `admin_review_salon`
coalesces, so omitting them leaves an existing pin alone.

They come back out of `admin_salon_detail` and `admin_salons` as **numbers**.
`lib/geo.ts` mirrors the validation and parses pasted Maps links.

A salon with no pin is fully bookable — it is only absent from the customer
Map tab and loses the distance cue and the recommender's proximity boost.
Nothing server-side reads the coordinates; distance is computed in Dart over
the whole list, and there is no geo index and no PostGIS.

### Known gaps

`admin_verify_document`, `admin_set_user_role` and `admin_delete_user` all work
server-side but no UI reaches them. Most visible: the salon detail page renders
a Verified / Unverified badge on each document with no way to toggle it.

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

EXECUTE grants are inconsistent across migrations, and not in the way the
migration text suggests. Supabase's default privileges grant EXECUTE on new
`public` functions to `anon` as well as `authenticated`, so a
`revoke all … from public` removes only the PUBLIC entry and leaves the
explicit `anon` grant standing. Checked against the live catalogue:
`admin_create_salon`, `admin_bookings_trend` and the rebuilt `admin_salons` all
carry `anon=X`. In practice every path still ends at `28000 authentication
required` from `require_admin()`, so this is a wrong error code rather than a
hole — but do not rely on `42501` meaning "anon".

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

The three waitlist tables are a fourth case and the strictest one: RLS is on
with **no policies at all** and the table grants are revoked from `anon` and
`authenticated`, so a direct `.from("app_waitlist")` returns `42501` rather
than under-returning. Everything goes through the definer RPCs — including the
marketing site, which can reach exactly one function and read nothing.

---

## Creating an owner — the one non-RPC mutation

`profiles.id` is `FK → auth.users(id) ON DELETE CASCADE`, and profiles are only
ever minted by the `handle_new_user` signup trigger. **There is no SQL that
creates a salon owner**, so `admin_create_salon` requires the profile to exist
already and raises `P0002 owner not found` otherwise.

The console therefore provisions the auth account first, with the service-role
key, via `auth.admin.createUser`. The trigger reads only `full_name` and `role`
off `raw_user_meta_data`, so the profile lands correct on insert and only
`avatar_url` needs a follow-up write.

That path bypasses RLS and `require_admin()` entirely, so `createOwner` in
`app/actions.ts` carries its own `requireAdmin()` check against the caller's
cookie-bound session. It is the only action in the console that authorizes
anything itself.

Note the trigger's role whitelist is `('customer','staff','owner')` — passing
`role: 'admin'` silently falls back to `customer`. Combined with
`admin_set_user_role` refusing `'admin'`, a new operator can still only be
made with direct SQL.

## Sharp edges

- **`admin_review_salon` requires `p_info->>'name'` even on approve.** Calling
  it with the default `p_info = '{}'` always raises `22023 salon name is
  required`. Both wizards always send the full info object; keep it that way.
- **`admin_create_salon` has no rollback across the two steps.** If the auth
  user is created and then the RPC fails, the account exists with no salon.
  The operator can retry against the now-existing account via the picker.
- **Three RPCs write the same columns with two different null contracts.**
  `admin_create_salon` and `admin_review_salon` coalesce (empty = no change);
  `admin_update_salon` reads key presence (empty = NULL). Check which one you
  are calling before assuming a blank field is harmless.
- **Never reuse `admin_review_salon` as an edit.** It has no no-op decision —
  `p_decision` is validated to `approve|reject` — so every call re-decides the
  application and re-stamps `reviewed_at`.
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

`admin_update_salon` adds thirteen (`plan(39)`): anon and customer rejection,
`P0002`, a blank `name`, an unknown `business_type`, a lone latitude, the
set/absent/empty triad on `phone`, un-pinning, and the state-preservation case —
suspend a salon, edit it, assert `status`, `suspended_at`, `reviewed_at` and
`is_active` all survive while the edit itself lands.

`admin_create_salon` adds ten (`plan(26)`): anon and customer rejection,
`P0002 owner not found`, the empty-`p_info` name check, a lone latitude, an
out-of-range latitude, an unknown plan, the happy path, the customer→owner
promotion, and the `approved` starting status.

**Not covered:** `admin_block_user`, `admin_unblock_user`,
`admin_customers_at_risk`, `admin_bookings_trend`, `admin_top_salons`,
`admin_set_salon_plan`, `admin_plan_requests`.
