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
