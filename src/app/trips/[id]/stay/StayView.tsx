"use client";

import { useState, useTransition } from "react";
import { Field, inputCls, Masked, SheetActions, SheetForm, TzSelect, useDeviceTz, useToast } from "@/components/ui";
import { dayAt, nights, timeAt, tzLabel, utcToZonedInput } from "@/lib/time";
import { stayMapUrl, type Stay } from "@/lib/travel";
import { deleteStay, saveStay } from "../travel-actions";

type Sheet = { mode: "new" } | { mode: "edit"; stay: Stay } | null;

export function StayView({
  tripId,
  tripName,
  tripStart,
  stays,
  suggestedTz,
  canEdit,
}: {
  tripId: string;
  tripName: string;
  tripStart: string | null;
  stays: Stay[];
  suggestedTz: string | null;
  canEdit: boolean;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useToast();
  const total = stays.reduce((n, s) => n + nights(s.check_in, s.check_out, s.tz), 0);

  return (
    <main className="flex flex-col gap-[18px] px-5 pt-[calc(26px+env(safe-area-inset-top))]">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="label">
            {tripName}
            {total ? ` · ${total} ${total === 1 ? "night" : "nights"}` : ""}
          </span>
          <h1 className="page-title">Stays</h1>
        </div>
        {canEdit && stays.length > 0 && (
          <button
            type="button"
            onClick={() => setSheet({ mode: "new" })}
            className="rounded-sm bg-ink px-3 py-[7px] text-[13px] font-semibold text-white"
          >
            + Add
          </button>
        )}
      </div>

      {stays.length === 0 && (
        <div className="flex flex-col gap-3 rounded-card border-[1.5px] border-dashed border-line p-5 text-center">
          <span className="text-sm text-muted">No stays added yet.</span>
          {canEdit && (
            <button type="button" onClick={() => setSheet({ mode: "new" })} className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white">
              Add a stay
            </button>
          )}
        </div>
      )}

      {stays.map((s) => (
        <StayCard key={s.id} s={s} onEdit={canEdit ? () => setSheet({ mode: "edit", stay: s }) : undefined} />
      ))}

      {sheet && (
        <StaySheet
          tripId={tripId}
          tripStart={tripStart}
          sheet={sheet}
          suggestedTz={suggestedTz}
          onClose={() => setSheet(null)}
          onDone={setToast}
        />
      )}
      {toast}
    </main>
  );
}

function StayCard({ s, onEdit }: { s: Stay; onEdit?: () => void }) {
  const n = nights(s.check_in, s.check_out, s.tz);
  const label = tzLabel(s.tz, s.check_in);
  return (
    <article className="flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-col gap-[3px]">
        <span className="label">
          {n} {n === 1 ? "night" : "nights"} · {label}
        </span>
        <span className="text-[19px] font-semibold">{s.name}</span>
        {s.address && <span className="text-[13px] text-pretty text-muted">{s.address}</span>}
      </div>

      <div className="grid grid-cols-2 rounded-sm border border-line">
        <div className="flex flex-col gap-0.5 border-r border-line px-3 py-2.5">
          <span className="text-[11px] text-muted">Check-in</span>
          <span className="font-mono text-[22px] font-medium">{timeAt(s.check_in, s.tz)}</span>
          <span className="text-xs text-muted">
            {dayAt(s.check_in, s.tz)} · {label}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="text-[11px] text-muted">Check-out</span>
          <span className="font-mono text-[22px] font-medium">{timeAt(s.check_out, s.tz)}</span>
          <span className="text-xs text-muted">
            {dayAt(s.check_out, s.tz)} · {tzLabel(s.tz, s.check_out)}
          </span>
        </div>
      </div>

      {s.booking_ref && (
        <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
          <span className="text-muted">Booking ref</span>
          <Masked value={s.booking_ref} />
        </div>
      )}

      {s.notes && <p className="text-[13px] leading-normal whitespace-pre-line text-pretty text-muted">{s.notes}</p>}

      <a
        href={stayMapUrl(s)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex justify-center rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white"
      >
        Open in Maps
      </a>
      {onEdit && (
        <button type="button" onClick={onEdit} className="-mt-1 py-1 text-[13px] font-semibold">
          Edit stay
        </button>
      )}
    </article>
  );
}

function StaySheet({
  tripId,
  tripStart,
  sheet,
  suggestedTz,
  onClose,
  onDone,
}: {
  tripId: string;
  tripStart: string | null;
  sheet: NonNullable<Sheet>;
  suggestedTz: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const s = sheet.mode === "edit" ? sheet.stay : null;
  const deviceTz = useDeviceTz();
  const [tz, setTz] = useState(s?.tz ?? suggestedTz ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const effectiveTz = tz || deviceTz;

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveStay(tripId, s?.id ?? null, fd).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone(s ? "Stay saved" : "Stay added");
      }
    });
  }

  function remove() {
    if (!s) return;
    start(async () => {
      const res = await deleteStay(tripId, s.id).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone("Stay removed");
      }
    });
  }

  return (
    <SheetForm title={s ? "Edit stay" : "Add stay"} onClose={onClose} onSubmit={submit}>
      <Field label="Name">
        <input name="name" required maxLength={120} defaultValue={s?.name ?? ""} placeholder="Asakusa townhouse" className={inputCls} />
      </Field>
      <Field label="Address (optional)">
        <input name="address" maxLength={300} defaultValue={s?.address ?? ""} placeholder="2-chōme Nishiasakusa, Taitō City" className={inputCls} />
      </Field>
      <Field label="Timezone of the stay">
        <TzSelect name="tz" value={effectiveTz} onChange={setTz} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Check-in (local)">
          <input
            name="check_in_local"
            type="datetime-local"
            required
            defaultValue={s ? utcToZonedInput(s.check_in, s.tz) : tripStart ? `${tripStart}T15:00` : ""}
            className={`${inputCls} font-mono text-sm`}
          />
        </Field>
        <Field label="Check-out (local)">
          <input
            name="check_out_local"
            type="datetime-local"
            required
            defaultValue={s ? utcToZonedInput(s.check_out, s.tz) : ""}
            className={`${inputCls} font-mono text-sm`}
          />
        </Field>
      </div>
      <Field label="Booking ref (optional)">
        <input name="booking_ref" maxLength={40} defaultValue={s?.booking_ref ?? ""} autoComplete="off" className={`${inputCls} font-mono`} />
      </Field>
      <Field label="Google Maps link (optional, otherwise we search the address)">
        <input name="map_url" type="url" maxLength={2000} defaultValue={s?.map_url ?? ""} placeholder="https://maps.app.goo.gl/…" className={inputCls} />
      </Field>
      <Field label="Notes (optional)">
        <textarea
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={s?.notes ?? ""}
          placeholder="Lockbox code is in the host message."
          className={`${inputCls} resize-none`}
        />
      </Field>
      <SheetActions pending={pending} error={error} saveLabel={s ? "Save" : "Add stay"} onDelete={s ? remove : undefined} />
    </SheetForm>
  );
}
