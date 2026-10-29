import { useEffect, useMemo, useState } from "react";
import { Download, ChartColumnIncreasing } from "lucide-react";
import { Button, SectionTitle, PageHeading } from "./ui";
import { won, monthlyData, exportCsv } from "./lib";
import { today } from "../shared/domain.mjs";
import type { Review, Payment } from "./types";
import OrderTrend from "./OrderTrend";
import ReviewActivity from "./ReviewActivity";
import { ReviewDonut, IncomeBars, PlatformBars } from "./InsightCharts";
import "./insights.css";
import { earningsByMonth, earningsSummary } from "../shared/earnings.mjs";

type Period = { year: string; month: string };
function readPeriod(): Period {
  const params = new URLSearchParams(location.search);
  const rawYear = params.get("statsYear") || "";
  const year = /^\d{4}$/.test(rawYear) && Number(rawYear) > 0 ? rawYear : "";
  const rawMonth = params.get("statsMonth") || "";
  return {
    year,
    month: year && /^(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : "",
  };
}
function savePeriod(period: Period, push = false) {
  const url = new URL(location.href);
  for (const [key, value] of [
    ["statsYear", period.year],
    ["statsMonth", period.month],
  ]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== location.href) {
    history[push ? "pushState" : "replaceState"](null, "", url);
  }
}

export default function Insights({
  items,
  payments,
}: {
  items: Review[];
  payments: Payment[];
}) {
  const [period, setPeriod] = useState(readPeriod);
  useEffect(() => {
    const restore = () => {
      const next = readPeriod();
      setPeriod(next);
      savePeriod(next);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const changePeriod = (next: Period) => {
    setPeriod(next);
    savePeriod(next, true);
  };
  const years = Array.from(
    new Set([
      today().slice(0, 4),
      ...items.map((r) => r.purchaseDate.slice(0, 4)),
      ...items.filter((r) => r.reviewedAt).map((r) => r.reviewedAt.slice(0, 4)),
      ...payments.map((p) => p.paidAt.slice(0, 4)),
      ...(period.year ? [period.year] : []),
    ]),
  )
    .filter(Boolean)
    .sort()
    .reverse();
  const prefix = period.year + (period.month ? `-${period.month}` : "");
  const filteredItems = items.filter((i) => i.purchaseDate.startsWith(prefix));
  // Deposits can arrive for purchases outside the selected period.
  const filteredPayments = payments.filter((p) => p.paidAt.startsWith(prefix));
  const periodLabel = period.year
    ? `${period.year}년${period.month ? ` ${Number(period.month)}월` : " 전체"}`
    : "전체 기간";
  const months = period.year
    ? period.month
      ? [prefix]
      : Array.from(
          { length: 12 },
          (_, i) => `${period.year}-${String(i + 1).padStart(2, "0")}`,
        )
    : undefined;
  const monthly = monthlyData(filteredItems, filteredPayments, months);
  const incomeMonths = useMemo(
    () => earningsByMonth(items, payments),
    [items, payments],
  );
  const earnings = earningsSummary(filteredItems);
  if (prefix) {
    // Cash income follows deposit dates, including purchases in earlier periods.
    earnings.cashReceived = 0;
    for (const [key, income] of incomeMonths) {
      if (key.startsWith(prefix)) earnings.cashReceived += income.cashReceived;
    }
    earnings.total = earnings.cashReceived + earnings.productValue;
  }
  return (
    <>
      <div className="page-title insights-title">
        <PageHeading
          icon={ChartColumnIncreasing}
          title="나의 리뷰 통계"
          subtitle="구매금액과 리뷰 활동, 페이백 흐름을 살펴보세요."
        />
        <div className="insight-controls">
          <div
            className="insight-period-filters"
            role="group"
            aria-label="통계 기간 필터"
          >
            <select
              aria-label="통계 연도"
              value={period.year}
              onChange={(e) =>
                changePeriod({
                  year: e.target.value,
                  month: e.target.value ? period.month : "",
                })
              }
            >
              <option value="">전체 연도</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
            <select
              aria-label="통계 월"
              value={period.month}
              disabled={!period.year}
              title={!period.year ? "연도를 먼저 선택해 주세요." : undefined}
              onChange={(e) =>
                changePeriod({ ...period, month: e.target.value })
              }
            >
              <option value="">전체 월</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={String(i + 1).padStart(2, "0")}>
                  {i + 1}월
                </option>
              ))}
            </select>
          </div>
          <Button
            className="data-export-button"
            onClick={() => exportCsv(items)}
          >
            <Download size={16} />
            전체 데이터 내보내기
          </Button>
        </div>
      </div>
      <p className="insight-period-summary" role="status">
        <strong>{periodLabel}</strong>
        <span>
          주문은 구매일, 리뷰 활동은 작성일, 정산 금액은 입금일 기준이에요.
        </span>
      </p>
      <div className="analysis-grid">
        <section className="panel analysis-panel">
          <SectionTitle
            title="주문금액 추이"
            note={`${period.year ? periodLabel : "최근 6개월"} · 구매일 기준`}
          />
          <OrderTrend
            key={prefix}
            items={filteredItems}
            months={months}
            initialMode={period.month ? "day" : "month"}
          />
        </section>
        <ReviewDonut items={filteredItems} />
        <section className="panel analysis-panel analysis-activity-panel">
          <SectionTitle
            title="리뷰 활동"
            note={`${period.year ? periodLabel : "최근 6개월"} · 리뷰 작성일 기준`}
          />
          <ReviewActivity
            key={prefix}
            items={items}
            months={months}
            initialMode={period.month ? "day" : "month"}
          />
        </section>
        <IncomeBars
          summary={earnings}
          received={filteredPayments.reduce((sum, p) => sum + p.amount, 0)}
        />
        <PlatformBars items={filteredItems} />
      </div>
      <details className="panel analysis-detail">
        <summary>월별 상세 내역</summary>
        <p className="analysis-detail-note">
          구매·리뷰·상품 수익은 구매월 기준, 정산 금액·현금 수익은 입금월 기준
        </p>
        <div
          className="table-wrap"
          role="region"
          aria-label="월별 상세 내역"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>기간</th>
                <th>구매 건수</th>
                <th>리뷰 완료</th>
                <th>주문금액</th>
                <th>정산 금액</th>
                <th>현금 수익</th>
                <th>상품 수익</th>
                <th>총수익</th>
              </tr>
            </thead>
            <tbody>
              {[...monthly].reverse().map((d) => (
                <tr key={d.key}>
                  <td>{d.key.replace("-", "년 ")}월</td>
                  <td>{d.count}건</td>
                  <td>{d.reviews}건</td>
                  <td className="money-cell">{won(d.purchase)}원</td>
                  <td className="money-cell brand-text">{won(d.received)}원</td>
                  <td className="money-cell">
                    {won(incomeMonths.get(d.key)?.cashReceived ?? 0)}원
                  </td>
                  <td className="money-cell">
                    {won(incomeMonths.get(d.key)?.productValue ?? 0)}원
                  </td>
                  <td className="money-cell">
                    <strong>
                      {won(incomeMonths.get(d.key)?.total ?? 0)}원
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="insight-note">
        총수익은 입금된 추가 리뷰비와 실배송 상품가액의 합계입니다. 상품값
        환급은 수익에 포함하지 않으며, 상품 수익은 현금이 아닌 상품 가치입니다.
      </p>
    </>
  );
}
