"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Owner removes another member. RLS enforces who may delete which row (owner only, never the owner). */
export async function removeMember(tripId: string, userId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("trip_members")
    .delete({ count: "exact" })
    .eq("trip_id", tripId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  if (!count) return { error: "Only the trip owner can remove members." };
  revalidatePath(`/trips/${tripId}`, "layout");
  return {};
}

export type InviteResult = { error?: string };

/** Owner/editor creates an invite link. The RPC checks the caller's role. */
export async function createInvite(
  tripId: string,
  role: "editor" | "viewer",
  expiresHours: 24 | 168 | 720,
  maxUses: 1 | 5 | 10,
): Promise<InviteResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invite", {
    p_trip_id: tripId,
    p_role: role,
    p_expires_hours: expiresHours,
    p_max_uses: maxUses,
  });
  if (error) return { error: error.message };
  revalidatePath(`/trips/${tripId}/members`);
  return {};
}

export async function revokeInvite(tripId: string, inviteId: string): Promise<InviteResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite", { p_invite_id: inviteId });
  if (error) return { error: error.message };
  revalidatePath(`/trips/${tripId}/members`);
  return {};
}

/** Any non-owner member leaves the trip. */
export async function leaveTrip(tripId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/welcome");

  const { error, count } = await supabase
    .from("trip_members")
    .delete({ count: "exact" })
    .eq("trip_id", tripId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("The owner can't leave their own trip.");
  redirect("/");
}
