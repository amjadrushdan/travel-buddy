// Small built-in airport list so a typed code fills in the city and timezone.
// Unknown codes still work: the person just picks the timezone themselves.

export const AIRPORTS: Record<string, { city: string; tz: string }> = {
  // Malaysia
  KUL: { city: "Kuala Lumpur", tz: "Asia/Kuala_Lumpur" },
  SZB: { city: "Subang", tz: "Asia/Kuala_Lumpur" },
  PEN: { city: "Penang", tz: "Asia/Kuala_Lumpur" },
  LGK: { city: "Langkawi", tz: "Asia/Kuala_Lumpur" },
  JHB: { city: "Johor Bahru", tz: "Asia/Kuala_Lumpur" },
  KBR: { city: "Kota Bharu", tz: "Asia/Kuala_Lumpur" },
  BKI: { city: "Kota Kinabalu", tz: "Asia/Kuching" },
  KCH: { city: "Kuching", tz: "Asia/Kuching" },
  // Japan
  NRT: { city: "Tokyo Narita", tz: "Asia/Tokyo" },
  HND: { city: "Tokyo Haneda", tz: "Asia/Tokyo" },
  KIX: { city: "Osaka Kansai", tz: "Asia/Tokyo" },
  ITM: { city: "Osaka Itami", tz: "Asia/Tokyo" },
  NGO: { city: "Nagoya", tz: "Asia/Tokyo" },
  FUK: { city: "Fukuoka", tz: "Asia/Tokyo" },
  CTS: { city: "Sapporo", tz: "Asia/Tokyo" },
  OKA: { city: "Okinawa", tz: "Asia/Tokyo" },
  // Rest of Asia
  SIN: { city: "Singapore", tz: "Asia/Singapore" },
  BKK: { city: "Bangkok", tz: "Asia/Bangkok" },
  DMK: { city: "Bangkok Don Mueang", tz: "Asia/Bangkok" },
  HKT: { city: "Phuket", tz: "Asia/Bangkok" },
  CGK: { city: "Jakarta", tz: "Asia/Jakarta" },
  DPS: { city: "Bali", tz: "Asia/Makassar" },
  MNL: { city: "Manila", tz: "Asia/Manila" },
  SGN: { city: "Ho Chi Minh City", tz: "Asia/Ho_Chi_Minh" },
  HAN: { city: "Hanoi", tz: "Asia/Bangkok" },
  HKG: { city: "Hong Kong", tz: "Asia/Hong_Kong" },
  TPE: { city: "Taipei", tz: "Asia/Taipei" },
  ICN: { city: "Seoul Incheon", tz: "Asia/Seoul" },
  GMP: { city: "Seoul Gimpo", tz: "Asia/Seoul" },
  PEK: { city: "Beijing", tz: "Asia/Shanghai" },
  PVG: { city: "Shanghai", tz: "Asia/Shanghai" },
  CAN: { city: "Guangzhou", tz: "Asia/Shanghai" },
  DEL: { city: "Delhi", tz: "Asia/Kolkata" },
  BOM: { city: "Mumbai", tz: "Asia/Kolkata" },
  // Middle East
  DXB: { city: "Dubai", tz: "Asia/Dubai" },
  DOH: { city: "Doha", tz: "Asia/Qatar" },
  JED: { city: "Jeddah", tz: "Asia/Riyadh" },
  MED: { city: "Madinah", tz: "Asia/Riyadh" },
  RUH: { city: "Riyadh", tz: "Asia/Riyadh" },
  IST: { city: "Istanbul", tz: "Europe/Istanbul" },
  // Europe / Oceania
  LHR: { city: "London Heathrow", tz: "Europe/London" },
  CDG: { city: "Paris", tz: "Europe/Paris" },
  AMS: { city: "Amsterdam", tz: "Europe/Amsterdam" },
  FRA: { city: "Frankfurt", tz: "Europe/Berlin" },
  SYD: { city: "Sydney", tz: "Australia/Sydney" },
  MEL: { city: "Melbourne", tz: "Australia/Melbourne" },
  PER: { city: "Perth", tz: "Australia/Perth" },
};

export function airport(code: string | null | undefined) {
  return code ? AIRPORTS[code.toUpperCase()] ?? null : null;
}
