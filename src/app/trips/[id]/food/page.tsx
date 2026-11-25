import { createClient } from "@/lib/supabase/server";
import { getTrip } from "@/lib/data/trips";
import { FoodView, type FoodCheck } from "./FoodView";

export default async function FoodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { trip, me } = await getTrip(id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("food_checks")
    .select("id, barcode, name, ingredients, checked_by, updated_at, profiles(name)")
    .eq("trip_id", id)
    .order("updated_at", { ascending: false })
    .limit(200)
    .returns<FoodCheck[]>();
  if (error) throw error;

  return <FoodView tripId={trip.id} tripName={trip.name} checks={data ?? []} myId={me.user_id} canManage={me.role !== "viewer"} />;
}
