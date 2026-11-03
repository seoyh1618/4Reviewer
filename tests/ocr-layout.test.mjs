import test from "node:test";
import assert from "node:assert/strict";
import {
  readingRows,
  tileOcrLines,
  enhanceOcrPixels,
} from "../shared/ocr-layout.mjs";
import { parseOrderText } from "../shared/order-ocr.mjs";

const line = (text, x, y, width = 100) => ({
  text,
  confidence: 90,
  bbox: { x0: x, y0: y, x1: x + width, y1: y + 20 },
});
test("payment labels stay paired with their amounts even when OCR reads columns vertically", () => {
  const rows = readingRows([
    line("총 상품금액", 20, 40),
    line("쿠폰할인", 20, 80),
    line("총 결제금액", 20, 120),
    line("25,000원", 500, 42),
    line("3,000원", 500, 82),
    line("22,000원", 500, 122),
  ]);
  assert.deepEqual(
    rows.map((r) => r.text),
    ["총 상품금액 25,000원", "쿠폰할인 3,000원", "총 결제금액 22,000원"],
  );
  assert.equal(parseOrderText(rows.map((r) => r.text).join("\n")).price, 22000);
});
test("tile boundaries use geometry rather than deleting identical text at different positions", () => {
  const first = tileOcrLines(
    [line("상품명 머그", 12, 1812), line("잘린 글자", 12, 1952)],
    {
      top: 0,
      height: 1000,
      imageHeight: 1800,
      scale: 2,
      padding: 12,
      overlap: 200,
    },
  );
  const second = tileOcrLines(
    [line("상품명 머그", 12, 212), line("상품명 머그", 12, 512)],
    {
      top: 800,
      height: 1000,
      imageHeight: 1800,
      scale: 2,
      padding: 12,
      overlap: 200,
    },
  );
  assert.equal(first.length, 0);
  assert.deepEqual(
    second.map((l) => l.bbox.y0),
    [900, 1050],
  );
  assert.equal(second[0].text, second[1].text);
});
test("contrast enhancement handles pale text, dark mode and a blank image without corrupting alpha", () => {
  for (const [background, foreground, inverted] of [
    [250, 150, false],
    [30, 210, true],
  ]) {
    const pixels = new Uint8ClampedArray(400);
    for (let i = 0; i < pixels.length; i += 4)
      pixels.set(
        [
          i < 360 ? background : foreground,
          i < 360 ? background : foreground,
          i < 360 ? background : foreground,
          255,
        ],
        i,
      );
    assert.equal(enhanceOcrPixels(pixels).inverted, inverted);
    assert.equal(pixels[0], 255);
    assert.equal(pixels[360], 0);
    assert.equal(pixels[363], 255);
  }
  const blank = new Uint8ClampedArray(40).fill(255);
  enhanceOcrPixels(blank);
  assert.ok(blank.every((v) => v === 255));
});
