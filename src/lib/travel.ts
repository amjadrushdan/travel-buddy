// Shared (server + browser) flight and stay types. No server imports here.

export type Flight = {
  id: string;
  airline: string | null;
  flight_no: string;
  from_airport: string;
  to_airport: string;
  depart_at: string;
  depart_tz: string;
  arrive_at: string;
  arrive_tz: string;
  pnr: string | null;
  passengers: string[];
};

export type Stay = {
  id: string;
  name: string;
  address: string | null;
  map_url: string | null;
  check_in: string;
  check_out: string;
  tz: string;
  booking_ref: string | null;
  notes: string | null;
};

export const FLIGHT_COLUMNS =
  "id, airline, flight_no, from_airport, to_airport, depart_at, depart_tz, arrive_at, arrive_tz, pnr, passengers";
export const STAY_COLUMNS = "id, name, address, map_url, check_in, check_out, tz, booking_ref, notes";

/** "MH 88" → "MH88" for FlightAware, which resolves airline codes itself. */
export function flightAwareUrl(flightNo: string): string {
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(flightNo.replace(/\s+/g, ""))}`;
}

export function stayMapUrl(s: Pick<Stay, "map_url" | "address" | "name">): string {
  if (s.map_url) return s.map_url;
  const q = [s.name, s.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** The flight still to land soonest, or null. */
export function nextFlight(flights: Flight[], nowMs: number): Flight | null {
  return flights.find((f) => new Date(f.arrive_at).getTime() > nowMs) ?? null;
}
