import { getTrip } from "@/lib/data/trips";
import { listFlights } from "@/lib/data/travel";
import { listDocuments } from "@/lib/data/bookings";
import { getFlightStatuses, liveWindowBeforeMs } from "@/lib/data/flight-status";
import { FlightsView } from "./FlightsView";

export default async function FlightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, members, me }, flights] = await Promise.all([getTrip(id), listFlights(id)]);
  const [live, docs] = await Promise.all([getFlightStatuses(flights), listDocuments(id)]);

  return (
    <FlightsView
      live={live}
      liveBeforeMs={liveWindowBeforeMs()}
      docs={docs.filter((d) => d.flight_id)}
      renderedAt={Date.now()}
      tripId={trip.id}
      tripName={trip.name}
      tripStart={trip.start_date}
      flights={flights}
      members={members.map((m) => ({ id: m.user_id, name: m.profiles?.name ?? "Member" }))}
      canEdit={me.role !== "viewer"}
    />
  );
}
