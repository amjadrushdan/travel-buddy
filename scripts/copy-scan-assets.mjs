// Copies the barcode reader and the Japanese label reader into public/scan-v1/ so the app serves
// them itself (no third-party CDN, and the service worker can keep them for offline use).
// Runs before every build. Bump SCAN_ASSETS in src/lib/scan-assets.ts and the folder name here
// together when upgrading these packages, so phones don't keep a stale cached copy.
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const out = path.join(root, "public", "scan-v1");
const nm = (...p) => path.join(root, "node_modules", ...p);
const files = [
  [nm("zxing-wasm", "dist", "reader", "zxing_reader.wasm"), "zxing_reader.wasm"],
  [nm("tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  [nm("tesseract.js-core", "tesseract-core-lstm.wasm.js"), "core/tesseract-core-lstm.wasm.js"],
  [nm("tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"), "core/tesseract-core-simd-lstm.wasm.js"],
  [nm("@tesseract.js-data", "jpn", "4.0.0_best_int", "jpn.traineddata.gz"), "lang/jpn.traineddata.gz"],
];
for (const [from, to] of files) {
  const dest = path.join(out, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(from, dest);
}
console.log(`scan assets copied to ${path.relative(root, out)}`);
