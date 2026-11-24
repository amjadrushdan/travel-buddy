"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  token: string;
  tripId: string;
  tripName: string;
  defaultName: string;
  hasSession: boolean;
  alreadyMember: boolean;
};

export function JoinForm({ token, tripId, tripName, defaultName, hasSession, alreadyMember }: Props) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyMember) {
    return (
      <div className="mt-auto flex flex-col gap-2.5">
        <p className="text-center text-sm text-muted">You&apos;re already in this trip.</p>
        <button
          type="button"
          onClick={() => router.push(`/trips/${tripId}`)}
          className="w-full rounded-sm bg-ink p-[15px] text-base font-semibold text-white"
        >
          Open {tripName}
        </button>
      </div>
    );
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();

    if (!hasSession) {
      const { error } = await supabase.auth.signInAnonymously({ options: { data: { name: trimmed } } });
      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
    }

    const { data, error } = await supabase.rpc("redeem_invite", { p_token: token, p_name: trimmed });
    if (error || !data) {
      setBusy(false);
      setError(error?.message ? capitalise(error.message) : "Couldn't join. Try again.");
      return;
    }
    router.replace(`/trips/${data}?joined=${encodeURIComponent(trimmed)}`);
    router.refresh();
  }

  return (
    <form onSubmit={join} className="mt-auto flex flex-col gap-2.5">
      <label htmlFor="name" className="text-xs text-muted">
        Your name
      </label>
      <input
        id="name"
        required
        maxLength={40}
        autoComplete="given-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-sm border border-line bg-surface p-3.5 text-base outline-none focus:border-ink"
      />
      <button type="submit" disabled={busy || !name.trim()} className="w-full rounded-sm bg-ink p-[15px] text-base font-semibold text-white">
        {busy ? "Joining…" : "Join trip"}
      </button>
      <span className="text-center text-xs text-pretty text-muted">
        No account needed. This phone remembers you.
      </span>
      {error && (
        <p role="alert" className="text-center text-[13px] text-bad">
          {error}
        </p>
      )}
    </form>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
