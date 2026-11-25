// Shared shapes for getting between plan stops. Saved as-is in route_legs.steps, read by the app.

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

export type Leg = {
  mode: "walk" | "transit" | "none";
  minutes: number | null;
  /** Local "HH:MM" to leave the first stop. */
  leave_at: string | null;
  fare: number | null;
  currency: string | null;
  steps: Step[];
  provider: string | null;
};

/** A trip time in the stop's own timezone: "2026-12-14T13:00" in "Asia/Tokyo". */
export type LocalTime = { local: string; tz: string; arriveBy: boolean };

export type TransitResult = Pick<Leg, "minutes" | "leave_at" | "fare" | "currency" | "steps">;

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
  route(from: LatLng, to: LatLng, when: LocalTime): Promise<TransitResult | null>;
}
