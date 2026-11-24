// Daily forecast per trip day from Open-Meteo (free, no key), fetched on the server and
// cached for 3 hours. The location is the stay you sleep in that night. Forecasts only reach
// ~16 days ahead, so days further out simply have no entry yet.
import { stayForDay } from "@/lib/stay-location";
import type { Stay } from "@/lib/travel";
import type { DayWeather } from "@/lib/weather";

const HORIZON_DAYS = 15;

type OpenMeteo = {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: (number | null)[];
    snowfall_sum?: (number | null)[];
  };
};

export async function forecastForDays(days: string[], stays: Stay[]): Promise<Record<string, DayWeather>> {
  const out: Record<string, DayWeather> = {};
  const today = new Date().toISOString().slice(0, 10);
  const last = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);
  const inRange = days.filter((d) => d >= today && d <= last);
  if (inRange.length === 0) return out;

  // Group days by location so each place is one request.
  const groups = new Map<string, { lat: number; lng: number; tz: string; days: string[] }>();
  for (const d of inRange) {
    const s = stayForDay(stays, d);
    if (!s || s.lat == null || s.lng == null) continue;
    const key = `${s.lat.toFixed(2)},${s.lng.toFixed(2)}`;
    const g = groups.get(key) ?? { lat: s.lat, lng: s.lng, tz: s.tz, days: [] };
    g.days.push(d);
    groups.set(key, g);
  }

  await Promise.all(
    [...groups.values()].map(async (g) => {
      const params = new URLSearchParams({
        latitude: g.lat.toFixed(3),
        longitude: g.lng.toFixed(3),
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum",
        timezone: g.tz,
        start_date: g.days[0],
        end_date: g.days[g.days.length - 1],
      });
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
          next: { revalidate: 3 * 3600 },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const j = (await res.json()) as OpenMeteo;
        const daily = j.daily;
        if (!daily) return;
        daily.time.forEach((d, i) => {
          if (!g.days.includes(d)) return;
          out[d] = {
            code: daily.weather_code[i],
            tMax: Math.round(daily.temperature_2m_max[i]),
            tMin: Math.round(daily.temperature_2m_min[i]),
            rain: daily.precipitation_probability_max?.[i] ?? null,
            snowCm: daily.snowfall_sum?.[i] ?? null,
          };
        });
      } catch {
        /* weather is a nice-to-have; the page works without it */
      }
    }),
  );
  return out;
}
