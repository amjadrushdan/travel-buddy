// Which stay a calendar day belongs to (shared by Plan weather, Today and prayer times).
import { dateAt } from "@/lib/time";
import type { Stay } from "@/lib/travel";

type Located = Pick<Stay, "id" | "name" | "check_in" | "check_out" | "tz" | "lat" | "lng">;

/**
 * The stay you sleep in on the night of `day` (YYYY-MM-DD). On the last day (check-out day,
 * no next stay yet) it falls back to the stay you're checking out of, then the nearest stay.
 */
export function stayForDay<T extends Located>(stays: T[], day: string): T | null {
  const night = stays.find((s) => dateAt(s.check_in, s.tz) <= day && day < dateAt(s.check_out, s.tz));
  if (night) return night;
  const leaving = stays.find((s) => dateAt(s.check_out, s.tz) === day);
  if (leaving) return leaving;
  if (stays.length === 0) return null;
  // nearest by date
  return [...stays].sort(
    (a, b) => Math.abs(Date.parse(dateAt(a.check_in, a.tz)) - Date.parse(day)) - Math.abs(Date.parse(dateAt(b.check_in, b.tz)) - Date.parse(day)),
  )[0];
}
