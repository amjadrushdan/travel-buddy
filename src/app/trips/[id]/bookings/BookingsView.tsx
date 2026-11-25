"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DocumentList } from "@/components/DocumentList";
import { LinkedText } from "@/components/LinkedText";
import { Field, inputCls, Masked, SheetActions, SheetForm, TzSelect, useDeviceTz, useToast } from "@/components/ui";
import { BOOKING_KINDS, formatPrice, kindOf, type Booking, type BookingKind, type TripDocument } from "@/lib/bookings";
import { dateAt, dayAt, timeAt, utcToZonedInput } from "@/lib/time";
import { deleteBooking, saveBooking } from "../booking-actions";

type Sheet = { mode: "new" } | { mode: "edit"; booking: Booking } | null;
const OFFLINE = { error: "Couldn't reach the server. Are you offline?" };
const CURRENCIES = ["JPY", "MYR", "THB", "SGD", "USD", "KRW"];

export function BookingsView({
  tripId,
  tripName,
  tripStart,
  bookings,
  docs,
  suggestedTz,
  canEdit,
}: {
  tripId: string;
  tripName: string;
  tripStart: string | null;
  bookings: Booking[];
  docs: TripDocument[];
  suggestedTz: string | null;
  canEdit: boolean;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useToast();

  // Group by the booking's local date.
  const groups: { day: string; label: string; items: Booking[] }[] = [];
  for (const b of bookings) {
    const day = dateAt(b.starts_at, b.tz);
    const g = groups.find((x) => x.day === day);
    if (g) g.items.push(b);
    else groups.push({ day, label: dayAt(b.starts_at, b.tz), items: [b] });
  }
  const tripDocs = docs.filter((d) => !d.flight_id && !d.stay_id && !d.booking_id);

  return (
    <main data-two-col className="flex flex-col gap-5 px-5 pt-[calc(16px+env(safe-area-inset-top))] lg:mx-auto lg:max-w-[880px] lg:pt-0">
      <Link href={`/trips/${tripId}`} className="self-start py-1 text-[15px] font-semibold lg:hidden">
        ‹ {tripName}
      </Link>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="label">Cars, transfers, tickets</span>
          <h1 className="page-title">Bookings</h1>
        </div>
        {canEdit && bookings.length > 0 && (
          <button type="button" onClick={() => setSheet({ mode: "new" })} className="rounded-sm bg-ink px-3 py-[7px] text-[13px] font-semibold text-white">
            + Add
          </button>
        )}
      </div>

      {bookings.length === 0 && (
        <div className="flex flex-col gap-3 rounded-card border-[1.5px] border-dashed border-line p-5 text-center">
          <span className="text-sm text-pretty text-muted">No bookings yet. Add car rentals, airport transfers, tickets and tours here.</span>
          {canEdit && (
            <button type="button" onClick={() => setSheet({ mode: "new" })} className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white">
              Add a booking
            </button>
          )}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.day} className="flex flex-col gap-2.5 lg:grid lg:grid-cols-[160px_minmax(0,1fr)] lg:items-start lg:gap-x-6">
          <span className="label lg:sticky lg:top-6 lg:pt-4">{g.label}</span>
          <div className="flex min-w-0 flex-col gap-2.5">
          {g.items.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              tripId={tripId}
              docs={docs.filter((d) => d.booking_id === b.id)}
              canEdit={canEdit}
              onEdit={() => setSheet({ mode: "edit", booking: b })}
            />
          ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-2.5 lg:grid lg:grid-cols-[160px_minmax(0,1fr)] lg:items-start lg:gap-x-6">
        <span className="label lg:pt-4">Trip documents</span>
        <div className="rounded-card border border-line bg-surface p-4">
          <DocumentList
            tripId={tripId}
            docs={tripDocs}
            canEdit={canEdit}
            title="Not tied to one booking"
            emptyHint="Insurance, visa letters, itineraries… PDFs and photos, up to 10 MB each."
          />
        </div>
      </section>

      {sheet && (
        <BookingSheet tripId={tripId} tripStart={tripStart} sheet={sheet} suggestedTz={suggestedTz} onClose={() => setSheet(null)} onDone={setToast} />
      )}
      {toast}
    </main>
  );
}

function BookingCard({ b, tripId, docs, canEdit, onEdit }: { b: Booking; tripId: string; docs: TripDocument[]; canEdit: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const kind = kindOf(b.kind);
  const sameDay = b.ends_at && dateAt(b.ends_at, b.tz) === dateAt(b.starts_at, b.tz);
  const when = b.ends_at
    ? sameDay
      ? `${timeAt(b.starts_at, b.tz)}–${timeAt(b.ends_at, b.tz)}`
      : `${timeAt(b.starts_at, b.tz)} → ${dayAt(b.ends_at, b.tz)} ${timeAt(b.ends_at, b.tz)}`
    : timeAt(b.starts_at, b.tz);
  const price = formatPrice(b.price, b.currency);

  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3.5 p-4 text-left transition-colors hover:bg-ink/[.02]">
        <span className="flex size-10 flex-none items-center justify-center rounded-sm bg-bg text-xl" aria-hidden>
          {kind.icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] leading-snug font-semibold [overflow-wrap:anywhere]">{b.title}</span>
          <span className="text-[13px] text-muted">
            <span className="font-mono">{when}</span>
            {b.provider ? ` · ${b.provider}` : ""}
            {docs.length ? ` · ${docs.length} file${docs.length === 1 ? "" : "s"}` : ""}
          </span>
        </span>
        <span className="flex-none pt-1 font-mono text-xl text-muted" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3.5 border-t border-line px-4 pt-3.5 pb-4">
          {(b.location || b.location_end || b.ref || price) && (
            <dl className="flex flex-col gap-2 text-[13px]">
              {b.location && <Row label={b.kind === "car" || b.kind === "transfer" ? "Pickup" : "Where"}>{b.location}</Row>}
              {b.location_end && <Row label="Drop-off">{b.location_end}</Row>}
              {b.ref && (
                <Row label="Reference">
                  <Masked value={b.ref} />
                </Row>
              )}
              {price && <Row label="Price">{price}</Row>}
            </dl>
          )}
          {b.url && (
            <a href={b.url} target="_blank" rel="noopener noreferrer" className="flex justify-center rounded-sm border border-line bg-bg p-3 text-sm font-semibold">
              Open booking ↗
            </a>
          )}
          {b.notes && <LinkedText text={b.notes} className="text-[13px] leading-normal text-muted" />}
          <DocumentList tripId={tripId} parent={{ booking_id: b.id }} docs={docs} canEdit={canEdit} />
          {canEdit && (
            <button type="button" onClick={onEdit} className="py-1 text-[13px] font-semibold">
              Edit booking
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex-none text-muted">{label}</dt>
      <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function BookingSheet({
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
  const b = sheet.mode === "edit" ? sheet.booking : null;
  const deviceTz = useDeviceTz();
  const [kind, setKind] = useState<BookingKind>(b?.kind ?? "car");
  const [tz, setTz] = useState(b?.tz ?? suggestedTz ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const twoPlaces = kind === "car" || kind === "transfer";

  function submit(fd: FormData) {
    setError(null);
    fd.set("kind", kind);
    start(async () => {
      const res = await saveBooking(tripId, b?.id ?? null, fd).catch(() => OFFLINE);
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone(b ? "Booking saved" : "Booking added");
      }
    });
  }

  function remove() {
    if (!b) return;
    start(async () => {
      const res = await deleteBooking(tripId, b.id).catch(() => OFFLINE);
      if (res.error) setError(res.error);
      else {
        onClose();
        onDone("Booking removed");
      }
    });
  }

  return (
    <SheetForm title={b ? "Edit booking" : "Add booking"} onClose={onClose} onSubmit={submit}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type">
        {BOOKING_KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            onClick={() => setKind(k.key)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${kind === k.key ? "border-ink bg-ink text-white" : "border-line bg-surface"}`}
          >
            {k.icon} {k.label}
          </button>
        ))}
      </div>
      <Field label="Name">
        <input name="title" required maxLength={120} defaultValue={b?.title ?? ""} placeholder={kind === "car" ? "Car rental (Tokyo → Fuji)" : "Shibuya Sky"} className={inputCls} />
      </Field>
      <Field label="Company (optional)">
        <input name="provider" maxLength={80} defaultValue={b?.provider ?? ""} placeholder="Easygo, Klook…" className={inputCls} />
      </Field>
      <Field label="Timezone">
        <TzSelect name="tz" value={tz || deviceTz} onChange={setTz} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={twoPlaces ? "Pickup (local)" : "Starts (local)"}>
          <input
            name="start_local"
            type="datetime-local"
            required
            defaultValue={b ? utcToZonedInput(b.starts_at, b.tz) : tripStart ? `${tripStart}T09:00` : ""}
            className={`${inputCls} font-mono text-sm`}
          />
        </Field>
        <Field label={twoPlaces ? "Return (optional)" : "Ends (optional)"}>
          <input name="end_local" type="datetime-local" defaultValue={b?.ends_at ? utcToZonedInput(b.ends_at, b.tz) : ""} className={`${inputCls} font-mono text-sm`} />
        </Field>
      </div>
      <Field label={twoPlaces ? "Pickup place (optional)" : "Where (optional)"}>
        <input name="location" maxLength={200} defaultValue={b?.location ?? ""} className={inputCls} />
      </Field>
      {twoPlaces && (
        <Field label="Drop-off place (optional)">
          <input name="location_end" maxLength={200} defaultValue={b?.location_end ?? ""} className={inputCls} />
        </Field>
      )}
      <div className="grid grid-cols-[1.2fr_1fr_0.9fr] gap-2.5">
        <Field label="Reference (optional)">
          <input name="ref" maxLength={60} defaultValue={b?.ref ?? ""} autoComplete="off" className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Price (optional)">
          <input name="price" inputMode="decimal" defaultValue={b?.price ?? ""} className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Currency">
          <select name="currency" defaultValue={b?.currency ?? "JPY"} className={inputCls}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Booking link (optional)">
        <input name="url" type="url" maxLength={2000} defaultValue={b?.url ?? ""} placeholder="https://…" className={inputCls} />
      </Field>
      <Field label="Notes (optional)">
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={b?.notes ?? ""} className={`${inputCls} resize-none`} />
      </Field>
      {!b && <p className="text-xs text-muted">After saving, open the booking to attach its PDF or screenshot.</p>}
      <SheetActions pending={pending} error={error} saveLabel={b ? "Save" : "Add booking"} onDelete={b ? remove : undefined} />
    </SheetForm>
  );
}
