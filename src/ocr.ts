// Keep the client bundled; workers/models are loaded locally on demand.
import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  ocrLines,
  readingRows,
  tileOcrLines,
  enhanceOcrPixels,
} from "../shared/ocr-layout.mjs";
import { parseOrderText } from "../shared/order-ocr.mjs";

export class OrderOcrError extends Error {}
export const OCR_MAX_FILES = 6;
export const OCR_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const OCR_MAX_BATCH_BYTES = 30 * 1024 * 1024;
export type OcrPageResult = {
  text: string;
  error?: string;
  warnings?: string[];
  uncertainFields?: ("price" | "purchaseDate" | "orderNumber")[];
};
type OcrLine = {
  text: string;
  confidence: number;
  bbox: { x0: number; x1: number; y0: number; y1: number };
};

function enhance(canvas: HTMLCanvasElement, darkOnly = false) {
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  enhanceOcrPixels(pixels.data, darkOnly);
  ctx.putImageData(pixels, 0, 0);
}

async function refineLines(
  worker: Worker,
  canvas: HTMLCanvasElement,
  lines: OcrLine[],
  check: () => void,
  budget: { remaining: number },
) {
  const refined = [...lines];
  const critical =
    /(?:주문|구매|결제)\s*(?:일|번호|금액)|총\s*결제|최종\s*결제|실\s*결제/;
  const rows = readingRows(lines);
  const candidates = lines
    .map((line, index) => ({
      line,
      index,
      critical: rows.some(
        (row) =>
          critical.test(row.text.replace(/\s/g, "")) &&
          line.bbox.y0 >= row.bbox.y0 &&
          line.bbox.y1 <= row.bbox.y1,
      ),
    }))
    .filter(
      ({ line, critical }) =>
        (line.confidence < 82 || critical) && line.text.length > 1,
    )
    .sort(
      (a, b) =>
        Number(b.critical) - Number(a.critical) ||
        a.line.confidence - b.line.confidence,
    )
    .slice(0, Math.min(8, budget.remaining));
  if (!candidates.length) return refined;
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  for (const { line, index } of candidates) {
    check();
    budget.remaining--;
    const b = line.bbox,
      pad = 6;
    const x = Math.max(0, b.x0 - pad),
      y = Math.max(0, b.y0 - pad);
    const width = Math.min(canvas.width - x, b.x1 - x + pad);
    const height = Math.min(canvas.height - y, b.y1 - y + pad);
    const scale = Math.max(1, Math.min(2, 48 / (b.y1 - b.y0), 2800 / width));
    const crop = document.createElement("canvas");
    try {
      crop.width = Math.ceil(width * scale) + 24;
      crop.height = Math.ceil(height * scale) + 24;
      const ctx = crop.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, crop.width, crop.height);
      ctx.drawImage(
        canvas,
        x,
        y,
        width,
        height,
        12,
        12,
        width * scale,
        height * scale,
      );
      enhance(crop);
      const { data } = await worker.recognize(
        crop,
        {},
        { text: true, blocks: false },
      );
      check();
      const text = data.text.trim().replace(/\s+/g, " ");
      // A second pass is a candidate, not permission to invent missing text.
      if (
        text &&
        data.confidence >= 75 &&
        data.confidence >= line.confidence + 5
      )
        refined[index] = { ...line, text, confidence: data.confidence };
    } finally {
      crop.width = 0;
      crop.height = 0;
    }
  }
  return refined;
}

