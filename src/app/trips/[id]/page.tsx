import { Suspense } from "react";
import Link from "next/link";
import { AvatarStack } from "@/components/Avatar";
import { JoinedToast } from "@/components/JoinedToast";
import { NextFlightCard } from "@/components/NextFlightCard";
import { TodayCard } from "@/components/TodayCard";
import { listItinerary } from "@/lib/data/itinerary";
import { listFlights } from "@/lib/data/travel";
import { getFlightStatuses, liveWindowBeforeMs } from "@/lib/data/flight-status";
import { nextFlight } from "@/lib/travel";
import { getTrip } from "@/lib/data/trips";
import { tripDays } from "@/lib/itinerary";
import { daysUntil, formatDateRange } from "@/lib/format";

export default async function TripHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, members }, items, flights] = await Promise.all([getTrip(id), listItinerary(id), listFlights(id)]);
  const now = Date.now();
  const next = nextFlight(flights, now);
  const live = next ? await getFlightStatuses([next]) : {};
  const days = daysUntil(trip.start_date);
  const subtitle = [trip.destination, formatDateRange(trip.start_date, trip.end_date)].filter(Boolean).join(" · ");
  const kicker = days === 0 ? "Departure day" : days !== null && days < 0 ? "On the trip" : "Next trip";

  return (
    <main className="flex flex-col gap-[22px] px-5 pt-[calc(16px+env(safe-area-inset-top))]">
      <Link href="/" className="self-start py-1 text-[15px] font-semibold">
        ‹ Trips
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="label">{kicker}</span>
          <h1 className="text-[32px] leading-[1.05] font-bold tracking-[-0.02em] break-words">{trip.name}</h1>
          <span className="text-sm text-muted">{subtitle}</span>
        </div>
        <Link href={`/trips/${trip.id}/members`} className="flex flex-none flex-col items-end gap-1.5 py-1">
          <AvatarStack names={members.map((m) => m.profiles?.name ?? null)} />
          <span className="text-xs text-muted">
            {members.length} {members.length === 1 ? "member" : "members"} ›
          </span>
        </Link>
      </div>

      {days !== null && days > 0 && (
        <div className="flex items-baseline gap-2.5 border-b border-line pb-1">
          <span className="font-mono text-[64px] leading-none font-medium tracking-[-0.04em]">{days}</span>
          <span className="text-[15px] text-muted">{days === 1 ? "day to go" : "days to go"}</span>
        </div>
      )}

      <NextFlightCard
        tripId={trip.id}
        flight={next}
        live={next ? (live[next.id] ?? null) : null}
        liveBeforeMs={liveWindowBeforeMs()}
        nowMs={now}
      />

      <TodayCard tripId={trip.id} days={tripDays(trip.start_date, trip.end_date, items)} items={items} />

      <Suspense>
        <JoinedToast tripName={trip.name} />
      </Suspense>
    </main>
  );
}
