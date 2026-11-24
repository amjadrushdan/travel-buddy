"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { COVER_BUCKET, isCoverPathFor } from "@/lib/cover";

export type CoverResult = { error?: string };

/**
 * Make an already-uploaded file the trip's cover, then delete the previous one.
 * RLS decides who may do this (owners and editors); the DB checks the path's trip too.
 */
export async function setCover(tripId: string, path: string): Promise<CoverResult> {
  if (!isCoverPathFor(tripId, path)) return { error: "That upload doesn't belong to this trip." };
  const supabase = await createClient();

  const { data: before } = await supabase.from("trips").select("cover_url").eq("id", tripId).maybeSingle();
  const { error, count } = await supabase.from("trips").update({ cover_url: path }, { count: "exact" }).eq("id", tripId);
  if (error || !count) {
    await supabase.storage.from(COVER_BUCKET).remove([path]);
    return { error: error?.message ?? "Only owners and editors can change the cover." };
  }

  if (before?.cover_url && before.cover_url !== path) {
    await supabase.storage.from(COVER_BUCKET).remove([before.cover_url]);
  }
  revalidatePath(`/trips/${tripId}`, "layout");
  revalidatePath("/");
  return {};
}

/** Remove the cover photo (back to the plain Home). */
export async function removeCover(tripId: string): Promise<CoverResult> {
  const supabase = await createClient();
  const { data: before } = await supabase.from("trips").select("cover_url").eq("id", tripId).maybeSingle();
  const { error, count } = await supabase.from("trips").update({ cover_url: null }, { count: "exact" }).eq("id", tripId);
  if (error) return { error: error.message };
  if (!count) return { error: "Only owners and editors can change the cover." };
  if (before?.cover_url) await supabase.storage.from(COVER_BUCKET).remove([before.cover_url]);
  revalidatePath(`/trips/${tripId}`, "layout");
  revalidatePath("/");
  return {};
}
