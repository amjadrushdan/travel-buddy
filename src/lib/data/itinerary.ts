import { createClient } from "@/lib/supabase/server";
import type { ItineraryItem } from "@/lib/itinerary";
import type { SavedLeg } from "@/lib/routes/types";

export const ITEM_COLUMNS = "id, day, start_time, title, place, map_url, notes, sort_order";

/** Day titles by date ("2026-12-13" → "Harajuku day"). */
export async function listDayTitles(tripId: string): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("plan_days").select("day, title").eq("trip_id", tripId);
  return Object.fromEntries((data ?? []).map((r) => [r.day as string, r.title as string]));
}

/** All items of a trip, ordered by day then the group's chosen order. RLS limits this to members. */
export async function listItinerary(tripId: string): Promise<ItineraryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("itinerary_items")
    .select(ITEM_COLUMNS)
    .eq("trip_id", tripId)
    .order("day")
    .order("sort_order")
    .order("start_time", { nullsFirst: false })
    .returns<ItineraryItem[]>();
  if (error) throw error;
  return data ?? [];
}

export const LEG_COLUMNS =
  "to_item, from_item, from_place, to_place, choice, from_lat, from_lng, to_lat, to_lng, walk_min, walk_m, transit, transit_at, provider";

/** Saved ways of getting between stops (lib/routes), keyed by the stop they lead to. */
export async function listRouteLegs(tripId: string): Promise<SavedLeg[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("route_legs").select(LEG_COLUMNS).eq("trip_id", tripId).returns<SavedLeg[]>();
  if (error) throw error;
  return data ?? [];
}
