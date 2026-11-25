"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DocumentList } from "@/components/DocumentList";
import { LinkedText } from "@/components/LinkedText";
import type { TripDocument } from "@/lib/bookings";
import { Field, inputCls, Masked, SheetActions, SheetForm, TzSelect, useDeviceTz, useOnline, useToast } from "@/components/ui";
import { dateRange, dayParts } from "@/lib/format";
import { dateAt, dayAt, nights, timeAt, tzLabel, utcToZonedInput } from "@/lib/time";
import { PLATFORMS, stayDirectionsUrl, stayMapUrl, type Stay, type StayTodo } from "@/lib/travel";
import { addStayTodo, deleteStay, deleteStayTodo, findLocation, saveStay, setStayTodoDone } from "../travel-actions";

type Sheet = { mode: "new" } | { mode: "edit"; stay: Stay } | null;
type Status = "past" | "now" | "upcoming";

const OFFLINE = { error: "Couldn't reach the server. Are you offline?" };
// One colour per stay, in trip order (night strip and card accents).
const PALETTE = ["#2F5D8C", "#1E7B4A", "#B5651D", "#7A4FA3", "#0E7C86", "#A33A5C"];

/** "Tokyo Airbnb (Ōjima, Koto)" → "Tokyo Airbnb"; "Fuji: Holiday Home…" → "Fuji". */
const shortName = (name: string) => name.split(/[:(]/)[0].trim() || name;

function statusOf(s: Stay, now: number): Status {
  if (now >= Date.parse(s.check_out)) return "past";
  if (now >= Date.parse(s.check_in)) return "now";
  return "upcoming";
}

/** "in 40 min", "in 14 h", "in 18 days" */
function inTime(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `in ${h} h`;
  const d = Math.round(min / 1440);
  return `in ${d} ${d === 1 ? "day" : "days"}`;
}

export function StayView({
  tripId,
  tripName,
  tripStart,
  tripEnd,
  stays,
  todos,
  docs,
  suggestedTz,
  canEdit,
  renderedAt,
}: {
  tripId: string;
  tripName: string;
  tripStart: string | null;
  tripEnd: string | null;
  stays: Stay[];
  todos: StayTodo[];
  docs: TripDocument[];
  suggestedTz: string | null;
  canEdit: boolean;
  renderedAt: number;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [driver, setDriver] = useState<Stay | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [now, setNow] = useState(renderedAt);
  const [toast, setToast] = useToast();

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const colorOf = useMemo(() => new Map(stays.map((s, i) => [s.id, PALETTE[i % PALETTE.length]])), [stays]);
  const total = stays.reduce((n, s) => n + nights(s.check_in, s.check_out, s.tz), 0);
  const current = stays.find((s) => statusOf(s, now) === "now");
  const next = stays.find((s) => statusOf(s, now) === "upcoming");
  const featured = current ?? next ?? null;
  const upcoming = stays.filter((s) => s !== featured && statusOf(s, now) !== "past");
  const past = stays.filter((s) => s !== featured && statusOf(s, now) === "past");
  const todosOf = (id: string) => todos.filter((t) => t.stay_id === id);

  const card = (s: Stay, opts: { kicker?: string; defaultOpen?: boolean; faded?: boolean } = {}) => (
    <StayCard
      key={s.id}
      s={s}
      tripId={tripId}
      color={colorOf.get(s.id)!}
      todos={todosOf(s.id)}
      docs={docs.filter((d) => d.stay_id === s.id)}
      canEdit={canEdit}
      kicker={opts.kicker}
      defaultOpen={opts.defaultOpen}
      faded={opts.faded}
      onEdit={() => setSheet({ mode: "edit", stay: s })}
      onDriver={() => setDriver(s)}
      onToast={setToast}
    />
  );

  let featuredKicker: string | undefined;
  if (featured && current) {
    featuredKicker = `Staying now · check-out ${dayAt(current.check_out, current.tz)} ${timeAt(current.check_out, current.tz)} · ${inTime(Date.parse(current.check_out) - now)}`;
  } else if (featured) {
    featuredKicker = `Next stay · check-in ${dayAt(featured.check_in, featured.tz)} ${timeAt(featured.check_in, featured.tz)} · ${inTime(Date.parse(featured.check_in) - now)}`;
  }

  return (
    <main className="flex flex-col gap-4 px-5 pt-[calc(26px+env(safe-area-inset-top))]">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="label">
            {tripName}
            {total ? ` · ${total} ${total === 1 ? "night" : "nights"}` : ""}
          </span>
          <h1 className="page-title">Stays</h1>
        </div>
        {canEdit && stays.length > 0 && (
          <button type="button" onClick={() => setSheet({ mode: "new" })} className="rounded-sm bg-ink px-3 py-[7px] text-[13px] font-semibold text-white">
            + Add
          </button>
        )}
      </div>

      {stays.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-card border-[1.5px] border-dashed border-line p-5 text-center">
          <span className="text-sm text-muted">No stays added yet.</span>
          {canEdit && (
            <button type="button" onClick={() => setSheet({ mode: "new" })} className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white">
              Add a stay
            </button>
          )}
        </div>
      ) : (
        <>
          <NightStrip tripStart={tripStart} tripEnd={tripEnd} stays={stays} colorOf={colorOf} />

          {featured && card(featured, { kicker: featuredKicker, defaultOpen: true })}

          {upcoming.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="label">Later</span>
              {upcoming.map((s) => card(s))}
            </div>
          )}

          {past.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={() => setShowPast((v) => !v)} className="label self-start" aria-expanded={showPast}>
                Done · {past.length} {past.length === 1 ? "stay" : "stays"} {showPast ? "▴" : "▾"}
              </button>
              {showPast && past.map((s) => card(s, { faded: true }))}
            </div>
          )}
        </>
      )}

      {sheet && (
        <StaySheet tripId={tripId} tripStart={tripStart} sheet={sheet} suggestedTz={suggestedTz} onClose={() => setSheet(null)} onDone={setToast} />
      )}
      {driver && <DriverView s={driver} onClose={() => setDriver(null)} onToast={setToast} />}
      {toast}
    </main>
  );
}

