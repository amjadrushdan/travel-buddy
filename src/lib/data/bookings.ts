import { createClient } from "@/lib/supabase/server";
import { BOOKING_COLUMNS, DOCUMENT_COLUMNS, type Booking, type TripDocument } from "@/lib/bookings";

/** A trip's bookings by start time. RLS limits this to members. */
export async function listBookings(tripId: string): Promise<Booking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("trip_id", tripId)
    .order("starts_at")
    .returns<Booking[]>();
  if (error) throw error;
  return (data ?? []).map((b) => ({ ...b, price: b.price == null ? null : Number(b.price) }));
}

/** A trip's documents, newest last. RLS limits this to members. */
export async function listDocuments(tripId: string): Promise<TripDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at")
    .returns<TripDocument[]>();
  if (error) throw error;
  return data ?? [];
}
