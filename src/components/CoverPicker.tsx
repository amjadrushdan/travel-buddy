"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/components/ui";
import {
  COVER_BUCKET,
  COVER_DAILY_LIMIT,
  COVER_MAX_BYTES,
  COVER_MAX_EDGE,
  COVER_MAX_ORIGINAL_BYTES,
  newCoverPath,
} from "@/lib/cover";
import { removeCover, setCover } from "@/app/trips/[id]/cover-actions";

type Shrunk = { blob: Blob; type: "image/webp" | "image/jpeg"; url: string };

/** Decode a photo, honouring the phone's rotation flag. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Shrink to ≤1600px on the long edge and ≤1 MB, as WebP (JPEG where the browser can't
 * write WebP). Re-drawing also drops EXIF data such as the photo's GPS location.
 */
async function shrink(file: File): Promise<Shrunk> {
  if (!file.type.startsWith("image/")) throw new Error("Pick a photo (JPEG, PNG or WebP).");
  if (file.size > COVER_MAX_ORIGINAL_BYTES) throw new Error("That photo is over 25 MB. Pick a smaller one.");

  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decode(file);
  } catch {
    throw new Error("Couldn't read that photo. Try a JPEG or PNG.");
  }
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;

  let edge = COVER_MAX_EDGE;
  let quality = 0.82;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, edge / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);

    let blob = await toBlob(canvas, "image/webp", quality);
    let type: Shrunk["type"] = "image/webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await toBlob(canvas, "image/jpeg", quality);
      type = "image/jpeg";
    }
    if (blob && blob.size <= COVER_MAX_BYTES) {
      if ("close" in src) src.close();
      return { blob, type, url: URL.createObjectURL(blob) };
    }
    quality = Math.max(0.5, quality - 0.1);
    edge = Math.round(edge * 0.85);
  }
  throw new Error("Couldn't make that photo small enough. Try another one.");
}

function friendly(message: string): string {
  if (/uploads per trip per day/i.test(message))
    return `The cover has been changed ${COVER_DAILY_LIMIT} times today. Try again tomorrow.`;
  if (/already has 2 files/i.test(message)) return "Another cover upload is still finishing. Try again in a minute.";
  if (/row-level security|policy|unauthori[sz]ed|403/i.test(message))
    return `Couldn't save. Only owners and editors can change the cover, up to ${COVER_DAILY_LIMIT} times a day.`;
  if (/payload too large|exceeded the maximum|413|size/i.test(message)) return "That photo is still too large.";
  if (/mime|type/i.test(message)) return "That file type isn't allowed. Use a photo.";
  return message;
}

export function CoverPicker({ tripId, hasCover, onPhoto }: { tripId: string; hasCover: boolean; onPhoto: boolean }) {
  const router = useRouter();
  const online = useOnline();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Shrunk | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  function close() {
    setOpen(false);
    setPreview(null);
    setError(null);
    setBusy(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy("Preparing photo…");
    try {
      setPreview(await shrink(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!preview) return;
    setError(null);
    setBusy("Uploading…");
    const path = newCoverPath(tripId, preview.type);
    const { error: upErr } = await createClient()
      .storage.from(COVER_BUCKET)
      .upload(path, preview.blob, { contentType: preview.type, upsert: false, cacheControl: "31536000" });
    if (upErr) {
      setBusy(null);
      setError(friendly(upErr.message));
      return;
    }
    const res = await setCover(tripId, path).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
    if (res.error) {
      setBusy(null);
      setError(friendly(res.error));
      return;
    }
    close();
    start(() => router.refresh());
  }

  async function remove() {
    setError(null);
    setBusy("Removing…");
    const res = await removeCover(tripId).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
    if (res.error) {
      setBusy(null);
      setError(res.error);
      return;
    }
    close();
    start(() => router.refresh());
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          onPhoto
            ? "flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-sm"
            : "flex w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-line p-3.5 text-sm font-semibold text-muted"
        }
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4Z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        {onPhoto ? "Change cover" : "Add a cover photo"}
      </button>

      <input ref={input} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/35" onClick={busy ? undefined : close}>
          <div
            role="dialog"
            aria-label="Cover photo"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[480px] flex-col gap-3.5 rounded-t-[22px] bg-bg px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))] text-ink"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-line" />
            <span className="text-xl font-bold">Cover photo</span>

            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview blob
              <img src={preview.url} alt="New cover preview" className="h-48 w-full rounded-card object-cover" />
            ) : (
              <p className="text-sm text-pretty text-muted">
                Pick a photo for the top of the trip&apos;s Home. It&apos;s shrunk on your phone first (max 1600px, 1 MB) and
                only trip members can see it.
              </p>
            )}

            {error && (
              <p role="alert" className="text-[13px] text-bad">
                {error}
              </p>
            )}
            {busy && <p className="text-[13px] text-muted">{busy}</p>}

            {preview ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className="rounded-sm border border-line bg-surface p-3 text-sm font-semibold">
                  Pick another
                </button>
                <button type="button" disabled={!!busy || !online} onClick={save} className="rounded-sm bg-ink p-3 text-sm font-semibold text-white">
                  {online ? "Save cover" : "You're offline"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!!busy || !online}
                onClick={() => input.current?.click()}
                className="rounded-sm bg-ink p-[15px] text-base font-semibold text-white"
              >
                {online ? "Choose a photo" : "You're offline"}
              </button>
            )}

            {hasCover && !preview && (
              <button type="button" disabled={!!busy || !online} onClick={remove} className="rounded-sm border border-line bg-surface p-3 text-sm font-semibold text-bad">
                Remove cover
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
