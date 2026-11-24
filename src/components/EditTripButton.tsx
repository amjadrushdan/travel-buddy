"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls, SheetActions, SheetForm, useToast } from "@/components/ui";
import { updateTrip } from "@/app/trips/[id]/trip-actions";

type TripInfo = { id: string; name: string; destination: string | null; start_date: string | null; end_date: string | null };

/** "Edit" for the trip's name, destination and dates. `onPhoto` styles it for the cover photo. */
export function EditTripButton({ trip, onPhoto = false }: { trip: TripInfo; onPhoto?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [toast, setToast] = useToast();

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await updateTrip(trip.id, fd).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        setToast("Trip updated");
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          onPhoto
            ? "flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur-sm"
            : "flex items-center gap-1.5 py-1 text-[15px] font-semibold"
        }
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 20h4L19 9l-4-4L4 16Z" />
          <path d="m13.5 6.5 4 4" />
        </svg>
        Edit
      </button>

      {open && (
        <SheetForm title="Trip details" onClose={() => setOpen(false)} onSubmit={submit}>
          <Field label="Trip name">
            <input name="name" required maxLength={80} defaultValue={trip.name} className={inputCls} />
          </Field>
          <Field label="Destination">
            <input name="destination" maxLength={120} defaultValue={trip.destination ?? ""} placeholder="Tokyo · Hokkaido" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Starts">
              <input name="start_date" type="date" defaultValue={trip.start_date ?? ""} className={`${inputCls} min-w-0 font-mono`} />
            </Field>
            <Field label="Ends">
              <input name="end_date" type="date" defaultValue={trip.end_date ?? ""} className={`${inputCls} min-w-0 font-mono`} />
            </Field>
          </div>
          <p className="text-xs text-pretty text-muted">Changing dates doesn&apos;t move plan items; items outside the dates still show on their own day.</p>
          <SheetActions pending={pending} error={error} saveLabel="Save" />
        </SheetForm>
      )}
      {toast}
    </>
  );
}
