"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateTripState = { error?: string };

export async function createTrip(_prev: CreateTripState, formData: FormData): Promise<CreateTripState> {
  const name = String(formData.get("name") ?? "").trim();
  const destination = String(formData.get("destination") ?? "").trim();
  const start = String(formData.get("start_date") ?? "") || null;
  const end = String(formData.get("end_date") ?? "") || null;

  if (!name) return { error: "Give the trip a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  if (start && end && end < start) return { error: "The trip can't end before it starts." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_trip", {
    p_name: name,
    p_destination: destination || null,
    p_start_date: start,
    p_end_date: end,
  });

  if (error || !data) return { error: error?.message ?? "Couldn't create the trip." };
  redirect(`/trips/${data}`);
}
