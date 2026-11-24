import Link from "next/link";
import { Logo } from "@/components/Logo";
import { listMyTrips } from "@/lib/data/trips";
import { daysUntil, formatDateRange, roleLabel } from "@/lib/format";

export default async function TripsPage() {
  const trips = await listMyTrips();

  return (
    <main className="flex min-h-dvh flex-col gap-[22px] px-5 pt-[calc(24px+env(safe-area-inset-top))] pb-10">
      <Logo />
      <div className="flex flex-col gap-1">
        <span className="label">{trips.length === 1 ? "1 trip" : `${trips.length} trips`}</span>
        <h1 className="page-title">Your trips</h1>
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col gap-1.5 rounded-card border-[1.5px] border-dashed border-line p-5 text-center">
          <span className="text-base font-semibold">No trips yet</span>
          <span className="text-sm text-pretty text-muted">
            Create one, or open an invite link from someone in your group.
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {trips.map((t) => {
            const days = daysUntil(t.start_date);
            return (
              <li key={t.id}>
                <Link
                  href={`/trips/${t.id}`}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 active:opacity-80"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-lg font-bold tracking-[-0.01em]">{t.name}</span>
                    <span className="truncate text-[13px] text-muted">
                      {[t.destination, formatDateRange(t.start_date, t.end_date)].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1.5">
                    {days !== null && days > 0 && (
                      <span className="flex items-baseline gap-1 rounded-sm bg-warn px-2 pt-[3px] pb-0.5 text-ink">
                        <span className="font-mono text-[15px] leading-[1.1] font-semibold">{days}</span>
                        <span className="text-xs font-semibold">{days === 1 ? "day" : "days"}</span>
                      </span>
                    )}
                    <span className="rounded-sm border border-line px-[7px] py-[3px] font-mono text-[11px] text-muted">
                      {roleLabel(t.role)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/trips/new" className="rounded-sm bg-ink p-[13px] text-center text-[15px] font-semibold text-white">
        New trip
      </Link>
    </main>
  );
}
