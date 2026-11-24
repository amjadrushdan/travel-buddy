// Prayer times, JAKIM method: Subuh and Isyak at 18°, Asar Syafie (shadow + 1), with JAKIM's
// ihtiyat. Calibrated against the official Federal Territory table (KL, 1 Jan 2024): all six
// times match to the minute. Pure functions, used in the browser for the Today screen.
import { tzOffsetHours, zonedToUtc } from "@/lib/time";

const d2r = (d: number) => (d * Math.PI) / 180;
const r2d = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => a - b * Math.floor(a / b);

const FAJR_ANGLE = 18;
const ISHA_ANGLE = 18;
// minutes added (removed for Syuruk) as JAKIM's safety margin
const IHTIYAT = { subuh: 2, syuruk: -1, zuhur: 2, asar: 1, maghrib: 1, isyak: 1 };

function sunPos(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(d2r(g)) + 0.02 * Math.sin(d2r(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = r2d(Math.atan2(Math.cos(d2r(e)) * Math.sin(d2r(L)), Math.cos(d2r(L)))) / 15;
  return { decl: r2d(Math.asin(Math.sin(d2r(e)) * Math.sin(d2r(L)))), eqt: q / 15 - fix(RA, 24) };
}

function julian(y: number, m: number, d: number) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

export const PRAYERS = ["Subuh", "Syuruk", "Zuhur", "Asar", "Maghrib", "Isyak"] as const;
export type PrayerName = (typeof PRAYERS)[number];
export type PrayerTime = { name: PrayerName; time: string; at: number };

/** The day's prayer times at a place: local "HH:MM" plus the exact instant. */
export function prayerTimes(date: string, lat: number, lng: number, tz: string): PrayerTime[] {
  const [y, m, d] = date.split("-").map(Number);
  const offset = tzOffsetHours(tz, date);
  const jd = julian(y, m, d) - lng / (15 * 24);
  const mid = (t: number) => fix(12 - sunPos(jd + t).eqt, 24);
  const angle = (ang: number, t: number, ccw = false) => {
    const { decl } = sunPos(jd + t);
    const T = r2d(Math.acos((-Math.sin(d2r(ang)) - Math.sin(d2r(decl)) * Math.sin(d2r(lat))) / (Math.cos(d2r(decl)) * Math.cos(d2r(lat))))) / 15;
    return mid(t) + (ccw ? -T : T);
  };
  const asr = (t: number) => {
    const { decl } = sunPos(jd + t);
    const a = -r2d(Math.atan(1 / (1 + Math.tan(d2r(Math.abs(lat - decl))))));
    return angle(a, t);
  };

  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
  for (let i = 0; i < 2; i++) {
    const p = { fajr: t.fajr / 24, sunrise: t.sunrise / 24, dhuhr: t.dhuhr / 24, asr: t.asr / 24, maghrib: t.maghrib / 24, isha: t.isha / 24 };
    t = {
      fajr: angle(FAJR_ANGLE, p.fajr, true),
      sunrise: angle(0.833, p.sunrise, true),
      dhuhr: mid(p.dhuhr),
      asr: asr(p.asr),
      maghrib: angle(0.833, p.maghrib),
      isha: angle(ISHA_ANGLE, p.isha),
    };
  }

  const local = (h: number, mins: number, roundDown = false) => {
    const total = fix(h + offset - lng / 15 + mins / 60, 24) * 60;
    const m2 = roundDown ? Math.floor(total) : Math.ceil(total - 1e-9);
    return `${String(Math.floor(m2 / 60) % 24).padStart(2, "0")}:${String(m2 % 60).padStart(2, "0")}`;
  };
  const rows: [PrayerName, string][] = [
    ["Subuh", local(t.fajr, IHTIYAT.subuh)],
    ["Syuruk", local(t.sunrise, IHTIYAT.syuruk, true)],
    ["Zuhur", local(t.dhuhr, IHTIYAT.zuhur)],
    ["Asar", local(t.asr, IHTIYAT.asar)],
    ["Maghrib", local(t.maghrib, IHTIYAT.maghrib)],
    ["Isyak", local(t.isha, IHTIYAT.isyak)],
  ];
  return rows.map(([name, time]) => ({ name, time, at: zonedToUtc(`${date}T${time}`, tz).getTime() }));
}
