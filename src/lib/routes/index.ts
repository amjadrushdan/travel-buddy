// Finds ways of getting between plan stops. Server only (API keys).
//
//   walkBetween    Google walking route: places both stops on the map and gives the walking
//                  time. Google's free allowance is large, so this is the cheap call.
//   transitBetween Trains/buses from the first provider that covers both stops (NAVITIME in
//                  Japan, Google elsewhere). NAVITIME's free plan is small, so callers only ask
//                  when a train could matter (see wantsTransit in leg.ts) and keep the answer.
//
// Every provider call is counted by `claim` (route_claim in the database: daily and monthly
// caps per provider), on top of the providers' own limits.

import { googleEnabled, googleFindPlace, googleRoute, googleTransit } from "./google";
import { navitime } from "./navitime";
import type { LatLng, LocalTime, Transit, TransitProvider } from "./types";

export type { SavedLeg, Step, RideStep, WalkStep, Transit, Choice } from "./types";

/** Order matters: the first enabled provider that covers both stops is used. */
const TRANSIT_PROVIDERS: TransitProvider[] = [navitime, googleTransit];

/** Our caps, below the providers' free allowances (Google quota 300/day; NAVITIME 500/month). */
type Api = TransitProvider["api"] | "places_google";

const CAPS: Record<Api, { daily: number; monthly: number }> = {
  routes_google: { daily: 150, monthly: 2000 },
  routes_navitime: { daily: 60, monthly: 400 },
  places_google: { daily: 100, monthly: 1500 },
};

export type Claim = (api: Api, cap: { daily: number; monthly: number }) => Promise<boolean>;

export class CapReached extends Error {}

export const routesEnabled = googleEnabled;

export type Walk = { minutes: number; meters: number; from: LatLng; to: LatLng; toll: { amount: number; currency: string } | null };

/** null = a place couldn't be found. */
export async function walkBetween(fromPlace: string | LatLng, toPlace: string | LatLng, claim: Claim): Promise<Walk | null> {
  if (!(await claim("routes_google", CAPS.routes_google))) throw new CapReached();
  return googleRoute(fromPlace, toPlace, "WALK");
}

/** Driving time (rental car, taxi). Same cheap Google call as the walk; no train lookup. */
export async function driveBetween(fromPlace: string | LatLng, toPlace: string | LatLng, claim: Claim): Promise<Walk | null> {
  if (!(await claim("routes_google", CAPS.routes_google))) throw new CapReached();
  return googleRoute(fromPlace, toPlace, "DRIVE");
}

/** Where a named place is, searching near `near` first. null = not found. */
export async function findPlace(text: string, near: LatLng | null, claim: Claim) {
  if (!(await claim("places_google", CAPS.places_google))) throw new CapReached();
  return googleFindPlace(text, near);
}

/**
 * The quickest train/bus option, or null when none was found. `provider` is null when no
 * provider covers these stops (nothing was asked, so the caller shouldn't mark it checked).
 */
export async function transitBetween(
  from: LatLng,
  to: LatLng,
  when: LocalTime,
  claim: Claim,
): Promise<{ transit: Transit | null; provider: string | null }> {
  const p = TRANSIT_PROVIDERS.find((t) => t.enabled() && t.covers(from) && t.covers(to));
  if (!p) return { transit: null, provider: null };
  if (!(await claim(p.api, CAPS[p.api]))) throw new CapReached();
  return { transit: bestOption(await p.route(from, to, when)), provider: p.id };
}

/** What one change of train "costs" when comparing options: walking between platforms, waiting,
 * the risk of missing the connection with a group. */
export const CHANGE_MIN = 8;

/**
 * The option a person would pick, not just the fastest on paper: total time plus CHANGE_MIN
 * per change, then the cheaper fare. (NAVITIME's own first pick for "arrive by" is the one that
 * leaves latest, which can mean three changes to save four minutes.)
 */
export function bestOption(options: Transit[]): Transit | null {
  const score = (t: Transit) => (t.minutes ?? 999) + CHANGE_MIN * Math.max(0, t.steps.filter((s) => s.k === "ride").length - 1);
  return (
    [...options].sort((a, b) => score(a) - score(b) || (a.fare ?? Infinity) - (b.fare ?? Infinity))[0] ?? null
  );
}
