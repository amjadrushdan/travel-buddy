"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { dayParts, formatDay, localTime, localToday, shortTime } from "@/lib/format";
import { LinkedText } from "@/components/LinkedText";
import { EscClose } from "@/components/ui";
import { mapLink, nowIndex, type ItineraryItem } from "@/lib/itinerary";
import { weatherLabel, type DayWeather } from "@/lib/weather";
import { needsWork, samePlace } from "@/lib/routes/leg";
import { stayForDay } from "@/lib/stay-location";
import type { SavedLeg } from "@/lib/routes/types";
import { addRoutes, deleteItem, reorderDay, saveItem, setDayTitle } from "./actions";
import { LegRow, RouteSheet } from "./LegRow";

const input = "w-full rounded-sm border border-line bg-surface p-3 text-base outline-none focus:border-ink";

type Props = {
  tripId: string;
  tripName: string;
  days: string[];
  items: ItineraryItem[];
  titles: Record<string, string>;
  weather: Record<string, DayWeather>;
  legs: SavedLeg[];
  /** For the place picker in Add/Edit. */
  stays: PickStay[];
  /** Editor, and the server has route keys. */
  canRoute: boolean;
  canEdit: boolean;
  requestedDay: string | null;
};

type Sheet = { mode: "new" } | { mode: "edit"; item: ItineraryItem } | null;
type PickStay = { id: string; name: string; address: string | null; map_url: string | null; check_in: string; check_out: string; tz: string; lat: number | null; lng: number | null };

