"use client";

import { useState, useTransition } from "react";
import { Field, inputCls, Masked, SheetActions, SheetForm, TzSelect, useToast } from "@/components/ui";
import { airport } from "@/lib/airports";
import { AirlineLogo } from "@/components/AirlineLogo";
import { airlineName } from "@/lib/airlines";
import { dayAt, duration, timeAt, tzLabel, utcToZonedInput } from "@/lib/time";
import { flightAwareUrl, type Flight } from "@/lib/travel";
import type { LiveStatus } from "@/lib/data/flight-status";
import { BADGE_CLS, changedTime, statusBadge, statusNote } from "@/lib/flight-status-map";
import { deleteFlight, saveFlight } from "../travel-actions";

type Member = { id: string; name: string };
type Sheet = { mode: "new" } | { mode: "edit"; flight: Flight } | null;

export function FlightsView({
  tripId,
  tripName,
  tripStart,
  flights,
  members,
  canEdit,
  live,
  liveBeforeMs,
  renderedAt,
}: {
  tripId: string;
  tripName: string;
  tripStart: string | null;
  flights: Flight[];
  members: Member[];
  canEdit: boolean;
  live: Record<string, LiveStatus | null>;
  liveBeforeMs: number | null;
  renderedAt: number;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useToast();

  return (
    <main className="flex flex-col gap-[18px] px-5 pt-[calc(26px+env(safe-area-inset-top))]">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="label">{tripName} · local times</span>
          <h1 className="page-title">Flights</h1>
        </div>
        {canEdit && flights.length > 0 && (
          <button
            type="button"
            onClick={() => setSheet({ mode: "new" })}
            className="rounded-sm bg-ink px-3 py-[7px] text-[13px] font-semibold text-white"
          >
            + Add
          </button>
        )}
      </div>

      {flights.length === 0 && (
        <div className="flex flex-col gap-3 rounded-card border-[1.5px] border-dashed border-line p-5 text-center">
          <span className="text-sm text-muted">No flights added yet.</span>
          {canEdit && (
            <button type="button" onClick={() => setSheet({ mode: "new" })} className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white">
              Add a flight
            </button>
          )}
        </div>
      )}

      {flights.map((f) => (
        <FlightCard
          key={f.id}
          f={f}
          pax={f.passengers.length}
          live={live[f.id] ?? null}
          liveBeforeMs={liveBeforeMs}
          renderedAt={renderedAt}
          onEdit={canEdit ? () => setSheet({ mode: "edit", flight: f }) : undefined}
        />
      ))}

      {sheet && (
        <FlightSheet
          tripId={tripId}
          tripStart={tripStart}
          sheet={sheet}
          members={members}
          onClose={() => setSheet(null)}
          onDone={setToast}
        />
      )}
      {toast}
    </main>
  );
}

function FlightCard({
  f,
  pax,
  live,
  liveBeforeMs,
  renderedAt,
  onEdit,
}: {
  f: Flight;
  pax: number;
  live: LiveStatus | null;
  liveBeforeMs: number | null;
  renderedAt: number;
  onEdit?: () => void;
}) {
  const from = airport(f.from_airport);
  const to = airport(f.to_airport);
  const badge = statusBadge(live);
  const late = live?.status === "delayed";
  const estDep = live && live.status !== "cancelled" ? changedTime(f.depart_at, live.est_departure) : null;
  const estArr = live && live.status !== "cancelled" ? changedTime(f.arrive_at, live.est_arrival) : null;

  return (
    <article className="relative rounded-card border border-line bg-surface">
      <div className="flex flex-col gap-3.5 px-4 pt-4 pb-[18px]">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2.5">
            <AirlineLogo flightNo={f.flight_no} size={32} />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[14px] font-semibold text-ink">{airlineName(f.flight_no, f.airline) ?? "Flight"}</span>
              <span className="font-mono text-[12px] font-semibold text-muted">{f.flight_no}</span>
            </span>
          </span>
          <span className={`rounded-sm px-2 py-1 font-mono text-xs font-semibold ${BADGE_CLS[badge.tone]}`}>{badge.label}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2.5">
          <End
            align="start"
            code={f.from_airport}
            city={from?.city}
            scheduled={f.depart_at}
            estimate={estDep}
            tz={f.depart_tz}
            late={late}
          />
          <div className="flex flex-col items-center gap-1 pt-3">
            <span className="h-px w-11 bg-muted" />
            <span className="font-mono text-[11px] text-muted">{duration(f.depart_at, f.arrive_at)}</span>
          </div>
          <End align="end" code={f.to_airport} city={to?.city} scheduled={f.arrive_at} estimate={estArr} tz={f.arrive_tz} late={late} />
        </div>
      </div>

      {/* perforation with notches */}
      <div className="relative border-t-[1.5px] border-dashed border-line">
        <span className="absolute -top-[11px] -left-[11px] size-5 rounded-full border-r border-line bg-bg" />
        <span className="absolute -top-[11px] -right-[11px] size-5 rounded-full border-l border-line bg-bg" />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted">PNR</span>
          <Masked value={f.pnr} className="text-[15px]" />
        </div>
        <Stat label="Pax" value={pax ? String(pax) : "—"} />
        <Stat label="Gate" value={live?.gate_dep ?? "—"} />
        <Stat label="Term." value={live?.terminal_dep ?? "—"} />
      </div>

      <div className="flex items-center justify-between gap-2.5 border-t border-line px-4 pt-2.5 pb-3.5 text-xs text-muted">
        <span className="text-pretty">{statusNote(f, live, liveBeforeMs, renderedAt)}</span>
        <a href={flightAwareUrl(f.flight_no)} target="_blank" rel="noopener noreferrer" className="font-semibold whitespace-nowrap text-ink">
          Track on FlightAware ↗
        </a>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="w-full border-t border-line py-2.5 text-[13px] font-semibold">
          Edit flight
        </button>
      )}
    </article>
  );
}

