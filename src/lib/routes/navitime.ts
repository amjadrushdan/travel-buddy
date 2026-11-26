// NAVITIME (via RapidAPI, free Basic plan: 500 requests a month, hard stop): trains and buses in
// Japan, which Google's API won't give out. Names come back in Japanese (English is a paid
// option), so line names are translated with our own list in lines-jp.ts.

import { inJapan } from "./google";
import { englishLine } from "./lines-jp";
import type { Step, Transit, TransitProvider } from "./types";

const HOST = "navitime-route-totalnavi.p.rapidapi.com";
const key = () => process.env.RAPIDAPI_KEY;

type NSection = {
  type: "point" | "move";
  name?: string;
  move?: string;
  time?: number;
  line_name?: string;
  from_time?: string;
  transport?: { name?: string; color?: string };
};
type NItem = { summary: { move: { time?: number; fare?: Record<string, number> } }; sections: NSection[] };

function toTransit(item: NItem): Transit | null {
  const steps: Step[] = [];
  const secs = item.sections;
  secs.forEach((s, i) => {
    if (s.type !== "move") return;
    const min = Math.max(1, s.time ?? 0);
    if (s.move === "walk") {
      const last = steps[steps.length - 1];
      if (last?.k === "walk") last.min += min;
      else steps.push({ k: "walk", min });
      return;
    }
    const local = s.transport?.name || s.line_name || "";
    const en = englishLine(local);
    steps.push({
      k: "ride",
      min,
      line: en.en,
      line_local: en.en !== local ? local : undefined,
      code: en.code,
      color: s.transport?.color,
      from: secs[i - 1]?.name,
      to: secs[i + 1]?.name,
      vehicle: s.move,
    });
  });
  if (!steps.some((s) => s.k === "ride")) return null;
  const fare = item.summary.move.fare?.unit_0;
  return { minutes: item.summary.move.time ?? null, fare: fare ?? null, currency: fare != null ? "JPY" : null, steps };
}

export const navitime: TransitProvider = {
  id: "navitime",
  api: "routes_navitime",
  enabled: () => !!key(),
  covers: inJapan,
  async route(from, to, when) {
    const q = new URLSearchParams({
      start: `${from.lat},${from.lng}`,
      goal: `${to.lat},${to.lng}`,
      [when.arriveBy ? "goal_time" : "start_time"]: `${when.local}:00`,
      // Several options in the same call (no extra cost): its own first pick favours leaving
      // late over fewer changes, so we choose (bestOption in index.ts).
      limit: "5",
    });
    const res = await fetch(`https://${HOST}/route_transit?${q}`, {
      headers: { "X-RapidAPI-Key": key()!, "X-RapidAPI-Host": HOST },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`NAVITIME ${res.status}`);
    const items = ((await res.json()) as { items?: NItem[] }).items ?? [];
    return items.map(toTransit).filter((t): t is Transit => t != null);
  },
};
