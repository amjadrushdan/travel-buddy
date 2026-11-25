"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TRIP_TABLES = ["itinerary_items", "plan_days", "flights", "stays", "stay_todos", "bookings", "documents", "guides", "trip_members", "food_checks"] as const;

/**
 * Listens for changes to this trip and re-renders the page when someone else edits it.
 * Realtime applies the tables' RLS, so only this trip's members get its inserts and updates.
 * Deletes can't be filtered by trip, so any delete triggers a (batched) refresh.
 */
export function LiveUpdates({ tripId }: { tripId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let pending = false; // a change arrived while the tab was hidden
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      // Batch bursts (e.g. a reorder updates every row of a day) into one refresh.
      timer.current = setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
        else pending = true;
      }, 600);
    };
    const onVisible = () => {
      if (pending && document.visibilityState === "visible") {
        pending = false;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;

    // Realtime must carry the member's token, or RLS sees an anonymous visitor and sends nothing.
    // So wait for the session before subscribing, and pass on refreshed tokens.
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (stopped || !session) return;
      supabase.realtime.setAuth(session.access_token);
      let ch = supabase.channel(`trip:${tripId}`);
      for (const table of TRIP_TABLES) {
        ch = ch
          .on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `trip_id=eq.${tripId}` }, refresh)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `trip_id=eq.${tripId}` }, refresh)
          .on("postgres_changes", { event: "DELETE", schema: "public", table }, refresh);
      }
      ch = ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` }, refresh);
      // Status on <html data-live="…"> helps when checking the connection in devtools.
      ch.subscribe((status) => document.documentElement.setAttribute("data-live", status));
      channel = ch;
    });

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [tripId, router]);

  return null;
}
