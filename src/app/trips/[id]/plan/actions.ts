"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTrip } from "@/lib/data/trips";
import { listStays } from "@/lib/data/travel";
import { stayForDay } from "@/lib/stay-location";
import { CapReached, driveBetween, findPlace, routesEnabled, transitBetween, walkBetween, type Claim } from "@/lib/routes";
import { pointFromMapLink } from "@/lib/routes/maplink";
import { legMatches, needsWork, samePlace, stayMoved, wantsTransit } from "@/lib/routes/leg";
import { matchStay } from "@/lib/routes/stay-match";
import type { Choice, SavedLeg } from "@/lib/routes/types";
import { LEG_COLUMNS } from "@/lib/data/itinerary";

export type ActionResult = { error?: string };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function revalidate(tripId: string) {
  revalidatePath(`/trips/${tripId}/plan`);
  revalidatePath(`/trips/${tripId}`);
}

/**
 * Re-number a day so `id` lands in time order: before the first item that starts later.
 * Items without a time go to the end. Other items keep their relative (manual) order.
 */
async function placeInDay(supabase: SupabaseClient, tripId: string, day: string, id: string, time: string | null) {
  const { data, error } = await supabase
    .from("itinerary_items")
    .select("id, start_time")
    .eq("trip_id", tripId)
    .eq("day", day)
    .order("sort_order")
    .order("start_time", { nullsFirst: false });
  if (error) return error.message;

  const others = (data ?? []).filter((r) => r.id !== id);
  let at = others.length;
  if (time) {
    const later = others.findIndex((r) => r.start_time && r.start_time.slice(0, 5) > time);
    if (later !== -1) at = later;
  }
  const ids = others.map((r) => r.id);
  ids.splice(at, 0, id);

  const { error: rpcError } = await supabase.rpc("reorder_itinerary_day", {
    p_trip_id: tripId,
    p_day: day,
    p_ids: ids,
  });
  return rpcError?.message ?? null;
}

function readForm(formData: FormData) {
  const day = String(formData.get("day") ?? "");
  const time = String(formData.get("start_time") ?? "").slice(0, 5);
  const title = String(formData.get("title") ?? "").trim();
  const place = String(formData.get("place") ?? "").trim();
  const mapUrl = String(formData.get("map_url") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!DATE_RE.test(day)) return { error: "Pick a day." } as const;
  if (time && !TIME_RE.test(time)) return { error: "Use a time like 09:30." } as const;
  if (!title) return { error: "Give it a title." } as const;
  if (title.length > 120) return { error: "Keep the title under 120 characters." } as const;
  if (place.length > 200) return { error: "Keep the place under 200 characters." } as const;
  if (notes.length > 2000) return { error: "Keep notes under 2000 characters." } as const;
  if (mapUrl && (!mapUrl.startsWith("https://") || mapUrl.length > 2000))
    return { error: "The map link must start with https://" } as const;

  return {
    values: {
      day,
      start_time: time || null,
      title,
      place: place || null,
      map_url: mapUrl || null,
      notes: notes || null,
    },
  } as const;
}

/** Create (no `id`) or update an item. RLS lets only owners and editors write. */
export async function saveItem(tripId: string, id: string | null, formData: FormData): Promise<ActionResult> {
  const parsed = readForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const v = parsed.values;
  const supabase = await createClient();

  if (!id) {
    const { data, error } = await supabase
      .from("itinerary_items")
      .insert({ trip_id: tripId, ...v, sort_order: 0 })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Couldn't add the item." };
    const placeError = await placeInDay(supabase, tripId, v.day, data.id, v.start_time);
    revalidate(tripId);
    return placeError ? { error: placeError } : {};
  }

  const { data: before } = await supabase
    .from("itinerary_items")
    .select("day, start_time")
    .eq("id", id)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (!before) return { error: "That item no longer exists." };

  const { error, count } = await supabase
    .from("itinerary_items")
    .update(v, { count: "exact" })
    .eq("id", id)
    .eq("trip_id", tripId);
  if (error) return { error: error.message };
  if (!count) return { error: "You can't edit this plan." };

  // Only re-slot when the day or time changed, so a manual order survives title/notes edits.
  let placeError: string | null = null;
  if (before.day !== v.day || (before.start_time?.slice(0, 5) ?? null) !== v.start_time) {
    placeError = await placeInDay(supabase, tripId, v.day, id, v.start_time);
  }
  revalidate(tripId);
  return placeError ? { error: placeError } : {};
}

