"use client";

import { useEffect, useState, useTransition } from "react";
import { roleLabel } from "@/lib/format";
import { createInvite, revokeInvite } from "./actions";

export type Invite = {
  id: string;
  token: string;
  role: "editor" | "viewer";
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked: boolean;
};

const ROLES = [
  { v: "editor", label: "Editor" },
  { v: "viewer", label: "Viewer" },
] as const;
const EXPIRES = [
  { v: 24, label: "24 hours" },
  { v: 168, label: "7 days" },
  { v: 720, label: "30 days" },
] as const;
const USES = [
  { v: 1, label: "1" },
  { v: 5, label: "5" },
  { v: 10, label: "10" },
] as const;

const btnLine = "rounded-sm border border-line bg-bg p-2.5 text-sm font-semibold";

function expiryText(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `expires in ${Math.max(h, 1)}h`;
  return `expires in ${Math.round(h / 24)}d`;
}

export function InvitePanel({ tripId, invites }: { tripId: string; invites: Invite[] }) {
  const [origin, setOrigin] = useState("");
  const [sheet, setSheet] = useState(false);
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [expires, setExpires] = useState<24 | 168 | 720>(168);
  const [uses, setUses] = useState<1 | 5 | 10>(5);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOrigin(window.location.origin);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function copy(url: string) {
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        await navigator.share({ url, title: "Join our trip" });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("Link copied");
    } catch {
      /* user cancelled share */
    }
  }

  function create() {
    setError(null);
    start(async () => {
      const res = await createInvite(tripId, role, expires, uses);
      if (res.error) setError(res.error);
      else {
        setSheet(false);
        setToast("Invite link created");
      }
    });
  }

  function revoke(id: string) {
    start(async () => {
      const res = await revokeInvite(tripId, id);
      if (res.error) setToast(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="label">Invite links</span>

      {invites.map((iv) => {
        const dead = iv.revoked || iv.uses >= iv.max_uses || new Date(iv.expires_at) <= new Date();
        const url = `${origin}/join/${iv.token}`;
        return (
          <div
            key={iv.id}
            className={`flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5 ${dead ? "opacity-50" : ""}`}
          >
            <span className={`font-mono text-[13px] break-all ${dead ? "line-through" : ""}`}>{url}</span>
            <span className="text-[13px] text-muted">
              {roleLabel(iv.role)} · {iv.revoked ? "revoked" : expiryText(iv.expires_at)} · {iv.uses} of {iv.max_uses} used
            </span>
            {!dead && (
              <div className="flex gap-2">
                <button type="button" onClick={() => copy(url)} className={`${btnLine} flex-1`}>
                  Copy link
                </button>
                <button
                  type="button"
                  disabled={pending || !online}
                  onClick={() => revoke(iv.id)}
                  className={`${btnLine} px-3 text-bad`}
                >
                  Revoke
                </button>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        disabled={!online}
        onClick={() => setSheet(true)}
        className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white"
      >
        New invite link
      </button>
      {!online && <span className="text-center text-xs text-muted">Invites need a connection.</span>}

      {sheet && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35" onClick={() => setSheet(false)}>
          <div
            role="dialog"
            aria-label="New invite link"
            className="flex w-full max-w-[480px] flex-col gap-4 rounded-t-[22px] bg-bg px-5 pt-5 pb-[max(28px,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-line" />
            <span className="text-xl font-bold">New invite link</span>
            <Segment label="Role" options={ROLES} value={role} onChange={setRole} />
            <Segment label="Expires" options={EXPIRES} value={expires} onChange={setExpires} />
            <Segment label="Max uses" options={USES} value={uses} onChange={setUses} />
            {error && <p className="text-[13px] text-bad">{error}</p>}
            <button
              type="button"
              disabled={pending}
              onClick={create}
              className="rounded-sm bg-ink p-[15px] text-base font-semibold text-white"
            >
              {pending ? "Creating…" : "Create link"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-5 bottom-24 z-30 mx-auto max-w-[440px] rounded-sm bg-ink px-3.5 py-3 text-center text-sm font-medium text-bg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Segment<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { v: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={`flex-1 rounded-sm border p-2.5 text-sm font-semibold ${
              value === o.v ? "border-ink bg-ink text-white" : "border-line bg-surface"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
