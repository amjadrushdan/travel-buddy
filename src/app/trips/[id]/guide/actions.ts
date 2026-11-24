"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCategory } from "@/lib/guides";

export type ActionResult = { error?: string };

function friendly(error: { code?: string; message: string }) {
  if (error.code === "42501") return "Only owners and editors can change the guide.";
  if (error.code === "23514") return "Some details don't look right. Check the form.";
  return error.message;
}

export async function saveGuide(tripId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  const category = String(fd.get("category") ?? "");
  const title = String(fd.get("title") ?? "").trim();
  const body = String(fd.get("body_md") ?? "").trim();
  if (!isCategory(category)) return { error: "Pick a category." };
  if (!title) return { error: "Give the note a title." };
  if (title.length > 120) return { error: "Keep the title under 120 characters." };
  if (body.length > 10000) return { error: "Keep the note under 10,000 characters." };

  const values = { category, title, body_md: body };
  const supabase = await createClient();
  const { error, count } = id
    ? await supabase.from("guides").update(values, { count: "exact" }).eq("id", id).eq("trip_id", tripId)
    : await supabase.from("guides").insert({ trip_id: tripId, ...values }, { count: "exact" });
  if (error) return { error: friendly(error) };
  if (!count) return { error: "You can't edit this guide." };
  revalidatePath(`/trips/${tripId}/guide`);
  return {};
}

export async function deleteGuide(tripId: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("guides").delete({ count: "exact" }).eq("id", id).eq("trip_id", tripId);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "You can't delete this note." };
  revalidatePath(`/trips/${tripId}/guide`);
  return {};
}
