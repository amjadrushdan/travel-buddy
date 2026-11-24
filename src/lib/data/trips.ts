import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "editor" | "viewer";

export type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_url: string | null;
  owner_id: string;
};

export type Member = {
  user_id: string;
  role: Role;
  joined_at: string;
  profiles: { name: string | null; avatar_url: string | null } | null;
};

const ROLE_ORDER: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 };

/**
 * The signed-in user, or a redirect to /welcome. Uses getClaims(), which checks the token's
 * signature locally (ES256 keys) instead of calling the auth server on every page.
 * Data access is still enforced by RLS in the database on every query.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/welcome");
  return { supabase, user: { id } };
}

export async function listMyTrips() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("trip_members")
    .select("role, trips(id, name, destination, start_date, end_date, cover_url, owner_id)")
    .eq("user_id", user.id)
    .returns<{ role: Role; trips: Trip | null }[]>();
  if (error) throw error;

  return (data ?? [])
    .filter((r) => r.trips)
    .map((r) => ({ ...r.trips!, role: r.role }))
    .sort((a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"));
}

/** Loads a trip the user belongs to. RLS hides other trips, so they 404. */
export async function getTrip(id: string) {
  const { supabase, user } = await requireUser();

  const [{ data: trip }, { data: members }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, cover_url, owner_id")
      .eq("id", id)
      .maybeSingle<Trip>(),
    supabase
      .from("trip_members")
      .select("user_id, role, joined_at, profiles(name, avatar_url)")
      .eq("trip_id", id)
      .returns<Member[]>(),
  ]);

  if (!trip) notFound();

  const sorted = (members ?? []).sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joined_at.localeCompare(b.joined_at),
  );
  const me = sorted.find((m) => m.user_id === user.id);
  if (!me) notFound();

  return { trip, members: sorted, me, userId: user.id };
}
