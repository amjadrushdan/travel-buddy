import { getTrip } from "@/lib/data/trips";
import { listFlights, listStayTodos, listStays } from "@/lib/data/travel";
import { listDocuments } from "@/lib/data/bookings";
import { StayView } from "./StayView";

export default async function StayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, me }, stays, flights, todos, docs] = await Promise.all([
    getTrip(id),
    listStays(id),
    listFlights(id),
    listStayTodos(id),
    listDocuments(id),
  ]);

  // New stays default to where the first flight lands (usually the destination).
  const suggestedTz = flights[0]?.arrive_tz ?? null;

  return (
    <StayView
      tripId={trip.id}
      tripName={trip.name}
      tripStart={trip.start_date}
      tripEnd={trip.end_date}
      stays={stays}
      todos={todos}
      docs={docs.filter((d) => d.stay_id)}
      suggestedTz={suggestedTz}
      canEdit={me.role !== "viewer"}
      renderedAt={Date.now()}
    />
  );
}
