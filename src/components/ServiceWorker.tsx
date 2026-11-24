"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js. Off in `next dev` (it fights hot reload) unless
 * NEXT_PUBLIC_SW_IN_DEV=1. Optionally warms a list of paths so they're saved for offline.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SW_IN_DEV !== "1") {
      // A worker left over from a production run on this origin would serve stale dev files.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      caches.keys().then((keys) => keys.filter((k) => k.startsWith("tb-")).forEach((k) => caches.delete(k)));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

/** Ask the service worker to save these pages (the trip's other tabs) while online. */
export function WarmOffline({ paths }: { paths: string[] }) {
  const key = paths.join("|");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !navigator.onLine) return;
    let cancelled = false;
    // Wait a moment so warming never competes with the page the person is looking at.
    const t = setTimeout(async () => {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!cancelled) reg?.active?.postMessage({ type: "warm", urls: key.split("|") });
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key]);
  return null;
}

/** Drop every saved page (e.g. after leaving a trip on a shared device). */
export async function clearOfflinePages() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.active?.postMessage({ type: "clear" });
}
