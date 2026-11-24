import { createClient } from "@/lib/supabase/server";

// GET /trips/:id/docs/:docId — view a trip document (PDF/photo) in the browser.
// ?download=1 saves it instead. Served from the app's own address with the member's session,
// so RLS decides who can read it and the service worker can keep it for offline.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase.from("documents").select("name, path, mime").eq("id", docId).eq("trip_id", id).maybeSingle();
  if (!doc) return new Response("Not found", { status: 404 });

  const { data: file, error } = await supabase.storage.from("trip-docs").download(doc.path as string);
  if (error || !file) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.has("download");
  const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[doc.mime as string] ?? "bin";
  const base = String(doc.name).replace(/\.(pdf|jpe?g|png|webp)$/i, "");
  const filename = `${base}.${ext}`;
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");

  return new Response(file, {
    headers: {
      "Content-Type": doc.mime as string,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      // A document never changes under the same id, so phones can keep it.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
