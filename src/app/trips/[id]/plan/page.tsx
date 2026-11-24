import { getTrip } from "@/lib/data/trips";
import { listDayTitles, listItinerary } from "@/lib/data/itinerary";
import { listStays } from "@/lib/data/travel";
import { forecastForDays } from "@/lib/data/weather";
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
  const [{ trip, me }, items, titles, stays] = await Promise.all([getTrip(id), listItinerary(id), listDayTitles(id), listStays(id)]);
  const days = tripDays(trip.start_date, trip.end_date, items);
  const weather = await forecastForDays(days, stays);

  return (
    <PlanView
      tripId={trip.id}
      tripName={trip.name}
      days={days}
      items={items}
      titles={titles}
      weather={weather}
      canEdit={me.role !== "viewer"}
      requestedDay={day && days.includes(day) ? day : null}
    />
  );
}
