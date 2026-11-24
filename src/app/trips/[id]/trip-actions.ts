"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TripResult = { error?: string };

/** Owners and editors change the trip's name, destination and dates (RLS enforces who). */
export async function updateTrip(tripId: string, fd: FormData): Promise<TripResult> {
  const name = String(fd.get("name") ?? "").trim();
  const destination = String(fd.get("destination") ?? "").trim();
  const start = String(fd.get("start_date") ?? "") || null;
  const end = String(fd.get("end_date") ?? "") || null;

  if (!name) return { error: "Give the trip a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  if (destination.length > 120) return { error: "Keep the destination under 120 characters." };
  if (start && end && end < start) return { error: "The trip can't end before it starts." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("trips")
    .update({ name, destination: destination || null, start_date: start, end_date: end }, { count: "exact" })
    .eq("id", tripId);
  if (error) return { error: error.message };
  if (!count) return { error: "Only owners and editors can edit the trip." };
  revalidatePath(`/trips/${tripId}`, "layout");
  revalidatePath("/");
  return {};
}
