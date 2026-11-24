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
  platform: StayPlatform | null;
  host: string | null;
  address_local: string | null;
  booking_url: string | null;
  checkin_info: string | null;
  door_code: string | null;
  wifi: string | null;
};

export type StayPlatform = "airbnb" | "booking" | "agoda" | "hotel" | "other";

export const PLATFORMS: { key: StayPlatform; label: string; color: string }[] = [
  { key: "airbnb", label: "Airbnb", color: "#FF385C" },
  { key: "booking", label: "Booking.com", color: "#003580" },
  { key: "agoda", label: "Agoda", color: "#5392F9" },
  { key: "hotel", label: "Hotel", color: "#16181A" },
  { key: "other", label: "Other", color: "#5F6265" },
];

export type StayTodo = {
  id: string;
  stay_id: string;
  text: string;
  done: boolean;
  sort_order: number;
};

export const STAY_TODO_COLUMNS = "id, stay_id, text, done, sort_order";

/** Google Maps directions to the stay from wherever the phone is. */
export function stayDirectionsUrl(s: Pick<Stay, "address" | "name">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address?.trim() || s.name)}`;
}

export const FLIGHT_COLUMNS =
  "id, airline, flight_no, from_airport, to_airport, depart_at, depart_tz, arrive_at, arrive_tz, pnr, passengers";
export const STAY_COLUMNS =
  "id, name, address, map_url, check_in, check_out, tz, booking_ref, notes, platform, host, address_local, booking_url, checkin_info, door_code, wifi";

/** "MH 88" → "MH88" for FlightAware, which resolves airline codes itself. */
export function flightAwareUrl(flightNo: string): string {
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(flightNo.replace(/\s+/g, ""))}`;
}

/**
 * Google Maps link for a stay. A pasted map link wins. Otherwise search the ADDRESS only:
 * names like "Tokyo Airbnb (Ōjima, Koto)" aren't real place names and send the search astray,
 * while a full street address resolves to the exact building. Name is the fallback.
 */
export function stayMapUrl(s: Pick<Stay, "map_url" | "address" | "name">): string {
  if (s.map_url) return s.map_url;
  const q = s.address?.trim() || s.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** The flight still to land soonest, or null. */
export function nextFlight(flights: Flight[], nowMs: number): Flight | null {
  return flights.find((f) => new Date(f.arrive_at).getTime() > nowMs) ?? null;
}
