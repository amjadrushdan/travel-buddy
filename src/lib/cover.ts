// Trip cover photo limits and paths (shared by server and browser).
// The database enforces the same limits (see migration 20261125000010_trip_covers.sql).

export const COVER_BUCKET = "trip-covers";
/** Biggest photo we'll try to read from the phone, before shrinking. */
export const COVER_MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
/** Longest edge after shrinking. */
export const COVER_MAX_EDGE = 1600;
/** Upload limit, same as the storage bucket's file_size_limit. */
export const COVER_MAX_BYTES = 1024 * 1024;
/** Uploads allowed per trip per 24h (enforced by the database). */
export const COVER_DAILY_LIMIT = 10;

const PATH_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/cover-(\d{10,16})\.(webp|jpg)$/;

export function newCoverPath(tripId: string, type: "image/webp" | "image/jpeg"): string {
  return `${tripId}/cover-${Date.now()}.${type === "image/webp" ? "webp" : "jpg"}`;
}

/** True when `path` is a cover file inside this trip's own folder. */
export function isCoverPathFor(tripId: string, path: string): boolean {
  const m = PATH_RE.exec(path);
  return !!m && m[1] === tripId;
}

/** Same-origin URL for the photo; the version changes on every new upload. */
export function coverSrc(tripId: string, coverUrl: string | null): string | null {
  const m = coverUrl ? PATH_RE.exec(coverUrl) : null;
  return m ? `/trips/${tripId}/cover?v=${m[2]}` : null;
}
