"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTrip } from "@/lib/data/trips";
import { listStays } from "@/lib/data/travel";
import { stayForDay } from "@/lib/stay-location";
import { CapReached, routesEnabled, workOutLeg, type Claim } from "@/lib/routes";

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

const ROUTES_PER_RUN = 15;
const samePlace = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type RoutesResult = { error?: string; done?: number; upToDate?: boolean; more?: boolean; capped?: boolean };

/**
 * Work out walking or train routes between this day's stops that don't have one yet, and save
 * them for the group. Owners and editors only (RLS on route_legs).
 */
export async function workOutRoutes(tripId: string, day: string): Promise<RoutesResult> {
  if (!DATE_RE.test(day)) return { error: "Bad day." };
  if (!routesEnabled() || !process.env.FLIGHT_STATUS_SECRET) return { error: "Routes aren't set up on the server yet." };

  const { trip, me } = await getTrip(tripId);
  if (me.role === "viewer") return { error: "Only owners and editors can work out routes." };
  const supabase = await createClient();

  const [{ data: items, error: itemsError }, { data: legs }, stays] = await Promise.all([
    supabase
      .from("itinerary_items")
      .select("id, start_time, place")
      .eq("trip_id", tripId)
      .eq("day", day)
      .order("sort_order")
      .order("start_time", { nullsFirst: false }),
    supabase.from("route_legs").select("to_item, from_item, from_place, to_place").eq("trip_id", tripId),
    listStays(tripId),
  ]);
  if (itemsError) return { error: itemsError.message };
  const list = items ?? [];
  const saved = new Map((legs ?? []).map((l) => [l.to_item as string, l]));
  const tz = stayForDay(stays, day)?.tz ?? stays[0]?.tz ?? "UTC";
  const where = trip.destination?.trim();
  const address = (p: string) => (where && !p.toLowerCase().includes(where.toLowerCase()) ? `${p}, ${where}` : p);

  // Consecutive stops with different places need a leg.
  const wanted = list.slice(1).flatMap((b, i) => {
    const a = list[i];
    return a.place && b.place && !samePlace(a.place, b.place) ? [{ a, b }] : [];
  });

  // Drop legs that no longer join two stops of this day.
  const keep = new Set(wanted.map((w) => w.b.id));
  const stale = list.filter((it) => saved.has(it.id) && !keep.has(it.id)).map((it) => it.id);
  if (stale.length) await supabase.from("route_legs").delete().in("to_item", stale);

  const todo = wanted.filter(({ a, b }) => {
    const l = saved.get(b.id);
    return !l || l.from_item !== a.id || l.from_place !== a.place || l.to_place !== b.place;
  });
  if (!todo.length) {
    if (stale.length) revalidate(tripId);
    return { upToDate: true, done: 0 };
  }

  const secret = process.env.FLIGHT_STATUS_SECRET!;
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

  let done = 0;
  let capped = false;
  for (const { a, b } of todo.slice(0, ROUTES_PER_RUN)) {
    const arrive = b.start_time?.slice(0, 5);
    const leave = a.start_time?.slice(0, 5);
    const when = { local: `${day}T${arrive ?? leave ?? "10:00"}`, tz, arriveBy: !!arrive };
    let leg;
    try {
      leg = await workOutLeg(address(a.place!), address(b.place!), when, claim);
    } catch (e) {
      if (e instanceof CapReached) {
        capped = true;
        break;
      }
      continue; // provider hiccup: try this leg again next time
    }
    const { error } = await supabase.from("route_legs").upsert(
      { to_item: b.id, trip_id: tripId, from_item: a.id, from_place: a.place!, to_place: b.place!, ...leg },
      { onConflict: "to_item" },
    );
    if (error) return { error: error.message, done };
    done++;
  }
  revalidate(tripId);
  return { done, capped, more: !capped && todo.length > ROUTES_PER_RUN };
}
