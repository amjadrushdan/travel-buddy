"use client";

import { useEffect, useState, useTransition } from "react";
import { useOnline } from "@/components/ui";
import { removeMember } from "./actions";

/** Owner-only "Remove" with a second tap to confirm. The database also enforces owner-only. */
export function RemoveMemberButton({ tripId, userId, name }: { tripId: string; userId: string; name: string }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const online = useOnline();

  // Un-arm after a few seconds so a stray tap later doesn't remove anyone.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  function onClick() {
    if (!armed) {
      setError(null);
      setArmed(true);
      return;
    }
    start(async () => {
      const res = await removeMember(tripId, userId).catch(() => ({ error: "Couldn't reach the server. Are you offline?" }));
      if (res.error) {
        setError(res.error);
        setArmed(false);
      }
    });
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || !online}
        aria-label={armed ? `Confirm removing ${name}` : `Remove ${name}`}
        className={`rounded-sm px-2 py-1 text-[13px] font-semibold ${armed ? "bg-bad text-white" : "text-bad"}`}
      >
        {pending ? "Removing…" : armed ? "Tap to confirm" : "Remove"}
      </button>
      {error && (
        <span role="alert" className="max-w-[160px] text-right text-[11px] text-bad">
          {error}
        </span>
      )}
    </span>
  );
}
