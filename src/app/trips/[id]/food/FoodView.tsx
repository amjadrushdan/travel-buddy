"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { EscClose, useOnline, useToast } from "@/components/ui";
import { checkIngredients, summarize, validBarcode, type Hit, type Level } from "@/lib/halal";
import {
  downloadOfflineList,
  getDetector,
  loadRecent,
  lookupJapan,
  offlineList,
  pushRecent,
  readLabel,
  type ListInfo,
  type Recent,
} from "@/lib/food";
import { deleteFoodCheck, saveFoodCheck } from "./actions";

export type FoodCheck = {
  id: string;
  barcode: string | null;
  name: string | null;
  ingredients: string;
  checked_by: string | null;
  updated_at: string;
  profiles: { name: string | null } | null;
};

type Source = "group" | "off" | "photo" | "none";
type Found = {
  code: string | null;
  name: string | null;
  ingredients: string | null;
  halalLabel: boolean;
  source: Source;
  by?: string | null;
  at?: string;
  check?: FoodCheck;
  offline?: boolean; // couldn't look it up: offline and the list isn't downloaded
};
type Verdict = "contains" | "check" | "clear" | "label" | "unknown";

const verdictOf = (f: Pick<Found, "ingredients" | "halalLabel">): Verdict => {
  const s = checkIngredients(f.ingredients).status;
  if (s === "contains") return "contains";
  if (f.halalLabel) return "label";
  return s;
};

