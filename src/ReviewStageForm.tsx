import { useRef, useState, useId, type FormEvent } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import {
  today,
  reviewTypes,
  reviewSchema,
  expectedSettlement,
} from "../shared/domain.mjs";
import { Modal, Button, Platform } from "./ui";
import { platformLabel } from "../shared/domain.mjs";
import { won } from "./lib";
import type { Review, ReviewInput } from "./types";
import type { ReviewStage } from "./ReviewProgress";

export default function ReviewStageForm({
  item,
  stage,
  onSave,
  onClose,
}: {
  item: Review;
  stage: ReviewStage;
  onSave: (data: ReviewInput) => Promise<void>;
  onClose: () => void;
}) {
  const payment = stage === "payment";
  const [additionalReviewFee, setAdditionalReviewFee] = useState(
    String(item.additionalReviewFee ?? 0),
  );
  const fee = Number(additionalReviewFee);
  const total = expectedSettlement({ ...item, additionalReviewFee: fee });
  const remaining = Math.max(0, total - item.receivedAmount);
  const feeHelpId = useId();
  const [reviewedAt, setReviewedAt] = useState(item.reviewedAt || today());
  const [reviewType, setReviewType] = useState(item.reviewType);
  const [memo, setMemo] = useState(item.memo);
  const [amount, setAmount] = useState<string | null>(null);
  const paymentAmount = amount === null ? remaining : Number(amount);
  const [paidAt, setPaidAt] = useState(today());
  const [depositor, setDepositor] = useState(item.depositor);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const completePayment = paymentAmount === remaining;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    setError("");
    if (
      payment &&
      (item.reviewStatus !== "done" ||
        remaining <= 0 ||
        !Number.isSafeInteger(paymentAmount) ||
        paymentAmount <= 0 ||
        paymentAmount > remaining)
    ) {
      setError("리뷰 완료 후 남은 페이백 이내의 실제 입금액을 입력해 주세요.");
      return;
    }
    if (!payment && !reviewedAt) {
      setError("리뷰 작성일을 입력해 주세요.");
      return;
    }
    const data = payment
      ? {
          ...item,
          additionalReviewFee: fee,
          receivedAmount: item.receivedAmount + paymentAmount,
          paidAt,
          depositor,
        }
      : {
          ...item,
          additionalReviewFee: fee,
          reviewStatus: "done" as const,
          reviewedAt,
          reviewType,
          memo,
        };
    const parsed = reviewSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      await onSave(parsed.data as ReviewInput);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={payment ? "정산 정보 입력" : "리뷰 완료 입력"}
      onClose={() => {
        if (!saving.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="modal-body stage-form-body">
          <div className="stage-product">
            <Platform name={platformLabel(item)} />
            <h3>{item.name}</h3>
          </div>
          <div className="stage-summary">
            {payment ? <Wallet size={20} /> : <CheckCircle2 size={20} />}
            <div>
              <strong>
                {payment
                  ? "리뷰 완료 → 정산 완료"
                  : item.reviewStatus === "done"
                    ? "리뷰 정보 수정"
                    : "작성 전 → 리뷰 완료"}
              </strong>
              <p>
                {payment
                  ? "실제로 받은 금액을 입력해 주세요. 부분 입금도 기록할 수 있습니다."
                  : item.reviewStatus === "done"
                    ? "리뷰 작성일과 유형, 추가 리뷰비, 메모를 수정할 수 있습니다."
                    : "작성한 리뷰 정보를 저장하면 리뷰 완료로 반영됩니다."}
              </p>
            </div>
          </div>
          {payment && total === 0 && (
            <p className="stage-empty-payment" role="status">
              현재 받을 금액이 0원이에요. 추가로 받을 리뷰비가 있다면 아래에
              입력한 뒤 실제 입금액을 기록해 주세요.
            </p>
          )}
          {payment && (
            <dl className="stage-amounts">
              <div>
                <dt>총 받을 금액</dt>
                <dd>{won(total)}원</dd>
              </div>
              <div>
                <dt>기존 입금액</dt>
                <dd>{won(item.receivedAmount)}원</dd>
              </div>
              <div>
                <dt>남은 페이백</dt>
                <dd>{won(remaining)}원</dd>
              </div>
            </dl>
          )}
          <fieldset disabled={busy} className="stage-fields">
            <legend className="sr-only">
              {payment ? "입금 정보" : "리뷰 작성 정보"}
            </legend>
            <div className="form-grid">
              {payment ? (
                <>
                  <label>
                    이번 입금액
                    <input
                      name="amount"
                      type="number"
                      required
                      min={1}
                      max={remaining}
                      step={1}
                      inputMode="numeric"
                      value={amount ?? String(remaining)}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    입금일
                    <input
                      type="date"
                      required
                      max={today()}
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                    />
                  </label>
                  <label className="span-2">
                    입금자명
                    <input
                      maxLength={100}
                      value={depositor}
                      onChange={(e) => setDepositor(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    리뷰 작성일
                    <input
                      type="date"
                      required
                      max={today()}
                      value={reviewedAt}
                      onChange={(e) => setReviewedAt(e.target.value)}
                    />
                  </label>
                  <label>
                    리뷰 유형
                    <select
                      aria-label="리뷰 유형"
                      value={reviewType}
                      onChange={(e) => setReviewType(e.target.value)}
                    >
                      {reviewTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="span-2">
                추가 리뷰비
                <div className="unit-input">
                  <input
                    aria-label="추가 리뷰비"
                    aria-describedby={feeHelpId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={Math.max(0, 1_000_000_000 - item.expectedPayback)}
                    step={1}
                    value={additionalReviewFee}
                    placeholder="0"
                    onChange={(e) => setAdditionalReviewFee(e.target.value)}
                  />
                  <span>원</span>
                </div>
                <small id={feeHelpId}>
                  리뷰를 진행하고 받는 금액이에요. 없으면 0원으로 두세요.
                </small>
              </label>
              <div
                className="review-fee-summary span-2"
                role="group"
                aria-live="polite"
                aria-label="정산 예정 금액"
              >
                <span>
                  {item.shippingMethod === "실배송"
                    ? "실배송 · 상품 가격 제외"
                    : item.shippingMethod === "빈박스"
                      ? "빈박스 · 상품 가격 포함"
                      : "리뷰 타입 미정 · 기존 페이백 기준"}
                </span>
                <span>
                  예상 페이백 {won(item.expectedPayback)}원 + 추가 리뷰비{" "}
                  {won(fee)}원
                </span>
                <strong>총 받을 금액 {won(total)}원</strong>
              </div>
              {!payment && (
                <label className="span-2">
                  메모
                  <textarea
                    aria-label="메모"
                    rows={3}
                    maxLength={2000}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </label>
              )}
            </div>
          </fieldset>
          {payment && paymentAmount > 0 && paymentAmount <= remaining && (
            <div
              className="stage-result"
              role="status"
              aria-label="입금 후 정산 상태"
            >
              <strong>
                {completePayment
                  ? "전액 입금 · 정산 완료"
                  : "부분 입금 · 정산 대기"}
              </strong>
              <span>
                저장 후 남은 페이백 {won(remaining - paymentAmount)}원
              </span>
            </div>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <Button type="button" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <span className="footer-spacer" />
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={payment && remaining <= 0}
          >
            {payment
              ? completePayment
                ? "정산 완료 저장"
                : "부분 입금 저장"
              : "리뷰 완료 저장"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