export async function recognizeOrderImages(
  files: File[],
  {
    signal,
    onProgress,
    onImageComplete,
  }: {
    signal: AbortSignal;
    onProgress: (progress: number, index: number) => void;
    onImageComplete: (index: number, result: OcrPageResult) => void;
  },
) {
  let worker: Worker | undefined,
    workerUrl: string | undefined,
    finished = false,
    imageIndex = 0,
    tileIndex = 0,
    tileCount = 1,
    progressValue = 0;
  const retryBudget = { remaining: 24 };
  let fail: (reason: unknown) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const abort = () => fail(new DOMException("Cancelled", "AbortError"));
  const check = () => {
    if (signal.aborted || finished)
      throw new DOMException("Cancelled", "AbortError");
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(
    () =>
      fail(
        new OrderOcrError(
          "인식 시간이 길어지고 있습니다. 사진 수를 줄이거나 주문 부분만 잘라 다시 시도해 주세요.",
        ),
      ),
    180000,
  );
  try {
    return await Promise.race([
      failed,
      (async () => {
        check();
        // WebKit may not report a failed importScripts request to the parent
        // worker. Fetch the script explicitly so network failures are retryable.
        const script = await fetch("/ocr/worker.min.js", {
          signal,
          cache: "no-cache",
        });
        if (
          !script.ok ||
          !/javascript|ecmascript/.test(
            script.headers.get("content-type") || "",
          )
        )
          throw new Error("OCR worker unavailable");
        const source = await script.text();
        check();
        workerUrl = URL.createObjectURL(
          new Blob([source], { type: "application/javascript" }),
        );
        const ready = await createWorker("kor", 1, {
          workerPath: workerUrl,
          workerBlobURL: false,
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          errorHandler: fail,
          logger: (message) => {
            if (
              !finished &&
              !signal.aborted &&
              message.status === "recognizing text"
            ) {
              progressValue = Math.max(
                progressValue,
                Math.round(
                  ((imageIndex +
                    (tileIndex + message.progress * 0.85) / tileCount) /
                    files.length) *
                    100,
                ),
              );
              onProgress(progressValue, imageIndex);
            }
          },
        });
        if (signal.aborted || finished) {
          await ready.terminate();
          check();
        }
        worker = ready;
        const results: OcrPageResult[] = [];
        for (imageIndex = 0; imageIndex < files.length; imageIndex++) {
          check();
          let bitmap: ImageBitmap | undefined;
          let result: OcrPageResult;
          try {
            try {
              bitmap = await createImageBitmap(files[imageIndex]);
            } catch {
              throw new OrderOcrError(
                "이미지를 열 수 없습니다. PNG, JPG, WebP 파일을 다시 올려 주세요.",
              );
            }
            check();
            if (
              bitmap.width * bitmap.height > 40_000_000 ||
              bitmap.height > 30000 ||
              bitmap.width > 8000
            )
              throw new OrderOcrError(
                "이미지가 너무 큽니다. 주문 부분을 나눠서 올려 주세요.",
              );
            // Keep glyphs large instead of shrinking an entire scrolling screenshot.
            const scale = Math.min(2, 2400 / bitmap.width);
            const segmentHeight = Math.min(
              2200,
              Math.floor(8_000_000 / (bitmap.width * scale * scale)),
            );
            const overlap = Math.min(160, segmentHeight / 4);
            const tops: number[] = [];
            for (
              let top = 0;
              top < bitmap.height;
              top += segmentHeight - overlap
            ) {
              tops.push(top);
              if (top + segmentHeight >= bitmap.height) break;
            }
            tileCount = tops.length;
            const lines: OcrLine[] = [];
            const originalLines: OcrLine[] = [];
            const padding = 12;
            for (tileIndex = 0; tileIndex < tops.length; tileIndex++) {
              check();
              const top = tops[tileIndex],
                height = Math.min(segmentHeight, bitmap.height - top);
              const canvas = document.createElement("canvas");
              try {
                canvas.width = Math.round(bitmap.width * scale) + padding * 2;
                canvas.height = Math.round(height * scale) + padding * 2;
                const ctx = canvas.getContext("2d");
                if (!ctx)
                  throw new OrderOcrError(
                    "이 브라우저에서 이미지 인식을 사용할 수 없습니다.",
                  );
                ctx.fillStyle = "#fff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(
                  bitmap,
                  0,
                  top,
                  bitmap.width,
                  height,
                  padding,
                  padding,
                  bitmap.width * scale,
                  height * scale,
                );
                enhance(canvas, true);
                await ready.setParameters({
                  tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
                  user_defined_dpi: "300",
                });
                const { data } = await ready.recognize(
                  canvas,
                  {},
                  { text: true, blocks: true },
                );
                check();
                const original = ocrLines(data) as OcrLine[];
                let detected = original;
                if (!original.length && retryBudget.remaining > 0) {
                  // Sparse layouts sometimes look empty to block segmentation.
                  // Retry once after contrast correction, with the same worker.
                  retryBudget.remaining--;
                  enhance(canvas);
                  await ready.setParameters({
                    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
                  });
                  const retry = await ready.recognize(
                    canvas,
                    {},
                    { text: true, blocks: true },
                  );
                  check();
                  detected = ocrLines(retry.data) as OcrLine[];
                }
                const refined = await refineLines(
                  ready,
                  canvas,
                  detected,
                  check,
                  retryBudget,
                );
                const geometry = {
                  top,
                  height,
                  imageHeight: bitmap.height,
                  scale,
                  padding,
                  overlap,
                };
                originalLines.push(...tileOcrLines(original, geometry));
                lines.push(...tileOcrLines(refined, geometry));
              } finally {
                canvas.width = 0;
                canvas.height = 0;
              }
            }
            const text = readingRows(lines)
              .map((line) => line.text)
              .join("\n");
            const originalText = readingRows(originalLines)
              .map((line) => line.text)
              .join("\n");
            const before = parseOrderText(originalText),
              after = parseOrderText(text);
            const uncertainFields = (
              ["price", "purchaseDate", "orderNumber"] as const
            ).filter(
              (field) =>
                before[field] !== undefined &&
                after[field] !== undefined &&
                before[field] !== after[field],
            );
            const warnings = lines.some((line) => line.confidence < 65)
              ? [
                  "흐리거나 작게 읽힌 글자가 있어요. 상품명·금액·날짜를 원본과 확인해 주세요.",
                ]
              : [];
            if (uncertainFields.length)
              warnings.push(
                "다시 읽은 금액·날짜·주문번호가 원래 결과와 달라 해당 항목은 자동 입력하지 않았어요. 원본을 확인해 주세요.",
              );
            result = text.trim()
              ? { text, warnings, uncertainFields }
              : {
                  text: "",
                  error:
                    "텍스트를 찾지 못했습니다. 더 선명한 주문내역을 올려 주세요.",
                };
          } catch (error) {
            check();
            if (!(error instanceof OrderOcrError)) throw error;
            result = { text: "", error: error.message };
          } finally {
            bitmap?.close();
          }
          check();
          results.push(result);
          onImageComplete(imageIndex, result);
          onProgress(
            Math.round(((imageIndex + 1) / files.length) * 100),
            imageIndex,
          );
        }
        return results;
      })(),
    ]);
  } catch (error) {
    if (signal.aborted || error instanceof OrderOcrError) throw error;
    throw new OrderOcrError(
      "주문내역을 읽지 못했습니다. 연결 상태를 확인하고 이미지를 다시 올려 주세요.",
    );
  } finally {
    finished = true;
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    await worker?.terminate().catch(() => {});
    if (workerUrl) URL.revokeObjectURL(workerUrl);
  }
}
