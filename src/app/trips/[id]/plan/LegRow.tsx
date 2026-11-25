import type { RouteLeg } from "@/lib/data/itinerary";
import type { RideStep } from "@/lib/routes/types";

const GRID = "grid grid-cols-[48px_14px_1fr] gap-2.5";

/** Google Maps directions between the two stops, for live times on the day. */
function mapsUrl(leg: RouteLeg) {
  const q = new URLSearchParams({
    api: "1",
    origin: leg.from_place,
    destination: leg.to_place,
    travelmode: leg.mode === "walk" ? "walking" : "transit",
  });
  return `https://www.google.com/maps/dir/?${q}`;
}

function money(n: number, currency: string | null) {
  if (currency === "JPY") return `¥${n.toLocaleString("en")}`;
  return currency ? `${currency} ${n.toLocaleString("en")}` : String(n);
}

/** Dotted line in the timeline column: walking. */
function Dots() {
  return (
    <div className="flex justify-center" aria-hidden>
      <span className="w-0 border-l-2 border-dotted border-muted/45" />
    </div>
  );
}

function WalkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="13" cy="4" r="1.6" />
      <path d="M7 21l3-4M16 21l-2-4-3-3 1-6M6 12l2-3 4-1 3 3 3 1" />
    </svg>
  );
}

function Badge({ r }: { r: RideStep }) {
  const c = r.color ?? "var(--color-ink)";
  return (
    <span
      className="flex size-[22px] flex-none items-center justify-center rounded-full border-[2.5px] bg-surface font-mono text-[9.5px] leading-none font-semibold"
      style={{ borderColor: c }}
      aria-hidden
    >
      {r.code ?? ""}
    </span>
  );
}

/** How to get to the next stop: a walk, or the lines to ride. Sits between two plan items. */
export function LegRow({ leg, dim }: { leg: RouteLeg; dim: boolean }) {
  const rides = leg.steps.filter((s): s is RideStep => s.k === "ride");
  const walkMin = leg.steps.reduce((n, s) => (s.k === "walk" ? n + s.min : n), 0);
  const link = (
    <a href={mapsUrl(leg)} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-line underline-offset-2">
      Maps
    </a>
  );

  return (
    <li className={`flex flex-col ${dim ? "opacity-45" : ""}`} aria-label="Getting there">
      {leg.mode === "transit" &&
        rides.map((r, i) => (
          <div key={i} className={GRID}>
            <span />
            <div className="flex justify-center" aria-hidden>
              <span className="w-[4px] rounded-full" style={{ background: r.color ?? "var(--color-ink)" }} />
            </div>
            <div className="flex min-w-0 items-start gap-2 py-1.5">
              <Badge r={r} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-semibold">
                  {r.line} <span className="font-normal text-muted">· {r.min} min</span>
                </span>
                {(r.from || r.to) && (
                  <span className="text-[12px] text-muted [overflow-wrap:anywhere]">
                    {r.from} → {r.to}
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}

      <div className={GRID}>
        <span />
        <Dots />
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 py-1.5 text-[12px] text-muted">
          {leg.mode === "transit" ? (
            <>
              <span className="font-semibold text-ink">{leg.minutes} min</span>
              {leg.fare != null && <span>· {money(leg.fare, leg.currency)}</span>}
              {leg.leave_at && <span>· leave {leg.leave_at}</span>}
              {walkMin > 0 && <span>· {walkMin} min walk</span>}
              <span>·</span>
              {link}
            </>
          ) : leg.mode === "walk" ? (
            <>
              <WalkIcon />
              <span>Walk {leg.minutes} min</span>
              <span>·</span>
              {link}
            </>
          ) : (
            <>
              <span>Route not found</span>
              <span>·</span>
              {link}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
