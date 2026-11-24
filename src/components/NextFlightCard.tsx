import Link from "next/link";
import { airport } from "@/lib/airports";
import { dayAt, duration, shortDayAt, timeAt } from "@/lib/time";
import { flightAwareUrl, type Flight } from "@/lib/travel";

/** Home's dark boarding pass for the next flight. Times are local at each airport. */
export function NextFlightCard({ tripId, flight }: { tripId: string; flight: Flight | null }) {
  const href = `/trips/${tripId}/flights`;

  if (!flight) {
    return (
      <Link href={href} className="flex flex-col gap-1.5 rounded-card border-[1.5px] border-dashed border-line p-5 text-center">
        <span className="text-base font-semibold">No upcoming flights</span>
        <span className="text-sm text-muted">Add flights and the next one shows here as a boarding pass.</span>
      </Link>
    );
  }

  const f = flight;
  const from = airport(f.from_airport);
  const to = airport(f.to_airport);
  const liveFrom = new Date(new Date(f.depart_at).getTime() - 24 * 3_600_000).toISOString();

  return (
    <div className="flex flex-col text-hero-ink">
      <Link href={href} className="flex flex-col gap-3.5 rounded-t-card bg-hero px-[18px] pt-[18px] pb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] tracking-[.1em] text-hero-muted uppercase">
            Next flight · {dayAt(f.depart_at, f.depart_tz)}
          </span>
          <span className="rounded-sm bg-neutral-badge px-2 py-1 font-mono text-xs font-semibold text-ink">Scheduled</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.02em]">{f.from_airport}</span>
            <span className="font-mono text-xl font-medium">{timeAt(f.depart_at, f.depart_tz)}</span>
            {from && <span className="text-xs text-hero-muted">{from.city}</span>}
          </div>
          <div className="flex flex-col items-center gap-1 pb-2.5">
            <span className="font-mono text-[11px] text-hero-muted">{f.flight_no}</span>
            <span className="h-px w-14 bg-hero-muted" />
            <span className="font-mono text-[11px] text-hero-muted">{duration(f.depart_at, f.arrive_at)}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.02em]">{f.to_airport}</span>
            <span className="font-mono text-xl font-medium">{timeAt(f.arrive_at, f.arrive_tz)}</span>
            {to && <span className="text-xs text-hero-muted">{to.city}</span>}
          </div>
        </div>
      </Link>
      <div className="relative flex flex-col gap-3.5 rounded-b-card border-t-[1.5px] border-dashed border-hero-line bg-hero px-[18px] pt-3 pb-3.5">
        <span className="absolute -top-[11px] -left-[11px] size-5 rounded-full bg-bg" />
        <span className="absolute -top-[11px] -right-[11px] size-5 rounded-full bg-bg" />
        <div className="grid grid-cols-3 gap-2">
          <HeroStat label="Gate" value="—" />
          <HeroStat label="Terminal" value="—" />
          <HeroStat label="Departs" value={shortDayAt(f.depart_at, f.depart_tz)} />
        </div>
        <div className="flex justify-between gap-2 text-xs text-hero-muted">
          <span>
            Live status from {dayAt(liveFrom, f.depart_tz)}, {timeAt(liveFrom, f.depart_tz)}
          </span>
          <a
            href={flightAwareUrl(f.flight_no)}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap text-hero-ink underline underline-offset-2"
          >
            Track on FlightAware ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-hero-muted">{label}</span>
      <span className="font-mono text-lg font-semibold">{value}</span>
    </div>
  );
}
