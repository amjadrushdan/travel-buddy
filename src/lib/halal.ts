// Halal check for Japanese ingredient lists (原材料). Pure, no imports: runs on the phone,
// offline, on Open Food Facts text or on a photographed label.
//
// This is a word check, not a certification. It can only flag words it knows; "clear" means
// "no flagged words found", never "halal". Japan does not require pork or gelatin to be listed
// as allergens and alcohol is not an allergen, so we read the full ingredients text.
//
// The word list is our own compilation and must be reviewed by someone who reads labels well.

export type Level = "haram" | "alcohol" | "doubtful" | "info";
export type Status = "contains" | "check" | "clear" | "unknown";
export type Hit = { word: string; gloss: string; level: Level; start: number; end: number };
export type Result = { status: Status; text: string; hits: Hit[] };

type Term = { w: string; g: string; l: Level | "ok" };

// "ok" entries are not flagged: they mask longer words that contain a flagged word
// (酒石酸 is tartaric acid, not alcohol; グラム is "gram", not rum).
const TERMS: Term[] = [
  // pork
  { w: "豚肉", g: "pork", l: "haram" },
  { w: "豚脂", g: "pork fat", l: "haram" },
  { w: "豚骨", g: "pork bone", l: "haram" },
  { w: "とんこつ", g: "pork bone", l: "haram" },
  { w: "豚由来", g: "from pork", l: "haram" },
  { w: "豚", g: "pork", l: "haram" },
  { w: "ポークエキス", g: "pork extract", l: "haram" },
  { w: "ポーク", g: "pork", l: "haram" },
  { w: "ラード", g: "lard", l: "haram" },
  { w: "ベーコン", g: "bacon", l: "haram" },
  { w: "チャーシュー", g: "roast pork", l: "haram" },
  { w: "ハム", g: "ham", l: "haram" },
  { w: "ゼラチン", g: "gelatin (often pork)", l: "haram" },
  // alcohol
  { w: "醸造アルコール", g: "brewed alcohol", l: "alcohol" },
  { w: "ノンアルコール", g: "non-alcoholic (may still contain some)", l: "doubtful" },
  { w: "糖アルコール", g: "", l: "ok" }, // sugar alcohols (erythritol etc.) are not alcohol
  { w: "アルコール", g: "alcohol", l: "alcohol" },
  { w: "酒精", g: "alcohol (preservative)", l: "alcohol" },
  { w: "みりん風調味料", g: "mirin-style seasoning (little alcohol)", l: "doubtful" },
  { w: "本みりん", g: "mirin (rice wine)", l: "alcohol" },
  { w: "みりん", g: "mirin (rice wine)", l: "alcohol" },
  { w: "味醂", g: "mirin (rice wine)", l: "alcohol" },
  { w: "料理酒", g: "cooking sake", l: "alcohol" },
  { w: "日本酒", g: "sake", l: "alcohol" },
  { w: "清酒", g: "sake", l: "alcohol" },
  { w: "酒粕", g: "sake lees", l: "alcohol" },
  { w: "洋酒", g: "liquor", l: "alcohol" },
  { w: "梅酒", g: "plum wine", l: "alcohol" },
  { w: "紹興酒", g: "Shaoxing wine", l: "alcohol" },
  { w: "焼酎", g: "shochu", l: "alcohol" },
  { w: "ラム酒", g: "rum", l: "alcohol" },
  { w: "ブランデー", g: "brandy", l: "alcohol" },
  { w: "ウイスキー", g: "whisky", l: "alcohol" },
  { w: "リキュール", g: "liqueur", l: "alcohol" },
  { w: "ワインビネガー", g: "wine vinegar", l: "info" },
  { w: "ワイン", g: "wine", l: "alcohol" },
  { w: "ビール", g: "beer", l: "alcohol" },
  { w: "酒石酸", g: "", l: "ok" },
  { w: "酒", g: "alcohol", l: "alcohol" },
  // doubtful: source or slaughter not stated
  { w: "発酵調味料", g: "fermented seasoning (may contain alcohol)", l: "doubtful" },
  { w: "発酵調味液", g: "fermented seasoning (may contain alcohol)", l: "doubtful" },
  { w: "発酵風味料", g: "fermented flavouring (may contain alcohol)", l: "doubtful" },
  { w: "加工油脂", g: "processed fat (source not stated)", l: "doubtful" },
  { w: "食用油脂", g: "edible fat (source not stated)", l: "doubtful" },
  { w: "レンネット", g: "rennet (source not stated)", l: "doubtful" },
  { w: "乳化剤", g: "emulsifier (source not stated)", l: "doubtful" },
  { w: "ショートニング", g: "shortening (source not stated)", l: "doubtful" },
  { w: "マーガリン", g: "margarine (source not stated)", l: "doubtful" },
  { w: "動物油脂", g: "animal fat", l: "doubtful" },
  { w: "牛脂", g: "beef fat (not halal-slaughtered)", l: "doubtful" },
  { w: "チキンエキス", g: "chicken extract", l: "doubtful" },
  { w: "ビーフエキス", g: "beef extract", l: "doubtful" },
  { w: "肉エキス", g: "meat extract", l: "doubtful" },
  { w: "牛肉", g: "beef (not halal-slaughtered)", l: "doubtful" },
  { w: "鶏肉", g: "chicken (not halal-slaughtered)", l: "doubtful" },
  { w: "チキン", g: "chicken (not halal-slaughtered)", l: "doubtful" },
  { w: "ビーフ", g: "beef (not halal-slaughtered)", l: "doubtful" },
  { w: "ソーセージ", g: "sausage", l: "doubtful" },
  { w: "ウインナー", g: "sausage", l: "doubtful" },
  { w: "ブイヨン", g: "stock (meat not stated)", l: "doubtful" },
  { w: "コンソメ", g: "consommé (meat not stated)", l: "doubtful" },
  { w: "コラーゲン", g: "collagen", l: "doubtful" },
  { w: "グリセリン", g: "glycerin (source not stated)", l: "doubtful" },
  { w: "l-システイン", g: "L-cysteine (source not stated)", l: "doubtful" },
  // info only: shown, not counted
  { w: "しょうゆ", g: "soy sauce (trace alcohol from brewing)", l: "info" },
  { w: "醤油", g: "soy sauce (trace alcohol from brewing)", l: "info" },
  { w: "香料", g: "flavouring (source not stated)", l: "info" },
  // not flagged
  { w: "プログラム", g: "", l: "ok" },
  { w: "グラム", g: "", l: "ok" },
  { w: "ハムスター", g: "", l: "ok" },
];

