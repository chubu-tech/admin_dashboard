/**
 * Coordinate helpers for the salon pin.
 *
 * The owner app can only pin a salon by GPS, standing in the doorway
 * (`business_settings_tab.dart`). An operator onboarding or fixing a salon
 * from a desk needs to get coordinates in some other way, so we accept a
 * pasted map link or a raw pair as well as the browser's own geolocation.
 *
 * Validation mirrors `admin_create_salon` / `admin_review_salon` exactly: the
 * server re-checks all of it, this just means the operator finds out before
 * submitting rather than after.
 */

export type Coords = { lat: number; lng: number };

/** Matches the RPCs' own `^-?[0-9]+(\.[0-9]+)?$` — no exponents, no `+`. */
const NUMERIC = /^-?[0-9]+(\.[0-9]+)?$/;

export function isValidLat(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLng(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Validate a lat/lng pair as the wizard holds them — two strings, either both
 * filled or both empty. Returns an error message, or null when acceptable.
 */
export function validateCoordPair(lat: string, lng: string): string | null {
  const a = lat.trim();
  const b = lng.trim();

  if (!a && !b) return null; // Unpinned is allowed.
  if (!a || !b) return "Set both latitude and longitude, or neither.";
  if (!NUMERIC.test(a) || !NUMERIC.test(b)) {
    return "Coordinates must be plain numbers, e.g. 27.4728 and 89.6390.";
  }
  if (!isValidLat(Number(a))) return "Latitude must be between -90 and 90.";
  if (!isValidLng(Number(b))) return "Longitude must be between -180 and 180.";
  return null;
}

/**
 * Pull coordinates out of whatever an operator pasted.
 *
 * Handles a Google Maps `@lat,lng,17z` URL, a `?q=lat,lng` or `!3dlat!4dlng`
 * link, and a bare `27.4728, 89.6390` pair. Returns null when nothing in the
 * input looks like a valid coordinate.
 */
export function parseCoords(input: string): Coords | null {
  const text = input.trim();
  if (!text) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // /maps/@27.47,89.63,17z
    /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // ?q=27.47,89.63
    /[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // ?ll=27.47,89.63
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // place links
    /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/, // 27.4728, 89.6390
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (isValidLat(lat) && isValidLng(lng)) return { lat, lng };
  }

  return null;
}

/** Trim to 6 decimals — ~11 cm, far past what a salon pin needs. */
export function formatCoord(value: number): string {
  return String(Number(value.toFixed(6)));
}

/** A link an operator can open to check the pin landed in the right place. */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
