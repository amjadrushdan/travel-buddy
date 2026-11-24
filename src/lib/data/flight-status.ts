// Live flight status, server side only. Follows MVP_PLAN "Fetch Rules":
//  1. Server-side only; API keys never reach the browser.
//  2. Lazy: runs when a member opens the trip, never on a schedule.
//  3. Active window around the flight (see PROVIDERS).
//  4. Cache: rows newer than the TTL are served as-is.
//  5. Frozen once landed or cancelled.
//  6. Dedupe: the DB claim lets only one concurrent request call the API.
//
// Limiter / cache layers, cheapest first:
//  a. In-memory (per server instance): a flight checked within its TTL skips even the DB claim.
//  b. DB claim (shared by every instance and user): TTL cache, row-lock dedupe, freeze after
//     landing, a DAILY cap and a MONTHLY cap. Only a 'go' from the claim calls the provider.
//
// Provider: aviationstack if AVIATIONSTACK_API_KEY is set, else FlightAware if FLIGHTAWARE_API_KEY
// is set. With neither (or a cap reached) the app shows scheduled times plus tracking links.

import { createClient } from "@/lib/supabase/server";
import { dateAt } from "@/lib/time";
import type { Flight } from "@/lib/travel";
import {
  mapAeroFlight,
  mapAvsFlight,
  pickAvsFlight,
  pickFlight,
  type AeroFlight,
  type AvsFlight,
  type MappedStatus,
  type StatusKey,
} from "@/lib/flight-status-map";

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

const H = 3_600_000;
const FETCH_TIMEOUT_MS = 6000;

type Provider = {
  name: "aviationstack" | "flightaware";
  ttlMin: number;
  windowBeforeMs: number;
  windowAfterMs: number;
  defaultMonthlyCap: number;
  defaultDailyCap: number;
  /** The mapped status plus the raw record to store, or null if the flight wasn't found. */
  fetch: (ident: string, f: Flight) => Promise<{ mapped: MappedStatus; raw: unknown } | null>;
};

