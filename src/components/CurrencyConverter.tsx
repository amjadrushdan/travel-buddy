"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EscClose } from "@/components/ui";

type Rates = { base: "MYR"; updated: number; rates: Record<string, number> };

const STORE = "tb-rates";
const PICK = "tb-rates-currency";
const CHOICES = [
  { code: "JPY", symbol: "¥", label: "Yen" },
  { code: "THB", symbol: "฿", label: "Baht" },
  { code: "SGD", symbol: "S$", label: "SGD" },
  { code: "USD", symbol: "$", label: "USD" },
  { code: "KRW", symbol: "₩", label: "Won" },
];
const QUICK: Record<string, number[]> = { JPY: [1000, 5000, 10000], THB: [100, 500, 1000], KRW: [10000, 50000], SGD: [10, 50], USD: [10, 50] };

function readStore<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

const fmt = (n: number, digits: number) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : "");

/** "Currency" row on Home that opens a simple two-way converter (works offline with the last rates). */
export function CurrencyConverter() {
  const [rates, setRates] = useState<Rates | null>(null);
  const [code, setCode] = useState("JPY");
  const [open, setOpen] = useState(false);
  const [foreign, setForeign] = useState("1000");
  const [myr, setMyr] = useState("");

  useEffect(() => {
    const saved = readStore<Rates>(STORE);
    if (saved) setRates(saved);
    const pick = readStore<string>(PICK);
    if (pick) setCode(pick);
    fetch("/api/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Rates | null) => {
        if (j?.rates) {
          setRates(j);
          try {
            localStorage.setItem(STORE, JSON.stringify(j));
          } catch {
            /* private mode */
          }
        }
      })
      .catch(() => {
        /* offline: keep saved rates */
      });
  }, []);

  const rate = rates?.rates[code]; // units of `code` per 1 MYR
  const choice = CHOICES.find((c) => c.code === code)!;
  const digits = code === "JPY" || code === "KRW" ? 0 : 2;

  // Keep the RM side in step with the foreign amount.
  useEffect(() => {
    if (!rate) return;
    const n = Number(foreign.replace(/,/g, ""));
    setMyr(foreign === "" || !Number.isFinite(n) ? "" : fmt(n / rate, 2));
  }, [rate]); // eslint-disable-line react-hooks/exhaustive-deps

  function onForeign(v: string) {
    setForeign(v);
    const n = Number(v.replace(/,/g, ""));
    setMyr(v === "" || !rate || !Number.isFinite(n) ? "" : fmt(n / rate, 2));
  }
  function onMyr(v: string) {
    setMyr(v);
    const n = Number(v.replace(/,/g, ""));
    setForeign(v === "" || !rate || !Number.isFinite(n) ? "" : fmt(n * rate, digits));
  }
  function pick(c: string) {
    setCode(c);
    // Keep the ringgit amount and show it in the new currency.
    const r = rates?.rates[c];
    const n = Number(myr.replace(/,/g, ""));
    if (r && myr !== "" && Number.isFinite(n)) setForeign(fmt(n * r, c === "JPY" || c === "KRW" ? 0 : 2));
    try {
      localStorage.setItem(PICK, JSON.stringify(c));
    } catch {
      /* ignore */
    }
  }

  const rateText = rate ? `RM1 = ${choice.symbol}${fmt(rate, digits === 0 ? 1 : 3)}` : "Rates load when online";
  const input = "w-full min-w-0 bg-transparent text-[28px] font-semibold tabular-nums outline-none";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left">
        <span className="flex size-9 flex-none items-center justify-center rounded-sm bg-bg text-lg" aria-hidden>
          💱
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold">Currency</span>
          <span className="text-[13px] text-muted">{rateText}</span>
        </span>
        <span className="text-muted" aria-hidden>
          ›
        </span>
      </button>

      {/* Portal: the row sits inside Home's card stack, which would otherwise draw over the backdrop. */}
      {open &&
        createPortal(
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/35 lg:items-center lg:p-6" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Currency converter"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[480px] flex-col gap-4 rounded-t-[22px] bg-bg lg:max-h-[88dvh] lg:max-w-[520px] lg:overflow-y-auto lg:rounded-[22px] lg:pb-6 lg:shadow-[0_24px_60px_rgba(0,0,0,.25)] px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto h-1 w-10 lg:hidden rounded-full bg-line" />
            <EscClose onClose={() => setOpen(false)} />
            <span className="text-xl font-bold">Currency</span>

            <div className="flex gap-1.5" role="tablist" aria-label="Currency">
              {CHOICES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="tab"
                  aria-selected={code === c.code}
                  onClick={() => pick(c.code)}
                  className={`flex-1 rounded-full border px-2 py-1.5 text-[13px] font-semibold ${
                    code === c.code ? "border-ink bg-ink text-white" : "border-line bg-surface"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              <label className="flex items-center gap-3 px-4 py-3">
                <span className="w-12 flex-none text-[15px] font-semibold text-muted">{choice.symbol}</span>
                <input inputMode="decimal" value={foreign} onChange={(e) => onForeign(e.target.value)} className={input} aria-label={choice.label} />
                <span className="flex-none font-mono text-xs text-muted">{code}</span>
              </label>
              <label className="flex items-center gap-3 px-4 py-3">
                <span className="w-12 flex-none text-[15px] font-semibold text-muted">RM</span>
                <input inputMode="decimal" value={myr} onChange={(e) => onMyr(e.target.value)} className={input} aria-label="Ringgit" />
                <span className="flex-none font-mono text-xs text-muted">MYR</span>
              </label>
            </div>

            {QUICK[code] && (
              <div className="flex gap-1.5">
                {QUICK[code].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onForeign(String(q))}
                    className="flex-1 rounded-sm border border-line bg-surface py-2 font-mono text-[13px] font-semibold"
                  >
                    {choice.symbol}
                    {q.toLocaleString("en-US")}
                  </button>
                ))}
              </div>
            )}

            <span className="text-xs text-muted">
              {rates
                ? `${rateText} · updated ${new Date(rates.updated).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · rates by ExchangeRate-API · cards and money changers add their own margin`
                : "Open once while online to load rates; they're then saved for offline use."}
            </span>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
