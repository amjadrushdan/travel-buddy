"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDay, localTime, localToday, shortTime } from "@/lib/format";
import { nowIndex, type ItineraryItem } from "@/lib/itinerary";

/**
 * Home's "Today" list. Uses the device clock (the trip's own timezone isn't stored yet):
 * during the trip it shows today; before it, the first day; after it, nothing.
 */
export function TodayCard({ tripId, days, items }: { tripId: string; days: string[]; items: ItineraryItem[] }) {
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    const tick = () => setNow({ date: localToday(), time: localTime() });
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  if (days.length === 0) return <Shell tripId={tripId} label="Today" day={null} items={[]} current={-1} />;

  const during = !!now && days.includes(now.date);
  const after = !!now && now.date > days[days.length - 1];
  if (after) return null;

  const day = during ? now!.date : days[0];
  const list = items.filter((it) => it.day === day);
  const label = during ? `Today · ${formatDay(day)}` : `First day · ${formatDay(day)}`;
  const current = during ? nowIndex(list, now!.time) : -1;

  return <Shell tripId={tripId} label={label} day={day} items={list} current={current} />;
}

function Shell({
  tripId,
  label,
  day,
  items,
  current,
}: {
  tripId: string;
  label: string;
  day: string | null;
  items: ItineraryItem[];
  current: number;
}) {
  const href = `/trips/${tripId}/plan${day ? `?day=${day}` : ""}`;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <Link href={href} className="text-[13px] font-semibold">
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
              <li
                key={it.id}
                className={`flex items-center gap-3.5 px-3.5 py-[13px] ${k ? "border-t border-line" : ""} ${done ? "opacity-45" : ""}`}
              >
                <span className="w-11 flex-none font-mono text-sm tabular-nums">{shortTime(it.start_time) || "—"}</span>
                <span className={`flex-1 text-[15px] ${done ? "line-through" : ""}`}>{it.title}</span>
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
