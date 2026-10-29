import { useEffect, useRef, useState } from "react";
import {
  ScanLine,
  UploadCloud,
  ShieldCheck,
  LoaderCircle,
  X,
  CheckCircle2,
} from "lucide-react";
import {
  recognizeOrderImages,
  OCR_MAX_FILES,
  OCR_MAX_FILE_BYTES,
  OCR_MAX_BATCH_BYTES,
} from "./ocr";
import { parseOrderDocuments } from "../shared/order-ocr.mjs";
import { Button } from "./ui";
import type { ReviewInput } from "./types";

type PageImage = {
  id: string;
  file: File;
  url: string;
  text?: string;
  error?: string;
};

export default function OrderImport({
  startOcr,
  onApply,
  onBusy,
}: {
  startOcr: boolean;
  onApply: (fields: Partial<ReviewInput>) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [pages, setPages] = useState<PageImage[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [active, setActive] = useState(0),
    [error, setError] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]),
    [applied, setApplied] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    current = useRef<PageImage[]>([]),
    urls = useRef(new Set<string>());
  const updatePages = (next: PageImage[]) => {
    current.current = next;
    setPages(next);
  };
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  function apply(next = current.current) {
    setWarnings([]);
    setApplied(false);
    if (!next.length || next.some((p) => !p.text?.trim() || p.error)) {
      onApply({});
      if (next.length)
        setError(
          "일부 사진을 읽지 못해 자동 입력하지 않았어요. 다시 읽거나 해당 사진을 제거해 주세요.",
        );
      return;
    }
    const result = parseOrderDocuments(next.map((p) => p.text!));
    onApply(result.fields as Partial<ReviewInput>);
    setWarnings(result.warnings);
    setApplied(Object.keys(result.fields).length > 0);
    setError(
      !Object.keys(result.fields).length && !result.warnings.length
        ? "자동으로 구분할 항목을 찾지 못했습니다. 아래 인식 원문을 참고해 직접 입력해 주세요."
        : "",
    );
  }
  async function recognize(next: PageImage[]) {
    const queued = next.filter((p) => !p.text || p.error);
    if (!queued.length) {
      apply(next);
      return;
    }
    const run = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    onBusy(true);
    setProgress(0);
    setActive(0);
    setError("");
    setWarnings([]);
    setApplied(false);
    onApply({});
    let working = next.map((p) =>
      queued.some((q) => q.id === p.id)
        ? { ...p, text: undefined, error: undefined }
        : p,
    );
    updatePages(working);
    try {
      await recognizeOrderImages(
        queued.map((p) => p.file),
        {
          signal: abort.signal,
          onProgress: (value, index) => {
            if (run === generation.current) {
              setProgress(value);
              setActive(working.findIndex((p) => p.id === queued[index].id));
            }
          },
          onImageComplete: (index, result) => {
            if (run !== generation.current) return;
            working = working.map((p) =>
              p.id === queued[index].id ? { ...p, ...result } : p,
            );
            updatePages(working);
          },
        },
      );
      if (run === generation.current) {
        apply(working);
        setProgress(100);
      }
    } catch (e) {
      if (run !== generation.current) return;
      const message =
        (e as Error).message || "이미지 인식에 실패했습니다. 다시 올려 주세요.";
      updatePages(working.map((p) => (!p.text ? { ...p, error: message } : p)));
      setError(message);
    } finally {
      if (run === generation.current) {
        controller.current = null;
        setBusy(false);
        onBusy(false);
      }
    }
  }
  function addFiles(files: File[]) {
    if (busy || !files.length) return;
    if (
      files.some(
        (f) =>
          !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
          f.size > OCR_MAX_FILE_BYTES,
      )
    ) {
      setError("PNG, JPG, WebP 이미지를 한 장당 10MB 이하로 올려 주세요.");
      return;
    }
    const id = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
    const fresh = files.filter(
      (file, index) =>
        !current.current.some((p) => p.id === id(file)) &&
        files.findIndex((f) => id(f) === id(file)) === index,
    );
    if (current.current.length + fresh.length > OCR_MAX_FILES) {
      setError("같은 주문의 사진을 최대 6장까지 올릴 수 있어요.");
      return;
    }
    if (
      [...current.current.map((p) => p.file), ...fresh].reduce(
        (total, f) => total + f.size,
        0,
      ) > OCR_MAX_BATCH_BYTES
    ) {
      setError("사진의 전체 용량은 30MB 이하로 올려 주세요.");
      return;
    }
    const next = [
      ...current.current,
      ...fresh.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { id: id(file), file, url };
      }),
    ];
    updatePages(next);
    void recognize(next);
  }
  function remove(id: string) {
    const removed = current.current.find((p) => p.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.url);
      urls.current.delete(removed.url);
    }
    const next = current.current.filter((p) => p.id !== id);
    updatePages(next);
    setError("");
    apply(next);
  }
  function cancel() {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    onBusy(false);
    setError("인식을 취소했습니다. 직접 입력하거나 다시 올릴 수 있어요.");
  }
  return (
    <section className="ocr-section">
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="주문내역 이미지 업로드"
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          addFiles(files);
        }}
      />
      <button
        type="button"
        className={`upload-zone ${startOcr ? "highlight" : ""}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="upload-icon">
          {busy ? (
            <LoaderCircle className="spin" size={25} />
          ) : (
            <ScanLine size={25} />
          )}
        </span>
        <div>
          <strong>
            {busy
              ? `주문내역을 읽고 있어요 · ${active + 1}/${pages.length}장 · ${progress}%`
              : pages.length
                ? "주문내역 사진 추가하기"
                : "주문내역 사진으로 간편하게"}
          </strong>
          <p>
            같은 상품·주문의 사진을 함께 올려 주세요.
            상품명·구매금액·구매일·플랫폼을 찾아드려요.
          </p>
          <span>JPG, PNG, WebP · 최대 6장 · 장당 10MB · 전체 30MB</span>
        </div>
        <UploadCloud size={21} />
      </button>
      {busy && (
        <>
          <progress
            max={100}
            value={progress}
            aria-label="이미지 인식 진행률"
          />
          <Button type="button" variant="ghost" onClick={cancel}>
            인식 취소
          </Button>
        </>
      )}
      <p className="privacy-note">
        <ShieldCheck size={13} />
        이미지는 이 기기에서만 읽으며 서버에 저장하지 않아요.
      </p>
      {!!pages.length && (
        <ul className="ocr-images" aria-label="업로드한 주문내역 이미지">
          {pages.map((p, index) => (
            <li key={p.id}>
              <img src={p.url} alt={`${index + 1}번 주문내역`} />
              <div>
                <strong>
                  {index + 1}. {p.file.name}
                </strong>
                <small>
                  {p.error
                    ? "인식 실패 · 다시 읽거나 제거해 주세요"
                    : p.text
                      ? "인식 완료"
                      : busy && index === active
                        ? "읽는 중"
                        : "인식 대기"}
                </small>
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                onClick={() => remove(p.id)}
                aria-label={`${index + 1}번 이미지 제거`}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {!!warnings.length && (
        <div className="ocr-notice" role="note">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      {!busy && pages.some((p) => !p.text || p.error) && (
        <Button type="button" onClick={() => void recognize(current.current)}>
          다시 읽기
        </Button>
      )}
      {pages.some((p) => p.text) && (
        <div className="ocr-result">
          <div className="ocr-preview">
            <div>
              <b>인식 결과를 확인해 주세요</b>
              <p>
                같은 주문의 정보를 모아 채워요. 여러 상품이 포함된 주문은 상품별
                금액을 확인해 주세요. 리뷰비·카톡 이름은 직접 입력해 주세요.
              </p>
              <Button
                type="button"
                disabled={busy || pages.some((p) => !p.text || p.error)}
                variant="primary"
                onClick={() => apply()}
              >
                {applied ? <CheckCircle2 size={15} /> : <ScanLine size={15} />}
                {applied ? "다시 적용" : "인식한 정보 채우기"}
              </Button>
            </div>
          </div>
          <details>
            <summary>인식 원문 확인·수정</summary>
            {pages.map((p, index) => (
              <label key={p.id} className="ocr-source-label">
                {index + 1}번 이미지
                <textarea
                  disabled={busy}
                  aria-label={
                    pages.length === 1
                      ? "OCR 인식 원문"
                      : `OCR 인식 원문 ${index + 1}`
                  }
                  value={p.text || ""}
                  rows={5}
                  onChange={(e) => {
                    updatePages(
                      current.current.map((entry) =>
                        entry.id === p.id
                          ? { ...entry, text: e.target.value, error: undefined }
                          : entry,
                      ),
                    );
                    setApplied(false);
                  }}
                />
              </label>
            ))}
          </details>
          {applied && (
            <p className="success-text" role="status">
              찾은 정보를 채웠어요. 상품명·금액·날짜를 확인한 뒤 저장해 주세요.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
