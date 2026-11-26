// Exact map points from a Google Maps link on a plan stop, for free (no API call).

import type { LatLng } from "./types";

const ok = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

/** Reads "!3d35.5!4d138.7", "@35.5,138.7" or "?q=35.5,138.7" from a full Google Maps URL. */
export function pointFromMapUrl(url: string): LatLng | null {
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url); // the place itself
  if (pin) return ok(+pin[1], +pin[2]);
  const q = /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(decodeURIComponent(url));
  if (q) return ok(+q[1], +q[2]);
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url); // map view centre
  if (at) return ok(+at[1], +at[2]);
  return null;
}

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

/**
 * Same, following a share link (maps.app.goo.gl/…) to the full URL first. Only Google's own
 * short-link hosts are followed, at most three hops, so a pasted link can't make the server
 * fetch anything else.
 */
export async function pointFromMapLink(url: string): Promise<LatLng | null> {
  let u = url;
  for (let hop = 0; hop < 3; hop++) {
    const direct = pointFromMapUrl(u);
    if (direct) return direct;
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" || !SHORT_HOSTS.has(parsed.hostname)) return null;
    const res = await fetch(u, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(4000) }).catch(() => null);
    const next = res?.headers.get("location");
    if (!next) return null;
    u = new URL(next, u).toString();
  }
  return pointFromMapUrl(u);
}
