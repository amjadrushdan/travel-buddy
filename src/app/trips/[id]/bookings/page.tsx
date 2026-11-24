import { getTrip } from "@/lib/data/trips";
import { listBookings, listDocuments } from "@/lib/data/bookings";
import { listFlights } from "@/lib/data/travel";
import { BookingsView } from "./BookingsView";

export default async function BookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, me }, bookings, docs, flights] = await Promise.all([getTrip(id), listBookings(id), listDocuments(id), listFlights(id)]);

  return (
    <BookingsView
      tripId={trip.id}
      tripName={trip.name}
      tripStart={trip.start_date}
      bookings={bookings}
      docs={docs}
      suggestedTz={flights[0]?.arrive_tz ?? null}
      canEdit={me.role !== "viewer"}
    />
  );
}