// ---------------------------------------------------------------- night strip

function NightStrip({
  tripStart,
  tripEnd,
  stays,
  colorOf,
}: {
  tripStart: string | null;
  tripEnd: string | null;
  stays: Stay[];
  colorOf: Map<string, string>;
}) {
  if (!tripStart || !tripEnd || tripEnd <= tripStart) return null;
  const nightsList = dateRange(tripStart, tripEnd).slice(0, -1); // the night of each date except the last day
  const cover = nightsList.map((d) => stays.filter((s) => dateAt(s.check_in, s.tz) <= d && d < dateAt(s.check_out, s.tz)));

  // Merge consecutive nights with the same stay into one labelled segment.
  type Run = { key: string; stay: Stay | null; overlap: boolean; len: number };
  const runs: Run[] = [];
  cover.forEach((c) => {
    const key = c.length === 0 ? "gap" : c.length > 1 ? "overlap:" + c.map((s) => s.id).join() : c[0].id;
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.len++;
    else runs.push({ key, stay: c.length === 1 ? c[0] : null, overlap: c.length > 1, len: 1 });
  });
  const gaps = nightsList.filter((_, i) => cover[i].length === 0);
  const overlaps = nightsList.filter((_, i) => cover[i].length > 1);

  return (
    <div className="flex flex-col gap-1.5" aria-label="Where you sleep each night">
      <div className="flex font-mono text-[10px] text-muted">
        {nightsList.map((d) => (
          <span key={d} className="flex-1 text-center">
            {dayParts(d).d}
          </span>
        ))}
      </div>
      <div className="flex h-7 gap-[2px] overflow-hidden rounded-sm">
        {runs.map((r, i) => (
          <span
            key={i}
            style={{
              flexGrow: r.len,
              flexBasis: 0,
              background: r.stay ? colorOf.get(r.stay.id) : undefined,
            }}
            className={`flex min-w-0 items-center justify-center px-1 text-[11px] font-semibold ${
              r.stay ? "text-white" : r.overlap ? "bg-warn text-warn-ink" : "bg-bad/15 text-bad"
            }`}
            title={r.stay ? r.stay.name : r.overlap ? "Two stays booked" : "No stay booked"}
          >
            <span className="truncate">{r.stay ? shortName(r.stay.name) : r.overlap ? "Overlap" : "No stay"}</span>
          </span>
        ))}
      </div>
      {(gaps.length > 0 || overlaps.length > 0) && (
        <span className="text-xs text-bad">
          {gaps.length > 0 && `No stay booked for the night of ${gaps.map((d) => `${dayParts(d).d} ${dayParts(d).mon}`).join(", ")}. `}
          {overlaps.length > 0 && `Two stays overlap on ${overlaps.map((d) => `${dayParts(d).d} ${dayParts(d).mon}`).join(", ")}.`}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- stay card

function StayCard({
  s,
  tripId,
  color,
  todos,
  docs,
  canEdit,
  kicker,
  defaultOpen = false,
  faded = false,
  onEdit,
  onDriver,
  onToast,
}: {
  s: Stay;
  tripId: string;
  color: string;
  todos: StayTodo[];
  docs: TripDocument[];
  canEdit: boolean;
  kicker?: string;
  defaultOpen?: boolean;
  faded?: boolean;
  onEdit: () => void;
  onDriver: () => void;
  onToast: (msg: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const n = nights(s.check_in, s.check_out, s.tz);
  const label = tzLabel(s.tz, s.check_in);
  const platform = PLATFORMS.find((p) => p.key === s.platform);
  const openTodos = todos.filter((t) => !t.done).length;
  const ci = dayParts(dateAt(s.check_in, s.tz));
  const co = dayParts(dateAt(s.check_out, s.tz));

  return (
    <article
      className={`flex min-w-0 flex-col overflow-hidden rounded-card border bg-surface ${kicker ? "border-ink" : "border-line"} ${faded ? "opacity-60" : ""}`}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      {kicker && <div className="bg-ink px-4 py-2 font-mono text-[11px] tracking-[.06em] text-white uppercase">{kicker}</div>}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[17px] leading-snug font-semibold text-pretty [overflow-wrap:anywhere]">{s.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span>
              {ci.dow} {ci.d} {ci.mon} → {co.dow} {co.d} {co.mon} · {n} {n === 1 ? "night" : "nights"}
            </span>
            {openTodos > 0 && (
              <span className="rounded-full bg-warn/30 px-2 py-0.5 text-[11px] font-semibold text-warn-ink">
                {openTodos} to-do{openTodos === 1 ? "" : "s"}
              </span>
            )}
          </span>
        </span>
        <span className="flex-none pt-0.5 font-mono text-xl text-muted" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="flex min-w-0 flex-col gap-3.5 border-t border-line px-4 pt-3.5 pb-4">
          {s.address && <span className="text-[13px] text-pretty text-muted [overflow-wrap:anywhere]">{s.address}</span>}

          <div className="grid grid-cols-2 rounded-sm border border-line">
            <div className="flex min-w-0 flex-col gap-0.5 border-r border-line px-3 py-2.5">
              <span className="text-[11px] text-muted">Check-in</span>
              <span className="font-mono text-[22px] font-medium">{timeAt(s.check_in, s.tz)}</span>
              <span className="text-xs text-muted">
                {dayAt(s.check_in, s.tz)} · {label}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
              <span className="text-[11px] text-muted">Check-out</span>
              <span className="font-mono text-[22px] font-medium">{timeAt(s.check_out, s.tz)}</span>
              <span className="text-xs text-muted">
                {dayAt(s.check_out, s.tz)} · {tzLabel(s.tz, s.check_out)}
              </span>
            </div>
          </div>

          <Actions s={s} onDriver={onDriver} onToast={onToast} />

          {/* Secondary details fold into one-line rows; tap to open. */}
          <div className="flex flex-col divide-y divide-line border-y border-line">
            {(s.checkin_info || s.door_code || s.wifi) && (
              <Section
                icon={SECTION_ICONS.key}
                title="Check-in"
                summary={s.checkin_info ?? [s.door_code && "Door code", s.wifi && "Wi-Fi"].filter(Boolean).join(" · ")}
              >
                {s.checkin_info && <LinkedText text={s.checkin_info} className="text-[13px] leading-normal text-ink" />}
                {(s.door_code || s.wifi) && (
                  <dl className="flex flex-col gap-2 text-[13px]">
                    {s.door_code && (
                      <Row label="Door code">
                        <Masked value={s.door_code} />
                      </Row>
                    )}
                    {s.wifi && (
                      <Row label="Wi-Fi">
                        <Masked value={s.wifi} />
                      </Row>
                    )}
                  </dl>
                )}
              </Section>
            )}

            {(platform || s.host || s.booking_ref || docs.length > 0 || canEdit) && (
              <Section
                icon={SECTION_ICONS.receipt}
                title="Booking"
                summary={[platform?.label, s.host, docs.length > 0 && `${docs.length} ${docs.length === 1 ? "file" : "files"}`].filter(Boolean).join(" · ") || "Add confirmation"}
              >
                {(platform || s.host || s.booking_ref) && (
                  <dl className="flex flex-col gap-2 text-[13px]">
                    {platform && <Row label="Booked on">{platform.label}</Row>}
                    {s.host && <Row label="Host">{s.host}</Row>}
                    {s.booking_ref && (
                      <Row label="Booking ref">
                        <Masked value={s.booking_ref} />
                      </Row>
                    )}
                  </dl>
                )}
                <DocumentList tripId={tripId} parent={{ stay_id: s.id }} docs={docs} canEdit={canEdit} title="" />
              </Section>
            )}

            {(todos.length > 0 || canEdit) && (
              <Section
                icon={SECTION_ICONS.check}
                title="To-do"
                summary={todos.length === 0 ? "Shared with the group" : openTodos > 0 ? `${openTodos} open · shared with the group` : "All done"}
                attention={openTodos > 0}
              >
                <Todos tripId={tripId} stayId={s.id} todos={todos} canEdit={canEdit} onToast={onToast} />
              </Section>
            )}

            {s.notes && (
              <Section icon={SECTION_ICONS.note} title="Notes" summary={s.notes}>
                <LinkedText text={s.notes} className="text-[13px] leading-normal text-ink" />
              </Section>
            )}
          </div>

          {canEdit && (
            <button type="button" onClick={onEdit} className="self-center px-3 py-1 text-[13px] font-semibold text-muted">
              Edit stay
            </button>
          )}
        </div>
      )}
    </article>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const SECTION_ICONS = {
  key: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8.7-8.7M16.5 6.5l2.5 2.5M14 9l2 2" />
    </svg>
  ),
  receipt: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  ),
  note: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M5 4h14v16H5z" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </svg>
  ),
};

/** One quiet row: icon, title, one-line summary. Tap to show the details underneath. */
function Section({
  icon,
  title,
  summary,
  attention = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  attention?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 py-3 text-left">
        <span className="flex-none text-muted">{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">{title}</span>
          {!open && <span className={`truncate text-[13px] ${attention ? "font-medium text-warn-ink" : "text-muted"}`}>{summary}</span>}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} className={`flex-none text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="flex flex-col gap-3 pb-3.5 pl-[30px]">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex-none text-muted">{label}</dt>
      <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- quick actions

const ICONS = {
  pin: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7Z" fill="#E5322D" />
      <circle cx="12" cy="9.5" r="2.6" fill="#fff" />
    </svg>
  ),
  directions: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m12 2.5 9.5 9.5-9.5 9.5L2.5 12Z" />
      <path d="M9 14v-2.5a1.5 1.5 0 0 1 1.5-1.5H15M13 8l2 2-2 2" />
    </svg>
  ),
  copy: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8.5" y="8.5" width="11" height="12" rx="2" />
      <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
    </svg>
  ),
  driver: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 16.5V12l2-5h10l2 5v4.5" />
      <path d="M3.5 16.5h17v2.5h-17zM6.5 19v1.5M17.5 19v1.5M5 12h14" />
      <circle cx="8" cy="14.3" r=".6" fill="currentColor" />
      <circle cx="16" cy="14.3" r=".6" fill="currentColor" />
    </svg>
  ),
  link: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 14a4 4 0 0 0 5.7 0l3.3-3.3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  ),
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Actions({ s, onDriver, onToast }: { s: Stay; onDriver: () => void; onToast: (msg: string) => void }) {
  const address = s.address_local || s.address || s.name;
  const btn = "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-sm border border-line bg-bg px-1 py-2 text-[11px] font-semibold text-ink active:bg-line/60";
  return (
    <div className="flex gap-1.5">
      <a href={stayMapUrl(s)} target="_blank" rel="noopener noreferrer" className={btn}>
        {ICONS.pin}
        Maps
      </a>
      <a href={stayDirectionsUrl(s)} target="_blank" rel="noopener noreferrer" className={btn}>
        {ICONS.directions}
        Directions
      </a>
      <button type="button" className={btn} onClick={async () => onToast((await copyText(address)) ? "Address copied" : "Couldn't copy")}>
        {ICONS.copy}
        Copy
      </button>
      <button type="button" className={btn} onClick={onDriver}>
        {ICONS.driver}
        Driver
      </button>
      {s.booking_url && (
        <a href={s.booking_url} target="_blank" rel="noopener noreferrer" className={btn}>
          {ICONS.link}
          Booking
        </a>
      )}
    </div>
  );
}

/** Full-screen address for a taxi or transfer driver. */
function DriverView({ s, onClose, onToast }: { s: Stay; onClose: () => void; onToast: (msg: string) => void }) {
  const big = s.address_local || s.address || s.name;
  return (
    <div role="dialog" aria-label="Address for the driver" className="fixed inset-0 z-50 flex flex-col bg-white px-6 pt-[calc(24px+env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <button type="button" onClick={onClose} className="self-end rounded-full bg-bg px-3.5 py-1.5 text-sm font-semibold">
        Close
      </button>
      <div className="flex flex-1 flex-col justify-center gap-5">
        <span className="label">Please take us to · この住所までお願いします</span>
        <span className="text-[34px] leading-tight font-bold text-pretty [overflow-wrap:anywhere]">{big}</span>
        {s.address_local && s.address && <span className="text-lg text-muted [overflow-wrap:anywhere]">{s.address}</span>}
        <span className="text-base font-semibold">{s.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={async () => onToast((await copyText(big)) ? "Address copied" : "Couldn't copy")} className="rounded-sm border border-line bg-bg p-3.5 text-sm font-semibold">
          Copy address
        </button>
        <a href={stayMapUrl(s)} target="_blank" rel="noopener noreferrer" className="rounded-sm bg-ink p-3.5 text-center text-sm font-semibold text-white">
          Open in Maps
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- shared to-dos

function Todos({
  tripId,
  stayId,
  todos,
  canEdit,
  onToast,
}: {
  tripId: string;
  stayId: string;
  todos: StayTodo[];
  canEdit: boolean;
  onToast: (msg: string) => void;
}) {
  const online = useOnline();
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  // Server data arrived (after a save or another member's tick): drop local guesses.
  useEffect(() => setOptimistic({}), [todos]);

  if (todos.length === 0 && !canEdit) return null;

  function toggle(t: StayTodo) {
    const done = !(optimistic[t.id] ?? t.done);
    setOptimistic((o) => ({ ...o, [t.id]: done }));
    start(async () => {
      const res = await setStayTodoDone(tripId, t.id, done).catch(() => OFFLINE);
      if (res.error) {
        setOptimistic((o) => ({ ...o, [t.id]: !done }));
        onToast(res.error);
      }
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    start(async () => {
      const res = await addStayTodo(tripId, stayId, value).catch(() => OFFLINE);
      if (res.error) onToast(res.error);
      else setText("");
    });
  }

  function remove(t: StayTodo) {
    start(async () => {
      const res = await deleteStayTodo(tripId, t.id).catch(() => OFFLINE);
      if (res.error) onToast(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {todos.length > 0 && (
        <ul className="flex flex-col">
          {todos.map((t) => {
            const done = optimistic[t.id] ?? t.done;
            return (
              <li key={t.id} className="flex items-start gap-2.5 border-b border-line py-2 last:border-b-0">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={!canEdit || !online}
                  onChange={() => toggle(t)}
                  aria-label={t.text}
                  className="mt-0.5 size-[18px] flex-none accent-ink"
                />
                <LinkedText text={t.text} className={`flex-1 text-[13px] leading-normal ${done ? "text-muted line-through" : "text-ink"}`} />
                {canEdit && (
                  <button type="button" onClick={() => remove(t)} disabled={pending || !online} aria-label="Remove to-do" className="flex-none px-1 text-muted">
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={add} className="flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder="Add a to-do (e.g. fill guest form)"
            className="min-w-0 flex-1 rounded-sm border border-line bg-surface px-2.5 py-2 text-sm outline-none focus:border-ink"
          />
          <button type="submit" disabled={pending || !online || !text.trim()} className="rounded-sm bg-ink px-3 text-sm font-semibold text-white">
            Add
          </button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- add / edit sheet

function StaySheet({
  tripId,
  tripStart,
  sheet,
  suggestedTz,
  onClose,
  onDone,
}: {
  tripId: string;
  tripStart: string | null;
  sheet: NonNullable<Sheet>;
  suggestedTz: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const s = sheet.mode === "edit" ? sheet.stay : null;
  const deviceTz = useDeviceTz();
  const [tz, setTz] = useState(s?.tz ?? suggestedTz ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const effectiveTz = tz || deviceTz;
  const [address, setAddress] = useState(s?.address ?? "");
  const [loc, setLoc] = useState<{ lat: number; lng: number; label?: string } | null>(
    s?.lat != null && s?.lng != null ? { lat: s.lat, lng: s.lng } : null,
  );
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [finding, startFind] = useTransition();

  function find() {
    setLocMsg(null);
    startFind(async () => {
      const r = await findLocation(address).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }) as { error: string });
      if ("lat" in r && r.lat != null && r.lng != null) setLoc({ lat: r.lat, lng: r.lng, label: r.label });
      else setLocMsg(r.error ?? "Couldn't find that address.");
    });
  }

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveStay(tripId, s?.id ?? null, fd).catch(() => OFFLINE);
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone(s ? "Stay saved" : "Stay added");
      }
    });
  }

  function remove() {
    if (!s) return;
    start(async () => {
      const res = await deleteStay(tripId, s.id).catch(() => OFFLINE);
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone("Stay removed");
      }
    });
  }

  return (
    <SheetForm title={s ? "Edit stay" : "Add stay"} onClose={onClose} onSubmit={submit}>
      <Field label="Name">
        <input name="name" required maxLength={120} defaultValue={s?.name ?? ""} placeholder="Asakusa townhouse" className={inputCls} />
      </Field>
      <div className="grid grid-cols-[1fr_1.3fr] gap-2.5">
        <Field label="Booked on">
          <select name="platform" defaultValue={s?.platform ?? ""} className={inputCls}>
            <option value="">—</option>
            {PLATFORMS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Host (optional)">
          <input name="host" maxLength={80} defaultValue={s?.host ?? ""} placeholder="Yurika" className={inputCls} />
        </Field>
      </div>
      <Field label="Address (optional)">
        <input
          name="address"
          maxLength={300}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="2-chōme Nishiasakusa, Taitō City"
          className={inputCls}
        />
      </Field>
      <div className="flex flex-col gap-1.5 rounded-sm border border-line bg-surface p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-muted">Map location · for prayer times & weather</span>
            <span className="truncate text-sm">
              {loc ? (loc.label ?? `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`) : "Not set"}
            </span>
          </span>
          <button
            type="button"
            onClick={find}
            disabled={finding || address.trim().length < 3}
            className="flex-none rounded-sm border border-line bg-bg px-3 py-2 text-[13px] font-semibold"
          >
            {finding ? "Finding…" : loc ? "Find again" : "Find on map"}
          </button>
        </div>
        {locMsg && <span className="text-xs text-bad">{locMsg}</span>}
        <input type="hidden" name="lat" value={loc?.lat ?? ""} />
        <input type="hidden" name="lng" value={loc?.lng ?? ""} />
      </div>
      <Field label="Address in local language (optional, shown big for drivers)">
        <input name="address_local" maxLength={300} defaultValue={s?.address_local ?? ""} placeholder="東京都江東区大島3-20-25" className={inputCls} />
      </Field>
      <Field label="Timezone of the stay">
        <TzSelect name="tz" value={effectiveTz} onChange={setTz} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Check-in (local)">
          <input
            name="check_in_local"
            type="datetime-local"
            required
            defaultValue={s ? utcToZonedInput(s.check_in, s.tz) : tripStart ? `${tripStart}T15:00` : ""}
            className={`${inputCls} font-mono text-sm`}
          />
        </Field>
        <Field label="Check-out (local)">
          <input
            name="check_out_local"
            type="datetime-local"
            required
            defaultValue={s ? utcToZonedInput(s.check_out, s.tz) : ""}
            className={`${inputCls} font-mono text-sm`}
          />
        </Field>
      </div>
      <Field label="Check-in info (optional)">
        <textarea
          name="checkin_info"
          rows={2}
          maxLength={1000}
          defaultValue={s?.checkin_info ?? ""}
          placeholder="Self check-in, key in the lockbox by the door."
          className={`${inputCls} resize-none`}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Door code (optional)">
          <input name="door_code" maxLength={40} defaultValue={s?.door_code ?? ""} autoComplete="off" className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Wi-Fi (optional)">
          <input name="wifi" maxLength={120} defaultValue={s?.wifi ?? ""} autoComplete="off" placeholder="name / password" className={`${inputCls} font-mono`} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Booking ref (optional)">
          <input name="booking_ref" maxLength={40} defaultValue={s?.booking_ref ?? ""} autoComplete="off" className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Booking link (optional)">
          <input name="booking_url" type="url" maxLength={2000} defaultValue={s?.booking_url ?? ""} placeholder="https://…" className={inputCls} />
        </Field>
      </div>
      <Field label="Google Maps link (optional, otherwise we search the address)">
        <input name="map_url" type="url" maxLength={2000} defaultValue={s?.map_url ?? ""} placeholder="https://maps.app.goo.gl/…" className={inputCls} />
      </Field>
      <Field label="Notes (optional)">
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={s?.notes ?? ""} className={`${inputCls} resize-none`} />
      </Field>
      <SheetActions pending={pending} error={error} saveLabel={s ? "Save" : "Add stay"} onDelete={s ? remove : undefined} />
    </SheetForm>
  );
}
