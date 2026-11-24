"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isTimezone, zonedToUtc } from "@/lib/time";

export type ActionResult = { error?: string };

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate(tripId: string) {
  revalidatePath(`/trips/${tripId}`, "layout");
}

function friendly(error: { code?: string; message: string }) {
  if (error.code === "42501") return "Only owners and editors can change this.";
  if (error.code === "23514" || error.code === "22023") return "Some details don't look right. Check the form.";
  return error.message;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Wall-clock time at a place → ISO instant, or an error message. */
function toInstant(local: string, tz: string, what: string): { iso: string } | { error: string } {
  if (!LOCAL_RE.test(local)) return { error: `Pick the ${what} date and time.` };
  if (!isTimezone(tz)) return { error: `Pick the ${what} timezone.` };
  return { iso: zonedToUtc(local, tz).toISOString() };
}

// ---------------------------------------------------------------- flights

function readFlight(fd: FormData) {
  const flightNo = str(fd, "flight_no").toUpperCase().replace(/\s+/g, " ");
  const from = str(fd, "from_airport").toUpperCase();
  const to = str(fd, "to_airport").toUpperCase();
  const airline = str(fd, "airline");
  const pnr = str(fd, "pnr").toUpperCase();
  const passengers = fd.getAll("passengers").map(String).filter((p) => UUID_RE.test(p));

  if (!/^[A-Z0-9]{2,3} ?[0-9]{1,4}[A-Z]?$/.test(flightNo)) return { error: "Flight number looks like MH 88." } as const;
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return { error: "Airports are 3-letter codes, like KUL." } as const;
  if (airline.length > 60) return { error: "Keep the airline under 60 characters." } as const;
  if (pnr && !/^[A-Z0-9]{5,8}$/.test(pnr)) return { error: "Booking code (PNR) is 5–8 letters or digits." } as const;

  const dep = toInstant(str(fd, "depart_local"), str(fd, "depart_tz"), "departure");
  if ("error" in dep) return dep;
  const arr = toInstant(str(fd, "arrive_local"), str(fd, "arrive_tz"), "arrival");
  if ("error" in arr) return arr;
  const mins = (Date.parse(arr.iso) - Date.parse(dep.iso)) / 60_000;
  if (mins <= 0) return { error: "Arrival must be after departure (check the timezones)." } as const;
  if (mins >= 30 * 60) return { error: "That flight is over 30 hours. Check the dates." } as const;

  return {
    values: {
      airline: airline || null,
      flight_no: flightNo,
      from_airport: from,
      to_airport: to,
      depart_at: dep.iso,
      depart_tz: str(fd, "depart_tz"),
      arrive_at: arr.iso,
      arrive_tz: str(fd, "arrive_tz"),
      pnr: pnr || null,
      passengers,
    },
  } as const;
}

export async function saveFlight(tripId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  const parsed = readFlight(fd);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { error, count } = id
    ? await supabase.from("flights").update(parsed.values, { count: "exact" }).eq("id", id).eq("trip_id", tripId)
    : await supabase.from("flights").insert({ trip_id: tripId, ...parsed.values }, { count: "exact" });
  if (error) return { error: friendly(error) };
  if (!count) return { error: "You can't edit flights on this trip." };
  revalidate(tripId);
  return {};
}

export async function deleteFlight(tripId: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  await removeDocFiles(supabase, "flight_id", id, tripId);
  const { error, count } = await supabase.from("flights").delete({ count: "exact" }).eq("id", id).eq("trip_id", tripId);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "You can't delete this flight." };
  revalidate(tripId);
  return {};
}

// ---------------------------------------------------------------- stays

function readStay(fd: FormData) {
  const name = str(fd, "name");
  const address = str(fd, "address");
  const mapUrl = str(fd, "map_url");
  const ref = str(fd, "booking_ref");
  const notes = str(fd, "notes");
  const tz = str(fd, "tz");
  const platform = str(fd, "platform");
  const host = str(fd, "host");
  const addressLocal = str(fd, "address_local");
  const bookingUrl = str(fd, "booking_url");
  const checkinInfo = str(fd, "checkin_info");
  const doorCode = str(fd, "door_code");
  const wifi = str(fd, "wifi");
  const coords = readCoords(str(fd, "lat"), str(fd, "lng"), mapUrl);
  if ("error" in coords) return coords;

  if (platform && !["airbnb", "booking", "agoda", "hotel", "other"].includes(platform))
    return { error: "Pick where it's booked." } as const;
  if (host.length > 80) return { error: "Keep the host under 80 characters." } as const;
  if (addressLocal.length > 300) return { error: "Keep the local address under 300 characters." } as const;
  if (bookingUrl && (!bookingUrl.startsWith("https://") || bookingUrl.length > 2000))
    return { error: "The booking link must start with https://" } as const;
  if (checkinInfo.length > 1000) return { error: "Keep check-in info under 1000 characters." } as const;
  if (doorCode.length > 40) return { error: "Keep the door code under 40 characters." } as const;
  if (wifi.length > 120) return { error: "Keep the Wi-Fi details under 120 characters." } as const;

  if (!name) return { error: "Give the stay a name." } as const;
  if (name.length > 120) return { error: "Keep the name under 120 characters." } as const;
  if (address.length > 300) return { error: "Keep the address under 300 characters." } as const;
  if (ref.length > 40) return { error: "Keep the booking ref under 40 characters." } as const;
  if (notes.length > 2000) return { error: "Keep notes under 2000 characters." } as const;
  if (mapUrl && (!mapUrl.startsWith("https://") || mapUrl.length > 2000))
    return { error: "The map link must start with https://" } as const;

  const inAt = toInstant(str(fd, "check_in_local"), tz, "check-in");
  if ("error" in inAt) return inAt;
  const outAt = toInstant(str(fd, "check_out_local"), tz, "check-out");
  if ("error" in outAt) return outAt;
  if (Date.parse(outAt.iso) <= Date.parse(inAt.iso)) return { error: "Check-out must be after check-in." } as const;

  return {
    values: {
      name,
      address: address || null,
      map_url: mapUrl || null,
      check_in: inAt.iso,
      check_out: outAt.iso,
      tz,
      booking_ref: ref || null,
      notes: notes || null,
      platform: platform || null,
      host: host || null,
      address_local: addressLocal || null,
      booking_url: bookingUrl || null,
      checkin_info: checkinInfo || null,
      door_code: doorCode || null,
      wifi: wifi || null,
      lat: coords.lat,
      lng: coords.lng,
    },
  } as const;
}

