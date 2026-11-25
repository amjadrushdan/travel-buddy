// Browser-only helpers for the halal food scanner: barcode reading, the offline Japan list,
// and reading a photographed ingredients label. Heavy parts load only when first used.

/** Our own copies of the barcode reader and Japanese label reader (scripts/copy-scan-assets.mjs). */
export const SCAN_BASE = "/scan-v1";

// ---------------------------------------------------------------- Japan list (Open Food Facts)

/** n name, e English name, b brand, c category (English), i ingredients, h halal label, a alcoholic drink. */
export type JpProduct = { n?: string; e?: string; b?: string; c?: string; i?: string; h?: 1; a?: 1 };
const FOOD_CACHE = "tb-food"; // kept by sw.js across versions
const ALL = "/food/jp/all.json";
let all: Record<string, JpProduct> | null = null;

async function readAll(): Promise<Record<string, JpProduct> | null> {
  if (all) return all;
  try {
    const hit = await (await caches.open(FOOD_CACHE)).match(ALL);
    if (hit) all = (await hit.json()) as Record<string, JpProduct>;
  } catch {
    /* no Cache API (private mode) */
  }
  return all;
}

/** null = not in the list. Throws when offline and the list wasn't downloaded. */
export async function lookupJapan(code: string): Promise<JpProduct | null> {
  const offline = await readAll();
  if (offline) return offline[code] ?? null;
  const res = await fetch(`/food/jp/${code.slice(0, 4)}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("lookup failed");
  const shard = (await res.json()) as Record<string, JpProduct>;
  return shard[code] ?? null;
}

export type ListInfo = { built: string; products: number; withIngredients: number };

/** The downloaded offline list's version, or null if not downloaded. */
export async function offlineList(): Promise<ListInfo | null> {
  try {
    const hit = await (await caches.open(FOOD_CACHE)).match("/food/jp/version.json");
    return hit ? ((await hit.json()) as ListInfo) : null;
  } catch {
    return null;
  }
}

/** If a saved list is older than the one online, replace it (quietly, in the background). */
export async function refreshOfflineList(): Promise<ListInfo | null> {
  const saved = await offlineList();
  if (!saved || !navigator.onLine) return saved;
  try {
    const res = await fetch("/food/jp/version.json", { cache: "no-store" });
    const live = (await res.json()) as ListInfo;
    return live.built !== saved.built ? await downloadOfflineList() : saved;
  } catch {
    return saved;
  }
}

export async function downloadOfflineList(): Promise<ListInfo> {
  const cache = await caches.open(FOOD_CACHE);
  // Bypass the browser's HTTP cache, or a stale version.json would make every visit re-download.
  await cache.addAll([ALL, "/food/jp/version.json"].map((u) => new Request(u, { cache: "reload" })));
  all = null;
  return (await offlineList())!;
}

// ---------------------------------------------------------------- barcode

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
const FORMATS = ["ean_13", "ean_8"];

/** The browser's own detector where it reads EAN (Android Chrome); otherwise ZXing in WebAssembly (iPhone). */
export async function getDetector(): Promise<Detector> {
  const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats();
      if (FORMATS.every((f) => formats.includes(f))) return new Native({ formats: FORMATS });
    } catch {
      /* fall through to the polyfill */
    }
  }
  const m = await import("barcode-detector/ponyfill");
  m.setZXingModuleOverrides({
    locateFile: (file: string, prefix: string) => (file.endsWith(".wasm") ? `${SCAN_BASE}/${file}` : prefix + file),
  });
  return new m.BarcodeDetector({ formats: ["ean_13", "ean_8"] });
}

// ---------------------------------------------------------------- label photo (OCR)

type OcrWorker = { recognize(image: Blob): Promise<{ data: { text: string } }> };
let worker: Promise<OcrWorker> | null = null;
let onProgress: ((p: { phase: "loading" | "reading"; pct: number }) => void) | null = null;

function getWorker(): Promise<OcrWorker> {
  worker ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    return createWorker("jpn", OEM.LSTM_ONLY, {
      workerPath: `${SCAN_BASE}/worker.min.js`,
      corePath: `${SCAN_BASE}/core`,
      langPath: `${SCAN_BASE}/lang`,
      logger: (m: { status: string; progress: number }) => {
        const phase = m.status === "recognizing text" ? "reading" : "loading";
        onProgress?.({ phase, pct: Math.round((m.progress ?? 0) * 100) });
      },
    }) as unknown as Promise<OcrWorker>;
  })().catch((e) => {
    worker = null; // allow a retry, e.g. after coming back online
    throw e;
  });
  return worker;
}

/** Phone photos are 12+ MP; the label reader is faster and no worse at ~1600 px. */
async function shrink(file: Blob, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.9));
  } catch {
    return file;
  }
}

/** Reads Japanese text from a label photo. Japanese has no spaces, so the ones OCR adds are removed. */
export async function readLabel(file: Blob, progress: (p: { phase: "loading" | "reading"; pct: number }) => void): Promise<string> {
  onProgress = progress;
  try {
    const [w, img] = await Promise.all([getWorker(), shrink(file)]);
    const { data } = await w.recognize(img);
    return data.text
      .replace(/[ \t　]+/g, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
  } finally {
    onProgress = null;
  }
}

// ---------------------------------------------------------------- recent scans (this phone)

export type Recent = { code: string | null; name: string | null; status: string; at: number };
const RECENT = "tb-food-recent";

export function loadRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? "[]") as Recent[];
  } catch {
    return [];
  }
}

export function pushRecent(r: Recent): Recent[] {
  const list = [r, ...loadRecent().filter((x) => !(r.code && x.code === r.code))].slice(0, 30);
  try {
    localStorage.setItem(RECENT, JSON.stringify(list));
  } catch {
    /* private mode */
  }
  return list;
}
