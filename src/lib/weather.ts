// Shared weather types and labels (server + browser).

export type DayWeather = {
  code: number; // WMO weather code
  tMax: number;
  tMin: number;
  rain: number | null; // max precipitation probability, %
  snowCm: number | null;
};

/** WMO weather code → icon and short label. */
export function weatherLabel(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Clear" };
  if (code <= 2) return { icon: "⛅", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Cloudy" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", label: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "❄️", label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "🌦️", label: "Showers" };
  if (code === 85 || code === 86) return { icon: "🌨️", label: "Snow showers" };
  if (code >= 95) return { icon: "⛈️", label: "Thunderstorm" };
  return { icon: "🌡️", label: "Weather" };
}