// Longest first, so 豚肉 wins over 豚 and 醸造アルコール over アルコール.
const ORDERED = [...TERMS].sort((a, b) => b.w.length - a.w.length);

/** NFKC folds half-width ｶﾅ and full-width Ｌ－ to the forms in the list; lowercase for "l-システイン". */
export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function checkIngredients(raw: string | null | undefined): Result {
  const text = normalize(raw ?? "").trim();
  if (!text) return { status: "unknown", text, hits: [] };

  // Mask each match so shorter words inside it aren't counted again. Length is kept, so
  // positions still point into `text` for highlighting.
  let work = text;
  const hits: Hit[] = [];
  for (const t of ORDERED) {
    let from = 0;
    for (;;) {
      const i = work.indexOf(t.w, from);
      if (i < 0) break;
      if (t.l !== "ok") hits.push({ word: text.slice(i, i + t.w.length), gloss: t.g, level: t.l, start: i, end: i + t.w.length });
      work = work.slice(0, i) + "\u0000".repeat(t.w.length) + work.slice(i + t.w.length);
      from = i + t.w.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const status: Status = hits.some((h) => h.level === "haram" || h.level === "alcohol")
    ? "contains"
    : hits.some((h) => h.level === "doubtful")
      ? "check"
      : "clear";
  return { status, text, hits };
}

/** One entry per distinct word, worst level first — for the summary line. */
export function summarize(hits: Hit[]): Hit[] {
  const rank: Record<Level, number> = { haram: 0, alcohol: 1, doubtful: 2, info: 3 };
  const seen = new Map<string, Hit>();
  for (const h of hits) if (!seen.has(h.word)) seen.set(h.word, h);
  return [...seen.values()].sort((a, b) => rank[a.level] - rank[b.level]);
}

/** EAN-13 / EAN-8 check digit. */
export function validBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{13})$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