const DOT: Record<Verdict, string> = {
  contains: "bg-bad",
  check: "bg-warn",
  clear: "bg-muted/50",
  label: "bg-good",
  unknown: "border border-muted bg-transparent",
};
const shortDate = (iso: string | number) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function FoodView({
  tripId,
  tripName,
  checks,
  myId,
  canManage,
}: {
  tripId: string;
  tripName: string;
  checks: FoodCheck[];
  myId: string;
  canManage: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const [typing, setTyping] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [label, setLabel] = useState<{ code: string | null; name: string | null } | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [list, setList] = useState<ListInfo | null | undefined>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useToast();
  const online = useOnline();
  const photoRef = useRef<HTMLInputElement>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
    offlineList().then(setList);
  }, []);

  // A saved check changes the open result (e.g. after "Save for the group").
  useEffect(() => {
    if (!found?.code) return;
    const g = checks.find((c) => c.barcode === found.code);
    if (g && g.updated_at !== found.check?.updated_at) setFound(fromCheck(g, found.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks]);

  function fromCheck(g: FoodCheck, fallbackName: string | null = null): Found {
    return {
      code: g.barcode,
      name: g.name ?? fallbackName,
      ingredients: g.ingredients,
      halalLabel: false,
      source: "group",
      by: g.checked_by === myId ? "you" : (g.profiles?.name ?? "someone"),
      at: g.updated_at,
      check: g,
    };
  }

  async function lookup(code: string) {
    setScanning(false);
    setTyping(false);
    let jp = null;
    let offline = false;
    try {
      jp = await lookupJapan(code);
    } catch {
      offline = true;
    }
    const g = checks.find((c) => c.barcode === code);
    const f: Found = g
      ? fromCheck(g, jp?.n ?? null)
      : { code, name: jp?.n ?? null, ingredients: jp?.i ?? null, halalLabel: !!jp?.h, source: jp?.i ? "off" : "none", offline };
    setFound(f);
    setRecent(pushRecent({ code, name: f.name, status: verdictOf(f), at: Date.now() }));
  }

  async function download() {
    setDownloading(true);
    try {
      setList(await downloadOfflineList());
      setToast("Saved for offline use");
    } catch {
      setToast("Couldn't download. Are you online?");
    } finally {
      setDownloading(false);
    }
  }

  function startPhoto(code: string | null, name: string | null) {
    setLabel({ code, name });
    photoRef.current?.click();
  }

  return (
    <main className="flex flex-col gap-5 px-5 pt-[calc(26px+env(safe-area-inset-top))] lg:pt-0">
      <div className="flex flex-col gap-1">
        <span className="label">{tripName} · halal check</span>
        <h1 className="page-title">Food</h1>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="flex items-center justify-center gap-2.5 rounded-sm bg-ink p-4 text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <BarcodeIcon />
          Scan a barcode
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => startPhoto(null, null)} className={secondary}>
            Photo of label
          </button>
          <button type="button" onClick={() => setTyping(true)} className={secondary}>
            Type barcode
          </button>
        </div>
        <p className="pt-1 text-[13px] text-pretty text-muted">
          Checks the ingredients for pork, alcohol and doubtful words. Not a halal certification: look for a halal logo when it matters.
        </p>
      </div>

      <OfflineRow list={list} downloading={downloading} online={online} onDownload={download} />

      {checks.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <span className="label">Checked by the group</span>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {checks.map((c) => {
              const f = fromCheck(c);
              return (
                <li key={c.id}>
                  <Row verdict={verdictOf(f)} title={c.name || c.barcode || "Label"} sub={`${f.by} · ${shortDate(c.updated_at)}`} onClick={() => setFound(f)} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <span className="label">Your recent scans</span>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {recent.slice(0, 10).map((r) => (
              <li key={`${r.code}-${r.at}`}>
                <Row
                  verdict={r.status as Verdict}
                  title={r.name || r.code || "Label"}
                  sub={shortDate(r.at)}
                  onClick={() => (r.code ? lookup(r.code) : undefined)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) setPendingPhoto(file);
          else setLabel(null);
        }}
      />

      {scanning && <Scanner onCode={lookup} onClose={() => setScanning(false)} onType={() => (setScanning(false), setTyping(true))} />}
      {typing && <TypeBarcode onCode={lookup} onClose={() => setTyping(false)} />}
      {found && !pendingPhoto && (
        <ResultSheet
          f={found}
          canDelete={!!found.check && (found.check.checked_by === myId || canManage)}
          onClose={() => setFound(null)}
          onPhoto={() => startPhoto(found.code, found.name)}
          onScan={() => (setFound(null), setScanning(true))}
          onDelete={async () => {
            const res = await deleteFoodCheck(tripId, found.check!.id);
            if (res.error) return setToast(res.error);
            setFound(null);
            setToast("Removed");
          }}
        />
      )}
      {pendingPhoto && label && (
        <LabelSheet
          tripId={tripId}
          file={pendingPhoto}
          code={label.code}
          name={label.name}
          online={online}
          onClose={() => (setPendingPhoto(null), setLabel(null))}
          onSaved={(name, ingredients) => {
            setPendingPhoto(null);
            setLabel(null);
            setToast("Saved for the group");
            const f: Found = { code: label.code, name, ingredients, halalLabel: false, source: "group", by: "you", at: new Date().toISOString() };
            setFound(f);
            setRecent(pushRecent({ code: label.code, name, status: verdictOf(f), at: Date.now() }));
          }}
          onUse={(name, ingredients) => {
            setPendingPhoto(null);
            setLabel(null);
            setFound({ code: label.code, name, ingredients, halalLabel: false, source: "photo" });
          }}
        />
      )}
      {toast}
    </main>
  );
}

const secondary = "flex-1 rounded-sm border border-line bg-surface py-3 text-[14px] font-semibold transition-colors hover:bg-ink/[.03]";

function Row({ verdict, title, sub, onClick }: { verdict: Verdict; title: string; sub: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[.03]">
      <span className={`size-2.5 flex-none rounded-full ${DOT[verdict] ?? DOT.unknown}`} aria-label={VERDICT[verdict]?.title} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-medium">{title}</span>
        <span className="text-[12px] text-muted">{sub}</span>
      </span>
      <span className="text-muted" aria-hidden>
        ›
      </span>
    </button>
  );
}

function OfflineRow({
  list,
  downloading,
  online,
  onDownload,
}: {
  list: ListInfo | null | undefined;
  downloading: boolean;
  online: boolean;
  onDownload: () => void;
}) {
  if (list === undefined) return null;
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold">{list ? "Japan product list saved" : "Japan product list"}</span>
        <span className="text-[12px] text-muted">
          {list
            ? `${list.products.toLocaleString("en-US")} products · ${shortDate(list.built)} · works offline`
            : "61,000 products from Open Food Facts · 1.6 MB, for scanning offline"}
        </span>
      </span>
      {!list && (
        <button
          type="button"
          disabled={downloading || !online}
          onClick={onDownload}
          className="flex-none rounded-sm border border-line bg-bg px-3 py-2 text-[13px] font-semibold disabled:opacity-50"
        >
          {downloading ? "Saving…" : "Download"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- result

const VERDICT: Record<Verdict, { title: string; cls: string }> = {
  contains: { title: "Contains pork or alcohol", cls: "border-bad/30 bg-bad/10 text-bad" },
  check: { title: "Check before eating", cls: "border-warn bg-warn/25 text-warn-ink" },
  clear: { title: "No flagged ingredients found", cls: "border-line bg-neutral-badge text-ink" },
  label: { title: "Halal label listed", cls: "border-good/40 bg-good/10 text-good" },
  unknown: { title: "Ingredients not known", cls: "border-dashed border-line bg-surface text-ink" },
};

const HIT_CLS: Record<Level, string> = {
  haram: "bg-bad/15 text-bad font-semibold",
  alcohol: "bg-bad/15 text-bad font-semibold",
  doubtful: "bg-warn/35 text-warn-ink font-semibold",
  info: "underline decoration-dotted underline-offset-2",
};

function containsTitle(hits: Hit[]) {
  const pork = hits.some((h) => h.level === "haram");
  const alcohol = hits.some((h) => h.level === "alcohol");
  return pork && alcohol ? "Contains pork and alcohol" : pork ? "Contains pork" : "Contains alcohol";
}

function Highlighted({ text, hits }: { text: string; hits: Hit[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  hits.forEach((h, k) => {
    if (h.start > at) parts.push(text.slice(at, h.start));
    parts.push(
      <mark key={k} className={`rounded-[3px] px-0.5 ${HIT_CLS[h.level]}`} title={h.gloss}>
        {text.slice(h.start, h.end)}
      </mark>,
    );
    at = h.end;
  });
  parts.push(text.slice(at));
  return <p className="text-[14px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-line">{parts}</p>;
}

function Sheet({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/35 lg:items-center lg:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto rounded-t-[22px] bg-bg px-5 pt-5 pb-[max(24px,env(safe-area-inset-bottom))] lg:max-w-[560px] lg:rounded-[22px] lg:shadow-[0_24px_60px_rgba(0,0,0,.25)]"
      >
        <div className="mx-auto h-1 w-10 flex-none rounded-full bg-line lg:hidden" />
        <EscClose onClose={onClose} />
        {children}
      </div>
    </div>
  );
}

function ResultSheet({
  f,
  canDelete,
  onClose,
  onPhoto,
  onScan,
  onDelete,
}: {
  f: Found;
  canDelete: boolean;
  onClose: () => void;
  onPhoto: () => void;
  onScan: () => void;
  onDelete: () => void;
}) {
  const r = checkIngredients(f.ingredients);
  const v = verdictOf(f);
  const flagged = summarize(r.hits).filter((h) => h.level !== "info");
  const notes = summarize(r.hits).filter((h) => h.level === "info");
  const [showAll, setShowAll] = useState(v !== "clear");
  const [pending, start] = useTransition();
  const title = v === "contains" ? containsTitle(r.hits) : VERDICT[v].title;

  return (
    <Sheet onClose={onClose} label="Food check result">
      <div className="flex flex-col gap-0.5">
        <span className="text-[19px] leading-snug font-bold [overflow-wrap:anywhere]">{f.name || (f.code ? "Unnamed product" : "Label")}</span>
        {f.code && <span className="font-mono text-[12px] text-muted">{f.code}</span>}
      </div>

      <div className={`flex flex-col gap-1.5 rounded-card border px-4 py-3.5 ${VERDICT[v].cls}`}>
        <span className="text-[18px] font-bold">{title}</span>
        {flagged.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-[14px]">
            {flagged.map((h) => (
              <li key={h.word}>
                <span className="font-semibold">{h.word}</span> · {h.gloss}
              </li>
            ))}
          </ul>
        )}
        {v === "clear" && <span className="text-[13px]">Not a halal certification. Look for a halal logo to be sure.</span>}
        {v === "label" && <span className="text-[13px]">As listed on Open Food Facts. Check the logo on the pack.</span>}
        {v === "unknown" && (
          <span className="text-[13px]">
            {f.offline
              ? "You're offline and the Japan list isn't downloaded."
              : f.name
                ? "We know this product, but not its ingredients."
                : "This barcode isn't in our list."}{" "}
            Take a photo of the 原材料 (ingredients) label to check it.
          </span>
        )}
      </div>

      {v === "unknown" ? (
        <button type="button" onClick={onPhoto} className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white">
          Take a photo of the label
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setShowAll((s) => !s)} className="label self-start" aria-expanded={showAll}>
            Ingredients {showAll ? "▴" : "▾"}
          </button>
          {showAll && <Highlighted text={r.text} hits={r.hits} />}
          {notes.length > 0 && (
            <span className="text-[12px] text-muted">
              Also: {notes.map((h) => `${h.word} (${h.gloss})`).join(", ")}
            </span>
          )}
        </div>
      )}

      <span className="text-[12px] text-muted">
        {f.source === "off" && (
          <>
            Ingredients from{" "}
            <a className="underline" href={f.code ? `https://world.openfoodfacts.org/product/${f.code}` : "https://world.openfoodfacts.org"} target="_blank" rel="noopener noreferrer">
              Open Food Facts
            </a>{" "}
            (ODbL), which may be out of date.
          </>
        )}
        {f.source === "group" && `Read from the label by ${f.by}${f.at ? ` · ${shortDate(f.at)}` : ""}.`}
        {f.source === "photo" && "Read from your photo. Check it matches the label."}
        {f.source === "none" && f.name && (
          <>
            Product name from{" "}
            <a className="underline" href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
              Open Food Facts
            </a>{" "}
            (ODbL).
          </>
        )}
      </span>

      <div className="flex gap-2">
        {v !== "unknown" && (
          <button type="button" onClick={onPhoto} className={secondary}>
            Re-read label
          </button>
        )}
        <button type="button" onClick={onScan} className={secondary}>
          Scan another
        </button>
      </div>
      {canDelete && f.source === "group" && (
        <button type="button" disabled={pending} onClick={() => start(onDelete)} className="self-center text-[13px] font-semibold text-muted">
          Remove this check
        </button>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- label photo

function LabelSheet({
  tripId,
  file,
  code,
  name: initialName,
  online,
  onClose,
  onSaved,
  onUse,
}: {
  tripId: string;
  file: File;
  code: string | null;
  name: string | null;
  online: boolean;
  onClose: () => void;
  onSaved: (name: string | null, ingredients: string) => void;
  onUse: (name: string | null, ingredients: string) => void;
}) {
  const [progress, setProgress] = useState<{ phase: "loading" | "reading"; pct: number } | null>({ phase: "loading", pct: 0 });
  const [text, setText] = useState("");
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    let live = true;
    readLabel(file, (p) => live && setProgress(p))
      .then((t) => {
        if (!live) return;
        setText(t);
        setProgress(null);
      })
      .catch(() => {
        if (!live) return;
        setProgress(null);
        setError(online ? "Couldn't read the photo. Try a closer, sharper photo." : "The label reader needs to download once (about 6 MB). Try again when online.");
      });
    return () => {
      live = false;
      URL.revokeObjectURL(url);
    };
  }, [file, online]);

  const r = checkIngredients(text);
  const v = r.status === "unknown" ? "unknown" : r.status;

  return (
    <Sheet onClose={onClose} label="Read ingredients label">
      <span className="text-[19px] font-bold">Ingredients label</span>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- local photo preview
        <img src={preview} alt="Your photo of the label" className="max-h-40 w-full rounded-sm object-contain" />
      )}

      {progress ? (
        <div className="flex flex-col gap-2 py-2">
          <span className="text-[14px] font-semibold">{progress.phase === "loading" ? "Getting the Japanese reader ready…" : "Reading the label…"}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-ink transition-[width]" style={{ width: `${Math.max(4, progress.pct)}%` }} />
          </div>
          {progress.phase === "loading" && <span className="text-[12px] text-muted">The first time, this downloads about 6 MB. After that it works offline.</span>}
        </div>
      ) : (
        <>
          {error && <span className="text-[14px] text-bad">{error}</span>}
          <div className={`rounded-card border px-4 py-3 text-[16px] font-bold ${VERDICT[v].cls}`}>
            {v === "contains" ? containsTitle(r.hits) : v === "unknown" ? "No text yet" : VERDICT[v].title}
            {summarize(r.hits).filter((h) => h.level !== "info").length > 0 && (
              <span className="mt-1 block text-[13px] font-normal">
                {summarize(r.hits)
                  .filter((h) => h.level !== "info")
                  .map((h) => `${h.word} (${h.gloss})`)
                  .join(", ")}
              </span>
            )}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted">What it read: fix any mistakes, it re-checks as you type</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full rounded-sm border border-line bg-surface p-3 text-[15px] leading-relaxed outline-none focus:border-ink"
              placeholder="原材料名: …"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted">Product name (optional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-sm border border-line bg-surface p-3 text-base outline-none focus:border-ink" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={!text.trim()} onClick={() => onUse(name.trim() || null, text)} className={`${secondary} disabled:opacity-50`}>
              Just check
            </button>
            <button
              type="button"
              disabled={!text.trim() || pending || !online}
              onClick={() =>
                start(async () => {
                  const res = await saveFoodCheck(tripId, code, name, text).catch(() => ({ error: "Couldn't save. Are you offline?" }));
                  if (res.error) setError(res.error);
                  else onSaved(name.trim() || null, text.trim());
                })
              }
              className="flex-1 rounded-sm bg-ink py-3 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save for the group"}
            </button>
          </div>
          {!online && <span className="text-[12px] text-muted">Saving for the group needs a connection.</span>}
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- barcode entry

function TypeBarcode({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet onClose={onClose} label="Type barcode">
      <span className="text-[19px] font-bold">Type the barcode</span>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const code = value.replace(/\D/g, "");
          if (!validBarcode(code)) return setError("That doesn't look like a full barcode. It's the 13 digits under the bars.");
          onCode(code);
        }}
      >
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => (setValue(e.target.value), setError(null))}
          placeholder="4901234567894"
          className="w-full rounded-sm border border-line bg-surface p-3 font-mono text-[20px] tracking-wider outline-none focus:border-ink"
        />
        {error && <span className="text-[13px] text-bad">{error}</span>}
        <button type="submit" className="rounded-sm bg-ink p-[13px] text-[15px] font-semibold text-white">
          Check
        </button>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- camera

function Scanner({ onCode, onClose, onType }: { onCode: (code: string) => void; onClose: () => void; onType: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Keep the camera running across parent re-renders: read the latest callback from a ref.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setError("This browser can't open the camera. Type the barcode instead.");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as { name?: string }).name;
        return setError(
          name === "NotAllowedError"
            ? "Camera access is blocked. Allow the camera for this site in your browser settings, or type the barcode."
            : "Couldn't open the camera. Type the barcode instead.",
        );
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      const detector = await getDetector().catch(() => null);
      if (!detector) return setError("Couldn't start the barcode reader. Type the barcode instead.");

      const tick = async () => {
        if (stopped) return;
        try {
          if (v.readyState >= 2) {
            const codes = await detector.detect(v);
            const hit = codes.map((c) => c.rawValue).find(validBarcode);
            if (hit) {
              navigator.vibrate?.(60);
              stopped = true;
              stream?.getTracks().forEach((t) => t.stop());
              onCodeRef.current(hit);
              return;
            }
          }
        } catch {
          /* a frame can fail; keep going */
        }
        timer = setTimeout(tick, 180);
      };
      tick();
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-label="Scan barcode">
      <EscClose onClose={onClose} />
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />
      <div className="relative flex items-center justify-between px-5 pt-[calc(14px+env(safe-area-inset-top))]">
        <span className="text-[15px] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">Scan barcode</span>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full bg-black/45 text-lg">
          ✕
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-8">
        {!error && <div className="aspect-[2.2/1] w-full max-w-[360px] rounded-[14px] border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,.35)]" />}
        {error && <p className="max-w-[320px] rounded-card bg-black/70 p-4 text-center text-[15px]">{error}</p>}
      </div>
      <div className="relative flex flex-col items-center gap-3 px-5 pb-[calc(24px+env(safe-area-inset-bottom))]">
        {!error && <span className="text-[14px] [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">Point at the barcode</span>}
        <button type="button" onClick={onType} className="rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-ink">
          Type barcode instead
        </button>
      </div>
    </div>
  );
}

function BarcodeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8" />
    </svg>
  );
}
