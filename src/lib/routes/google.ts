// Google Routes API: walking (everywhere, and it also places both stops on the map) and
// trains/buses where Google is allowed to share them. Japan returns no transit routes through
// the API, so NAVITIME covers Japan instead (see index.ts).

import { zonedToUtc } from "@/lib/time";
import type { LatLng, Step, Transit, TransitProvider } from "./types";

const URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const key = () => process.env.GOOGLE_MAPS_API_KEY;
const secs = (d?: string) => (d ? Number(d.replace(/s$/, "")) || 0 : 0);
const mins = (s: number) => Math.max(1, Math.round(s / 60));

async function call(body: object, fields: string) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key()!, "X-Goog-FieldMask": fields },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google routes ${res.status}`);
  return (await res.json()) as { routes?: GRoute[] };
}

type GRoute = {
  duration?: string;
  distanceMeters?: number;
  legs?: {
    startLocation?: { latLng: { latitude: number; longitude: number } };
    endLocation?: { latLng: { latitude: number; longitude: number } };
    steps?: GStep[];
  }[];
  travelAdvisory?: { transitFare?: { currencyCode?: string; units?: string } };
};
type GStep = {
  travelMode?: string;
  staticDuration?: string;
  transitDetails?: {
    transitLine?: { name?: string; nameShort?: string; color?: string; vehicle?: { type?: string } };
    stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string }; departureTime?: string };
  };
};

const ll = (p?: { latLng: { latitude: number; longitude: number } }): LatLng | null =>
  p ? { lat: p.latLng.latitude, lng: p.latLng.longitude } : null;

export const googleEnabled = () => !!key();

/** Walking time between two place names, plus where Google put them. null = a place wasn't found. */
export async function googleWalk(from: string, to: string): Promise<{ minutes: number; meters: number; from: LatLng; to: LatLng } | null> {
  const j = await call(
    { origin: { address: from }, destination: { address: to }, travelMode: "WALK" },
    "routes.duration,routes.distanceMeters,routes.legs.startLocation,routes.legs.endLocation",
  );
  const r = j.routes?.[0];
  const a = ll(r?.legs?.[0]?.startLocation);
  const b = ll(r?.legs?.[0]?.endLocation);
  if (!r || !a || !b) return null;
  return { minutes: mins(secs(r.duration)), meters: r.distanceMeters ?? 0, from: a, to: b };
}

export const googleTransit: TransitProvider = {
  id: "google",
  api: "routes_google",
  enabled: googleEnabled,
  // Everywhere except Japan, where the API returns nothing for trains.
  covers: (p) => !inJapan(p),
  async route(from, to, when) {
    const at = zonedToUtc(when.local, when.tz).toISOString();
    const j = await call(
      {
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: "TRANSIT",
        ...(when.arriveBy ? { arrivalTime: at } : { departureTime: at }),
        languageCode: "en",
      },
      "routes.duration,routes.travelAdvisory.transitFare,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails",
    );
    const r = j.routes?.[0];
    if (!r) return null;

    const steps: Step[] = [];
    for (const s of r.legs?.[0]?.steps ?? []) {
      const sec = secs(s.staticDuration);
      if (s.travelMode === "TRANSIT" && s.transitDetails) {
        const t = s.transitDetails;
        const line = t.transitLine ?? {};
        steps.push({
          k: "ride",
          min: mins(sec),
          // A short name like "G" or "JY" goes in the badge; a longer one ("Seremban Line") is
          // usually friendlier than the full name ("KTM Batu Caves - Pulau Sebang/Tampin").
          ...(line.nameShort && line.nameShort.length <= 3
            ? { line: line.name || line.nameShort, code: line.nameShort }
            : { line: line.nameShort || line.name || "Transit" }),
          color: line.color,
          from: t.stopDetails?.departureStop?.name,
          to: t.stopDetails?.arrivalStop?.name,
          vehicle: line.vehicle?.type?.toLowerCase(),
        });
      } else {
        const last = steps[steps.length - 1];
        if (last?.k === "walk") last.min = mins(last.min * 60 + sec);
        else steps.push({ k: "walk", min: mins(sec) });
      }
    }
    if (!steps.some((s) => s.k === "ride")) return null;
    const fare = r.travelAdvisory?.transitFare;
    const out: Transit = {
      minutes: mins(secs(r.duration)),
      fare: fare?.units ? Number(fare.units) : null,
      currency: fare?.currencyCode ?? null,
      steps,
    };
    return out;
  },
};

/** Rough box around Japan's main islands and Okinawa. */
export function inJapan(p: LatLng): boolean {
  return p.lat >= 24 && p.lat <= 46 && p.lng >= 122.9 && p.lng <= 146;
}
