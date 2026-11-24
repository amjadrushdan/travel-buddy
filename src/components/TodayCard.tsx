"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDay, localTime, localToday, shortTime } from "@/lib/format";
import { mapLink, nowIndex, type ItineraryItem } from "@/lib/itinerary";
import { prayerTimes, type PrayerTime } from "@/lib/prayer";
import { stayForDay } from "@/lib/stay-location";
import { dateAt, timeAt } from "@/lib/time";
import { kindOf, type Booking } from "@/lib/bookings";
import type { Stay } from "@/lib/travel";

type TodayStay = Pick<Stay, "id" | "name" | "address" | "check_in" | "check_out" | "tz" | "lat" | "lng">;

/** "in 40 min", "in 2 h 5 min" */
function inTime(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

const directions = (s: TodayStay) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address?.trim() || s.name)}`;

/**
 * Home's "Today". Uses the device clock. During the trip: what's next, the next prayer,
 * where you sleep tonight and today's bookings, then the day's plan. Before the trip it
 * previews the first day; after the trip it disappears.
 */
export function TodayCard({
  tripId,
  days,
  items,
  titles,
  stays,
  bookings,
}: {
  tripId: string;
  days: string[];
  items: ItineraryItem[];
  titles: Record<string, string>;
  stays: TodayStay[];
  bookings: Booking[];
}) {
  const [now, setNow] = useState<{ date: string; time: string; ms: number } | null>(null);

  useEffect(() => {
    const tick = () => setNow({ date: localToday(), time: localTime(), ms: Date.now() });
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  if (days.length === 0) return <PlanList tripId={tripId} label="Today" day={null} title={null} items={[]} current={-1} />;
  if (!now) return <PlanList tripId={tripId} label={`First day · ${formatDay(days[0])}`} day={days[0]} title={titles[days[0]] ?? null} items={items.filter((i) => i.day === days[0])} current={-1} />;

  const during = days.includes(now.date);
  if (!during && now.date > days[days.length - 1]) return null;

  const day = during ? now.date : days[0];
  const list = items.filter((it) => it.day === day);
  if (!during) return <PlanList tripId={tripId} label={`First day · ${formatDay(day)}`} day={day} title={titles[day] ?? null} items={list} current={-1} />;

  const current = nowIndex(list, now.time);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="label">Today · {formatDay(day)}</span>
        {titles[day] && <span className="text-[22px] leading-tight font-semibold">{titles[day]}</span>}
      </div>
      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        <NextUp list={list} time={now.time} />
        <NextPrayer stays={stays} day={day} nowMs={now.ms} />
        <Tonight stays={stays} day={day} nowMs={now.ms} tripId={tripId} />
        <TodayBookings bookings={bookings} day={day} tripId={tripId} />
      </div>
      <PlanList tripId={tripId} label="Today's plan" day={day} title={null} items={list} current={current} />
    </div>
  );
}

function Section({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold tracking-[.04em] text-muted uppercase">{label}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

function NextUp({ list, time }: { list: ItineraryItem[]; time: string }) {
  const next = list.find((it) => it.start_time && it.start_time.slice(0, 5) >= time);
  if (!next) {
    return (
      <Section label="Next up">
        <span className="text-[15px] text-muted">{list.length ? "Nothing else timed today." : "Nothing planned today."}</span>
      </Section>
    );
  }
  const [h, m] = next.start_time!.slice(0, 5).split(":").map(Number);
  const [nh, nm] = time.split(":").map(Number);
  const link = mapLink(next);
  return (
    <Section label="Next up" aside={<span className="text-[13px] font-semibold">{inTime(((h - nh) * 60 + (m - nm)) * 60_000)}</span>}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[17px] leading-snug font-semibold [overflow-wrap:anywhere]">
            <span className="font-mono">{shortTime(next.start_time)}</span> · {next.title}
          </span>
          {next.place && <span className="text-[13px] text-muted [overflow-wrap:anywhere]">{next.place}</span>}
        </div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="flex-none rounded-full border border-line bg-bg px-3 py-1.5 text-[12px] font-semibold">
            📍 Maps
          </a>
        )}
      </div>
    </Section>
  );
}

function NextPrayer({ stays, day, nowMs }: { stays: TodayStay[]; day: string; nowMs: number }) {
  const s = stayForDay(stays, day);
  if (!s || s.lat == null || s.lng == null) return null;
  const today = dateAt(new Date(nowMs).toISOString(), s.tz);
  const times = prayerTimes(today, s.lat, s.lng, s.tz).filter((p) => p.name !== "Syuruk");
  let next: PrayerTime | undefined = times.find((p) => p.at > nowMs);
  if (!next) {
    const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
    next = prayerTimes(tomorrow, s.lat, s.lng, s.tz)[0];
  }
  const place = s.name.split(/[:(]/)[0].trim();
  return (
    <Section label={`Next prayer · ${place}`} aside={<span className="text-[13px] font-semibold">{inTime(next.at - nowMs)}</span>}>
      <span className="text-[17px] font-semibold">
        {next.name} <span className="font-mono">{next.time}</span>
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
        {times.map((p) => (
          <span key={p.name} className={p.at <= nowMs ? "text-muted line-through decoration-line" : p.name === next!.name ? "font-semibold" : "text-muted"}>
            {p.name} <span className="font-mono">{p.time}</span>
          </span>
        ))}
      </div>
    </Section>
  );
}

function Tonight({ stays, day, nowMs, tripId }: { stays: TodayStay[]; day: string; nowMs: number; tripId: string }) {
  const tonight = stays.find((s) => dateAt(s.check_in, s.tz) <= day && day < dateAt(s.check_out, s.tz));
  const leaving = stays.find((s) => s !== tonight && dateAt(s.check_out, s.tz) === day && Date.parse(s.check_out) > nowMs);
  if (!tonight && !leaving) return null;
  return (
    <Section label="Tonight" aside={<Link href={`/trips/${tripId}/stay`} className="text-[13px] font-semibold">Stay ›</Link>}>
      {leaving && (
        <span className="text-[13px] text-muted">
          Check-out {timeAt(leaving.check_out, leaving.tz)} · {leaving.name}
        </span>
      )}
      {tonight && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[17px] leading-snug font-semibold [overflow-wrap:anywhere]">{tonight.name}</span>
            {dateAt(tonight.check_in, tonight.tz) === day && (
              <span className="text-[13px] text-muted">Check-in from {timeAt(tonight.check_in, tonight.tz)}</span>
            )}
          </div>
          <a href={directions(tonight)} target="_blank" rel="noopener noreferrer" className="flex-none rounded-full border border-line bg-bg px-3 py-1.5 text-[12px] font-semibold">
            Directions
          </a>
        </div>
      )}
    </Section>
  );
}

function TodayBookings({ bookings, day, tripId }: { bookings: Booking[]; day: string; tripId: string }) {
  const rows = bookings.flatMap((b) => {
    const out: { key: string; time: string; text: string }[] = [];
    if (dateAt(b.starts_at, b.tz) === day) out.push({ key: b.id + "s", time: timeAt(b.starts_at, b.tz), text: `${kindOf(b.kind).icon} ${b.title}` });
    if (b.ends_at && dateAt(b.ends_at, b.tz) === day && b.kind === "car") out.push({ key: b.id + "e", time: timeAt(b.ends_at, b.tz), text: `🚗 Return · ${b.title}` });
    return out;
  });
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.time.localeCompare(b.time));
  return (
    <Section label="Bookings today" aside={<Link href={`/trips/${tripId}/bookings`} className="text-[13px] font-semibold">All ›</Link>}>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key} className="flex gap-3 text-[15px]">
            <span className="w-11 flex-none font-mono text-sm tabular-nums">{r.time}</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{r.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PlanList({
  tripId,
  label,
  day,
  title,
  items,
  current,
}: {
  tripId: string;
  label: string;
  day: string | null;
  title: string | null;
  items: ItineraryItem[];
  current: number;
}) {
  const href = `/trips/${tripId}/plan${day ? `?day=${day}` : ""}`;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label min-w-0 truncate">
          {label}
          {title ? ` · ${title}` : ""}
        </span>
        <Link href={href} className="flex-none text-[13px] font-semibold">
          Full plan ›
        </Link>
      </div>
      {items.length === 0 ? (
        <Link href={href} className="rounded-card border-[1.5px] border-dashed border-line p-4 text-center text-sm text-muted">
          Nothing planned yet.
        </Link>
      ) : (
        <ol className="overflow-hidden rounded-card border border-line bg-surface">
          {items.map((it, k) => {
            const done = current !== -1 && k < current;
            return (
              <li key={it.id} className={`flex items-center gap-3.5 px-4 py-[13px] ${k ? "border-t border-line" : ""} ${done ? "opacity-45" : ""}`}>
                <span className="w-11 flex-none font-mono text-sm tabular-nums">{shortTime(it.start_time) || "—"}</span>
                <span className={`min-w-0 flex-1 text-[15px] [overflow-wrap:anywhere] ${done ? "line-through" : ""}`}>{it.title}</span>
                {k === current && (
                  <span className="rounded-sm bg-ink px-1.5 py-[3px] font-mono text-[10px] font-semibold tracking-[.06em] text-white">NOW</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
