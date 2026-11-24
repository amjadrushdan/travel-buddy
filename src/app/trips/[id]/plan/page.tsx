import { getTrip } from "@/lib/data/trips";
import { listItinerary } from "@/lib/data/itinerary";
import { tripDays } from "@/lib/itinerary";
import { PlanView } from "./PlanView";

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { id } = await params;
  const { day } = await searchParams;
  const [{ trip, me }, items] = await Promise.all([getTrip(id), listItinerary(id)]);
  const days = tripDays(trip.start_date, trip.end_date, items);

  return (
    <PlanView
      tripId={trip.id}
      tripName={trip.name}
      days={days}
      items={items}
      canEdit={me.role !== "viewer"}
      requestedDay={day && days.includes(day) ? day : null}
    />
  );
}
