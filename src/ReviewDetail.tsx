import { useState } from "react";
import { Pencil, Wallet, Trash2 } from "lucide-react";
import {
  platformLabel,
  expectedSettlement,
  remainingPayback,
} from "../shared/domain.mjs";
import { Modal, Button, Platform, ReviewBadge, PaybackBadge } from "./ui";
import { won, fullDate } from "./lib";
import ReviewProgress, { type ReviewStage } from "./ReviewProgress";
import type { Review, Payment } from "./types";
export default function ReviewDetail({
  item,
  payments,
  onClose,
  onEdit,
  onProgress,
  onDelete,
}: {
  item: Review;
  payments: Payment[];
  onClose: () => void;
  onEdit: () => void;
  onProgress: (stage: ReviewStage) => void;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const remaining = remainingPayback(item);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const info = [
    ["리뷰 가이드", item.reviewType],
    ["리뷰 마감일", item.dueDate ? fullDate(item.dueDate) : "미정"],
    ["리뷰 타입", item.shippingMethod],
    ["판매처", item.seller],
    ["구매일", fullDate(item.purchaseDate)],
    ["주문번호", item.orderNumber],
    ["SKU", item.sku],
    ["계정주", item.purchaser],
    ["리뷰 작성일", item.reviewedAt ? fullDate(item.reviewedAt) : "미입력"],
    ["예상 페이백", `${won(item.expectedPayback)}원`],
    ["추가 리뷰비", `${won(item.additionalReviewFee)}원`],
    ["총 받을 금액", `${won(expectedSettlement(item))}원`],
    ["정산일", item.paidAt ? fullDate(item.paidAt) : "미입력"],
    ["연락처", item.contact],
    ["카톡 이름", item.kakaoName],
    ["입금자명", item.depositor],
  ];
  return (
    <Modal
      title="상품 상세"
      className="review-detail-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body detail-body">
        <div className="detail-product">
          <Platform name={platformLabel(item)} />
          <h2>{item.name}</h2>
          <div className="inline-badges">
            <ReviewBadge item={item} />
            <PaybackBadge item={item} />
          </div>
        </div>
        <div className="detail-finance">
          <div>
            <span>구매금액</span>
            <b>
              {won(item.price)}
              <small>원</small>
            </b>
          </div>
          <div>
            <span>남은 페이백</span>
            <b>
              {won(remaining)}
              <small>원</small>
            </b>
          </div>
        </div>
        <div className="detail-info-heading">
          <h3>리뷰 정보</h3>
          {item.reviewStatus === "done" && (
            <button
              type="button"
              className="review-info-edit"
              aria-haspopup="dialog"
              onClick={() => onProgress("review")}
            >
              <Pencil size={13} aria-hidden="true" />
              리뷰 정보 수정
            </button>
          )}
        </div>
        <dl className="detail-fields">
          {info.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "미입력"}</dd>
            </div>
          ))}
        </dl>
        {item.memo && (
          <section className="memo-box">
            <h3>리뷰 가이드 · 메모</h3>
            <p>{item.memo}</p>
          </section>
        )}
        {payments.filter((p) => p.reviewId === item.id).length > 0 && (
          <section className="detail-history">
            <h3>입금 내역</h3>
            {payments
              .filter((p) => p.reviewId === item.id)
              .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
              .map((p, n) => (
                <div key={n}>
                  <Wallet size={14} />
                  <span>{fullDate(p.paidAt)}</span>
                  <b>{won(p.amount)}원</b>
                </div>
              ))}
          </section>
        )}
        <div className="detail-delete-action">
          <Button
            variant="ghost"
            onClick={() => setConfirm(true)}
            aria-label="상품 삭제 요청"
            disabled={busy}
          >
            <Trash2 size={14} />
            상품 삭제
          </Button>
        </div>
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        {confirm && (
          <div className="delete-confirm">
            <b>이 상품과 입금 내역을 삭제할까요?</b>
            <p>삭제하면 금액 집계에서도 제외되며 되돌릴 수 없습니다.</p>
            <div className="flex-end">
              <Button onClick={() => setConfirm(false)} disabled={busy}>
                취소
              </Button>
              <Button
                variant="danger"
                busy={busy}
                onClick={() => void action(onDelete)}
              >
                상품 삭제
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer detail-footer">
        <Button onClick={onClose} disabled={busy}>
          닫기
        </Button>
        <div className="detail-footer-actions">
          <Button onClick={onEdit} disabled={busy}>
            수정
          </Button>
          <ReviewProgress
            item={item}
            onStart={onProgress}
            paymentLabel="정산 완료"
            disabled={busy}
          />
        </div>
      </div>
    </Modal>
  );
}