export async function deleteItem(tripId: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("itinerary_items")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("trip_id", tripId);
  if (error) return { error: error.message };
  if (!count) return { error: "You can't delete this item." };
  revalidate(tripId);
  return {};
}

/** Save a new manual order for one day. `ids` must be exactly that day's items. */
export async function reorderDay(tripId: string, day: string, ids: string[]): Promise<ActionResult> {
  if (!DATE_RE.test(day)) return { error: "Bad day." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_itinerary_day", { p_trip_id: tripId, p_day: day, p_ids: ids });
  if (error) return { error: error.message };
  revalidate(tripId);
  return {};
}

/** Name a day ("Harajuku day"). An empty title removes it. */
export async function setDayTitle(tripId: string, day: string, title: string): Promise<ActionResult> {
  if (!DATE_RE.test(day)) return { error: "Bad day." };
  const t = title.trim();
  if (t.length > 80) return { error: "Keep the title under 80 characters." };
  const supabase = await createClient();
  let error: { code?: string; message: string } | null = null;
  if (!t) {
    ({ error } = await supabase.from("plan_days").delete().eq("trip_id", tripId).eq("day", day));
  } else {
    // Update first, insert if the day has no title yet. (An upsert would also try to rewrite
    // trip_id/day, which clients aren't allowed to update, so the database refuses it.)
    const res = await supabase.from("plan_days").update({ title: t }, { count: "exact" }).eq("trip_id", tripId).eq("day", day);
    error = res.error;
    if (!error && !res.count) ({ error } = await supabase.from("plan_days").insert({ trip_id: tripId, day, title: t }));
  }
  if (error) return { error: error.code === "42501" ? "Only owners and editors can name days." : error.message };
  revalidate(tripId);
  return {};
}

// ---------------------------------------------------------------- getting between stops
//
// API calls are spent only here, and only when an editor asks: "Add routes" for a day,
// choosing Train on a leg that has no train answer yet, or "Check again". Everything else
// (switching walk/train/car, hiding, changing times) reads what's saved.

const ROUTES_PER_RUN = 15;

type Stop = { id: string; day: string; start_time: string | null; place: string | null; map_url: string | null };
type Point = { lat: number; lng: number };
type Ctx = {
  supabase: SupabaseClient;
  tripId: string;
  tz: (day: string) => string;
  /** Where a stop is on the map (see routeCtx), or its name for Google to guess. */
  locate: (s: Stop, force?: boolean) => Promise<Point | string>;
  claim: Claim;
};

async function routeCtx(tripId: string): Promise<Ctx | { error: string }> {
  if (!routesEnabled() || !process.env.FLIGHT_STATUS_SECRET) return { error: "Routes aren't set up on the server yet." };
  const { trip, me } = await getTrip(tripId);
  if (me.role === "viewer") return { error: "Only owners and editors can change routes." };
  const supabase = await createClient();
  const stays = await listStays(tripId);
  const where = trip.destination?.trim();
  const secret = process.env.FLIGHT_STATUS_SECRET!;
  const { data: saved } = await supabase.from("place_points").select("place_key, lat, lng, source").eq("trip_id", tripId);
  const places = new Map((saved ?? []).map((p) => [p.place_key as string, p]));
  const keyOf = (p: string) => p.trim().toLowerCase().slice(0, 200);

  const claim: Claim = async (api, cap) => {
      const { data, error } = await supabase.rpc("route_claim", {
        p_secret: secret,
        p_api: api,
        p_daily_cap: cap.daily,
        p_monthly_cap: cap.monthly,
      });
      if (error) throw error;
      return data === true;
  };

  /**
   * Cheapest first: a stay's saved point; a place already found in this trip; the stop's own
   * Google Maps link (free); a Google place search near that day's stay (saved for the trip).
   * If nothing is found, the name goes to the route lookup as before.
   */
  async function locate(stop: Stop, force = false): Promise<Point | string> {
    const p = stop.place!;
    const stay = matchStay(p, stays);
    if (stay) return { lat: stay.lat!, lng: stay.lng! };
    const named = where && !p.toLowerCase().includes(where.toLowerCase()) ? `${p}, ${where}` : p;

    const key = keyOf(p);
    const hit = places.get(key);
    if (hit && !force) return hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng } : named;

    let row: { lat: number | null; lng: number | null; found_name: string | null; found_addr: string | null; source: string };
    const fromLink = stop.map_url ? await pointFromMapLink(stop.map_url) : null;
    if (fromLink) {
      row = { ...fromLink, found_name: null, found_addr: null, source: "map_link" };
    } else {
      const near = stayForDay(stays, stop.day);
      const found = await findPlace(p, near?.lat != null && near.lng != null ? { lat: near.lat, lng: near.lng } : null, claim);
      row = found
        ? { ...found.point, found_name: found.name, found_addr: found.address, source: "places" }
        : { lat: null, lng: null, found_name: null, found_addr: null, source: "none" };
    }
    await supabase.from("place_points").upsert({ trip_id: tripId, place_key: key, ...row }, { onConflict: "trip_id,place_key" });
    places.set(key, { place_key: key, lat: row.lat, lng: row.lng, source: row.source });
    return row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : named;
  }

  return {
    supabase,
    tripId,
    tz: (day) => stayForDay(stays, day)?.tz ?? stays[0]?.tz ?? "UTC",
    locate,
    claim,
  };
}

