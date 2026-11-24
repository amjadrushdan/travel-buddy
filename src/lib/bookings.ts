// Shared booking + document types (server + browser).

export type BookingKind = "car" | "transfer" | "ticket" | "activity" | "other";

export const BOOKING_KINDS: { key: BookingKind; label: string; icon: string }[] = [
  { key: "car", label: "Car rental", icon: "🚗" },
  { key: "transfer", label: "Transfer", icon: "🚐" },
  { key: "ticket", label: "Ticket", icon: "🎟️" },
  { key: "activity", label: "Activity", icon: "📍" },
  { key: "other", label: "Other", icon: "📄" },
];

export const kindOf = (k: string) => BOOKING_KINDS.find((x) => x.key === k) ?? BOOKING_KINDS[4];

export type Booking = {
  id: string;
  kind: BookingKind;
  title: string;
  provider: string | null;
  starts_at: string;
  ends_at: string | null;
  tz: string;
  location: string | null;
  location_end: string | null;
  ref: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  notes: string | null;
};

export const BOOKING_COLUMNS = "id, kind, title, provider, starts_at, ends_at, tz, location, location_end, ref, price, currency, url, notes";

export type TripDocument = {
  id: string;
  flight_id: string | null;
  stay_id: string | null;
  booking_id: string | null;
  name: string;
  mime: string;
  size: number;
  created_at: string;
};

export const DOCUMENT_COLUMNS = "id, flight_id, stay_id, booking_id, name, mime, size, created_at";

/** Limits; the database and storage bucket enforce the same. */
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
export const DOC_TYPES: Record<string, "pdf" | "jpg" | "png" | "webp"> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatPrice(price: number | null, currency: string | null): string | null {
  if (price == null) return null;
  const c = currency || "";
  const digits = c === "JPY" || c === "KRW" ? 0 : 2;
  return `${c === "JPY" ? "¥" : c === "MYR" ? "RM" : c ? c + " " : ""}${price.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
