"use client";

import { useEffect, useState } from "react";
import { daysUntil } from "@/lib/format";

// The trip's "Next trip / Departure day / On the trip" label and "N days to go" use the phone's
// own date (the server runs in UTC, which is a day behind Asia for part of the day).

function useDays(start: string | null, serverDays: number | null) {
  const [days, setDays] = useState(serverDays);
  useEffect(() => {
    const update = () => setDays(daysUntil(start));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [start]);
  return days;
}

function kickerFor(days: number | null, end: string | null) {
  if (days === 0) return "Departure day";
  if (days !== null && days < 0) {
    const toEnd = daysUntil(end);
    return toEnd !== null && toEnd < 0 ? "Trip done" : "On the trip";
  }
  return "Next trip";
}

export function TripKicker({ start, end, serverDays, className }: { start: string | null; end: string | null; serverDays: number | null; className?: string }) {
  const days = useDays(start, serverDays);
  return <span className={className}>{kickerFor(days, end)}</span>;
}

/** Yellow "18 days to go" chip on the cover photo. */
export function DaysChip({ start, serverDays }: { start: string | null; serverDays: number | null }) {
  const days = useDays(start, serverDays);
  if (days === null || days <= 0) return null;
  return (
    <span className="rounded-sm bg-warn px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink [text-shadow:none]">
      {days} {days === 1 ? "day" : "days"} to go
    </span>
  );
}

/** Big "18 days to go" on the plain Home. */
export function BigCountdown({ start, serverDays }: { start: string | null; serverDays: number | null }) {
  const days = useDays(start, serverDays);
  if (days === null || days <= 0) return null;
  return (
    <div className="flex items-baseline gap-2.5 border-b border-line pb-1">
      <span className="font-mono text-[64px] leading-none font-medium tracking-[-0.04em]">{days}</span>
      <span className="text-[15px] text-muted">{days === 1 ? "day to go" : "days to go"}</span>
    </div>
  );
}
