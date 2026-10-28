import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Fingerprint,
  ShoppingBag,
  Star,
  Camera,
  Wallet,
  ClipboardCheck,
} from "lucide-react";

// Render the existing login identity without modifying the live login UI.
// Serve the repository root locally, open this HTML at 1200 x 630, then save
// its JPEG screenshot to public/social/login-orbit-v1.jpg. No account data is used.
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const orbitStyles = styles.match(/\.orbit \{[\s\S]*?(?=@keyframes orbit)/)?.[0];
if (!orbitStyles) throw new Error("Login orbit styles could not be found.");
const icon = (Component, size, props = {}) =>
  renderToStaticMarkup(createElement(Component, { size, ...props }));
const orbit = `<div class="orbit" aria-hidden="true">
  <div class="orbit-circle orbit-1"></div>
  <div class="orbit-circle orbit-2"></div>
  <div class="orbit-circle orbit-3"></div>
  <div class="orbit-center">${icon(Fingerprint, 34, { strokeWidth: 1.7 })}</div>
  ${[ShoppingBag, Star, Camera, Wallet, ClipboardCheck]
    .map(
      (
        Component,
        i,
      ) => `<div class="orbital-element" style="transform: rotate(${i * 72}deg) translateX(80px) rotate(${-i * 72}deg)">
        <div class="orbital-item">${icon(Component, 18)}</div>
      </div>`,
    )
    .join("\n")}
</div>`;
const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>For Reviewer share image preview</title>
  <link rel="stylesheet" href="/src/assets/fonts/pretendard/pretendardvariable-dynamic-subset.css">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #fff; }
    main { width: 1200px; height: 630px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
    ${orbitStyles}
    .identity { width: 396px; height: 396px; }
    .orbit { margin: 0; transform: scale(1.8); transform-origin: top left; }
    .orbital-element { animation: none; }
    h1 { margin: 0; font: 600 44px/1.2 "Pretendard Variable", sans-serif; letter-spacing: -1px; color: #202735; }
  </style>
</head>
<body><main><div class="identity">${orbit}</div><h1>For Reviewer</h1></main></body>
</html>`;
const output = new URL(
  "../docs/screenshots/share-preview.html",
  import.meta.url,
);
await mkdir(new URL(".", output), { recursive: true });
await writeFile(output, html);
console.log(
  "Share preview prepared: docs/screenshots/share-preview.html (1200 x 630)",
);
