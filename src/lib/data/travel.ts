import { createClient } from "@/lib/supabase/server";
import { FLIGHT_COLUMNS, STAY_COLUMNS, STAY_TODO_COLUMNS, type Flight, type Stay, type StayTodo } from "@/lib/travel";

/** A trip's stay to-dos, in list order. RLS limits this to members. */
export async function listStayTodos(tripId: string): Promise<StayTodo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stay_todos")
    .select(STAY_TODO_COLUMNS)
    .eq("trip_id", tripId)
    .order("sort_order")
    .order("created_at")
    .returns<StayTodo[]>();
  if (error) throw error;
  return data ?? [];
}

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
