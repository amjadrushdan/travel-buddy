"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/components/ui";
import { DOC_MAX_BYTES, DOC_TYPES, fileSize, type TripDocument } from "@/lib/bookings";
import { createDocument, deleteDocument, type DocParent } from "@/app/trips/[id]/booking-actions";

function friendlyUpload(msg: string): string {
  if (/30 uploads/i.test(msg)) return "That's 30 uploads today for this trip. Try again tomorrow.";
  if (/100 files/i.test(msg)) return "This trip already has 100 documents. Remove some first.";
  if (/too large|exceeded|413|size/i.test(msg)) return "That file is over 10 MB.";
  if (/mime|type/i.test(msg)) return "Only PDF, JPG, PNG or WebP files.";
  if (/security|policy|unauthori[sz]ed|403/i.test(msg)) return "Only owners and editors can add documents.";
  return msg;
}

/**
 * Documents attached to something (a booking, flight or stay), or the trip itself.
 * View opens it on screen; Download saves it. Owners/editors can add and remove.
 */
export function DocumentList({
  tripId,
  parent = {},
  docs,
  canEdit,
  title = "Documents",
  emptyHint,
}: {
  tripId: string;
  parent?: DocParent;
  docs: TripDocument[];
  canEdit: boolean;
  title?: string;
  emptyHint?: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (docs.length === 0 && !canEdit) return null;

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const ext = DOC_TYPES[file.type];
    if (!ext) return setError("Only PDF, JPG, PNG or WebP files.");
    if (file.size > DOC_MAX_BYTES) return setError("That file is over 10 MB.");
    setBusy(`Uploading ${file.name}…`);
    const path = `${tripId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await createClient().storage.from("trip-docs").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setBusy(null);
      return setError(friendlyUpload(upErr.message));
    }
    const res = await createDocument(tripId, parent, { name: file.name, path, mime: file.type, size: file.size }).catch(() => ({
      error: "Couldn't reach the server. Are you offline?",
    }));
    setBusy(null);
    if (res.error) return setError(friendlyUpload(res.error));
    start(() => router.refresh());
  }

  function remove(d: TripDocument) {
    if (armed !== d.id) return setArmed(d.id);
    setArmed(null);
    setBusy(`Removing ${d.name}…`);
    start(async () => {
      const res = await deleteDocument(tripId, d.id).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      setBusy(null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {title && <span className="text-[11px] font-semibold text-muted">{title}</span>}
      {docs.length > 0 && (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-sm border border-line">
          {docs.map((d) => {
            const href = `/trips/${tripId}/docs/${d.id}`;
            return (
              <li key={d.id} className="flex items-center gap-3 bg-surface px-3 py-2.5">
                <span className="flex h-9 w-8 flex-none items-center justify-center rounded-[5px] bg-bg font-mono text-[9px] font-bold text-muted" aria-hidden>
                  {d.mime === "application/pdf" ? "PDF" : "IMG"}
                </span>
                <a href={href} target="_blank" rel="noopener" className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{d.name}</span>
                  <span className="text-[12px] text-muted">{fileSize(d.size)}</span>
                </a>
                <a href={`${href}?download=1`} className="flex-none rounded-sm border border-line bg-bg px-2.5 py-1.5 text-[12px] font-semibold" aria-label={`Download ${d.name}`}>
                  Save
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => remove(d)}
                    disabled={!online || !!busy}
                    className={`flex-none rounded-sm px-2 py-1.5 text-[12px] font-semibold ${armed === d.id ? "bg-bad text-white" : "text-muted"}`}
                    aria-label={armed === d.id ? `Confirm removing ${d.name}` : `Remove ${d.name}`}
                  >
                    {armed === d.id ? "Remove?" : "×"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {docs.length === 0 && emptyHint && <span className="text-[13px] text-muted">{emptyHint}</span>}
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!online || !!busy}
            className="flex items-center justify-center gap-2 rounded-sm border border-dashed border-line py-2.5 text-[13px] font-semibold text-muted"
          >
            {busy ?? (online ? "+ Add PDF or photo" : "You're offline")}
          </button>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={upload} />
        </>
      )}
      {error && (
        <span role="alert" className="text-[12px] text-bad">
          {error}
        </span>
      )}
    </div>
  );
}
