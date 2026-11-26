"use client";

import { useState, useTransition } from "react";
import { EscClose } from "@/components/ui";
import { leaveBy, minutesShown, shownAs } from "@/lib/routes/leg";
import type { Choice, RideStep, SavedLeg } from "@/lib/routes/types";
import { chooseRoute, recheckRoute } from "./actions";

const GRID = "grid grid-cols-[48px_14px_1fr] gap-2.5";
const SHORT_WALK = 10;

/** Google Maps directions between the two stops, for live times on the day. */
function mapsUrl(leg: SavedLeg, mode: string) {
  const q = new URLSearchParams({
    api: "1",
    origin: leg.from_place,
    destination: leg.to_place,
    travelmode: mode === "walk" ? "walking" : mode === "car" ? "driving" : "transit",
  });
  return `https://www.google.com/maps/dir/?${q}`;
}

function money(n: number, currency: string | null) {
  if (currency === "JPY") return `¥${n.toLocaleString("en")}`;
  return currency ? `${currency} ${n.toLocaleString("en")}` : String(n);
}

const km = (m: number | null) => (m == null ? null : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const rides = (l: SavedLeg) => (l.transit?.steps ?? []).filter((s): s is RideStep => s.k === "ride");

function Dots() {
  return (
    <div className="flex justify-center" aria-hidden>
      <span className="w-0 border-l-2 border-dotted border-muted/45" />
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const WALK = "M13 4.5a1.5 1.5 0 1 0 0-.01M7 21l3-4M16 21l-2-4-3-3 1-6M6 12l2-3 4-1 3 3 3 1";
const CAR = "M5 17h14M6 17v2M18 17v2M4 13l2-6h12l2 6v4H4zM7.5 14h.01M16.5 14h.01";

function Badge({ r }: { r: RideStep }) {
  return (
    <span
      className="flex size-[22px] flex-none items-center justify-center rounded-full border-[2.5px] bg-surface font-mono text-[9.5px] leading-none font-semibold"
      style={{ borderColor: r.color ?? "var(--color-ink)" }}
      aria-hidden
    >
      {r.code ?? ""}
    </span>
  );
}

/**
 * How to get to the next stop, between two plan items: the lines to ride, a walk, or a car.
 * Editors tap the summary to change it; everyone gets a Maps link for live times.
 */
export function LegRow({
  leg,
  arrive,
  dim,
  canEdit,
  onOpen,
}: {
  leg: SavedLeg;
  /** The next stop's start time ("13:30"), to show when to leave. */
  arrive: string | null;
  dim: boolean;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const shown = shownAs(leg);
  if (shown === "hidden" && !canEdit) return null;
  const min = minutesShown(leg);
  // A short walk is just "Walk 3 min": its leave time and a Maps link would only add noise.
  const short = shown === "walk" && min != null && min < SHORT_WALK;
  const leave = short ? null : leaveBy(arrive, min);

  const summary =
    shown === "transit" ? (
      <>
        <span className="font-semibold text-ink">{min} min</span>
        {leg.transit?.fare != null && <span>· {money(leg.transit.fare, leg.transit.currency)}</span>}
        {leave && <span>· leave {leave}</span>}
      </>
    ) : shown === "walk" ? (
      <>
        <Icon d={WALK} />
        <span>
          Walk <span className="font-semibold text-ink">{min} min</span>
        </span>
        {leave && <span>· leave {leave}</span>}
      </>
    ) : shown === "car" ? (
      <>
        <Icon d={CAR} />
        <span>Car or taxi</span>
      </>
    ) : shown === "hidden" ? (
      <span>Route hidden</span>
    ) : (
      <span>Route not found</span>
    );

  return (
    <li className={`flex flex-col ${dim ? "opacity-45" : ""}`} aria-label="Getting there">
      {shown === "transit" &&
        rides(leg).map((r, i) => (
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
        <div className={`flex min-w-0 items-center gap-2 ${shown === "hidden" ? "py-0.5" : "py-1.5"}`}>
          {canEdit ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label="Change how to get there"
              className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-left text-[12px] text-muted"
            >
              {summary}
              <span aria-hidden className="text-[13px]">
                ›
              </span>
            </button>
          ) : (
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] text-muted">{summary}</span>
          )}
          {shown !== "hidden" && !short && (
            <a
              href={mapsUrl(leg, shown)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex-none text-[12px] font-semibold text-ink underline decoration-line underline-offset-2"
            >
              Maps
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

/** Pick how to get there. Only "Check trains" and "Check again" can use an API call. */
export function RouteSheet({
  tripId,
  leg,
  fromTitle,
  toTitle,
  arrive,
  onClose,
  onDone,
}: {
  tripId: string;
  leg: SavedLeg;
  fromTitle: string;
  toTitle: string;
  arrive: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const shown = shownAs(leg);

  function run(key: string, job: () => Promise<{ error?: string; note?: string }>, done: string) {
    setError(null);
    setBusy(key);
    start(async () => {
      const res = await job().catch(() => ({ error: "Couldn't reach the server. Are you offline?" }) as { error?: string; note?: string });
      setBusy(null);
      if (res.error) return setError(res.error);
      onClose();
      onDone(res.note ?? done);
    });
  }
  const choose = (c: Choice, done: string) => run(c, () => chooseRoute(tripId, leg.to_item, c), done);

  const r = rides(leg);
  const transitLeave = leaveBy(arrive, leg.transit?.minutes ?? null);
  const walkLeave = leaveBy(arrive, leg.walk_min);
  const trainChecked = !!leg.transit_at;

  const option = (key: string, selected: boolean, icon: React.ReactNode, title: string, sub: string | null, onClick: (() => void) | null) => (
    <button
      type="button"
      disabled={(!onClick && !selected) || !!busy}
      onClick={onClick ?? undefined}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-[12px] border bg-surface px-3.5 py-3 text-left transition-colors disabled:cursor-default ${
        selected ? "cursor-default border-2 border-ink px-[13px] py-[11px]" : "border-line hover:bg-ink/[.03]"
      } ${!onClick && !selected ? "opacity-55" : ""}`}
    >
      <span className="flex w-[22px] flex-none justify-center">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold">{busy === key ? "Working…" : title}</span>
        {sub && <span className="text-[12px] text-muted [overflow-wrap:anywhere]">{sub}</span>}
      </span>
      {selected && <span aria-hidden>✓</span>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35 lg:items-center lg:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label="How to get there"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[480px] flex-col gap-2.5 rounded-t-[22px] bg-bg px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))] lg:max-h-[88dvh] lg:max-w-[520px] lg:overflow-y-auto lg:rounded-[22px] lg:pb-6 lg:shadow-[0_24px_60px_rgba(0,0,0,.25)]"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line lg:hidden" />
        <EscClose onClose={onClose} />
        <span className="text-xs text-muted">Getting there{leg.choice === "auto" && shown !== "none" ? " · picked automatically" : ""}</span>
        <span className="-mt-1 mb-1 text-[17px] leading-snug font-semibold text-pretty">
          {fromTitle} → {toTitle}
        </span>

        {leg.transit
          ? option(
              "transit",
              shown === "transit",
              r[0] ? <Badge r={r[0]} /> : null,
              `Train · ${leg.transit.minutes} min`,
              [
                r.map((x) => `${x.line} ${x.min} min`).join(" → "),
                leg.transit.fare != null ? money(leg.transit.fare, leg.transit.currency) : null,
                transitLeave ? `leave ${transitLeave}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              shown === "transit" ? null : () => choose("transit", "Showing the train"),
            )
          : trainChecked
            ? option("transit", false, null, "No train found", "Walking is the way here", null)
            : option("transit", false, null, "Check trains", "Looks up the train once and saves it", () => choose("transit", "Showing the train"))}

        {option(
          "walk",
          shown === "walk",
          <Icon d={WALK} />,
          leg.walk_min != null ? `Walk · ${leg.walk_min} min` : "Walk",
          leg.walk_min != null ? [km(leg.walk_m), walkLeave ? `leave ${walkLeave}` : null].filter(Boolean).join(" · ") : "Work out the walking time",
          shown === "walk" ? null : () => choose("walk", "Showing the walk"),
        )}

        {option(
          "car",
          shown === "car",
          <Icon d={CAR} />,
          "Car or taxi",
          "No route, just a note on the timeline",
          shown === "car" ? null : () => choose("car", "Marked as car or taxi"),
        )}

        {error && (
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between gap-3 text-[13px]">
          {shown === "hidden" ? (
            <button type="button" disabled={!!busy} onClick={() => choose("auto", "Route shown")} className="font-semibold">
              Show route
            </button>
          ) : (
            <button type="button" disabled={!!busy} onClick={() => choose("hidden", "Route hidden")} className="text-muted">
              Hide route
            </button>
          )}
          {leg.choice !== "auto" && leg.choice !== "hidden" && (
            <button type="button" disabled={!!busy} onClick={() => choose("auto", "Back to automatic")} className="text-muted">
              Automatic
            </button>
          )}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run("recheck", () => recheckRoute(tripId, leg.to_item), "Route checked again")}
            className="text-muted"
          >
            {busy === "recheck" ? "Checking…" : "Check again"}
          </button>
          <a href={mapsUrl(leg, shown)} target="_blank" rel="noopener noreferrer" className="font-semibold">
            Open in Maps
          </a>
        </div>
      </div>
    </div>
  );
}
