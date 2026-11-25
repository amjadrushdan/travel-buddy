import Link from "next/link";
import { CurrencyConverter } from "@/components/CurrencyConverter";

/** Quiet list of secondary places on Home: bookings & documents, and the currency converter. */
export function TripLinks({ tripId, bookings, documents }: { tripId: string; bookings: number; documents: number }) {
  const summary = [
    bookings ? `${bookings} ${bookings === 1 ? "booking" : "bookings"}` : null,
    documents ? `${documents} ${documents === 1 ? "document" : "documents"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      <Link href={`/trips/${tripId}/bookings`} className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-ink/[.03]">
        <span className="flex size-9 flex-none items-center justify-center rounded-sm bg-bg text-lg" aria-hidden>
          🎟️
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold">Bookings & documents</span>
          <span className="text-[13px] text-muted">{summary || "Car rentals, transfers, tickets, PDFs"}</span>
        </span>
        <span className="text-muted" aria-hidden>
          ›
        </span>
      </Link>
      <CurrencyConverter />
    </div>
  );
}
