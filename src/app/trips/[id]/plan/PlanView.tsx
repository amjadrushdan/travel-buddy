"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { dayParts, formatDay, localTime, localToday, shortTime } from "@/lib/format";
import { LinkedText } from "@/components/LinkedText";
import { mapLink, nowIndex, type ItineraryItem } from "@/lib/itinerary";
import { weatherLabel, type DayWeather } from "@/lib/weather";
import { deleteItem, reorderDay, saveItem, setDayTitle } from "./actions";

const input = "w-full rounded-sm border border-line bg-surface p-3 text-base outline-none focus:border-ink";

type Props = {
  tripId: string;
  tripName: string;
  days: string[];
  items: ItineraryItem[];
  titles: Record<string, string>;
  weather: Record<string, DayWeather>;
  canEdit: boolean;
  requestedDay: string | null;
};

type Sheet = { mode: "new" } | { mode: "edit"; item: ItineraryItem } | null;

export function PlanView({ tripId, tripName, days, items, titles, weather, canEdit, requestedDay }: Props) {
  const [titleSheet, setTitleSheet] = useState(false);
  const [day, setDay] = useState<string | null>(requestedDay ?? days[0] ?? null);
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);
  const [reorder, setReorder] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null); // optimistic order while reordering
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
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
      <main className="flex flex-col gap-4 px-5 pt-[calc(26px+env(safe-area-inset-top))]">
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
        {sheet && <ItemSheet tripId={tripId} sheet={sheet} defaultDay={now?.date ?? ""} onClose={() => setSheet(null)} onDone={setToast} />}
        {toast && <Toast text={toast} />}
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 pt-[calc(26px+env(safe-area-inset-top))]">
      <div className="px-5">
        <Header tripName={tripName} subtitle={`${days.length} ${days.length === 1 ? "day" : "days"}`} />
      </div>

      <div ref={chipsRef} className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pb-0.5" role="tablist" aria-label="Days">
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
              return (
                <li key={it.id} className={`grid grid-cols-[48px_14px_1fr_auto] items-stretch gap-2.5 ${past ? "opacity-45" : ""}`}>
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
              );
            })}
          </ol>
        )}
      </div>

      {sheet && (
        <ItemSheet tripId={tripId} sheet={sheet} defaultDay={day ?? ""} onClose={() => setSheet(null)} onDone={setToast} />
      )}
      {titleSheet && day && (
        <DayTitleSheet tripId={tripId} day={day} current={titles[day] ?? ""} onClose={() => setTitleSheet(false)} onDone={setToast} />
      )}
      {toast && <Toast text={toast} />}
    </main>
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
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35" onClick={onClose}>
      <form
        role="dialog"
        aria-label="Name this day"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save(value);
        }}
        className="flex w-full max-w-[480px] flex-col gap-3.5 rounded-t-[22px] bg-bg px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line" />
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
      className="fixed inset-x-5 bottom-24 z-30 mx-auto max-w-[440px] rounded-sm bg-ink px-3.5 py-3 text-center text-sm font-medium text-bg"
    >
      {text}
    </div>
  );
}

function ItemSheet({
  tripId,
  sheet,
  defaultDay,
  onClose,
  onDone,
}: {
  tripId: string;
  sheet: NonNullable<Sheet>;
  defaultDay: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const item = sheet.mode === "edit" ? sheet.item : null;
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

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
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35" onClick={onClose}>
      <form
        role="dialog"
        aria-label={item ? "Edit plan item" : "Add to plan"}
        // onSubmit, not `action`: a form action resets the fields, which would wipe them on an error.
        onSubmit={(e) => {
          e.preventDefault();
          submit(new FormData(e.currentTarget));
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-3.5 overflow-y-auto rounded-t-[22px] bg-bg px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line" />
        <span className="text-xl font-bold">{item ? "Edit" : "Add to plan"}</span>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">What</span>
          <input name="title" required maxLength={120} defaultValue={item?.title} placeholder="Sensō-ji & Nakamise-dōri" className={input} autoFocus={!item} />
        </label>
        <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-muted">Day</span>
            <input name="day" type="date" required defaultValue={item?.day ?? defaultDay} className={`${input} min-w-0 font-mono`} />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-muted">Time (optional)</span>
            <input name="start_time" type="time" defaultValue={shortTime(item?.start_time ?? null)} className={`${input} min-w-0 font-mono`} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Place (optional)</span>
          <input name="place" maxLength={200} defaultValue={item?.place ?? ""} placeholder="Senso-ji, Asakusa" className={input} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted">Google Maps link (optional, otherwise we search the place)</span>
          <input name="map_url" type="url" maxLength={2000} defaultValue={item?.map_url ?? ""} placeholder="https://maps.app.goo.gl/…" className={input} />
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
