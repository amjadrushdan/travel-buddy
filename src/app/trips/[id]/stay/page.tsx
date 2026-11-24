import { getTrip } from "@/lib/data/trips";
import { listFlights, listStays } from "@/lib/data/travel";
import { StayView } from "./StayView";

export default async function StayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, me }, stays, flights] = await Promise.all([getTrip(id), listStays(id), listFlights(id)]);

  // New stays default to where the first flight lands (usually the destination).
  const suggestedTz = flights[0]?.arrive_tz ?? null;

  return (
    <StayView
      tripId={trip.id}
      tripName={trip.name}
      tripStart={trip.start_date}
      stays={stays}
      suggestedTz={suggestedTz}
      canEdit={me.role !== "viewer"}
    />
  );
}