const emptyLeg = (a: Stop, b: Stop, choice: Choice = "auto"): SavedLeg => ({
  to_item: b.id,
  from_item: a.id,
  from_place: a.place!,
  to_place: b.place!,
  choice,
  from_lat: null,
  from_lng: null,
  to_lat: null,
  to_lng: null,
  walk_min: null,
  walk_m: null,
  drive_min: null,
  drive_m: null,
  toll: null,
  toll_currency: null,
  transit: null,
  transit_at: null,
  provider: null,
});

/**
 * Fill in what the leg is missing: the walk (also places both stops on the map), then a train
 * answer if one could matter. `force` asks again even for what's already saved.
 */
async function fill(ctx: Ctx, leg: SavedLeg, a: Stop, b: Stop, force = false) {
  if (leg.choice === "hidden") return;
  // Car: Google's driving time only. No train lookup.
  if (leg.choice === "car") {
    if (!force && leg.drive_min != null) return;
    const d = await driveBetween(await ctx.locate(a, force), await ctx.locate(b, force), ctx.claim);
    leg.drive_min = d?.minutes ?? null;
    leg.drive_m = d?.meters ?? null;
    leg.toll = d?.toll?.amount ?? null;
    leg.toll_currency = d?.toll?.currency ?? null;
    if (d && leg.from_lat == null) Object.assign(leg, { from_lat: d.from.lat, from_lng: d.from.lng, to_lat: d.to.lat, to_lng: d.to.lng });
    return;
  }
  // The walk call also gives the map points a train check needs.
  if (force || leg.walk_min == null || (leg.from_lat == null && leg.choice === "transit")) {
    const w = await walkBetween(await ctx.locate(a, force), await ctx.locate(b, force), ctx.claim);
    leg.walk_min = w?.minutes ?? null;
    leg.walk_m = w?.meters ?? null;
    leg.from_lat = w?.from.lat ?? null;
    leg.from_lng = w?.from.lng ?? null;
    leg.to_lat = w?.to.lat ?? null;
    leg.to_lng = w?.to.lng ?? null;
  }
  if (leg.from_lat == null || leg.from_lng == null || leg.to_lat == null || leg.to_lng == null) return;
  const ask = force ? leg.transit_at != null || wantsTransit({ ...leg, transit_at: null }) : wantsTransit(leg);
  if (!ask) return;
  // Arrive in time for the next stop; else leave when the last one starts; else mid-morning.
  const arrive = b.start_time?.slice(0, 5);
  const leave = a.start_time?.slice(0, 5);
  const when = { local: `${b.day}T${arrive ?? leave ?? "10:00"}`, tz: ctx.tz(b.day), arriveBy: !!arrive };
  let r: { transit: SavedLeg["transit"]; provider: string | null };
  try {
    r = await transitBetween({ lat: leg.from_lat, lng: leg.from_lng }, { lat: leg.to_lat, lng: leg.to_lng }, when, ctx.claim);
  } catch (e) {
    if (e instanceof CapReached) throw e;
    return; // provider hiccup: leave it unchecked so a later run tries again
  }
  if (r.provider) {
    leg.transit = r.transit;
    leg.transit_at = new Date().toISOString();
    leg.provider = r.provider;
  }
}

