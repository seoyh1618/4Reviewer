import { mkdir, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
const dest = "public/ocr";
await mkdir(dest + "/core", { recursive: true });
await mkdir(dest + "/lang", { recursive: true });
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  dest + "/worker.min.js",
);
for (const f of await readdir("node_modules/tesseract.js-core"))
  if (/\.wasm(?:\.js)?$/.test(f))
    await copyFile(
      path.join("node_modules/tesseract.js-core", f),
      path.join(dest, "core", f),
    );
for (const lang of ["eng", "kor"])
  await copyFile(
    `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `${dest}/lang/${lang}.traineddata.gz`,
  );
console.log("Local Korean / English OCR assets prepared.");
