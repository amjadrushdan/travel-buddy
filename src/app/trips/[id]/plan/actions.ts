"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
