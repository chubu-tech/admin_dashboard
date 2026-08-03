"use client";

import { useState } from "react";
import { Crosshair, ExternalLink, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldError } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCoord, mapsUrl, parseCoords } from "@/lib/geo";

/**
 * The salon pin.
 *
 * An owner can only set this by GPS, standing in the salon doorway — the app
 * has no manual entry at all. An operator working from a desk needs another
 * way in, so this accepts a pasted map link, a typed pair, or the browser's
 * own location when the operator happens to be on site.
 *
 * A salon with no pin is still fully bookable; it just never appears on the
 * customer Map tab and loses the distance cue. So this is never required.
 */
export function LocationFields({
  lat,
  lng,
  onChange,
  error,
}: {
  lat: string;
  lng: string;
  onChange: (next: { lat: string; lng: string }) => void;
  error?: string;
}) {
  const [paste, setPaste] = useState("");
  const [locating, setLocating] = useState(false);

  const pinned = lat.trim() !== "" && lng.trim() !== "";

  function applyPaste() {
    const coords = parseCoords(paste);
    if (!coords) {
      toast.error("No coordinates found in that. Paste a Google Maps link or “27.4728, 89.6390”.");
      return;
    }
    onChange({ lat: formatCoord(coords.lat), lng: formatCoord(coords.lng) });
    setPaste("");
    toast.success("Coordinates read from the link.");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("This browser cannot report a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          lat: formatCoord(position.coords.latitude),
          lng: formatCoord(position.coords.longitude),
        });
        setLocating(false);
        toast.success("Pinned to where you are now.");
      },
      (geoError) => {
        setLocating(false);
        toast.error(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was refused."
            : "Could not get a location fix.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="bg-muted/40 grid gap-4 rounded-lg p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="text-muted-foreground size-4" aria-hidden />
          <span className="text-sm font-medium">Map location</span>
        </div>
        {pinned ? (
          <a
            href={mapsUrl(Number(lat), Number(lng))}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs hover:underline"
          >
            Check the pin
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">
            Optional — without it the salon never shows on the map
          </span>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="coord-paste">Paste a Google Maps link</Label>
        <div className="flex gap-2">
          <Input
            id="coord-paste"
            value={paste}
            placeholder="https://maps.google.com/…  or  27.4728, 89.6390"
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyPaste();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={applyPaste}
            disabled={!paste.trim()}
          >
            Read
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field
          id="lat"
          label="Latitude"
          inputMode="decimal"
          placeholder="27.4728"
          value={lat}
          onChange={(v) => onChange({ lat: v, lng })}
        />
        <Field
          id="lng"
          label="Longitude"
          inputMode="decimal"
          placeholder="89.6390"
          value={lng}
          onChange={(v) => onChange({ lat, lng: v })}
        />
        <Button
          type="button"
          variant="outline"
          onClick={useMyLocation}
          disabled={locating}
        >
          <Crosshair className="size-4" aria-hidden />
          {locating ? "Locating…" : "Use my location"}
        </Button>
      </div>

      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
