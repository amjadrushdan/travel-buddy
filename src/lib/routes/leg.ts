// Which way of getting there a saved leg shows, and when to leave. Pure: used by the server
// (to decide whether a train check is worth an API call) and by the app (to draw the leg).

import { matchStay, moved, type StayPoint } from "./stay-match";
import type { SavedLeg } from "./types";

/** Walks up to this long are shown as a walk without asking for trains. */
export const WALK_MAX = 12;

/** Longer than this isn't a walk (Tokyo → Fuji): shown as "Too far to walk" unless a train helps. */
export const WALK_FAR = 90;

export type Shown = "walk" | "transit" | "car" | "hidden" | "far" | "none";

export function shownAs(l: Pick<SavedLeg, "choice" | "walk_min" | "transit">): Shown {
  if (l.choice === "hidden" || l.choice === "car") return l.choice;
  const w = l.walk_min;
  const t = l.transit?.minutes ?? null;
  const walk: Shown = w == null ? "none" : w > WALK_FAR ? "far" : "walk";
  if (l.choice === "transit" && l.transit) return "transit";
  if (l.choice === "walk" || l.choice === "transit") return walk;
  // auto: a short walk, else the train if it's quicker, else the walk.
  if (w != null && w <= WALK_MAX) return "walk";
  if (l.transit && (w == null || t == null || t < w)) return "transit";
  return walk;
}

/** Auto mode would like a train answer it doesn't have yet. */
export function wantsTransit(l: Pick<SavedLeg, "choice" | "walk_min" | "transit_at">): boolean {
  if (l.transit_at) return false;
  if (l.choice === "transit") return true;
  return l.choice === "auto" && l.walk_min != null && l.walk_min > WALK_MAX;
}

export function minutesShown(l: Pick<SavedLeg, "choice" | "walk_min" | "transit" | "drive_min">): number | null {
  const s = shownAs(l);
  if (s === "walk") return l.walk_min;
  if (s === "transit") return l.transit?.minutes ?? null;
  if (s === "car") return l.drive_min;
  return null;
}

/** "13:30" minus 22 min → "13:08". */
export function leaveBy(arrive: string | null | undefined, minutes: number | null): string | null {
  const m = arrive && /^(\d{2}):(\d{2})/.exec(arrive);
  if (!m || minutes == null) return null;
  const t = (((+m[1] * 60 + +m[2] - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export const samePlace = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The saved leg still joins these two stops as they are now. */
export function legMatches(
  l: Pick<SavedLeg, "from_item" | "from_place" | "to_place">,
  from: { id: string; place: string | null },
  to: { place: string | null },
): boolean {
  return l.from_item === from.id && l.from_place === from.place && l.to_place === to.place;
}

/**
 * This pair of stops needs a trip to the server: no saved leg, a leg for other stops or places,
 * or auto mode wanting a train answer it doesn't have. Car, hidden and not-found legs don't.
 */
export function needsWork(
  l: SavedLeg | undefined,
  from: { id: string; place: string | null },
  to: { place: string | null },
  stays: StayPoint[] = [],
): boolean {
  if (!l || !legMatches(l, from, to) || stayMoved(l, from, to, stays)) return true;
  return wantsTransit(l) && l.from_lat != null;
}

/** A stop is a stay whose map point has changed since this leg was worked out (stay edited). */
export function stayMoved(
  l: Pick<SavedLeg, "from_lat" | "from_lng" | "to_lat" | "to_lng">,
  from: { place: string | null },
  to: { place: string | null },
  stays: StayPoint[],
): boolean {
  const check = (place: string | null, lat: number | null, lng: number | null) => {
    const s = matchStay(place, stays);
    return !!s && lat != null && lng != null && moved({ lat, lng }, { lat: s.lat!, lng: s.lng! });
  };
  return check(from.place, l.from_lat, l.from_lng) || check(to.place, l.to_lat, l.to_lng);
}

export type DaySpend = { fares: Record<string, number>; tolls: Record<string, number>; unknown: number };

/**
 * What the day's shown routes cost: train fares (per person) and road tolls (per car), by
 * currency. A train leg with no fare counts as unknown, so the total can say it's at least that.
 */
export function daySpend(legs: Pick<SavedLeg, "choice" | "walk_min" | "transit" | "toll" | "toll_currency">[]): DaySpend {
  const out: DaySpend = { fares: {}, tolls: {}, unknown: 0 };
  for (const l of legs) {
    const s = shownAs(l);
    if (s === "transit") {
      const f = l.transit?.fare;
      if (f == null) out.unknown++;
      else if (f > 0) {
        const c = l.transit?.currency ?? "";
        out.fares[c] = (out.fares[c] ?? 0) + f;
      }
    } else if (s === "car" && l.toll) {
      const c = l.toll_currency ?? "";
      out.tolls[c] = (out.tolls[c] ?? 0) + l.toll;
    }
  }
  return out;
}
