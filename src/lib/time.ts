// Timezone helpers. Moments are stored as UTC plus an IANA zone; these convert
// between that and the wall-clock time at the place. Same output on server and browser.

const FMT_CACHE = new Map<string, Intl.DateTimeFormat>();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(tz: string) {
  let f = FMT_CACHE.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FMT_CACHE.set(tz, f);
  }
  return f;
}

function wall(date: Date, tz: string) {
  // Numbers only from Intl; names come from our own tables so every runtime agrees
  // (newer ICU writes "Sept" for en-GB, which would break hydration and lookups).
  const p = Object.fromEntries(parts(tz).formatToParts(date).map((x) => [x.type, x.value]));
  const year = Number(p.year);
  const month = Number(p.month);
  const day = Number(p.day);
  return {
    weekday: DOW[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
    year,
    monthName: MONTHS[month - 1],
    month,
    day,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

export function isTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at instant `utcMs`, in ms (e.g. +9h for Tokyo). */
function offsetMs(utcMs: number, tz: string): number {
  const w = wall(new Date(utcMs), tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock "YYYY-MM-DDTHH:MM" at `tz` → the exact instant. Handles DST shifts. */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("bad local time");
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(first, tz);
  return new Date(second);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Instant → "YYYY-MM-DDTHH:MM" wall clock at `tz` (for datetime-local inputs). */
export function utcToZonedInput(iso: string, tz: string): string {
  const w = wall(new Date(iso), tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** "23:30" at `tz`. */
export function timeAt(iso: string, tz: string): string {
  const w = wall(new Date(iso), tz);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** "Sat 12 Dec" at `tz`. */
export function dayAt(iso: string, tz: string): string {
  const w = wall(new Date(iso), tz);
  return `${w.weekday} ${w.day} ${w.monthName}`;
}

/** "12 Dec" at `tz`. */
export function shortDayAt(iso: string, tz: string): string {
  const w = wall(new Date(iso), tz);
  return `${w.day} ${w.monthName}`;
}

/** "YYYY-MM-DD" at `tz`. */
export function dateAt(iso: string, tz: string): string {
  const w = wall(new Date(iso), tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

const ABBR: Record<string, string> = {
  "Asia/Kuala_Lumpur": "MYT",
  "Asia/Kuching": "MYT",
  "Asia/Tokyo": "JST",
  "Asia/Singapore": "SGT",
  "Asia/Bangkok": "ICT",
  "Asia/Ho_Chi_Minh": "ICT",
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Seoul": "KST",
  "Asia/Hong_Kong": "HKT",
  "Asia/Manila": "PHT",
  "Asia/Kolkata": "IST",
  "Asia/Dubai": "GST",
  "Asia/Riyadh": "AST",
  "Asia/Qatar": "AST",
  "Australia/Perth": "AWST",
};

/** Short zone label: "MYT", "JST", else the browser's own ("GMT", "BST", "GMT+3"). */
export function tzLabel(tz: string, iso?: string): string {
  if (ABBR[tz]) return ABBR[tz];
  try {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(iso ? new Date(iso) : new Date())
      .find((x) => x.type === "timeZoneName");
    return p?.value ?? tz;
  } catch {
    return tz;
  }
}

/** "7h 05m" */
export function duration(fromIso: string, toIso: string): string {
  const mins = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
}

/** Whole nights between two local dates at `tz`. */
export function nights(inIso: string, outIso: string, tz: string): number {
  const a = dateAt(inIso, tz).split("-").map(Number);
  const b = dateAt(outIso, tz).split("-").map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/** Every IANA zone this runtime knows, for pickers. */
export function allTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return Object.keys(ABBR);
  }
}
