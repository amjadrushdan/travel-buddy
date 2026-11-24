// Pure mapping from a FlightAware AeroAPI flight to our status row, plus display helpers.
// No I/O, so it works on server and browser and can be tested alone.
import { dayAt, timeAt } from "@/lib/time";

export type StatusKey = "scheduled" | "on_time" | "delayed" | "departed" | "landed" | "cancelled";

export type MappedStatus = {
  status: StatusKey;
  delay_min: number | null;
  est_departure: string | null;
  est_arrival: string | null;
  gate_dep: string | null;
  gate_arr: string | null;
  terminal_dep: string | null;
  terminal_arr: string | null;
};

/** The fields of an AeroAPI /flights/{ident} result that we use. */
export type AeroFlight = {
  ident?: string;
  ident_iata?: string | null;
  cancelled?: boolean;
  status?: string | null;
  departure_delay?: number | null; // seconds
  arrival_delay?: number | null;
  scheduled_out?: string | null;
  estimated_out?: string | null;
  actual_out?: string | null;
  scheduled_off?: string | null;
  estimated_off?: string | null;
  actual_off?: string | null;
  scheduled_on?: string | null;
  estimated_on?: string | null;
  actual_on?: string | null;
  scheduled_in?: string | null;
  estimated_in?: string | null;
  actual_in?: string | null;
  gate_origin?: string | null;
  gate_destination?: string | null;
  terminal_origin?: string | null;
  terminal_destination?: string | null;
  origin?: { code_iata?: string | null } | null;
  destination?: { code_iata?: string | null } | null;
};

/** Minutes of departure delay that count as "Delayed" rather than "On time". */
export const DELAY_THRESHOLD_MIN = 15;

/** Pick the result that is our flight: same origin, scheduled departure closest to ours (within 12h). */
export function pickFlight(results: AeroFlight[], fromAirport: string, departAt: string): AeroFlight | null {
  const target = Date.parse(departAt);
  let best: AeroFlight | null = null;
  let bestGap = 12 * 3_600_000;
  for (const r of results) {
    const origin = r.origin?.code_iata;
    if (origin && origin.toUpperCase() !== fromAirport.toUpperCase()) continue;
    const sched = r.scheduled_out ?? r.scheduled_off;
    if (!sched) continue;
    const gap = Math.abs(Date.parse(sched) - target);
    if (gap <= bestGap) {
      best = r;
      bestGap = gap;
    }
  }
  return best;
}

export function mapAeroFlight(f: AeroFlight): MappedStatus {
  const cancelled = !!f.cancelled || /cancel/i.test(f.status ?? "");
  const landed = !!(f.actual_on || f.actual_in);
  const departed = !!(f.actual_off || f.actual_out);
  const delay = f.departure_delay != null ? Math.round(f.departure_delay / 60) : null;

  const status: StatusKey = cancelled
    ? "cancelled"
    : landed
      ? "landed"
      : departed
        ? "departed"
        : delay != null && delay >= DELAY_THRESHOLD_MIN
          ? "delayed"
          : "on_time";

  const clean = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

  return {
    status,
    delay_min: delay,
    est_departure: f.actual_out ?? f.estimated_out ?? f.actual_off ?? f.estimated_off ?? f.scheduled_out ?? null,
    est_arrival: f.actual_in ?? f.estimated_in ?? f.actual_on ?? f.estimated_on ?? f.scheduled_in ?? null,
    gate_dep: clean(f.gate_origin),
    gate_arr: clean(f.gate_destination),
    terminal_dep: clean(f.terminal_origin),
    terminal_arr: clean(f.terminal_destination),
  };
}

/** Badge text and colour for a status. */
export function statusBadge(s: { status: StatusKey; delay_min: number | null } | null): {
  label: string;
  tone: "neutral" | "good" | "warn" | "bad";
} {
  if (!s) return { label: "Scheduled", tone: "neutral" };
  switch (s.status) {
    case "on_time":
      return { label: "On time", tone: "good" };
    case "delayed":
      return { label: `Delayed +${s.delay_min ?? 0}m`, tone: "warn" };
    case "departed":
      return { label: "Departed", tone: "good" };
    case "landed":
      return { label: "Landed", tone: "good" };
    case "cancelled":
      return { label: "Cancelled", tone: "bad" };
    default:
      return { label: "Scheduled", tone: "neutral" };
  }
}

/** "just now", "4 min ago", "2 h ago" */
export function agoLabel(iso: string, nowMs: number): string {
  const min = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

/** Estimated time to show instead of the scheduled one, when it differs by a minute or more. */
export function changedTime(scheduled: string, estimate: string | null | undefined): string | null {
  if (!estimate) return null;
  return Math.abs(Date.parse(estimate) - Date.parse(scheduled)) >= 60_000 ? estimate : null;
}

/** Footer line: when status was last fetched, or when live status starts. */
export function statusNote(
  f: { depart_at: string; depart_tz: string },
  live: { fetched_at: string | null } | null,
  liveEnabled: boolean,
  nowMs: number,
): string {
  if (live?.fetched_at) return `Updated ${agoLabel(live.fetched_at, nowMs)}`;
  if (!liveEnabled) return "Scheduled times";
  const from = new Date(Date.parse(f.depart_at) - 24 * 3_600_000).toISOString();
  return `Live status from ${dayAt(from, f.depart_tz)}, ${timeAt(from, f.depart_tz)}`;
}

export const BADGE_CLS: Record<"neutral" | "good" | "warn" | "bad", string> = {
  neutral: "bg-neutral-badge text-ink",
  good: "bg-good text-white",
  warn: "bg-warn text-warn-ink",
  bad: "bg-bad text-white",
};
