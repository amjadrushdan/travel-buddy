import { Suspense } from "react";
import Link from "next/link";
import { AvatarStack } from "@/components/Avatar";
import { CoverPicker } from "@/components/CoverPicker";
import { EditTripButton } from "@/components/EditTripButton";
import { TripLinks } from "@/components/TripLinks";
import { JoinedToast } from "@/components/JoinedToast";
import { NextFlightCard } from "@/components/NextFlightCard";
import { TodayCard } from "@/components/TodayCard";
import { coverSrc } from "@/lib/cover";
import { listDayTitles, listItinerary } from "@/lib/data/itinerary";
import { listFlights, listStays } from "@/lib/data/travel";
import { listBookings, listDocuments } from "@/lib/data/bookings";
import { getFlightStatuses, liveWindowBeforeMs } from "@/lib/data/flight-status";
import { nextFlight } from "@/lib/travel";
import { getTrip } from "@/lib/data/trips";
import { tripDays } from "@/lib/itinerary";
import { daysUntil, formatDateRange } from "@/lib/format";

// Design 2a cover: darker at the top (status bar, back link) and bottom (trip name).
const SCRIM = "linear-gradient(180deg, rgba(0,0,0,.45) 0%, transparent 26%, transparent 48%, rgba(0,0,0,.62) 100%)";

export default async function TripHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, members, me }, items, flights, titles, stays, bookings, docs] = await Promise.all([
    getTrip(id),
    listItinerary(id),
    listFlights(id),
    listDayTitles(id),
    listStays(id),
    listBookings(id),
    listDocuments(id),
  ]);
  const now = Date.now();
  const next = nextFlight(flights, now);
  const live = next ? await getFlightStatuses([next]) : {};
  const days = daysUntil(trip.start_date);
  const subtitle = [trip.destination, formatDateRange(trip.start_date, trip.end_date)].filter(Boolean).join(" · ");
  const kicker = days === 0 ? "Departure day" : days !== null && days < 0 ? "On the trip" : "Next trip";
  const canEdit = me.role !== "viewer";
  const cover = coverSrc(trip.id, trip.cover_url);
  const names = members.map((m) => m.profiles?.name ?? null);
  const memberLabel = `${members.length} ${members.length === 1 ? "member" : "members"} ›`;

  const flightCard = (
    <NextFlightCard
      tripId={trip.id}
      flight={next}
      live={next ? (live[next.id] ?? null) : null}
      liveBeforeMs={liveWindowBeforeMs()}
      nowMs={now}
    />
  );

  if (cover) {
    // Photo Home: full-bleed cover, white text over it, boarding pass pulled up onto the photo.
    return (
      <main className="flex flex-col gap-[22px] px-5">
        <div className="relative -mx-5 h-[430px] overflow-hidden bg-hero">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, same-origin, already sized */}
          <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0" style={{ background: SCRIM }} />
          <div className="relative flex h-full flex-col px-5 pt-[calc(16px+env(safe-area-inset-top))] text-white">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="py-1 text-[15px] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">
                ‹ Trips
              </Link>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <EditTripButton trip={trip} onPhoto />
                  <CoverPicker tripId={trip.id} hasCover onPhoto />
                </div>
              )}
            </div>
            <div className={`mt-auto flex items-end justify-between gap-3 ${next ? "mb-[236px]" : "mb-6"}`}>
              <div className="flex min-w-0 flex-col gap-1.5 [text-shadow:0_1px_6px_rgba(0,0,0,.35)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] tracking-[.1em] uppercase opacity-90">{kicker}</span>
                  {days !== null && days > 0 && (
                    <span className="rounded-sm bg-warn px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink [text-shadow:none]">
                      {days} {days === 1 ? "day" : "days"} to go
                    </span>
                  )}
                </div>
                <h1 className="text-[40px] leading-[1.02] font-bold tracking-[-0.02em] [overflow-wrap:anywhere]">{trip.name}</h1>
                {subtitle && <span className="text-sm opacity-90">{subtitle}</span>}
              </div>
              <Link href={`/trips/${trip.id}/members`} className="flex flex-none flex-col items-end gap-1.5 py-1">
                <AvatarStack names={names} ring="#FFFFFF" />
                <span className="text-xs [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">{memberLabel}</span>
              </Link>
            </div>
          </div>
        </div>

        <div className={next ? "relative z-[1] -mt-[242px] drop-shadow-[0_14px_22px_rgba(0,0,0,.3)]" : ""}>{flightCard}</div>

        <TodayCard tripId={trip.id} days={tripDays(trip.start_date, trip.end_date, items)} items={items} titles={titles} stays={stays} bookings={bookings} />

        <TripLinks tripId={trip.id} bookings={bookings.length} documents={docs.length} />

        <Suspense>
          <JoinedToast tripName={trip.name} />
        </Suspense>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-[22px] px-5 pt-[calc(16px+env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="py-1 text-[15px] font-semibold">
          ‹ Trips
        </Link>
        {canEdit && <EditTripButton trip={trip} />}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="label">{kicker}</span>
          <h1 className="text-[32px] leading-[1.05] font-bold tracking-[-0.02em] [overflow-wrap:anywhere]">{trip.name}</h1>
          <span className="text-sm text-muted">{subtitle}</span>
        </div>
        <Link href={`/trips/${trip.id}/members`} className="flex flex-none flex-col items-end gap-1.5 py-1">
          <AvatarStack names={names} />
          <span className="text-xs text-muted">{memberLabel}</span>
        </Link>
      </div>

      {days !== null && days > 0 && (
        <div className="flex items-baseline gap-2.5 border-b border-line pb-1">
          <span className="font-mono text-[64px] leading-none font-medium tracking-[-0.04em]">{days}</span>
          <span className="text-[15px] text-muted">{days === 1 ? "day to go" : "days to go"}</span>
        </div>
      )}

      {flightCard}

      <TodayCard tripId={trip.id} days={tripDays(trip.start_date, trip.end_date, items)} items={items} titles={titles} stays={stays} bookings={bookings} />

        <TripLinks tripId={trip.id} bookings={bookings.length} documents={docs.length} />

      {canEdit && <CoverPicker tripId={trip.id} hasCover={false} onPhoto={false} />}

      <Suspense>
        <JoinedToast tripName={trip.name} />
      </Suspense>
    </main>
  );
}