function End({
  align,
  code,
  city,
  scheduled,
  estimate,
  tz,
  late,
}: {
  align: "start" | "end";
  code: string;
  city?: string;
  scheduled: string;
  estimate: string | null;
  tz: string;
  late: boolean;
}) {
  const shown = estimate ?? scheduled;
  return (
    <div className={`flex flex-col gap-[3px] ${align === "end" ? "items-end text-right" : ""}`}>
      <span className="font-mono text-[34px] leading-none font-semibold">{code}</span>
      <span className="text-xs text-muted">{city ?? "\u00a0"}</span>
      <span className={`mt-2 font-mono text-[22px] font-medium ${estimate && late ? "text-warn-ink" : ""}`}>{timeAt(shown, tz)}</span>
      {estimate && <span className="font-mono text-xs text-muted line-through">Sched. {timeAt(scheduled, tz)}</span>}
      <span className="text-xs text-muted">
        {dayAt(shown, tz)} · {tzLabel(tz, shown)}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="font-mono text-[15px] font-semibold">{value}</span>
    </div>
  );
}

function FlightSheet({
  tripId,
  tripStart,
  sheet,
  members,
  onClose,
  onDone,
}: {
  tripId: string;
  tripStart: string | null;
  sheet: NonNullable<Sheet>;
  members: Member[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const f = sheet.mode === "edit" ? sheet.flight : null;
  const [from, setFrom] = useState(f?.from_airport ?? "");
  const [to, setTo] = useState(f?.to_airport ?? "");
  const [depTz, setDepTz] = useState(f?.depart_tz ?? "");
  const [arrTz, setArrTz] = useState(f?.arrive_tz ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Typing a known airport code fills its timezone.
  function onAirport(code: string, set: (v: string) => void, setTz: (v: string) => void) {
    const c = code.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    set(c);
    const a = airport(c);
    if (a) setTz(a.tz);
  }

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveFlight(tripId, f?.id ?? null, fd).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone(f ? "Flight saved" : "Flight added");
      }
    });
  }

  function remove() {
    if (!f) return;
    start(async () => {
      const res = await deleteFlight(tripId, f.id).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone("Flight removed");
      }
    });
  }

  const defaultLocal = tripStart ? `${tripStart}T09:00` : "";
  const fromCity = airport(from)?.city;
  const toCity = airport(to)?.city;

  return (
    <SheetForm title={f ? "Edit flight" : "Add flight"} onClose={onClose} onSubmit={submit}>
      <div className="grid grid-cols-[1.3fr_1fr] gap-2.5">
        <Field label="Airline (optional)">
          <input name="airline" maxLength={60} defaultValue={f?.airline ?? ""} placeholder="Malaysia Airlines" className={inputCls} />
        </Field>
        <Field label="Flight no.">
          <input
            name="flight_no"
            required
            maxLength={9}
            defaultValue={f?.flight_no ?? ""}
            placeholder="MH 88"
            autoCapitalize="characters"
            className={`${inputCls} font-mono uppercase`}
          />
        </Field>
      </div>
      <p className="-mt-1 text-xs text-muted">Use the operating airline&apos;s number (the one on the boarding pass), not a codeshare.</p>

      <fieldset className="flex flex-col gap-2.5 rounded-sm border border-line p-3">
        <legend className="px-1 text-xs font-semibold">Departs {fromCity ? `· ${fromCity}` : ""}</legend>
        <div className="grid grid-cols-[88px_1fr] gap-2.5">
          <Field label="From">
            <input
              name="from_airport"
              required
              value={from}
              onChange={(e) => onAirport(e.target.value, setFrom, setDepTz)}
              placeholder="KUL"
              autoCapitalize="characters"
              className={`${inputCls} font-mono uppercase`}
            />
          </Field>
          <Field label="Local date & time">
            <input
              name="depart_local"
              type="datetime-local"
              required
              defaultValue={f ? utcToZonedInput(f.depart_at, f.depart_tz) : defaultLocal}
              className={`${inputCls} font-mono`}
            />
          </Field>
        </div>
        <Field label="Timezone">
          <TzSelect name="depart_tz" value={depTz} onChange={setDepTz} />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 rounded-sm border border-line p-3">
        <legend className="px-1 text-xs font-semibold">Arrives {toCity ? `· ${toCity}` : ""}</legend>
        <div className="grid grid-cols-[88px_1fr] gap-2.5">
          <Field label="To">
            <input
              name="to_airport"
              required
              value={to}
              onChange={(e) => onAirport(e.target.value, setTo, setArrTz)}
              placeholder="NRT"
              autoCapitalize="characters"
              className={`${inputCls} font-mono uppercase`}
            />
          </Field>
          <Field label="Local date & time">
            <input
              name="arrive_local"
              type="datetime-local"
              required
              defaultValue={f ? utcToZonedInput(f.arrive_at, f.arrive_tz) : ""}
              className={`${inputCls} font-mono`}
            />
          </Field>
        </div>
        <Field label="Timezone">
          <TzSelect name="arrive_tz" value={arrTz} onChange={setArrTz} />
        </Field>
      </fieldset>

      <Field label="Booking code / PNR (optional)">
        <input
          name="pnr"
          maxLength={8}
          defaultValue={f?.pnr ?? ""}
          placeholder="7XK2QD"
          autoCapitalize="characters"
          autoComplete="off"
          className={`${inputCls} font-mono uppercase`}
        />
      </Field>

      {members.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs text-muted">Who&apos;s on this flight</legend>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 py-2 text-sm has-checked:border-ink">
                <input
                  type="checkbox"
                  name="passengers"
                  value={m.id}
                  defaultChecked={f ? f.passengers.includes(m.id) : true}
                  className="accent-ink"
                />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <SheetActions pending={pending} error={error} saveLabel={f ? "Save" : "Add flight"} onDelete={f ? remove : undefined} />
    </SheetForm>
  );
}
