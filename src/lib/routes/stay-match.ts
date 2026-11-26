// Is this plan stop one of the trip's stays? Stays have exact map points, so a stop at a stay is
// routed from that point instead of a guess from its text. People write the same address in
// different ways ("NK Bldg, Minami 12 Jonishi 14-1-20, Sapporo" vs "NK Bldg 4F, 14-1-20 Minami
// 12 Jonishi, Chuo Ward…"), so this matches on more than the exact text. Pure: server and app.

export type StayPoint = { name: string; address: string | null; lat: number | null; lng: number | null };

const norm = (s: string) => s.normalize("NFKC").toLowerCase();
// Words that say nothing about which building it is.
const COMMON = new Set(["japan", "tokyo", "city", "ward", "chuo", "district", "prefecture", "hokkaido", "airbnb", "stay", "hotel", "bldg", "building", "chome", "chōme"]);
const words = (s: string) => new Set(norm(s).split(/[^\p{L}]+/u).filter((w) => w.length >= 4 && !COMMON.has(w)));
const numbers = (s: string): string[] => norm(s).match(/\d+/g) ?? [];

export function matchStay<T extends StayPoint>(place: string | null | undefined, stays: T[]): T | null {
  if (!place) return null;
  const p = norm(place).trim();
  const located = stays.filter((s) => s.lat != null && s.lng != null);
  // 1. Same text as the stay's name or address.
  const exact = located.find((s) => p === norm(s.name).trim() || (s.address && p === norm(s.address).trim()));
  if (exact) return exact;
  const pn = numbers(place);
  const pw = words(place);
  for (const s of located) {
    const text = `${s.name} ${s.address ?? ""}`;
    // 2. The same street numbers (at least three, e.g. 12 · 14-1-20) in the stay's address.
    const sn = numbers(s.address ?? "");
    if (pn.length >= 3 && pn.every((n) => sn.includes(n))) return s;
    // 3. Two distinctive words in common ("Sakaemachi" + "Biei").
    const sw = words(text);
    let shared = 0;
    for (const w of pw) if (sw.has(w)) shared++;
    if (shared >= 2) return s;
  }
  return null;
}

/** Roughly 150 m apart or more. */
export function moved(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) > 0.0014 || Math.abs(a.lng - b.lng) > 0.0018;
}
