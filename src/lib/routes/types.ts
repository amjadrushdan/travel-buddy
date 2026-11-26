// Shared shapes for getting between plan stops. Safe for the browser: no keys, no fetches.

export type LatLng = { lat: number; lng: number };

export type WalkStep = { k: "walk"; min: number };
export type RideStep = {
  k: "ride";
  min: number;
  /** Line name to show, in English where we know it ("Ginza Line"). */
  line: string;
  /** The provider's own name when it differs ("東京メトロ銀座線"). */
  line_local?: string;
  /** Line letter or number shown in the badge ("G", "JY"). */
  code?: string;
  /** "#RRGGBB" */
  color?: string;
  from?: string;
  to?: string;
  vehicle?: string;
};
export type Step = WalkStep | RideStep;

/** One train/bus option between two stops. */
export type Transit = { minutes: number | null; fare: number | null; currency: string | null; steps: Step[] };

/** A trip time in the stop's own timezone: "2026-12-14T13:00" in "Asia/Tokyo". */
export type LocalTime = { local: string; tz: string; arriveBy: boolean };

export type Choice = "auto" | "walk" | "transit" | "car" | "hidden";

/** A saved row of route_legs. Both options are kept so switching never needs an API call. */
export type SavedLeg = {
  to_item: string;
  from_item: string;
  from_place: string;
  to_place: string;
  choice: Choice;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  walk_min: number | null;
  walk_m: number | null;
  /** null with transit_at set: no train found. null without: not checked yet. */
  transit: Transit | null;
  transit_at: string | null;
  provider: string | null;
};

/**
 * A source of train/bus routes. Add a country by adding a provider and listing it in
 * TRANSIT_PROVIDERS (lib/routes/index.ts); the first enabled one that covers both stops wins.
 */
export interface TransitProvider {
  id: string;
  /** Usage counter name in the database (route_claim). */
  api: "routes_google" | "routes_navitime";
  /** Server env has what it needs (API key). */
  enabled(): boolean;
  covers(p: LatLng): boolean;
  route(from: LatLng, to: LatLng, when: LocalTime): Promise<Transit | null>;
}
