import { useState } from "react";
import { reviewStages } from "../shared/review-analysis.mjs";
import { earningsSummary } from "../shared/earnings.mjs";
import { platformLabel } from "../shared/domain.mjs";
import { won } from "./lib";
import { SectionTitle, Platform } from "./ui";
import type { Review } from "./types";

export function ReviewDonut({ items }: { items: Review[] }) {
  const stages = reviewStages(items);
  const rows = [
    { label: "작성 전", value: stages.todo, color: "#c68429" },
    { label: "리뷰 완료", value: stages.reviewed, color: "#2563eb" },
    { label: "정산 완료", value: stages.settled, color: "#059669" },
  ];
  let offset = 0;
  return (
    <section className="panel analysis-panel" aria-label="리뷰 진행 현황">
      <SectionTitle
        title="리뷰 진행 현황"
        note="선택한 구매 기간 · 현재 단계 기준"
      />
      <div className="analysis-donut-layout">
        <div className="analysis-donut">
          <svg
            viewBox="0 0 220 220"
            role="img"
            aria-label={
              stages.total
                ? `리뷰 ${stages.total}건, 작성 전 ${stages.todo}건, 리뷰 완료 ${stages.reviewed}건, 정산 완료 ${stages.settled}건`
                : "등록된 리뷰 없음"
            }
          >
            <circle
              cx="110"
              cy="110"
              r="86"
              fill="none"
              stroke="#eef2f7"
              strokeWidth="22"
            />
            {rows.map((row) => {
              const length = stages.total
                ? (row.value / stages.total) * 100
                : 0;
              const start = offset;
              offset += length;
              return (
                length > 0 && (
                  <circle
                    key={row.label}
                    cx="110"
                    cy="110"
                    r="86"
                    pathLength="100"
                    fill="none"
                    stroke={row.color}
                    strokeWidth="22"
                    strokeDasharray={`${length} ${100 - length}`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 110 110)"
                  />
                )
              );
            })}
          </svg>
          <div className="analysis-donut-center">
            <span>리뷰 완료율</span>
            <strong>
              {Math.round(stages.completion)}
              <small>%</small>
            </strong>
            <span>전체 {won(stages.total)}건</span>
          </div>
        </div>
        <ul className="analysis-donut-legend">
          {rows.map((row) => (
            <li key={row.label}>
              <span>
                <i style={{ background: row.color }} />
                {row.label}
              </span>
              <strong>
                {won(row.value)}건{" "}
                <small>
                  {stages.total
                    ? Number(((row.value / stages.total) * 100).toFixed(1))
                    : 0}
                  %
                </small>
              </strong>
            </li>
          ))}
        </ul>
      </div>
      <p className="analysis-footnote">
        정산 완료된 리뷰는 ‘리뷰 완료’ 건수에서 제외해요. 완료율에는 두 단계를
        모두 포함해요.
      </p>
    </section>
  );
}

export function IncomeBars({
  summary,
  received,
}: {
  summary: ReturnType<typeof earningsSummary>;
  received: number;
}) {
  const rows = [
    {
      label: "현금 수익",
      value: summary.cashReceived,
      color: "#2563eb",
      note: "입금된 추가 리뷰비",
    },
    {
      label: "상품 수익",
      value: summary.productValue,
      color: "#059669",
      note: "실배송 상품가액 · 등록 즉시 반영",
    },
  ];
  const max = Math.max(summary.cashReceived, summary.productValue, 1);
  return (
    <section className="panel analysis-panel" aria-label="수익 구성">
      <SectionTitle
        title="수익 구성"
        note="현금 수익과 상품 가치를 구분해 보세요."
      />
      <div className="analysis-income-body">
        <div className="analysis-income-total">
          <span>총수익</span>
          <strong>
            {won(summary.total)}
            <small>원</small>
          </strong>
        </div>
        <div className="analysis-income-bars">
          {rows.map((row) => (
            <div className="analysis-bar-row" key={row.label}>
              <div className="analysis-bar-label">
                <span>{row.label}</span>
                <strong>{won(row.value)}원</strong>
              </div>
              <div
                className="analysis-bar-track"
                role="img"
                aria-label={`${row.label} ${won(row.value)}원`}
              >
                <span
                  style={{
                    width: `${(row.value / max) * 100}%`,
                    background: row.color,
                  }}
                />
              </div>
              <small>{row.note}</small>
            </div>
          ))}
        </div>
        <dl className="analysis-income-context">
          <div>
            <dt>미입금 리뷰비</dt>
            <dd>{won(summary.cashPending)}원</dd>
          </div>
          <div>
            <dt>정산 금액</dt>
            <dd>{won(received)}원</dd>
          </div>
        </dl>
      </div>
      <p className="analysis-footnote">
        현금 수익·정산 금액은 입금일 기준, 상품 수익·미입금 리뷰비는 구매일
        기준이에요. 상품값 환급과 미입금액은 총수익에서 제외해요.
      </p>
    </section>
  );
}

export function PlatformBars({ items }: { items: Review[] }) {
  const [metric, setMetric] = useState<"amount" | "count">("amount");
  const groups = new Map<
    string,
    { name: string; amount: number; count: number }
  >();
  for (const item of items) {
    const name = platformLabel(item);
    const group = groups.get(name) ?? { name, amount: 0, count: 0 };
    group.amount += item.price;
    group.count += 1;
    groups.set(name, group);
  }
  const rows = [...groups.values()].sort((a, b) => b[metric] - a[metric]);
  const max = Math.max(...rows.map((row) => row[metric]), 1);
  return (
    <section className="panel analysis-panel" aria-label="플랫폼별 주문">
      <SectionTitle
        title="플랫폼별 주문"
        note="선택한 구매 기간 · 플랫폼 비교"
      />
      <div className="analysis-platform-body">
        <div
          className="analysis-switch"
          role="group"
          aria-label="플랫폼 비교 기준"
        >
          {(["amount", "count"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={metric === value}
              onClick={() => setMetric(value)}
            >
              {value === "amount" ? "주문금액" : "주문건수"}
            </button>
          ))}
        </div>
        <div className="analysis-platform-bars">
          {rows.length ? (
            rows.map((row) => (
              <div className="analysis-bar-row" key={row.name}>
                <div className="analysis-bar-label">
                  <Platform name={row.name} />
                  <strong>
                    {won(row[metric])}
                    {metric === "amount" ? "원" : "건"}
                  </strong>
                </div>
                <div
                  className="analysis-bar-track"
                  role="img"
                  aria-label={`${row.name} ${won(row[metric])}${metric === "amount" ? "원" : "건"}`}
                >
                  <span style={{ width: `${(row[metric] / max) * 100}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className="analysis-empty">선택한 기간에 구매한 상품이 없어요</p>
          )}
        </div>
      </div>
    </section>
  );
}
