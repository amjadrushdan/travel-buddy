"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isTimezone, zonedToUtc } from "@/lib/time";
import { DOC_MAX_BYTES, DOC_TYPES } from "@/lib/bookings";

export type ActionResult = { error?: string };

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const KINDS = ["car", "transfer", "ticket", "activity", "other"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function friendly(error: { code?: string; message: string }) {
  if (error.code === "42501") return "Only owners and editors can change bookings and documents.";
  if (error.code === "23514" || error.code === "22023") return "Some details don't look right. Check the form.";
  return error.message;
}

function revalidate(tripId: string) {
  revalidatePath(`/trips/${tripId}`, "layout");
}

// ---------------------------------------------------------------- bookings

function readBooking(fd: FormData) {
  const kind = str(fd, "kind") || "other";
  const title = str(fd, "title");
  const provider = str(fd, "provider");
  const tz = str(fd, "tz");
  const startLocal = str(fd, "start_local");
  const endLocal = str(fd, "end_local");
  const location = str(fd, "location");
  const locationEnd = str(fd, "location_end");
  const ref = str(fd, "ref");
  const priceRaw = str(fd, "price").replace(/,/g, "");
  const currency = str(fd, "currency").toUpperCase();
  const url = str(fd, "url");
  const notes = str(fd, "notes");

  if (!KINDS.includes(kind)) return { error: "Pick a type." } as const;
  if (!title) return { error: "Give the booking a name." } as const;
  if (title.length > 120) return { error: "Keep the name under 120 characters." } as const;
  if (provider.length > 80) return { error: "Keep the company under 80 characters." } as const;
  if (!isTimezone(tz)) return { error: "Pick the timezone." } as const;
  if (!LOCAL_RE.test(startLocal)) return { error: "Pick the date and time." } as const;
  if (endLocal && !LOCAL_RE.test(endLocal)) return { error: "Check the end date and time." } as const;
  if (location.length > 200 || locationEnd.length > 200) return { error: "Keep places under 200 characters." } as const;
  if (ref.length > 60) return { error: "Keep the reference under 60 characters." } as const;
  const price = priceRaw ? Number(priceRaw) : null;
  if (price != null && (!Number.isFinite(price) || price < 0 || price > 1e9)) return { error: "Check the price." } as const;
  if (currency && !/^[A-Z]{3}$/.test(currency)) return { error: "Pick a currency." } as const;
  if (url && (!url.startsWith("https://") || url.length > 2000)) return { error: "The link must start with https://" } as const;
  if (notes.length > 2000) return { error: "Keep notes under 2000 characters." } as const;

  const startsAt = zonedToUtc(startLocal, tz).toISOString();
  const endsAt = endLocal ? zonedToUtc(endLocal, tz).toISOString() : null;
  if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) return { error: "The end can't be before the start." } as const;

  return {
    values: {
      kind,
      title,
      provider: provider || null,
      tz,
      starts_at: startsAt,
      ends_at: endsAt,
      location: location || null,
      location_end: locationEnd || null,
      ref: ref || null,
      price,
      currency: price != null ? currency || null : null,
      url: url || null,
      notes: notes || null,
    },
  } as const;
}

export async function saveBooking(tripId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  const parsed = readBooking(fd);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { error, count } = id
    ? await supabase.from("bookings").update(parsed.values, { count: "exact" }).eq("id", id).eq("trip_id", tripId)
    : await supabase.from("bookings").insert({ trip_id: tripId, ...parsed.values }, { count: "exact" });
  if (error) return { error: friendly(error) };
  if (!count) return { error: "Only owners and editors can change bookings." };
  revalidate(tripId);
  return {};
}

export async function deleteBooking(tripId: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Remove the booking's files from storage first (the rows go with the booking).
  const { data: docs } = await supabase.from("documents").select("path").eq("booking_id", id).eq("trip_id", tripId);
  const { error, count } = await supabase.from("bookings").delete({ count: "exact" }).eq("id", id).eq("trip_id", tripId);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "Only owners and editors can delete bookings." };
  if (docs?.length) await supabase.storage.from("trip-docs").remove(docs.map((d) => d.path as string));
  revalidate(tripId);
  return {};
}

// ---------------------------------------------------------------- documents

export type DocParent = { flight_id?: string; stay_id?: string; booking_id?: string };

/** Record a file the browser already uploaded to trip-docs (the DB checks path + parent). */
export async function createDocument(
  tripId: string,
  parent: DocParent,
  file: { name: string; path: string; mime: string; size: number },
): Promise<ActionResult> {
  const supabase = await createClient();
  const name = file.name.trim().slice(0, 120) || "Document";
  const bad = !DOC_TYPES[file.mime] || file.size < 1 || file.size > DOC_MAX_BYTES || !file.path.startsWith(`${tripId}/`);
  if (bad) {
    await supabase.storage.from("trip-docs").remove([file.path]);
    return { error: "That file isn't allowed." };
  }
  const { error } = await supabase.from("documents").insert({
    trip_id: tripId,
    flight_id: parent.flight_id ?? null,
    stay_id: parent.stay_id ?? null,
    booking_id: parent.booking_id ?? null,
    name,
    path: file.path,
    mime: file.mime,
    size: file.size,
  });
  if (error) {
    await supabase.storage.from("trip-docs").remove([file.path]);
    return { error: friendly(error) };
  }
  revalidate(tripId);
  return {};
}

export async function deleteDocument(tripId: string, docId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("path").eq("id", docId).eq("trip_id", tripId).maybeSingle();
  if (!doc) return { error: "That document is already gone." };
  const { error, count } = await supabase.from("documents").delete({ count: "exact" }).eq("id", docId).eq("trip_id", tripId);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "Only owners and editors can delete documents." };
  await supabase.storage.from("trip-docs").remove([doc.path as string]);
  revalidate(tripId);
  return {};
}
