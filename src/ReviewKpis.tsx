import { useId, useMemo } from "react";
import { reviewOverview } from "../shared/domain.mjs";
import { won } from "./lib";
import type { Review } from "./types";

function Value({ value, unit = "건" }: { value: number; unit?: string }) {
  return (
    <dd className="review-kpi-value">
      <span>{won(value)}</span>
      <small>{unit}</small>
    </dd>
  );
}

export default function ReviewKpis({
  items,
  filtered,
}: {
  items: Review[];
  filtered: boolean;
}) {
  const summary = useMemo(() => reviewOverview(items), [items]);
  const id = useId();
  return (
    <section
      className="review-kpis"
      aria-label="내 리뷰 핵심 지표"
      aria-describedby={id}
    >
      <p className="sr-only" id={id}>
        검색어, 플랫폼, 리뷰 타입에 해당하는 전체 리뷰 기준입니다. 상태 탭과
        페이지를 바꿔도 집계 범위는 유지됩니다. 정산 완료는 실제 입금이 완료된
        건수입니다. 부분 입금은 상품 원가부터 차감합니다.
      </p>
      <div className="review-kpi-card">
        <dl className="review-kpi-pair">
          <div>
            <dt>등록 건수</dt>
            <Value value={summary.count} />
          </div>
          <div>
            <dt>정산 완료</dt>
            <Value value={summary.settled} />
          </div>
        </dl>
        {filtered && <p className="review-kpi-note">검색·필터 적용</p>}
      </div>
      <div className="review-kpi-card">
        <dl>
          <dt>작성 전</dt>
          <Value value={summary.todo} />
        </dl>
        <div
          className="review-kpi-detail"
          aria-label="작성 전 리뷰 타입별 건수"
        >
          <span>
            실배송 <b>{won(summary.todoPhysical)}</b>건
          </span>
          <span>
            빈박스 <b>{won(summary.todoEmpty)}</b>건
          </span>
          {summary.todoUnspecified > 0 && (
            <span>
              미지정 <b>{won(summary.todoUnspecified)}</b>건
            </span>
          )}
        </div>
      </div>
      <div className="review-kpi-card">
        <dl>
          <dt>리뷰 완료</dt>
          <Value value={summary.done} />
        </dl>
      </div>
      <div className="review-kpi-card review-kpi-payback">
        <dl>
          <dt>받을 페이백</dt>
          <Value value={summary.pending} unit="원" />
        </dl>
        <div className="review-kpi-detail" aria-label="받을 페이백 구성">
          <span>
            상품 원가 <b>{won(summary.pendingProduct)}</b>원
          </span>
          <span>
            리뷰비 <b>{won(summary.pendingReviewFee)}</b>원
          </span>
        </div>
        {summary.partial > 0 && (
          <p className="review-kpi-note">부분 입금은 상품 원가부터 차감</p>
        )}
      </div>
    </section>
  );
}
