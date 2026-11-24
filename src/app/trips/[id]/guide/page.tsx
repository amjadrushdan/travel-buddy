import { createClient } from "@/lib/supabase/server";
import { getTrip } from "@/lib/data/trips";
import { GUIDE_COLUMNS, type Guide } from "@/lib/guides";
import { GuideView } from "./GuideView";

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { trip, me } = await getTrip(id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guides")
    .select(GUIDE_COLUMNS)
    .eq("trip_id", id)
    .order("created_at")
    .returns<Guide[]>();
  if (error) throw error;

  return <GuideView tripId={trip.id} tripName={trip.name} guides={data ?? []} canEdit={me.role !== "viewer"} />;
}
