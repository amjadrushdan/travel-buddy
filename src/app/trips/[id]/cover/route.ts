import { createClient } from "@/lib/supabase/server";
import { COVER_BUCKET } from "@/lib/cover";

// GET /trips/:id/cover?v=<version> — the trip's cover photo, from the app's own address.
// Same origin means the service worker can save it for offline, and the private bucket stays
// private: the member's own session reads it, so RLS decides who can see it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: trip } = await supabase.from("trips").select("cover_url").eq("id", id).maybeSingle();
  if (!trip?.cover_url) return new Response("Not found", { status: 404 });

  const { data: file, error } = await supabase.storage.from(COVER_BUCKET).download(trip.cover_url);
  if (error || !file) return new Response("Not found", { status: 404 });

  return new Response(file, {
    headers: {
      "Content-Type": file.type || (trip.cover_url.endsWith(".jpg") ? "image/jpeg" : "image/webp"),
      // The URL carries the version (?v=), so a new upload gets a new URL. "private": never
      // stored by shared caches, only by the member's own browser.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
