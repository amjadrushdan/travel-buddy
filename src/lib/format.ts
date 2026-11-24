const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse a Postgres `date` (YYYY-MM-DD) without timezone shifts. */
function parseDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m: m - 1, day };
}

/** "12–21 Dec", "28 Dec – 3 Jan", "28 Dec 2026 – 3 Jan 2027" */
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Dates not set";
  if (!start || !end) {
    const one = parseDate((start ?? end)!);
    return `${one.day} ${MONTHS[one.m]}`;
  }
  const a = parseDate(start);
  const b = parseDate(end);
  if (a.y !== b.y) return `${a.day} ${MONTHS[a.m]} ${a.y} – ${b.day} ${MONTHS[b.m]} ${b.y}`;
  if (a.m !== b.m) return `${a.day} ${MONTHS[a.m]} – ${b.day} ${MONTHS[b.m]}`;
  if (a.day === b.day) return `${a.day} ${MONTHS[a.m]}`;
  return `${a.day}–${b.day} ${MONTHS[a.m]}`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** { dow: "Sat", d: 12, mon: "Dec" } for a YYYY-MM-DD date, with no timezone shift. */
export function dayParts(date: string) {
  const { y, m, day } = parseDate(date);
  const dow = DOW[new Date(Date.UTC(y, m, day)).getUTCDay()];
  return { dow, d: day, mon: MONTHS[m] };
}

/** "Sat 12 Dec" */
export function formatDay(date: string): string {
  const p = dayParts(date);
  return `${p.dow} ${p.d} ${p.mon}`;
}

/** Every date from start to end inclusive (YYYY-MM-DD). Capped at 60 days. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const a = parseDate(start);
  const t0 = Date.UTC(a.y, a.m, a.day);
  const b = parseDate(end);
  const t1 = Date.UTC(b.y, b.m, b.day);
  for (let t = t0; t <= t1 && out.length < 60; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Today's date on this device, as YYYY-MM-DD. Call in the browser only. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "HH:MM" on this device. Call in the browser only. */
export function localTime(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}

/** Postgres time "07:35:00" → "07:35". */
export function shortTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

/** Whole days from today (local) until `start`. Negative once started. */
export function daysUntil(start: string | null): number | null {
  if (!start) return null;
  const { y, m, day } = parseDate(start);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m, day) - today) / 86_400_000);
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Only allow same-origin relative redirects. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
