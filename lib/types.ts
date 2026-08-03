/**
 * Shapes returned by the `admin_*` RPCs.
 *
 * These mirror the live function signatures exactly — if you change one in a
 * migration, change it here too. Every one of them is guarded server-side by
 * `private.require_admin()`, so the console never decides who is an admin.
 */

export type SalonStatus = "pending" | "approved" | "rejected" | "suspended";
export type GenderFocus = "male" | "female" | "unisex";

/** `admin_dashboard()` */
export type DashboardData = {
  total_users: number;
  total_salons: number;
  pending_approvals: number;
  total_bookings: number;
  salons_by_status: { status: SalonStatus; count: number }[];
  users_by_role: { role: string; count: number }[];
  bookings_by_day: { day: string; count: number }[];
  bookings_by_status: { status: string; count: number }[];
  recent_pending: {
    id: string;
    name: string;
    city: string | null;
    gender_focus: string | null;
    submitted_at: string | null;
    owner_name: string | null;
  }[];
};

/** One row of `admin_salons(p_status)` */
export type SalonRow = {
  id: string;
  name: string;
  city: string | null;
  gender_focus: string | null;
  status: SalonStatus;
  /** `businesses.plan` is NOT NULL DEFAULT 'basic', so this never comes back null. */
  plan: PlanName;
  lat: number | null;
  lng: number | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  rating: number;
  review_count: number;
  owner_id: string | null;
  owner_name: string | null;
  staff_count: number;
  service_count: number;
};

/** `admin_salon_detail(p_business)` */
export type SalonDetail = {
  salon: {
    id: string;
    name: string;
    description: string | null;
    status: SalonStatus;
    city: string | null;
    gender_focus: string | null;
    address_text: string | null;
    phone: string | null;
    email: string | null;
    plan: string | null;
    is_active: boolean;
    business_type: BusinessType;
    /** Null until somebody pins the salon. Owners can only do it by GPS, on site. */
    lat: number | null;
    lng: number | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
    suspended_at: string | null;
    cover_url: string | null;
    timezone: string | null;
    rating: number;
    review_count: number;
    booking_count: number;
  };
  owner: {
    id: string;
    full_name: string | null;
    phone: string | null;
    avatar_url: string | null;
    role: string;
    email: string | null;
  } | null;
  documents: {
    id: string;
    file_name: string | null;
    storage_path: string | null;
    note: string | null;
    uploaded_at: string | null;
    verified_at: string | null;
    verified_by_name: string | null;
  }[];
  staff: {
    id: string;
    display_name: string;
    role: string;
    is_active: boolean;
    photo_url: string | null;
  }[];
  services: {
    id: string;
    name: string;
    price: number | null;
    duration_minutes: number | null;
    is_active: boolean;
    gender: string | null;
  }[];
  hours: {
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
  }[];
};

/** One row of `admin_users()` */
export type UserRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: "customer" | "staff" | "owner" | "admin";
  suspended_at: string | null;
  created_at: string;
  salon_count: number;
  booking_count: number;
  is_self: boolean;
};

/** One row of `admin_owners()` */
export type OwnerRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  suspended_at: string | null;
  created_at: string;
  salon_count: number;
  salons: { id: string; name: string; status: SalonStatus; city: string | null }[];
};

/** One row of `admin_customers_at_risk()` */
export type CustomerRiskRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  no_show_count: number;
  booking_count: number;
  last_no_show_at: string | null;
  suspended_at: string | null;
  suspended_until: string | null;
  is_blocked: boolean;
  created_at: string;
};

export type PlanName = "basic" | "growth" | "pro";

/** Windows offered by the bookings trend chart. */
export type TrendRange = "week" | "14d" | "month" | "year";

export const TREND_RANGES: { value: TrendRange; label: string }[] = [
  { value: "week", label: "Past week" },
  { value: "14d", label: "Last 14 days" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
];

/** One row of `admin_bookings_trend(p_range)` */
export type TrendPoint = {
  bucket: string;
  label: string;
  bookings: number;
  revenue: number;
};

/** One row of `admin_top_salons(p_metric, p_limit)` */
export type TopSalonRow = {
  id: string;
  name: string;
  city: string | null;
  plan: PlanName;
  customers: number;
  completed_bookings: number;
  revenue: number;
};

/** One row of `admin_plan_requests()` */
export type PlanRequestRow = {
  id: string;
  business_id: string;
  business_name: string;
  city: string | null;
  current_plan: PlanName;
  requested_plan: PlanName;
  note: string | null;
  requested_by_name: string | null;
  created_at: string;
};

/**
 * The salon columns every `p_info` payload can carry.
 *
 * All strings: `p_info` is jsonb and the RPCs read it with `->>`, parsing the
 * coordinates themselves. Send `lat` and `lng` together or not at all — a lone
 * one raises 22023.
 */
type SalonInfoBase = {
  name: string;
  description?: string;
  gender_focus?: GenderFocus | "";
  address_text?: string;
  city?: string;
  phone?: string;
  email?: string;
  lat?: string;
  lng?: string;
};

/**
 * What the review wizard sends as `p_info` for `admin_review_salon`.
 *
 * Coalescing semantics: an empty value means "leave it alone", so this cannot
 * clear a field. Use `UpdateSalonInfo` when that matters.
 */
export type ReviewInfo = SalonInfoBase & {
  owner_name?: string;
  owner_avatar_url?: string;
};

/** One entry of `p_hours`. `closed` days are simply not inserted. */
export type ReviewHours = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  closed: boolean;
};

/** `businesses.business_type` — a CHECK on text, not an enum. */
export type BusinessType = "salon" | "barber" | "home_based" | "mobile";

export const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "salon", label: "Salon" },
  { value: "barber", label: "Barber" },
  { value: "home_based", label: "Home-based" },
  { value: "mobile", label: "Mobile / travels to you" },
];

export const PLAN_NAMES: { value: PlanName; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "growth", label: "Growth" },
  { value: "pro", label: "Pro" },
];

/**
 * What the add-salon wizard sends as `admin_create_salon`'s `p_info`.
 *
 * `business_type` and `plan` default server-side to `salon` and `basic` when
 * absent.
 */
export type CreateSalonInfo = SalonInfoBase & {
  business_type?: BusinessType;
  plan?: PlanName;
  owner_name?: string;
};

/**
 * What the edit form sends as `admin_update_salon`'s `p_info`.
 *
 * **This one is the exception: an empty value CLEARS the column.** Presence of
 * the key decides — absent leaves the column alone, present-with-a-value sets
 * it, present-and-empty writes NULL. Sending `lat: "", lng: ""` un-pins the
 * salon. `name` and `business_type` are NOT NULL server-side, so a present-but-
 * empty value there raises 22023 instead of clearing.
 *
 * No `plan`: `PlanControl` owns that via `admin_set_salon_plan`, which also
 * closes a matching plan-change request. No owner fields either — editing a
 * salon should not rename a person.
 */
export type UpdateSalonInfo = SalonInfoBase & {
  business_type?: BusinessType;
};

/**
 * Details for an owner the console provisions itself.
 *
 * This is the one path that does not go through an `admin_*` RPC: a profile
 * cannot exist without an `auth.users` row, so the account is created with the
 * service role first. See `createOwner` in `app/actions.ts`.
 */
export type NewOwner = {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
};

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
