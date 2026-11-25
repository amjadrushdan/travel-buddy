// Works out how to get from one plan stop to the next. Server only (API keys).
//
//   1. Google walking route: places both stops on the map and gives the walking time.
//   2. Short walk (≤ WALK_MAX min): that's the leg.
//   3. Otherwise ask the first transit provider that covers both stops (NAVITIME in Japan,
//      Google elsewhere). If it finds nothing quicker, walking it is.
//
// Every provider call is counted by route_claim in the database (daily and monthly caps per
// provider), on top of the providers' own limits. Results are saved in route_legs, so each
// leg is looked up once.

import { googleEnabled, googleTransit, googleWalk } from "./google";
import { navitime } from "./navitime";
import type { Leg, LocalTime, TransitProvider } from "./types";

export type { Leg, Step, RideStep, WalkStep } from "./types";

/** Order matters: the first enabled provider that covers both stops is used. */
const TRANSIT_PROVIDERS: TransitProvider[] = [navitime, googleTransit];

const WALK_MAX = 12;

/** Our caps, below the providers' free allowances (Google quota 300/day; NAVITIME 500/month). */
const CAPS: Record<TransitProvider["api"], { daily: number; monthly: number }> = {
  routes_google: { daily: 150, monthly: 2000 },
  routes_navitime: { daily: 60, monthly: 400 },
};

export type Claim = (api: TransitProvider["api"], cap: { daily: number; monthly: number }) => Promise<boolean>;

export class CapReached extends Error {}

export const routesEnabled = googleEnabled;

export async function workOutLeg(fromPlace: string, toPlace: string, when: LocalTime, claim: Claim): Promise<Leg> {
  const none: Leg = { mode: "none", minutes: null, leave_at: null, fare: null, currency: null, steps: [], provider: null };

  if (!(await claim("routes_google", CAPS.routes_google))) throw new CapReached();
  const walk = await googleWalk(fromPlace, toPlace);
  if (!walk) return none;

  const walkLeg: Leg = {
    mode: "walk",
    minutes: walk.minutes,
    leave_at: null,
    fare: null,
    currency: null,
    steps: [{ k: "walk", min: walk.minutes }],
    provider: "google",
  };
  if (walk.minutes <= WALK_MAX) return walkLeg;

  const p = TRANSIT_PROVIDERS.find((t) => t.enabled() && t.covers(walk.from) && t.covers(walk.to));
  if (!p) return walkLeg;
  if (!(await claim(p.api, CAPS[p.api]))) throw new CapReached();
  const t = await p.route(walk.from, walk.to, when).catch(() => null);
  if (!t || (t.minutes != null && t.minutes >= walk.minutes)) return walkLeg;
  return { mode: "transit", provider: p.id, ...t };
}