// ---------------------------------------------------------------- stay to-dos

export async function addStayTodo(tripId: string, stayId: string, text: string): Promise<ActionResult> {
  const t = text.trim();
  if (!t) return { error: "Type the to-do first." };
  if (t.length > 300) return { error: "Keep it under 300 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("stay_todos").insert({ trip_id: tripId, stay_id: stayId, text: t });
  if (error) return { error: friendly(error) };
  revalidatePath(`/trips/${tripId}/stay`);
  return {};
}

export async function setStayTodoDone(tripId: string, todoId: string, done: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("stay_todos").update({ done }, { count: "exact" }).eq("id", todoId).eq("trip_id", tripId);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "Only owners and editors can tick to-dos." };
  revalidatePath(`/trips/${tripId}/stay`);
  return {};
}

export async function deleteStayTodo(tripId: string, todoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("stay_todos").delete({ count: "exact" }).eq("id", todoId).eq("trip_id", tripId);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "Only owners and editors can remove to-dos." };
  revalidatePath(`/trips/${tripId}/stay`);
  return {};
}

export async function saveStay(tripId: string, id: string | null, fd: FormData): Promise<ActionResult> {
  const parsed = readStay(fd);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { error, count } = id
    ? await supabase.from("stays").update(parsed.values, { count: "exact" }).eq("id", id).eq("trip_id", tripId)
    : await supabase.from("stays").insert({ trip_id: tripId, ...parsed.values }, { count: "exact" });
  if (error) return { error: friendly(error) };
  if (!count) return { error: "You can't edit stays on this trip." };
  revalidate(tripId);
  return {};
}

export async function deleteStay(tripId: string, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  await removeDocFiles(supabase, "stay_id", id, tripId);
  const { error, count } = await supabase.from("stays").delete({ count: "exact" }).eq("id", id).eq("trip_id", tripId);
  if (error) return { error: friendly(error) };
  if (!count) return { error: "You can't delete this stay." };
  revalidate(tripId);
  return {};
}

// ---------------------------------------------------------------- stay location

/**
 * Coordinates from the form, else from a pasted Google Maps link that contains them
 * (".../@35.68,139.83,17z" or "?q=35.68,139.83"). Both or neither.
 */
function readCoords(latRaw: string, lngRaw: string, mapUrl: string): { lat: number | null; lng: number | null } | { error: string } {
  let lat = latRaw ? Number(latRaw) : NaN;
  let lng = lngRaw ? Number(lngRaw) : NaN;
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    const m = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(mapUrl) ?? /[?&](?:q|query|ll)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(mapUrl);
    if (!m) return { lat: null, lng: null };
    lat = Number(m[1]);
    lng = Number(m[2]);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: "That location isn't valid." };
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}

/**
 * Look up an address on OpenStreetMap (Nominatim), only when the person taps "Find on map".
 * Used for prayer times and weather; city-level accuracy is plenty.
 */
export async function findLocation(query: string): Promise<{ lat?: number; lng?: number; label?: string; error?: string }> {
  const q = query.trim();
  if (q.length < 3) return { error: "Type the address first." };
  if (q.length > 300) return { error: "That address is too long." };
  // Try the full address, then drop the first part (building / street number) if nothing matches.
  const attempts = [q, q.split(",").slice(1).join(",").trim()].filter((a) => a.length >= 3);
  for (const attempt of attempts) {
    try {
      const params = new URLSearchParams({ q: attempt, format: "json", limit: "1" });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": "TravelBuddy/1.0 (group trip planner)", "Accept-Language": "en" },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      if (hits[0]) {
        return {
          lat: Math.round(Number(hits[0].lat) * 1e5) / 1e5,
          lng: Math.round(Number(hits[0].lon) * 1e5) / 1e5,
          label: hits[0].display_name.split(",").slice(0, 3).join(",").trim(),
        };
      }
    } catch {
      /* try the next form of the address */
    }
  }
  return { error: "Couldn't find that address. Try a shorter one (area, city)." };
}

/** Delete the storage files of documents attached to a flight/stay (their rows cascade). */
async function removeDocFiles(supabase: Awaited<ReturnType<typeof createClient>>, column: "flight_id" | "stay_id", id: string, tripId: string) {
  const { data } = await supabase.from("documents").select("path").eq(column, id).eq("trip_id", tripId);
  if (data?.length) await supabase.storage.from("trip-docs").remove(data.map((d) => d.path as string));
}
