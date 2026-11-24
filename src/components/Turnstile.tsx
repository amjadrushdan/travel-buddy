"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Cloudflare Turnstile bot check for anonymous sign-ins (Supabase Auth "CAPTCHA protection").
// Off when NEXT_PUBLIC_TURNSTILE_SITE_KEY is empty, so the app works before it's set up.
// Usually invisible; it only shows a checkbox when Cloudflare isn't sure you're a person.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the bot check. Check your connection."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Returns the widget to render, the current token (undefined until solved; always undefined
 * when Turnstile is off), whether a token is still needed, and reset() to call after a
 * failed sign-in (each token works once).
 */
export function useTurnstile() {
  const enabled = SITE_KEY !== "";
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !box.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          callback: (t: string) => {
            setToken(t);
            setError(null);
          },
          "expired-callback": () => setToken(undefined),
          "error-callback": () => {
            setToken(undefined);
            setError("The bot check failed. Try again.");
          },
        });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [enabled]);

  const reset = useCallback(() => {
    setToken(undefined);
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, []);

  const node = enabled ? (
    <div className="flex flex-col items-center gap-1">
      <div ref={box} />
      {error && <span className="text-center text-xs text-bad">{error}</span>}
    </div>
  ) : null;

  return { node, token, waiting: enabled && !token, reset };
}