async function saveLeg(ctx: Ctx, leg: SavedLeg) {
  const { error } = await ctx.supabase.from("route_legs").upsert({ ...leg, trip_id: ctx.tripId }, { onConflict: "to_item" });
  return error?.message ?? null;
}

export type RoutesResult = { error?: string; done?: number; upToDate?: boolean; more?: boolean; capped?: boolean };

/**
 * Add routes for this day's stops that don't have one yet (or need a train answer).
 * `by: "car"` is a driving day: every leg becomes car with Google's driving time, no trains.
 */
export async function addRoutes(tripId: string, day: string, by: "auto" | "car" = "auto"): Promise<RoutesResult> {
  if (!DATE_RE.test(day)) return { error: "Bad day." };
  if (by !== "auto" && by !== "car") return { error: "Bad choice." };
  const ctx = await routeCtx(tripId);
  if ("error" in ctx) return ctx;

  const [{ data: items, error: itemsError }, { data: legs }] = await Promise.all([
    ctx.supabase
      .from("itinerary_items")
      .select("id, day, start_time, place, map_url")
      .eq("trip_id", tripId)
      .eq("day", day)
      .order("sort_order")
      .order("start_time", { nullsFirst: false })
      .returns<Stop[]>(),
    ctx.supabase.from("route_legs").select(LEG_COLUMNS).eq("trip_id", tripId).returns<SavedLeg[]>(),
  ]);
  if (itemsError) return { error: itemsError.message };
  const list = items ?? [];
  const all = legs ?? [];
  const saved = new Map(all.map((l) => [l.to_item, l]));

  const wanted = list.slice(1).flatMap((b, i) => {
    const a = list[i];
    return a.place && b.place && !samePlace(a.place, b.place) ? [{ a, b }] : [];
  });

  // Drop legs that no longer join two stops of this day.
  const keep = new Set(wanted.map((w) => w.b.id));
  const stale = list.filter((it) => saved.has(it.id) && !keep.has(it.id)).map((it) => it.id);
  if (stale.length) await ctx.supabase.from("route_legs").delete().in("to_item", stale);

  const stays = await listStays(tripId);
  const todo = wanted.filter(({ a, b }) => {
    const l = saved.get(b.id);
    if (by === "car") return !l || !legMatches(l, a, b) || l.choice !== "car" || l.drive_min == null || stayMoved(l, a, b, stays);
    return needsWork(l, a, b, stays);
  });
  if (!todo.length) {
    if (stale.length) revalidate(tripId);
    return { upToDate: true, done: 0 };
  }

  let done = 0;
  let capped = false;
  for (const { a, b } of todo.slice(0, ROUTES_PER_RUN)) {
    const old = saved.get(b.id);
    let leg: SavedLeg;
    if (old && legMatches(old, a, b) && !stayMoved(old, a, b, stays)) {
      leg = { ...old }; // same stops, only the train answer is missing
    } else {
      leg = emptyLeg(a, b, old?.choice); // keep the editor's choice for this link
      // The same two places elsewhere in the trip: reuse that answer, no API call.
      const twin = all.find(
        (l) => samePlace(l.from_place, a.place) && samePlace(l.to_place, b.place) && l.from_lat != null && !stayMoved(l, a, b, stays),
      );
      if (twin) {
        Object.assign(leg, {
          from_lat: twin.from_lat,
          from_lng: twin.from_lng,
          to_lat: twin.to_lat,
          to_lng: twin.to_lng,
          walk_min: twin.walk_min,
          walk_m: twin.walk_m,
          drive_min: twin.drive_min,
          drive_m: twin.drive_m,
          toll: twin.toll,
          toll_currency: twin.toll_currency,
          transit: twin.transit,
          transit_at: twin.transit_at,
          provider: twin.provider,
        });
      }
    }
    if (by === "car") leg.choice = "car";
    try {
      await fill(ctx, leg, a, b);
    } catch (e) {
      if (!(e instanceof CapReached)) throw e;
      capped = true;
    }
    // Save even a half-filled leg (walk found, train capped): the next run finishes it.
    if (!capped || leg.from_lat != null || leg.choice === "hidden") {
      const err = await saveLeg(ctx, leg);
      if (err) return { error: err, done };
      done++;
    }
    if (capped) break;
  }
  revalidate(tripId);
  return { done, capped, more: !capped && todo.length > ROUTES_PER_RUN };
}

