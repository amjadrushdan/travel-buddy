// Live flight status, server side only. Follows MVP_PLAN "Fetch Rules":
//  1. Server-side only; FLIGHTAWARE_API_KEY never reaches the browser.
//  2. Lazy: runs when a member opens the trip, never on a schedule.
//  3. Active window: from 24h before departure until 6h after scheduled arrival.
//  4. Cache: rows newer than the TTL are served as-is.
//  5. Frozen once landed or cancelled.
//  6. Dedupe: the DB claim lets only one concurrent request call the API.
// With no API key (or the monthly cap reached) the app shows scheduled times plus the
// "Track on FlightAware" link only.

import { createClient } from "@/lib/supabase/server";
import { dateAt } from "@/lib/time";
import type { Flight } from "@/lib/travel";
import { mapAeroFlight, pickFlight, type AeroFlight, type StatusKey } from "@/lib/flight-status-map";

export type LiveStatus = {
  status: StatusKey;
  delay_min: number | null;
  est_departure: string | null;
  est_arrival: string | null;
  gate_dep: string | null;
  gate_arr: string | null;
  terminal_dep: string | null;
  terminal_arr: string | null;
  fetched_at: string | null;
};

const TTL_MIN = 12;
const WINDOW_BEFORE_MS = 24 * 3_600_000;
const WINDOW_AFTER_MS = 6 * 3_600_000;
const FETCH_TIMEOUT_MS = 5000;

const COLUMNS =
  "flight_no, flight_date, status, delay_min, est_departure, est_arrival, gate_dep, gate_arr, terminal_dep, terminal_arr, fetched_at";

export const statusKey = (f: Pick<Flight, "flight_no" | "depart_at" | "depart_tz">) => ({
  flight_no: f.flight_no.replace(/\s+/g, ""),
  flight_date: dateAt(f.depart_at, f.depart_tz),
});

export function inActiveWindow(f: Pick<Flight, "depart_at" | "arrive_at">, now: number): boolean {
  return now >= Date.parse(f.depart_at) - WINDOW_BEFORE_MS && now <= Date.parse(f.arrive_at) + WINDOW_AFTER_MS;
}

export function liveStatusEnabled(): boolean {
  return !!process.env.FLIGHTAWARE_API_KEY && !!process.env.FLIGHT_STATUS_SECRET;
}

/** Status for each flight id (null = nothing known). Refreshes stale, active flights first. */
export async function getFlightStatuses(flights: Flight[]): Promise<Record<string, LiveStatus | null>> {
  const out: Record<string, LiveStatus | null> = {};
  if (flights.length === 0) return out;
  const supabase = await createClient();
  const now = Date.now();

  if (liveStatusEnabled()) {
    await Promise.all(
      flights.filter((f) => inActiveWindow(f, now)).map((f) => refresh(supabase, f).catch((e) => console.error("flight status", f.flight_no, e))),
    );
  }

  const keys = flights.map(statusKey);
  const { data } = await supabase
    .from("flight_status")
    .select(COLUMNS)
    .in("flight_no", [...new Set(keys.map((k) => k.flight_no))])
    .returns<(LiveStatus & { flight_no: string; flight_date: string })[]>();

  flights.forEach((f, i) => {
    const row = data?.find((r) => r.flight_no === keys[i].flight_no && r.flight_date === keys[i].flight_date);
    out[f.id] = row && row.fetched_at ? row : null;
  });
  return out;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function refresh(supabase: Supabase, f: Flight) {
  const secret = process.env.FLIGHT_STATUS_SECRET!;
  const key = statusKey(f);
  const cap = Number(process.env.FLIGHTAWARE_MONTHLY_CAP) || 500;

  const { data: claim, error } = await supabase.rpc("flight_status_claim", {
    p_secret: secret,
    p_flight_no: key.flight_no,
    p_flight_date: key.flight_date,
    p_ttl_minutes: TTL_MIN,
    p_monthly_cap: cap,
  });
  if (error) throw error;
  if (claim !== "go") return; // fresh, frozen, busy or cap

  try {
    const result = await fetchAero(key.flight_no, f);
    if (!result) {
      await supabase.rpc("flight_status_release", { p_secret: secret, p_flight_no: key.flight_no, p_flight_date: key.flight_date });
      return;
    }
    const m = mapAeroFlight(result);
    const { error: saveError } = await supabase.rpc("flight_status_save", {
      p_secret: secret,
      p_flight_no: key.flight_no,
      p_flight_date: key.flight_date,
      p_status: m.status,
      p_delay_min: m.delay_min,
      p_est_departure: m.est_departure,
      p_est_arrival: m.est_arrival,
      p_gate_dep: m.gate_dep,
      p_gate_arr: m.gate_arr,
      p_terminal_dep: m.terminal_dep,
      p_terminal_arr: m.terminal_arr,
      p_raw: result,
    });
    if (saveError) throw saveError;
  } catch (e) {
    await supabase.rpc("flight_status_release", { p_secret: secret, p_flight_no: key.flight_no, p_flight_date: key.flight_date });
    throw e;
  }
}

async function fetchAero(ident: string, f: Flight): Promise<AeroFlight | null> {
  const dep = Date.parse(f.depart_at);
  const params = new URLSearchParams({
    ident_type: "designator",
    start: new Date(dep - 12 * 3_600_000).toISOString().slice(0, 19) + "Z",
    end: new Date(dep + 12 * 3_600_000).toISOString().slice(0, 19) + "Z",
  });
  const res = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}?${params}`, {
    headers: { "x-apikey": process.env.FLIGHTAWARE_API_KEY!, accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AeroAPI ${res.status}`);
  const body = (await res.json()) as { flights?: AeroFlight[] };
  return pickFlight(body.flights ?? [], f.from_airport, f.depart_at);
}
