// Shared (server + browser) itinerary types and helpers. No server imports here.
import { dateRange } from "@/lib/format";

export type ItineraryItem = {
  id: string;
  day: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  title: string;
  place: string | null;
  map_url: string | null;
  notes: string | null;
  sort_order: number;
};

/** The trip's days: its date range, plus any day an item sits on outside that range. */
export function tripDays(start: string | null, end: string | null, items: { day: string }[]): string[] {
  const days = new Set<string>(start && end ? dateRange(start, end) : start ? [start] : []);
  for (const it of items) days.add(it.day);
  return [...days].sort();
}

/** The item's own map link, or a Google Maps search for its place. */
export function mapLink(item: Pick<ItineraryItem, "map_url" | "place">): string | null {
  if (item.map_url) return item.map_url;
  if (item.place) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.place)}`;
  return null;
}

/** Index of the item that is "now": the last timed item at or before `time`. -1 if none. */
export function nowIndex(items: Pick<ItineraryItem, "start_time">[], time: string): number {
  let idx = -1;
  items.forEach((it, k) => {
    if (it.start_time && it.start_time.slice(0, 5) <= time) idx = k;
  });
  return idx;
}
