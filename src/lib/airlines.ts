// Airline names by IATA code, for flights where the airline field was left empty.
// The 2-character code is the start of the flight number ("D7 522" → "D7").

export const AIRLINES: Record<string, string> = {
  // Malaysia / AirAsia group
  MH: "Malaysia Airlines",
  AK: "AirAsia",
  D7: "AirAsia X",
  FD: "Thai AirAsia",
  XJ: "Thai AirAsia X",
  QZ: "Indonesia AirAsia",
  Z2: "Philippines AirAsia",
  OD: "Batik Air Malaysia",
  FY: "Firefly",
  // Japan
  NH: "ANA",
  JL: "Japan Airlines",
  MM: "Peach",
  GK: "Jetstar Japan",
  BC: "Skymark",
  HD: "AIRDO",
  "6J": "Solaseed Air",
  "7G": "Star Flyer",
  ZG: "ZIPAIR",
  NU: "Japan Transocean Air",
  // Rest of Asia
  SQ: "Singapore Airlines",
  TR: "Scoot",
  "3K": "Jetstar Asia",
  TG: "Thai Airways",
  SL: "Thai Lion Air",
  VZ: "Thai Vietjet",
  VN: "Vietnam Airlines",
  VJ: "Vietjet",
  GA: "Garuda Indonesia",
  ID: "Batik Air",
  PR: "Philippine Airlines",
  "5J": "Cebu Pacific",
  CX: "Cathay Pacific",
  UO: "HK Express",
  BR: "EVA Air",
  CI: "China Airlines",
  KE: "Korean Air",
  OZ: "Asiana Airlines",
  "7C": "Jeju Air",
  TW: "T'way Air",
  LJ: "Jin Air",
  CA: "Air China",
  MU: "China Eastern",
  CZ: "China Southern",
  // Middle East / long haul
  EK: "Emirates",
  QR: "Qatar Airways",
  EY: "Etihad",
  SV: "Saudia",
  TK: "Turkish Airlines",
  QF: "Qantas",
  JQ: "Jetstar",
  BA: "British Airways",
};

/** "D7 522" → "D7"; null when the flight number doesn't start with a 2-character code. */
export function airlineCode(flightNo: string): string | null {
  const m = /^([A-Z0-9]{2})\s?\d/.exec(flightNo.toUpperCase());
  return m ? m[1] : null;
}

/** The airline name typed on the flight, or the one known for its code. */
export function airlineName(flightNo: string, typed: string | null): string | null {
  if (typed?.trim()) return typed.trim();
  const code = airlineCode(flightNo);
  return code ? (AIRLINES[code] ?? null) : null;
}