// aviationstack free plan: ~100 calls/month. Check every 30 min from 3h before departure to
// 2h after arrival (about 24 calls per flight at most); stop at 15 a day and 90 a month.
const AVIATIONSTACK: Provider = {
  name: "aviationstack",
  ttlMin: 30,
  windowBeforeMs: 3 * H,
  windowAfterMs: 2 * H,
  defaultMonthlyCap: 90,
  defaultDailyCap: 15,
  async fetch(ident, f) {
    // The free plan only supports plain http. The key is only ever sent from the server.
    const base = process.env.AVIATIONSTACK_BASE_URL || "http://api.aviationstack.com/v1";
    const params = new URLSearchParams({ access_key: process.env.AVIATIONSTACK_API_KEY!, flight_iata: ident });
    const res = await fetch(`${base}/flights?${params}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { data?: AvsFlight[]; error?: { code?: string; message?: string } };
    if (!res.ok || body.error) {
      throw new Error(`aviationstack ${res.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`.trim());
    }
    const hit = pickAvsFlight(body.data ?? [], f);
    return hit ? { mapped: mapAvsFlight(hit, f), raw: hit } : null;
  },
};

// FlightAware AeroAPI personal tier (needs a card on file): every 12 min from 24h before.
const FLIGHTAWARE: Provider = {
  name: "flightaware",
  ttlMin: 12,
  windowBeforeMs: 24 * H,
  windowAfterMs: 6 * H,
  defaultMonthlyCap: 500,
  defaultDailyCap: 100,
  async fetch(ident, f) {
    const dep = Date.parse(f.depart_at);
    const params = new URLSearchParams({
      ident_type: "designator",
      start: new Date(dep - 12 * H).toISOString().slice(0, 19) + "Z",
      end: new Date(dep + 12 * H).toISOString().slice(0, 19) + "Z",
    });
    const res = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}?${params}`, {
      headers: { "x-apikey": process.env.FLIGHTAWARE_API_KEY!, accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`AeroAPI ${res.status}`);
    const body = (await res.json()) as { flights?: AeroFlight[] };
    const hit = pickFlight(body.flights ?? [], f.from_airport, f.depart_at);
    return hit ? { mapped: mapAeroFlight(hit), raw: hit } : null;
  },
};

function provider(): Provider | null {
  if (!process.env.FLIGHT_STATUS_SECRET) return null;
  if (process.env.AVIATIONSTACK_API_KEY) return AVIATIONSTACK;
  if (process.env.FLIGHTAWARE_API_KEY) return FLIGHTAWARE;
  return null;
}

const COLUMNS =
  "flight_no, flight_date, status, delay_min, est_departure, est_arrival, gate_dep, gate_arr, terminal_dep, terminal_arr, fetched_at";

export const statusKey = (f: Pick<Flight, "flight_no" | "depart_at" | "depart_tz">) => ({
  flight_no: f.flight_no.replace(/\s+/g, ""),
  flight_date: dateAt(f.depart_at, f.depart_tz),
});

export function inActiveWindow(f: Pick<Flight, "depart_at" | "arrive_at">, now: number, p: Provider): boolean {
  return now >= Date.parse(f.depart_at) - p.windowBeforeMs && now <= Date.parse(f.arrive_at) + p.windowAfterMs;
}

export function liveStatusEnabled(): boolean {
  return provider() !== null;
}

/** How long before departure live status starts, or null when live status is off. */
export function liveWindowBeforeMs(): number | null {
  return provider()?.windowBeforeMs ?? null;
}

// ---------------------------------------------------------------- layer a: in-memory gate
// key "MH88|2026-12-12" → don't ask the DB again before this time (ms).
// Per server instance only; the DB claim is still the source of truth across instances.
const memo = new Map<string, number>();
const MEMO_MAX = 500;

function memoSkip(k: string, now: number): boolean {
  const until = memo.get(k);
  if (until && until > now) return true;
  if (until) memo.delete(k);
  return false;
}

function memoHold(k: string, ms: number) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
  memo.set(k, Date.now() + ms);
}

/** Status for each flight id (null = nothing known). Refreshes stale, active flights first. */
export async function getFlightStatuses(flights: Flight[]): Promise<Record<string, LiveStatus | null>> {
  const out: Record<string, LiveStatus | null> = {};
  if (flights.length === 0) return out;
  const supabase = await createClient();
  const now = Date.now();
  const p = provider();

  if (p) {
    const due = flights.filter((f) => inActiveWindow(f, now, p));
    // The same flight may appear twice (two trips); refresh each key once.
    const seen = new Set<string>();
    await Promise.all(
      due
        .filter((f) => {
          const k = memoKey(f);
          if (seen.has(k) || memoSkip(k, now)) return false;
          seen.add(k);
          return true;
        })
        .map((f) => refresh(supabase, f, p).catch((e) => console.error("flight status", f.flight_no, e))),
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

const memoKey = (f: Flight) => {
  const k = statusKey(f);
  return `${k.flight_no}|${k.flight_date}`;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------- layer b: DB claim + provider
async function refresh(supabase: Supabase, f: Flight, p: Provider) {
  const secret = process.env.FLIGHT_STATUS_SECRET!;
  const key = statusKey(f);
  const mk = memoKey(f);
  const monthly = Number(process.env.FLIGHT_STATUS_MONTHLY_CAP) || p.defaultMonthlyCap;
  const daily = Number(process.env.FLIGHT_STATUS_DAILY_CAP) || p.defaultDailyCap;
  const release = () =>
    supabase.rpc("flight_status_release", { p_secret: secret, p_flight_no: key.flight_no, p_flight_date: key.flight_date });

  const { data: claim, error } = await supabase.rpc("flight_status_claim", {
    p_secret: secret,
    p_flight_no: key.flight_no,
    p_flight_date: key.flight_date,
    p_ttl_minutes: p.ttlMin,
    p_monthly_cap: monthly,
    p_daily_cap: daily,
  });
  if (error) throw error;

  // Remember the answer in memory so the next opens skip the DB round trip.
  if (claim === "fresh" || claim === "busy") memoHold(mk, Math.min(p.ttlMin, 5) * 60_000);
  if (claim === "frozen") memoHold(mk, 24 * H);
  if (claim === "cap") memoHold(mk, 30 * 60_000);
  if (claim !== "go") return;

  try {
    const result = await p.fetch(key.flight_no, f);
    if (!result) {
      await release();
      memoHold(mk, p.ttlMin * 60_000); // not found yet: don't retry on every open
      return;
    }
    const m = result.mapped;
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
      p_raw: { provider: p.name, data: result.raw },
    });
    if (saveError) throw saveError;
    memoHold(mk, p.ttlMin * 60_000);
  } catch (e) {
    await release();
    memoHold(mk, 5 * 60_000); // provider error: back off 5 min before trying again
    throw e;
  }
}
