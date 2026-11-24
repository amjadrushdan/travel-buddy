import { getTrip } from "@/lib/data/trips";
import { listFlights } from "@/lib/data/travel";
import { FlightsView } from "./FlightsView";

export default async function FlightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, members, me }, flights] = await Promise.all([getTrip(id), listFlights(id)]);

  return (
    <FlightsView
      tripId={trip.id}
      tripName={trip.name}
      tripStart={trip.start_date}
      flights={flights}
      members={members.map((m) => ({ id: m.user_id, name: m.profiles?.name ?? "Member" }))}
      canEdit={me.role !== "viewer"}
    />
  );
}
