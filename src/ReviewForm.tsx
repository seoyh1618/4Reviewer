import { useState, useRef, useEffect, useId, type FormEvent } from "react";
import {
  ScanLine,
  UploadCloud,
  CheckCircle2,
  ShieldCheck,
  ImagePlus,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import { recognizeOrderImage } from "./ocr";
import {
  platforms,
  shippingMethods,
  reviewTypes,
  parseOrderText,
  reviewSchema,
  today,
  expectedSettlement,
  normalizePayback,
} from "../shared/domain.mjs";
import { emptyReview, won } from "./lib";
import { Modal, Button, PaybackBadge } from "./ui";
import type { Review, ReviewInput } from "./types";

export default function ReviewForm({
  item,
  onClose,
  onSave,
  startOcr = false,
}: {
  item?: Review;
  onClose: () => void;
  onSave: (data: ReviewInput) => Promise<void>;
  startOcr?: boolean;
}) {
  const [data, setData] = useState<ReviewInput>(
      () => normalizePayback(item || emptyReview()) as ReviewInput,
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [ocrBusy, setOcrBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [ocrText, setOcrText] = useState(""),
    [ocrError, setOcrError] = useState(""),
    [preview, setPreview] = useState(""),
    [applied, setApplied] = useState(false),
    [expanded, setExpanded] = useState(!!item);
  const ocrRun = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null),
    generation = useRef(0);
  const dueDateHelpId = useId(),
    kakaoNameHelpId = useId(),
    paybackHelpId = useId(),
    reviewFeeHelpId = useId();
  const update = <K extends keyof ReviewInput>(key: K, value: ReviewInput[K]) =>
    setData(
      (d) =>
        normalizePayback({
          ...d,
          [key]: value,
        }) as ReviewInput,
    );
  useEffect(
    () => () => {
      generation.current++;
      ocrRun.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function recognize(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setOcrError("PNG, JPG, WebP 이미지를 10MB 이하로 올려 주세요.");
      return;
    }
    const run = ++generation.current;
    setOcrError("");
    setOcrText("");
    setApplied(false);
    setProgress(0);
    setOcrBusy(true);
    setPreview(URL.createObjectURL(file));
    ocrRun.current?.abort();
    const controller = new AbortController();
    ocrRun.current = controller;
    try {
      const text = await recognizeOrderImage(file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (run !== generation.current) return;
      setOcrText(text);
      applyOcr(text);
      setProgress(100);
    } catch (e) {
      if (run === generation.current)
        setOcrError(
          (e as Error).message ||
            "이미지 인식에 실패했습니다. 다시 올려 주세요.",
        );
    } finally {
      if (ocrRun.current === controller) ocrRun.current = null;
      if (run === generation.current) setOcrBusy(false);
    }
  }
  function cancelOcr() {
    generation.current++;
    ocrRun.current?.abort();
    ocrRun.current = null;
    setOcrBusy(false);
    setOcrError("인식을 취소했습니다. 직접 입력하거나 다시 올릴 수 있어요.");
  }
  function applyOcr(text = ocrText) {
    const parsed = parseOrderText(text);
    if (!Object.keys(parsed).length) {
      setOcrError(
        "자동으로 구분할 항목을 찾지 못했습니다. 아래 인식 원문을 참고해 직접 입력해 주세요.",
      );
      return;
    }
    setData((d) => normalizePayback({ ...d, ...parsed }) as ReviewInput);
    if (parsed.orderNumber) setExpanded(true);
    setApplied(true);
    setOcrError("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = reviewSchema.safeParse(
      item
        ? data
        : {
            ...data,
            reviewStatus: "todo",
            reviewedAt: "",
            receivedAmount: 0,
            paidAt: "",
            depositor: "",
          },
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data as ReviewInput);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={item ? "상품 정보 수정" : "새 상품 등록"}
      onClose={() => {
        if (!saving) onClose();
      }}
      wide
      className="review-form-modal"
    >
      <form onSubmit={submit}>
        <div className="modal-body form-body">
          {!item && (
            <section className="ocr-section">
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                aria-label="주문내역 이미지 업로드"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void recognize(file);
                }}
              />
              <button
                type="button"
                className={`upload-zone ${startOcr ? "highlight" : ""}`}
                disabled={ocrBusy}
                onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!ocrBusy) void recognize(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-icon">
                  {ocrBusy ? (
                    <LoaderCircle className="spin" size={25} />
                  ) : (
                    <ScanLine size={25} />
                  )}
                </span>
                <div>
                  <strong>
                    {ocrBusy
                      ? `주문내역을 읽고 있어요 · ${progress}%`
                      : "주문내역 한 장으로, 더 간편하게"}
                  </strong>
                  <p>
                    {ocrBusy
                      ? "처음에는 인식 도구를 준비하는 시간이 필요해요."
                      : "상품명·구매금액·구매일·주문번호를 자동으로 채워드려요."}
                  </p>
                  <span>JPG, PNG, WebP · 최대 10MB</span>
                </div>
                <UploadCloud size={21} />
              </button>
              {ocrBusy && (
                <>
                  <progress
                    max={100}
                    value={progress}
                    aria-label="이미지 인식 진행률"
                  />
                  <Button type="button" variant="ghost" onClick={cancelOcr}>
                    인식 취소
                  </Button>
                </>
              )}
              <p className="privacy-note">
                <ShieldCheck size={13} />
                이미지는 이 기기에서만 읽으며 서버에 저장하지 않아요.
              </p>
              {ocrError && (
                <div className="error-message" role="alert">
                  {ocrError}
                </div>
              )}
              {ocrText && (
                <div className="ocr-result">
                  <div className="ocr-preview">
                    {preview && <img src={preview} alt="업로드한 주문내역" />}
                    <div>
                      <b>인식 결과를 확인해 주세요</b>
                      <p>
                        찾은 정보는 아래 입력란에 채워져요. 주문내역에 없는
                        판매처·리뷰비·담당자 정보는 직접 입력해 주세요.
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => applyOcr()}
                      >
                        {applied ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <ScanLine size={15} />
                        )}{" "}
                        {applied ? "다시 적용" : "인식한 정보 채우기"}
                      </Button>
                    </div>
                  </div>
                  <details>
                    <summary>인식 원문 확인·수정</summary>
                    <textarea
                      aria-label="OCR 인식 원문"
                      value={ocrText}
                      onChange={(e) => {
                        setOcrText(e.target.value);
                        setApplied(false);
                      }}
                      rows={6}
                    />
                  </details>
                  {applied && (
                    <p className="success-text" role="status">
                      찾은 정보를 채웠어요. 상품명·금액·날짜를 확인한 뒤 저장해
                      주세요.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
          <div className="form-section-heading">
            <span>01</span>
            <h3>상품 정보</h3>
            <small>* 필수 항목</small>
          </div>
          <div className="form-grid">
            <label className="span-2">
              상품명 <em>*</em>
              <input
                name="productName"
                required
                maxLength={200}
                placeholder="어떤 상품을 리뷰하시나요?"
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <label className="span-2">
              계정주 (구매 계정)
              <input
                maxLength={80}
                placeholder="구매에 사용한 계정주 또는 계정명"
                value={data.purchaser}
                onChange={(e) => update("purchaser", e.target.value)}
              />
            </label>
            <label>
              구매 플랫폼 <em>*</em>
              <select
                value={data.platform}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    platform: e.target.value,
                    platformOther:
                      e.target.value === "기타" ? d.platformOther : "",
                  }))
                }
              >
                {platforms.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            {data.platform === "기타" && (
              <label>
                기타 플랫폼 이름 <em>*</em>
                <input
                  required
                  maxLength={80}
                  placeholder="예: G마켓, 옥션"
                  value={data.platformOther}
                  onChange={(e) => update("platformOther", e.target.value)}
                />
              </label>
            )}
            <label>
              리뷰 타입 <em>*</em>
              <select
                required
                aria-label="리뷰 타입"
                value={data.shippingMethod}
                onChange={(e) =>
                  update(
                    "shippingMethod",
                    e.target.value as ReviewInput["shippingMethod"],
                  )
                }
              >
                {!data.shippingMethod && (
                  <option value="" disabled>
                    리뷰 타입을 선택해 주세요
                  </option>
                )}
                {shippingMethods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
              <small>
                빈박스는 상품 가격과 리뷰비, 실배송은 리뷰비만 정산해요.
              </small>
            </label>
            <label>
              판매처
              <input
                placeholder="브랜드 또는 판매처"
                maxLength={100}
                value={data.seller}
                onChange={(e) => update("seller", e.target.value)}
              />
            </label>
            <label>
              구매일 <em>*</em>
              <input
                type="date"
                required
                value={data.purchaseDate}
                onChange={(e) => update("purchaseDate", e.target.value)}
              />
            </label>
            <div className="registration-amounts span-2">
              <label>
                구매금액 <em>*</em>
                <div className="unit-input">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1000000000}
                    required
                    value={data.price}
                    placeholder="0"
                    onChange={(e) => update("price", Number(e.target.value))}
                  />
                  <span>원</span>
                </div>
              </label>
              {!item && (
                <label>
                  리뷰비
                  <div className="unit-input">
                    <input
                      aria-label="리뷰비"
                      aria-describedby={reviewFeeHelpId}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={Math.max(0, 1_000_000_000 - data.expectedPayback)}
                      step={1}
                      value={data.additionalReviewFee}
                      placeholder="0"
                      onChange={(e) =>
                        update("additionalReviewFee", Number(e.target.value))
                      }
                    />
                    <span>원</span>
                  </div>
                  <small id={reviewFeeHelpId}>
                    리뷰를 진행하고 받는 금액이에요. 없으면 0원으로 두세요.
                  </small>
                </label>
              )}
            </div>
            {!item && (
              <div
                className="form-hint span-2"
                role="group"
                aria-label="예상 정산 금액"
                aria-live="polite"
              >
                {data.shippingMethod === "빈박스"
                  ? "빈박스 · 상품 가격 + 리뷰비"
                  : "실배송 · 리뷰비만 정산"}
                <strong>
                  {" "}
                  · 총 받을 금액 {won(expectedSettlement(data))}원
                </strong>
              </div>
            )}
          </div>
          <div className="form-section-heading">
            <span>02</span>
            <h3>{item ? "리뷰 일정과 작성" : "리뷰 정보"}</h3>
          </div>
          <div className="form-grid">
            <label>
              리뷰 가이드 (유형)
              <select
                value={data.reviewType}
                onChange={(e) => update("reviewType", e.target.value)}
              >
                {reviewTypes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              리뷰 마감일
              <input
                aria-label="리뷰 마감일"
                aria-describedby={dueDateHelpId}
                type="date"
                value={data.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
              />
              <small id={dueDateHelpId}>
                리뷰 마감일이 정해지지 않았다면 비워 두셔도 됩니다.
              </small>
            </label>
            {item && (
              <>
                <label>
                  리뷰 상태
                  <select
                    value={data.reviewStatus}
                    onChange={(e) => {
                      const status = e.target.value as "todo" | "done";
                      setData((d) => ({
                        ...d,
                        reviewStatus: status,
                        reviewedAt:
                          status === "done" ? d.reviewedAt || today() : "",
                      }));
                    }}
                  >
                    <option value="todo">작성 전</option>
                    <option value="done">리뷰 완료</option>
                  </select>
                </label>
                <label>
                  리뷰 작성일
                  <input
                    type="date"
                    value={data.reviewedAt}
                    disabled={data.reviewStatus !== "done"}
                    onChange={(e) => update("reviewedAt", e.target.value)}
                  />
                  <small>
                    {data.reviewStatus === "done"
                      ? "실제로 작성한 날짜로 수정할 수 있어요."
                      : "리뷰 완료 상태를 선택하면 입력할 수 있어요."}
                  </small>
                </label>
              </>
            )}
          </div>
          {item && (
            <>
              <div className="form-section-heading">
                <span>03</span>
                <h3>페이백과 정산</h3>
              </div>
              <div className="form-grid">
                <label>
                  예상 페이백
                  <div className="unit-input">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={1000000000}
                      value={data.expectedPayback}
                      aria-label="예상 페이백"
                      aria-describedby={paybackHelpId}
                      readOnly
                    />
                    <span>원</span>
                  </div>
                  <small id={paybackHelpId}>
                    {data.shippingMethod === "빈박스"
                      ? "빈박스는 상품 가격을 페이백에 포함해요."
                      : data.shippingMethod === "실배송"
                        ? "실배송은 상품 가격을 제외하고 리뷰비만 정산해요."
                        : "리뷰 타입을 선택하면 상품값 페이백을 계산해요."}
                  </small>
                </label>
                <label>
                  추가 리뷰비
                  <div className="unit-input">
                    <input
                      aria-label="추가 리뷰비"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={Math.max(0, 1_000_000_000 - data.expectedPayback)}
                      step={1}
                      value={data.additionalReviewFee}
                      onChange={(e) =>
                        update("additionalReviewFee", Number(e.target.value))
                      }
                    />
                    <span>원</span>
                  </div>
                  <small>
                    리뷰를 진행하고 받는 금액이에요. 없으면 0원으로 두세요.
                  </small>
                </label>
                <label>
                  실제 누적 입금액
                  <div className="unit-input">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={expectedSettlement(data)}
                      value={data.receivedAmount}
                      onChange={(e) =>
                        update("receivedAmount", Number(e.target.value))
                      }
                    />
                    <span>원</span>
                  </div>
                  <small>이미 받은 페이백이 있다면 입력하세요.</small>
                </label>
                <label>
                  정산일
                  <input
                    type="date"
                    value={data.paidAt}
                    required={data.receivedAmount > 0}
                    onChange={(e) => update("paidAt", e.target.value)}
                  />
                </label>
                <label>
                  입금자명
                  <input
                    maxLength={100}
                    placeholder="통장에 표시된 입금자명"
                    value={data.depositor}
                    onChange={(e) => update("depositor", e.target.value)}
                  />
                </label>
                <div className="settlement-preview span-2">
                  <span>페이백 상태</span>
                  <PaybackBadge item={data} />
                  <small>
                    예상 페이백과 추가 리뷰비를 합산해 실제 입금액과 비교해요.
                  </small>
                </div>
                <p className="form-hint span-2">
                  추가 입금은 상품 상세의 ‘정산 완료’를 이용하세요. 누적액을
                  줄이거나 날짜만 고치면 입금 이력을 정정한 금액·날짜로 다시
                  집계합니다.
                </p>
              </div>
            </>
          )}
          <div className="form-section-heading">
            <span>{item ? "04" : "03"}</span>
            <h3>연락처와 메모</h3>
          </div>
          <div className="form-grid">
            <label>
              연락처
              <input
                maxLength={100}
                placeholder="담당자 연락처 또는 연락용 ID"
                value={data.contact}
                onChange={(e) => update("contact", e.target.value)}
              />
            </label>
            <label>
              카톡 이름
              <input
                aria-label="카톡 이름"
                aria-describedby={kakaoNameHelpId}
                maxLength={100}
                placeholder="리뷰 제안을 보낸 상대방의 카톡 이름"
                value={data.kakaoName}
                onChange={(e) => update("kakaoName", e.target.value)}
              />
              <small id={kakaoNameHelpId}>
                카카오톡에서 실제로 리뷰 제안(오퍼)을 보낸 상대방의 카톡 이름을
                입력해 주세요.
              </small>
            </label>
          </div>
          <button
            type="button"
            className="advanced-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <span>추가 관리 정보 · SKU, 주문번호</span>
            <ChevronDown size={17} className={expanded ? "rotate" : ""} />
          </button>
          {expanded && (
            <div className="form-grid advanced-fields">
              <label>
                SKU
                <input
                  maxLength={80}
                  placeholder="나만의 관리 코드"
                  value={data.sku}
                  onChange={(e) => update("sku", e.target.value)}
                />
              </label>
              <label>
                주문번호
                <input
                  maxLength={100}
                  value={data.orderNumber}
                  onChange={(e) => update("orderNumber", e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="memo-label">
            메모
            <textarea
              rows={3}
              maxLength={2000}
              placeholder="리뷰 작성 가이드나 기억해 둘 내용을 적어주세요."
              value={data.memo}
              onChange={(e) => update("memo", e.target.value)}
            />
          </label>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span className="form-footer-note">
            입력한 정보는 나에게만 보여요.
          </span>
          <Button type="button" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button
            variant="primary"
            type="submit"
            busy={saving}
            disabled={ocrBusy}
          >
            {item ? "변경사항 저장" : "상품 등록하기"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
