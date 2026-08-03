"use client";

import { Field, FieldError } from "@/components/form-field";
import { LocationFields } from "@/components/location-fields";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { validateCoordPair } from "@/lib/geo";

/**
 * The salon details grid, shared by all three salon forms — review, create and
 * edit.
 *
 * The parent owns the state and the error record, as everywhere else in the
 * console: plain `useState`, errors keyed by field id, no form library.
 *
 * Field ids are global to the document (`name`, `city`, and `lat`/`lng`/
 * `coord-paste` inside `LocationFields`), so **render at most one of these per
 * page** or every `htmlFor` breaks.
 */

/** The fields this block owns. All strings — `p_info` is jsonb of text. */
export type SalonDetailsValue = {
  name: string;
  description: string;
  gender_focus: string;
  address_text: string;
  city: string;
  phone: string;
  email: string;
  lat: string;
  lng: string;
};

export function SalonDetailsFields({
  value,
  errors,
  onField,
  onCoords,
  children,
}: {
  value: SalonDetailsValue;
  errors: Record<string, string>;
  onField: (key: keyof SalonDetailsValue, next: string) => void;
  onCoords: (next: { lat: string; lng: string }) => void;
  /** Slot between gender focus and description — business type, plan, etc. */
  children?: React.ReactNode;
}) {
  return (
    <>
      <Field
        id="name"
        label="Salon name"
        required
        value={value.name}
        onChange={(v) => onField("name", v)}
        error={errors.name}
      />

      <div className="grid gap-2">
        <Label htmlFor="gender_focus">Gender focus</Label>
        <Select
          value={value.gender_focus || undefined}
          onValueChange={(v: string) => onField("gender_focus", v)}
        >
          <SelectTrigger id="gender_focus">
            <SelectValue placeholder="Not set" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="unisex">Unisex</SelectItem>
          </SelectContent>
        </Select>
        {errors.gender_focus && <FieldError>{errors.gender_focus}</FieldError>}
      </div>

      {children}

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={3}
          value={value.description}
          onChange={(e) => onField("description", e.target.value)}
        />
      </div>

      <Field
        id="address_text"
        label="Address"
        value={value.address_text}
        onChange={(v) => onField("address_text", v)}
      />
      <Field
        id="city"
        label="City"
        value={value.city}
        onChange={(v) => onField("city", v)}
      />
      <Field
        id="phone"
        label="Phone"
        type="tel"
        value={value.phone}
        onChange={(v) => onField("phone", v)}
      />
      <Field
        id="email"
        label="Email"
        type="email"
        value={value.email}
        onChange={(v) => onField("email", v)}
      />

      <LocationFields
        lat={value.lat}
        lng={value.lng}
        error={errors.coords}
        onChange={onCoords}
      />
    </>
  );
}

/**
 * The three checks every salon RPC applies to these fields: a name, a gender
 * from the fixed set, and coordinates paired and in range. Returns an error
 * record keyed to match the field ids above.
 */
export function validateSalonDetails(
  value: Pick<SalonDetailsValue, "name" | "gender_focus" | "lat" | "lng">,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!value.name.trim()) errors.name = "Salon name is required.";
  if (
    value.gender_focus &&
    !["male", "female", "unisex"].includes(value.gender_focus)
  ) {
    errors.gender_focus = "Choose male, female or unisex.";
  }
  const coordError = validateCoordPair(value.lat, value.lng);
  if (coordError) errors.coords = coordError;

  return errors;
}
