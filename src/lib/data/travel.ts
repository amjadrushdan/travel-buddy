import { createClient } from "@/lib/supabase/server";
import { FLIGHT_COLUMNS, STAY_COLUMNS, type Flight, type Stay } from "@/lib/travel";

/** A trip's flights by departure. RLS limits this to members. */
export async function listFlights(tripId: string): Promise<Flight[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flights")
    .select(FLIGHT_COLUMNS)
    .eq("trip_id", tripId)
    .order("depart_at")
    .returns<Flight[]>();
  if (error) throw error;
  return data ?? [];
}

/** A trip's stays by check-in. RLS limits this to members. */
export async function listStays(tripId: string): Promise<Stay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stays")
    .select(STAY_COLUMNS)
    .eq("trip_id", tripId)
    .order("check_in")
    .returns<Stay[]>();
  if (error) throw error;
  return data ?? [];
}