async function loadLeg(ctx: Ctx, toItem: string) {
  const { data: leg } = await ctx.supabase
    .from("route_legs")
    .select(`${LEG_COLUMNS}, computed_at`)
    .eq("trip_id", ctx.tripId)
    .eq("to_item", toItem)
    .maybeSingle<SavedLeg & { computed_at: string }>();
  if (!leg) return null;
  const { data: stops } = await ctx.supabase
    .from("itinerary_items")
    .select("id, day, start_time, place, map_url")
    .in("id", [leg.from_item, leg.to_item])
    .returns<Stop[]>();
  const a = stops?.find((s) => s.id === leg.from_item);
  const b = stops?.find((s) => s.id === leg.to_item);
  return a && b && a.place && b.place ? { leg, a, b } : null;
}

const CHOICES: Choice[] = ["auto", "walk", "transit", "car", "hidden"];

/** Walk / Train / Car or taxi / Hide for one leg. A missing walk or train answer is fetched once. */
export async function chooseRoute(tripId: string, toItem: string, choice: Choice): Promise<{ error?: string; note?: string }> {
  if (!CHOICES.includes(choice)) return { error: "Bad choice." };
  const ctx = await routeCtx(tripId);
  if ("error" in ctx) return ctx;
  const found = await loadLeg(ctx, toItem);
  if (!found) return { error: "That route no longer exists. Tap Add routes." };
  const { leg, a, b } = found;
  leg.choice = choice;
  try {
    await fill(ctx, leg, a, b);
  } catch (e) {
    if (e instanceof CapReached) return { error: "Daily route limit reached. Try tomorrow." };
    throw e;
  }
  const err = await saveLeg(ctx, leg);
  if (err) return { error: err };
  revalidate(tripId);
  if (choice === "transit" && !leg.transit) return { note: "No train found here, so it shows the walk." };
  return {};
}

/** Ask the providers again for one leg (times looked wrong, or a place was fixed). */
/** One refresh per route per few minutes, so tapping ↻ repeatedly can't use up the day's lookups. */
const REFRESH_COOLDOWN_MIN = 5;

export async function recheckRoute(tripId: string, toItem: string): Promise<{ error?: string }> {
  const ctx = await routeCtx(tripId);
  if ("error" in ctx) return ctx;
  const found = await loadLeg(ctx, toItem);
  if (!found) return { error: "That route no longer exists. Tap Add routes." };
  const age = (Date.now() - Date.parse(found.leg.computed_at)) / 60_000;
  if (age < REFRESH_COOLDOWN_MIN) {
    const wait = Math.max(1, Math.ceil(REFRESH_COOLDOWN_MIN - age));
    return { error: `Just updated. You can refresh it again in ${wait} min.` };
  }
  try {
    await fill(ctx, found.leg, found.a, found.b, true);
  } catch (e) {
    if (e instanceof CapReached) return { error: "Daily route limit reached. Try tomorrow." };
    throw e;
  }
  const err = await saveLeg(ctx, found.leg);
  if (err) return { error: err };
  revalidate(tripId);
  return {};
}
