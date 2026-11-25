// Builds the app's offline Japan food list from the Open Food Facts export.
//
//   1. Download the export (one file, ~7.7 GB):
//      curl -L -C - -o food.parquet https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet
//      (Download the whole file once. Reading it in small ranges hits Hugging Face's rate limit.)
//   2. node scripts/build-food-jp.mjs path/to/food.parquet
//
// Writes public/food/jp/<first 4 digits>.json (looked up per scan), all.json (for "Download for
// offline") and version.json. Keeps Japanese products (sold in Japan, or barcode 45/49) with:
// n = name, i = Japanese ingredients text, h = 1 if a halal label is listed.
//
// Licence: Open Food Facts data is under the Open Database Licence (ODbL). This list is a
// derived database, so it stays under ODbL and the app credits Open Food Facts wherever it
// shows a result. https://world.openfoodfacts.org/terms-of-use
import fs from "node:fs";
import path from "node:path";
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

const src = process.argv[2];
if (!src) throw new Error("Usage: node scripts/build-food-jp.mjs path/to/food.parquet");
const outDir = path.join(import.meta.dirname, "..", "public", "food", "jp");

const JA = /[぀-ヿ一-鿿]/;
const isJp = (code, countries) => (countries ?? []).includes("en:japan") || /^4[59](\d{6}|\d{11})$/.test(code ?? "");
const pick = (list, lang) => {
  if (!list?.length) return "";
  const m = list.find((x) => x.lang === lang) ?? list.find((x) => x.lang === "main") ?? list[0];
  return (m?.text ?? "").trim();
};

const file = await asyncBufferFromFile(src);
const metadata = await parquetMetadataAsync(file);
const columns = ["code", "countries_tags", "product_name", "ingredients_text", "labels_tags"];
const all = {};
let start = 0;
let n = 0;
for (const rg of metadata.row_groups) {
  const rowStart = start;
  start += Number(rg.num_rows);
  // Cheap pass first: most row groups have no Japanese product.
  const ids = await parquetReadObjects({ file, metadata, compressors, columns: ["code", "countries_tags"], rowStart, rowEnd: start });
  if (!ids.some((r) => isJp(r.code, r.countries_tags))) continue;
  const rows = await parquetReadObjects({ file, metadata, compressors, columns, rowStart, rowEnd: start });
  for (const r of rows) {
    if (!isJp(r.code, r.countries_tags) || !/^\d{8}$|^\d{13}$/.test(r.code)) continue;
    const name = pick(r.product_name, "ja").slice(0, 200);
    const ja = (r.ingredients_text ?? []).find((x) => x.lang === "ja" && JA.test(x.text ?? ""))?.text ?? (r.ingredients_text ?? []).map((x) => x.text).find((t) => JA.test(t ?? ""));
    const ingr = (ja ?? "").trim().slice(0, 3000);
    const halal = (r.labels_tags ?? []).some((t) => t.includes("halal"));
    if (!name && !ingr) continue;
    all[r.code] = { n: name || undefined, i: ingr || undefined, h: halal ? 1 : undefined };
    n++;
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const shards = {};
for (const [code, rec] of Object.entries(all)) (shards[code.slice(0, 4)] ??= {})[code] = rec;
for (const [k, v] of Object.entries(shards)) fs.writeFileSync(path.join(outDir, `${k}.json`), JSON.stringify(v));
fs.writeFileSync(path.join(outDir, "all.json"), JSON.stringify(all));
const withIngr = Object.values(all).filter((r) => r.i).length;
fs.writeFileSync(path.join(outDir, "version.json"), JSON.stringify({ built: new Date().toISOString().slice(0, 10), products: n, withIngredients: withIngr, source: "Open Food Facts (ODbL)" }));
console.log({ products: n, withIngredients: withIngr, shards: Object.keys(shards).length });
