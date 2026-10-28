// Include the small client in the page bundle so an open page never requests
// a deleted, hashed OCR chunk after a rebuild. The worker/model stay on demand.
import { createWorker, type Worker } from "tesseract.js";

export class OrderOcrError extends Error {}

async function prepareImage(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new OrderOcrError(
      "이미지를 열 수 없습니다. PNG, JPG, WebP 파일을 다시 올려 주세요.",
    );
  }
  try {
    const pixels = bitmap.width * bitmap.height;
    if (pixels > 30_000_000)
      throw new OrderOcrError(
        "이미지가 너무 큽니다. 주문 한 건만 잘라서 올려 주세요.",
      );
    // Small order screenshots need larger glyphs. Bound the canvas for mobile.
    const scale = Math.min(2, Math.sqrt(12_000_000 / pixels));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new OrderOcrError(
        "이 브라우저에서 이미지 인식을 사용할 수 없습니다.",
      );
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export async function recognizeOrderImage(
  file: File,
  {
    signal,
    onProgress,
  }: { signal: AbortSignal; onProgress: (progress: number) => void },
) {
  let worker: Worker | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let fail: (reason: unknown) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const abort = () => fail(new DOMException("Cancelled", "AbortError"));
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  timeout = setTimeout(
    () =>
      fail(
        new OrderOcrError(
          "인식 시간이 길어지고 있습니다. 연결 상태를 확인하거나 주문 부분만 잘라 다시 시도해 주세요.",
        ),
      ),
    90000,
  );
  try {
    return await Promise.race([
      failed,
      (async () => {
        const image = await prepareImage(file);
        if (signal.aborted || finished)
          throw new DOMException("Cancelled", "AbortError");
        // The Korean model also reads Latin letters. Mixing English into this
        // pass misclassifies small Korean product names as English glyphs.
        const ready = await createWorker("kor", 1, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          errorHandler: (error: unknown) => fail(error),
          logger: (message) => {
            if (
              !finished &&
              !signal.aborted &&
              message.status === "recognizing text"
            )
              onProgress(Math.round(message.progress * 100));
          },
        });
        if (signal.aborted || finished) {
          await ready.terminate();
          throw new DOMException("Cancelled", "AbortError");
        }
        worker = ready;
        const { data } = await worker.recognize(image);
        if (!data.text.trim())
          throw new OrderOcrError(
            "텍스트를 찾지 못했습니다. 더 선명한 주문내역을 올려 주세요.",
          );
        return data.text;
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
  }
}
