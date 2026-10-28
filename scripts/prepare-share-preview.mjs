import { readFile, writeFile } from "node:fs/promises";

// Run npm run build first, then serve dist with an isolated local app instance.
// Open /share-preview.html at 1200 x 630 and save its JPEG screenshot as
// public/social/login-screen-v2.jpg. The iframe renders the actual anonymous
// login UI at 375 x 667, with empty fields. No runtime login styles are changed.
const index = await readFile(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
const stylesheet = index.match(/<link[^>]*rel="stylesheet"[^>]*>/)?.[0];
if (!stylesheet) throw new Error("Build the app before preparing the preview.");
const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>For Reviewer login share preview</title>
  ${stylesheet}
  <style>
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; scrollbar-gutter: auto; background: #f5f7fa; }
    .share-scene { width: 1200px; height: 630px; display: grid; grid-template-columns: 1fr 400px; align-items: center; gap: 50px; padding: 0 86px; }
    .share-copy h1 { margin: 0; font: 650 58px/1.15 "Pretendard Variable", sans-serif; letter-spacing: -2px; color: #202735; }
    .share-copy p { margin: 22px 0 0; font-size: 25px; line-height: 1.5; color: #526078; }
    .preview-browser { width: 309.5px; justify-self: center; overflow: hidden; border: 1px solid #dfe5ec; border-radius: 14px; background: #fff; box-shadow: 0 20px 45px #25354a12; }
    .preview-toolbar { height: 28px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #e8edf2; color: #718096; font-size: 10px; letter-spacing: .1px; }
    .preview-viewport { width: 307.5px; height: 546.94px; overflow: hidden; }
    .preview-viewport iframe { display: block; width: 375px; height: 667px; border: 0; transform: scale(.82); transform-origin: top left; }
  </style>
</head>
<body>
  <main class="share-scene">
    <div class="share-copy"><h1>For Reviewer</h1><p>리뷰 관리, 정산 관리.</p></div>
    <div class="preview-browser">
      <div class="preview-toolbar">forreviwer.com</div>
      <div class="preview-viewport"><iframe src="/" title="포 리뷰어 로그인 첫 화면"></iframe></div>
    </div>
  </main>
</body>
</html>`;
await writeFile(new URL("../dist/share-preview.html", import.meta.url), html);
console.log(
  "Login screenshot preview prepared: /share-preview.html (1200 x 630)",
);
