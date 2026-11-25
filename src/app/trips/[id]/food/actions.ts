"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARCODE_RE = /^(\d{8}|\d{13})$/;

/** Saves a label reading for the whole trip. One reading per barcode: a newer one replaces it. */
export async function saveFoodCheck(tripId: string, barcode: string | null, name: string, ingredients: string): Promise<ActionResult> {
  if (!UUID_RE.test(tripId)) return { error: "Unknown trip." };
  const code = barcode && BARCODE_RE.test(barcode) ? barcode : null;
  const text = ingredients.trim().slice(0, 4000);
  const label = name.trim().slice(0, 200) || null;
  if (!text) return { error: "Add the ingredients first." };

  const supabase = await createClient();
  let error;
  if (code) {
    const { data: existing } = await supabase.from("food_checks").select("id").eq("trip_id", tripId).eq("barcode", code).maybeSingle();
    if (existing) {
      ({ error } = await supabase.from("food_checks").update({ name: label, ingredients: text }).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("food_checks").insert({ trip_id: tripId, barcode: code, name: label, ingredients: text }));
    }
  } else {
    ({ error } = await supabase.from("food_checks").insert({ trip_id: tripId, name: label, ingredients: text }));
  }
  if (error) return { error: error.code === "42501" ? "You're not in this trip." : "Couldn't save. Are you offline?" };
  revalidatePath(`/trips/${tripId}/food`);
  return {};
}

export async function deleteFoodCheck(tripId: string, id: string): Promise<ActionResult> {
  if (!UUID_RE.test(tripId) || !UUID_RE.test(id)) return { error: "Unknown item." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("food_checks").delete({ count: "exact" }).eq("id", id).eq("trip_id", tripId);
  if (error || !count) return { error: "Only the person who saved it, or an owner or editor, can remove it." };
  revalidatePath(`/trips/${tripId}/food`);
  return {};
}