export function PlanView({ tripId, tripName, days, items, titles, weather, legs, stays, canRoute, canEdit, requestedDay }: Props) {
  const [titleSheet, setTitleSheet] = useState(false);
  const [day, setDay] = useState<string | null>(requestedDay ?? days[0] ?? null);
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);
  const [reorder, setReorder] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null); // optimistic order while reordering
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [routing, startRouting] = useTransition();
  const legFor = useMemo(() => new Map(legs.map((l) => [l.to_item, l])), [legs]);
  const [routeSheet, setRouteSheet] = useState<string | null>(null); // to_item of the open leg
  const [addSheet, setAddSheet] = useState(false);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Device clock, read after mount so server and browser render the same HTML first.
  useEffect(() => {
    const tick = () => setNow({ date: localToday(), time: localTime() });
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  // With no ?day=, open on today when the trip is under way.
  useEffect(() => {
    if (requestedDay || !now) return;
    if (days.includes(now.date)) setDay(now.date);
    // Only on first clock read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now === null]);

  // Keep the active chip in view and the URL shareable.
  useEffect(() => {
    if (!day) return;
    chipsRef.current?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
    const url = new URL(window.location.href);
    url.searchParams.set("day", day);
    window.history.replaceState(null, "", url);
  }, [day]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const dayItems = useMemo(() => {
    const list = items.filter((it) => it.day === day);
    if (!order) return list;
    const byId = new Map(list.map((it) => [it.id, it]));
    const ordered = order.map((id) => byId.get(id)).filter((x): x is ItineraryItem => !!x);
    return ordered.length === list.length ? ordered : list;
  }, [items, day, order]);

  // Server data changed (after a save): drop the optimistic order.
  useEffect(() => setOrder(null), [items]);

  const isToday = !!now && now.date === day;
  const current = isToday ? nowIndex(dayItems, now!.time) : -1;
  const dayNo = day ? days.indexOf(day) + 1 : 0;
  // Stops on this day that still need a route (the Add routes button only shows then).
  const missingRoutes = dayItems.filter((b, k) => {
    const a = dayItems[k - 1];
    return a?.place && b.place && !samePlace(a.place, b.place) && needsWork(legFor.get(b.id), a, b);
  }).length;

  function routes(by: "auto" | "car") {
    if (!day) return;
    const d = day;
    setAddSheet(false);
    startRouting(async () => {
      const res = await addRoutes(tripId, d, by).catch(() => ({ error: "Couldn't add routes. Are you offline?" }) as const);
      if ("error" in res && res.error) return setToast(res.error);
      if ("upToDate" in res && res.upToDate) return setToast("Routes are up to date");
      const n = "done" in res ? (res.done ?? 0) : 0;
      if ("capped" in res && res.capped) return setToast(n ? `Added ${n} routes. Daily limit reached, try tomorrow.` : "Daily route limit reached. Try tomorrow.");
      if ("more" in res && res.more) return setToast(`Added ${n} routes. Tap Routes again for the rest.`);
      setToast(n === 1 ? "Added 1 route" : `Added ${n} routes`);
    });
  }

  function pickDay(d: string) {
    setDay(d);
    setOrder(null);
  }

  function move(k: number, dir: -1 | 1) {
    const ids = dayItems.map((it) => it.id);
    const j = k + dir;
    if (j < 0 || j >= ids.length || !day) return;
    [ids[k], ids[j]] = [ids[j], ids[k]];
    setOrder(ids);
    const d = day;
    start(async () => {
      const res = await reorderDay(tripId, d, ids).catch(() => ({ error: "Couldn't save. Are you offline?" }));
      if (res.error) {
        setOrder(null);
        setToast(res.error);
      }
    });
  }

  if (days.length === 0) {
    return (
      <main className="flex flex-col gap-4 px-5 pt-[calc(26px+env(safe-area-inset-top))] lg:pt-0">
        <Header tripName={tripName} subtitle="No dates yet" />
        <div className="rounded-card border-[1.5px] border-dashed border-line p-5 text-center text-sm text-muted">
          Nothing planned yet.
          {canEdit && " Add the first item and pick its day."}
        </div>
        {canEdit && (
          <button type="button" onClick={() => setSheet({ mode: "new" })} className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white">
            Add to plan
          </button>
        )}
        {sheet && <ItemSheet tripId={tripId} stays={stays} sheet={sheet} defaultDay={now?.date ?? ""} onClose={() => setSheet(null)} onDone={setToast} />}
        {toast && <Toast text={toast} />}
      </main>
    );
  }

  return (
    // Desktop: day list on the left, the chosen day on the right. Phone: day chips above the day.
    <main data-two-col className="flex flex-col gap-4 pt-[calc(26px+env(safe-area-inset-top))] lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-x-4 lg:gap-y-6 lg:pt-0">
      <div className="px-5 lg:col-span-2">
        <Header tripName={tripName} subtitle={`${days.length} ${days.length === 1 ? "day" : "days"}`} />
      </div>

      <div ref={chipsRef} className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-0.5 lg:hidden" role="tablist" aria-label="Days">
        {days.map((d) => {
          const p = dayParts(d);
          const active = d === day;
          const count = items.filter((it) => it.day === d).length;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              data-day={d}
              aria-selected={active}
              aria-label={`${formatDay(d)}, ${count} ${count === 1 ? "item" : "items"}`}
              onClick={() => pickDay(d)}
              className={`flex w-12 flex-none flex-col items-center gap-0.5 rounded-sm border py-2 ${
                active ? "border-ink bg-ink text-white" : "border-line bg-surface"
              }`}
            >
              <span className="text-[11px] opacity-75">{now?.date === d ? "Today" : p.dow}</span>
              <span className="font-mono text-lg font-semibold">{p.d}</span>
            </button>
          );
        })}
      </div>

      <nav aria-label="Days" className="sticky top-6 hidden max-h-[calc(100dvh-48px)] flex-col gap-0.5 overflow-y-auto px-5 lg:flex">
        {days.map((d, i) => {
          const active = d === day;
          const count = items.filter((it) => it.day === d).length;
          const w = weather[d];
          return (
            <button
              key={d}
              type="button"
              aria-current={active ? "date" : undefined}
              onClick={() => pickDay(d)}
              className={`flex items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors ${active ? "bg-ink/[.07]" : "hover:bg-ink/[.04]"}`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-[12px] ${now?.date === d ? "font-semibold text-now-ink" : "text-muted"}`}>
                  Day {i + 1} · {now?.date === d ? "Today" : formatDay(d)}
                </span>
                <span className={`truncate text-[14px] ${active ? "font-semibold" : "font-medium"} ${titles[d] ? "" : "text-muted"}`}>
                  {titles[d] ?? (count ? `${count} ${count === 1 ? "stop" : "stops"}` : "Nothing planned")}
                </span>
              </span>
              {w && (
                <span className="flex-none text-[12px] text-muted tabular-nums" title={weatherLabel(w.code).label}>
                  <span aria-hidden>{weatherLabel(w.code).icon}</span> {w.tMax}°
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-2 lg:max-w-[680px]">
      {day && (
        <div className="flex items-end justify-between gap-2.5 px-5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted">
              Day {dayNo} · {formatDay(day)}
              {titles[day] ? ` · ${dayItems.length} ${dayItems.length === 1 ? "stop" : "stops"}` : ""}
            </span>
            {canEdit ? (
              <button type="button" onClick={() => setTitleSheet(true)} className="group flex items-baseline gap-1.5 text-left">
                <span className={`text-[20px] leading-tight font-semibold text-pretty ${titles[day] ? "" : "text-ink"}`}>
                  {titles[day] ?? `${dayItems.length} ${dayItems.length === 1 ? "stop" : "stops"}`}
                </span>
                <span className="text-[13px] text-muted">{titles[day] ? "✎" : "· name this day"}</span>
              </button>
            ) : (
              <span className="text-[20px] leading-tight font-semibold text-pretty">
                {titles[day] ?? `${dayItems.length} ${dayItems.length === 1 ? "stop" : "stops"}`}
              </span>
            )}
            {weather[day] && <WeatherLine w={weather[day]} />}
            {canRoute && !reorder && (missingRoutes > 0 || routing) && (
              <button
                type="button"
                onClick={() => setAddSheet(true)}
                disabled={routing}
                aria-busy={routing}
                className="mt-0.5 self-start text-[13px] font-semibold text-ink underline decoration-line underline-offset-2 disabled:text-muted"
              >
                {routing ? "Adding routes…" : `Add routes for ${missingRoutes} ${missingRoutes === 1 ? "stop" : "stops"}`}
              </button>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-none gap-1.5">
              {dayItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => setReorder((r) => !r)}
                  aria-pressed={reorder}
                  className={`rounded-sm border px-3 py-[7px] text-[13px] font-semibold ${
                    reorder ? "border-ink bg-ink text-white" : "border-line bg-surface"
                  }`}
                >
                  {reorder ? "Done" : "Reorder"}
                </button>
              )}
              {!reorder && (
                <button
                  type="button"
                  onClick={() => setSheet({ mode: "new" })}
                  className="rounded-sm border border-ink bg-ink px-3 py-[7px] text-[13px] font-semibold text-white"
                >
                  + Add
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-5">
        {dayItems.length === 0 ? (
          <div className="rounded-card border-[1.5px] border-dashed border-line px-4 py-7 text-center text-sm text-muted">
            Nothing planned yet.
          </div>
        ) : (
          <ol>
            {dayItems.map((it, k) => {
              const isNow = k === current;
              const past = isToday && current !== -1 && k < current;
              const link = mapLink(it);
              const time = shortTime(it.start_time);
              const prev = dayItems[k - 1];
              const leg = legFor.get(it.id);
              const showLeg =
                !reorder && prev && leg && leg.from_item === prev.id && leg.from_place === prev.place && leg.to_place === it.place;
              const arrive = it.start_time ? it.start_time.slice(0, 5) : null;
              return (
                <Fragment key={it.id}>
                {showLeg && <LegRow leg={leg} arrive={arrive} dim={past} canEdit={canRoute} onOpen={() => setRouteSheet(it.id)} />}
                <li className={`grid grid-cols-[48px_14px_1fr_auto] items-stretch gap-2.5 ${past ? "opacity-45" : ""}`}>
                  <span
                    className={`pt-[13px] font-mono text-sm tabular-nums ${isNow ? "font-semibold text-now-ink" : ""} ${time ? "" : "text-muted"}`}
                  >
                    {time || "—"}
                  </span>
                  <div className="flex flex-col items-center" aria-hidden>
                    <span className={`h-3.5 w-px ${k ? "bg-line" : "bg-transparent"}`} />
                    <span
                      className={`flex-none rounded-full ${isNow ? "size-[13px] bg-now shadow-[0_0_0_4px_rgba(229,50,45,.18)]" : "size-[9px] bg-ink"}`}
                    />
                    <span className={`w-px flex-1 ${k < dayItems.length - 1 ? "bg-line" : "bg-transparent"}`} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-[3px] pt-2.5 pb-4">
                    <span className="flex flex-wrap items-center gap-2">
                      {canEdit && !reorder ? (
                        <button
                          type="button"
                          onClick={() => setSheet({ mode: "edit", item: it })}
                          className="text-left text-[15px] font-medium text-pretty [overflow-wrap:anywhere]"
                        >
                          {it.title}
                        </button>
                      ) : (
                        <span className="text-[15px] font-medium text-pretty [overflow-wrap:anywhere]">{it.title}</span>
                      )}
                      {isNow && (
                        <span className="rounded-sm bg-now px-1.5 py-[3px] font-mono text-[10px] font-semibold tracking-[.06em] text-white">
                          NOW · {now!.time}
                        </span>
                      )}
                    </span>
                    {(it.place || link) && (
                      <div className="mt-0.5 flex items-center gap-2">
                        {it.place && <span className="min-w-0 flex-1 text-[13px] text-muted [overflow-wrap:anywhere]">{it.place}</span>}
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${it.place || it.title} in Google Maps`}
                            className="flex flex-none items-center gap-1 rounded-full border border-line bg-surface py-1 pr-2.5 pl-1.5 text-[12px] font-semibold text-ink active:bg-bg"
                          >
                            <MapPinIcon />
                            Maps
                          </a>
                        )}
                      </div>
                    )}
                    {it.notes && <LinkedText text={it.notes} className="text-[13px] text-muted" />}
                  </div>
                  {reorder ? (
                    <div className="flex flex-col gap-1 pt-2">
                      <button
                        type="button"
                        aria-label={`Move ${it.title} up`}
                        disabled={k === 0 || pending}
                        onClick={() => move(k, -1)}
                        className="h-[26px] w-[34px] rounded-sm border border-line bg-surface"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${it.title} down`}
                        disabled={k === dayItems.length - 1 || pending}
                        onClick={() => move(k, 1)}
                        className="h-[26px] w-[34px] rounded-sm border border-line bg-surface"
                      >
                        ↓
                      </button>
                    </div>
                  ) : (
                    <span />
                  )}
                </li>
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>
      </div>

      {sheet && (
        <ItemSheet tripId={tripId} stays={stays} sheet={sheet} defaultDay={day ?? ""} onClose={() => setSheet(null)} onDone={setToast} />
      )}
      {titleSheet && day && (
        <DayTitleSheet tripId={tripId} day={day} current={titles[day] ?? ""} onClose={() => setTitleSheet(false)} onDone={setToast} />
      )}
      {addSheet && day && <AddRoutesSheet count={missingRoutes} onPick={routes} onClose={() => setAddSheet(false)} />}
      {routeSheet &&
        (() => {
          const leg = legFor.get(routeSheet);
          const to = items.find((x) => x.id === routeSheet);
          const from = leg && items.find((x) => x.id === leg.from_item);
          if (!leg || !to || !from) return null;
          return (
            <RouteSheet
              tripId={tripId}
              leg={leg}
              fromTitle={from.title}
              toTitle={to.title}
              arrive={to.start_time ? to.start_time.slice(0, 5) : null}
              onClose={() => setRouteSheet(null)}
              onDone={setToast}
            />
          );
        })()}
      {toast && <Toast text={toast} />}
    </main>
  );
}

/** How the group gets around this day, before any route is looked up. */
function AddRoutesSheet({ count, onPick, onClose }: { count: number; onPick: (by: "auto" | "car") => void; onClose: () => void }) {
  const option = (by: "auto" | "car", title: string, sub: string) => (
    <button
      type="button"
      onClick={() => onPick(by)}
      className="flex flex-col gap-0.5 rounded-[12px] border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:bg-ink/[.03]"
    >
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-[13px] text-muted">{sub}</span>
    </button>
  );
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35 lg:items-center lg:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Add routes"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[480px] flex-col gap-2.5 rounded-t-[22px] bg-bg px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))] lg:max-w-[520px] lg:rounded-[22px] lg:pb-6 lg:shadow-[0_24px_60px_rgba(0,0,0,.25)]"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line lg:hidden" />
        <EscClose onClose={onClose} />
        <span className="text-xl font-bold">How are you getting around?</span>
        <span className="-mt-1.5 mb-1 text-sm text-muted">
          {count} {count === 1 ? "stop needs" : "stops need"} a route. You can change any of them later.
        </span>
        {option("auto", "Walk and train", "Walks between nearby stops, trains when it's far")}
        {option("car", "By car", "Rental car or taxi: driving times only")}
      </div>
    </div>
  );
}

/** "☁️ Cloudy · 4° / 11° · rain 20%" (snow amount when it snows). */
function WeatherLine({ w }: { w: DayWeather }) {
  const { icon, label } = weatherLabel(w.code);
  const extra =
    w.snowCm && w.snowCm >= 0.5 ? `snow ${Math.round(w.snowCm)} cm` : w.rain != null && w.rain >= 20 ? `rain ${w.rain}%` : null;
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-muted">
      <span aria-hidden>{icon}</span>
      <span>
        {label} · {w.tMin}° / {w.tMax}°{extra ? ` · ${extra}` : ""}
      </span>
    </span>
  );
}

function DayTitleSheet({
  tripId,
  day,
  current,
  onClose,
  onDone,
}: {
  tripId: string;
  day: string;
  current: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(title: string) {
    setError(null);
    start(async () => {
      const res = await setDayTitle(tripId, day, title).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone(title.trim() ? "Day named" : "Title removed");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35 lg:items-center lg:p-6" onClick={onClose}>
      <form
        role="dialog"
        aria-label="Name this day"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save(value);
        }}
        className="flex w-full max-w-[480px] flex-col gap-3.5 rounded-t-[22px] bg-bg lg:max-h-[88dvh] lg:max-w-[520px] lg:overflow-y-auto lg:rounded-[22px] lg:pb-6 lg:shadow-[0_24px_60px_rgba(0,0,0,.25)] px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto h-1 w-10 lg:hidden rounded-full bg-line" />
        <EscClose onClose={onClose} />
        <span className="text-xl font-bold">Name this day</span>
        <span className="-mt-2 text-sm text-muted">{formatDay(day)}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          autoFocus
          placeholder="Harajuku & Shibuya"
          className={input}
        />
        {error && (
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="rounded-sm bg-ink p-[15px] text-base font-semibold text-white">
          {pending ? "Saving…" : "Save"}
        </button>
        {current && (
          <button type="button" disabled={pending} onClick={() => save("")} className="rounded-sm border border-line bg-surface p-3 text-sm font-semibold text-muted">
            Remove title
          </button>
        )}
      </form>
    </div>
  );
}

function Header({ tripName, subtitle }: { tripName: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">
        {tripName} · {subtitle}
      </span>
      <h1 className="page-title">Plan</h1>
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="fixed inset-x-5 bottom-24 z-30 mx-auto max-w-[440px] lg:bottom-8 lg:left-[276px] rounded-sm bg-ink px-3.5 py-3 text-center text-sm font-medium text-bg"
    >
      {text}
    </div>
  );
}

function ItemSheet({
  tripId,
  stays,
  sheet,
  defaultDay,
  onClose,
  onDone,
}: {
  tripId: string;
  stays: PickStay[];
  sheet: NonNullable<Sheet>;
  defaultDay: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const item = sheet.mode === "edit" ? sheet.item : null;
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const placeRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLInputElement>(null);
  const [pickDay, setPickDay] = useState(item?.day ?? defaultDay);
  // The night's stay first, then the rest in date order.
  const stayList = useMemo(() => {
    const tonight = stayForDay(stays, pickDay);
    return tonight ? [tonight, ...stays.filter((s) => s.id !== tonight.id)] : stays;
  }, [stays, pickDay]);

  function pickStay(s: PickStay) {
    if (placeRef.current) placeRef.current.value = s.address || s.name;
    if (mapRef.current && s.map_url) mapRef.current.value = s.map_url;
  }

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await saveItem(tripId, item?.id ?? null, formData).catch(() => ({ error: "Couldn't save. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone(item ? "Saved" : "Added to plan");
      }
    });
  }

  function remove() {
    if (!item) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    start(async () => {
      const res = await deleteItem(tripId, item.id).catch(() => ({ error: "Couldn't delete. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone("Removed from plan");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35 lg:items-center lg:p-6" onClick={onClose}>
      <form
        role="dialog"
        aria-label={item ? "Edit plan item" : "Add to plan"}
        // onSubmit, not `action`: a form action resets the fields, which would wipe them on an error.
        onSubmit={(e) => {
          e.preventDefault();
          submit(new FormData(e.currentTarget));
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-3.5 overflow-y-auto rounded-t-[22px] bg-bg lg:max-h-[88dvh] lg:max-w-[520px] lg:overflow-y-auto lg:rounded-[22px] lg:pb-6 lg:shadow-[0_24px_60px_rgba(0,0,0,.25)] px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto h-1 w-10 lg:hidden rounded-full bg-line" />
        <EscClose onClose={onClose} />
        <span className="text-xl font-bold">{item ? "Edit" : "Add to plan"}</span>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">What</span>
          <input name="title" required maxLength={120} defaultValue={item?.title} placeholder="Sensō-ji & Nakamise-dōri" className={input} autoFocus={!item} />
        </label>
        <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-muted">Day</span>
            <input
              name="day"
              type="date"
              required
              defaultValue={item?.day ?? defaultDay}
              onChange={(e) => setPickDay(e.target.value)}
              className={`${input} min-w-0 font-mono`}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-muted">Time (optional)</span>
            <input name="start_time" type="time" defaultValue={shortTime(item?.start_time ?? null)} className={`${input} min-w-0 font-mono`} />
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">Place (optional)</span>
            <input ref={placeRef} name="place" maxLength={200} defaultValue={item?.place ?? ""} placeholder="Senso-ji, Asakusa" className={input} />
          </label>
          {stayList.length > 0 && (
            <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5" aria-label="Use a stay as the place">
              {stayList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickStay(s)}
                  className="flex flex-none items-center gap-1 rounded-full border border-line bg-surface py-1.5 pr-3 pl-2 text-[12px] font-semibold"
                >
                  <span aria-hidden>🏠</span>
                  <span className="max-w-[180px] truncate">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Google Maps link (optional, otherwise we search the place)</span>
          <input ref={mapRef} name="map_url" type="url" maxLength={2000} defaultValue={item?.map_url ?? ""} placeholder="https://maps.app.goo.gl/…" className={input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Notes (optional)</span>
          <textarea name="notes" rows={3} maxLength={2000} defaultValue={item?.notes ?? ""} className={`${input} resize-none`} />
        </label>

        {error && (
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="rounded-sm bg-ink p-[15px] text-base font-semibold text-white">
          {pending ? "Saving…" : item ? "Save" : "Add to plan"}
        </button>
        {item && (
          <button type="button" disabled={pending} onClick={remove} className="rounded-sm border border-line bg-surface p-3 text-sm font-semibold text-bad">
            {confirmDelete ? "Tap again to delete" : "Delete"}
          </button>
        )}
      </form>
    </div>
  );
}

/** Red map pin for the "Maps" button. */
function MapPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7Z" fill="#E5322D" />
      <circle cx="12" cy="9.5" r="2.6" fill="#fff" />
    </svg>
  );
}
