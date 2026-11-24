import { createClient } from "@/lib/supabase/server";
import type { ItineraryItem } from "@/lib/itinerary";

export const ITEM_COLUMNS = "id, day, start_time, title, place, map_url, notes, sort_order";

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
