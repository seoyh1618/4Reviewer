// Keep the client bundled; workers/models are loaded locally on demand.
import { createWorker, type Worker } from "tesseract.js";

export class OrderOcrError extends Error {}
export const OCR_MAX_FILES = 6;
export const OCR_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const OCR_MAX_BATCH_BYTES = 30 * 1024 * 1024;
export type OcrPageResult = { text: string; error?: string };

function mergeTiles(texts: string[]) {
  const lines: string[] = [];
  const key = (line: string) => line.replace(/\s+/g, "");
  for (const text of texts) {
    const next = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    let overlap = 0;
    for (
      let count = Math.min(lines.length, next.length, 15);
      count > 0;
      count--
    ) {
      if (lines.slice(-count).every((line, i) => key(line) === key(next[i]))) {
        overlap = count;
        break;
      }
    }
    lines.push(...next.slice(overlap));
  }
  return lines.join("\n");
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
    tileCount = 1;
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
            )
              onProgress(
                Math.round(
                  ((imageIndex + (tileIndex + message.progress) / tileCount) /
                    files.length) *
                    100,
                ),
                imageIndex,
              );
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
            const texts: string[] = [];
            for (tileIndex = 0; tileIndex < tops.length; tileIndex++) {
              check();
              const top = tops[tileIndex],
                height = Math.min(segmentHeight, bitmap.height - top);
              const canvas = document.createElement("canvas");
              try {
                canvas.width = Math.round(bitmap.width * scale);
                canvas.height = Math.round(height * scale);
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
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                );
                const { data } = await ready.recognize(canvas);
                check();
                texts.push(data.text);
              } finally {
                canvas.width = 0;
                canvas.height = 0;
              }
            }
            const text = mergeTiles(texts);
            result = text.trim()
              ? { text }
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
