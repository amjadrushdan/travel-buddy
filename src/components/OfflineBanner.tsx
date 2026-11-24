"use client";

import { useEffect, useState } from "react";
import { useOnline } from "@/components/ui";

/**
 * "Offline · showing trip saved at HH:MM" pill. The saved time comes from the
 * <meta name="tb-rendered-at"> the server stamps into each trip page: a page served
 * from the offline cache still carries the time it was rendered.
 */
export function OfflineBanner() {
  const online = useOnline();
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (online) return;
    const iso = document.querySelector<HTMLMetaElement>('meta[name="tb-rendered-at"]')?.content;
    if (!iso) return setSaved(null);
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    const today = new Date().toDateString() === d.toDateString();
    setSaved(`${today ? "" : `${d.getDate()}/${d.getMonth() + 1} `}${p(d.getHours())}:${p(d.getMinutes())}`);
  }, [online]);

  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-30 flex justify-center px-4 pt-[max(8px,env(safe-area-inset-top))] pb-1">
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] shadow-sm">
        <span className="size-2 flex-none rounded-full bg-warn" aria-hidden />
        <span>{saved ? `Offline · showing trip saved at ${saved}` : "Offline · showing saved copy"}</span>
        <button type="button" onClick={() => location.reload()} className="font-semibold underline">
          Reconnect
        </button>
      </div>
    </div>
  );
}
