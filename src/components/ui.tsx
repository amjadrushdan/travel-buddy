"use client";

import { useEffect, useMemo, useState } from "react";
import { allTimezones, tzLabel } from "@/lib/time";

export const inputCls = "w-full rounded-sm border border-line bg-surface p-3 text-base outline-none focus:border-ink";

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Bottom sheet holding a form. Uses onSubmit (not `action`) so fields survive an error. */
export function SheetForm({
  title,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35" onClick={onClose}>
      <form
        role="dialog"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-3.5 overflow-y-auto rounded-t-[22px] bg-bg px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto h-1 w-10 flex-none rounded-full bg-line" />
        <span className="text-xl font-bold">{title}</span>
        {children}
      </form>
    </div>
  );
}

/** Save / delete buttons and the error line for a SheetForm. Delete needs a second tap. */
export function SheetActions({
  pending,
  error,
  saveLabel,
  onDelete,
}: {
  pending: boolean;
  error: string | null;
  saveLabel: string;
  onDelete?: () => void;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <>
      {error && (
        <p role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-sm bg-ink p-[15px] text-base font-semibold text-white">
        {pending ? "Saving…" : saveLabel}
      </button>
      {onDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={() => (armed ? onDelete() : setArmed(true))}
          className="rounded-sm border border-line bg-surface p-3 text-sm font-semibold text-bad"
        >
          {armed ? "Tap again to delete" : "Delete"}
        </button>
      )}
    </>
  );
}

export function useToast() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 2400);
    return () => clearTimeout(t);
  }, [text]);
  const node = text ? (
    <div
      role="status"
      className="fixed inset-x-5 bottom-24 z-30 mx-auto max-w-[440px] rounded-sm bg-ink px-3.5 py-3 text-center text-sm font-medium text-bg"
    >
      {text}
    </div>
  ) : null;
  return [node, setText] as const;
}

/** IANA timezone picker. Common travel zones first, then every zone. */
const COMMON = [
  "Asia/Kuala_Lumpur",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Seoul",
  "Asia/Hong_Kong",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/London",
];

export function TzSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (tz: string) => void;
}) {
  const all = useMemo(() => allTimezones().filter((z) => !COMMON.includes(z)), []);
  const label = (z: string) => `${z.replace(/_/g, " ")} (${tzLabel(z)})`;
  return (
    <select name={name} required value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} min-w-0`}>
      <option value="" disabled>
        Pick a timezone
      </option>
      <optgroup label="Common">
        {COMMON.map((z) => (
          <option key={z} value={z}>
            {label(z)}
          </option>
        ))}
      </optgroup>
      <optgroup label="All">
        {/* keep a saved zone selectable even if it isn't in this runtime's list */}
        {value && !COMMON.includes(value) && !all.includes(value) && <option value={value}>{value}</option>}
        {all.map((z) => (
          <option key={z} value={z}>
            {label(z)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/** A booking code shown as dots until tapped. Resets on reload. */
export function Masked({ value, className = "" }: { value: string | null; className?: string }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className={`font-mono font-semibold ${className}`}>—</span>;
  return (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      className="flex items-baseline gap-1.5 text-left"
      aria-label={shown ? "Hide code" : "Show code"}
    >
      <span className={`font-mono font-semibold ${className}`}>{shown ? value : "•".repeat(Math.min(value.length, 8))}</span>
      <span className="text-[11px] text-muted underline">{shown ? "Hide" : "Show"}</span>
    </button>
  );
}

/** The device's own timezone, read after mount. */
export function useDeviceTz(): string {
  const [tz, setTz] = useState("");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return tz;
}
