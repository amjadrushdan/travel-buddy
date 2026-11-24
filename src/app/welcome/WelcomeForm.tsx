"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTurnstile } from "@/components/Turnstile";
import { safeNext } from "@/lib/format";

export function WelcomeForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/trips/new");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bot = useTurnstile();

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || bot.waiting) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInAnonymously({
      options: { data: { name: trimmed }, captchaToken: bot.token },
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      bot.reset(); // each bot-check token works once
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={start} className="mt-auto flex flex-col gap-2.5">
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
      {bot.node}
      <button
        type="submit"
        disabled={busy || !name.trim() || bot.waiting}
        className="w-full rounded-sm bg-ink p-[15px] text-base font-semibold text-white"
      >
        {busy ? "Starting…" : bot.waiting ? "Checking you're not a bot…" : "Start a trip"}
      </button>
      <p className="text-center text-xs text-pretty text-muted">
        Got an invite link? Open it instead to join your group&apos;s trip.
      </p>
      {error && (
        <p role="alert" className="text-center text-[13px] text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
