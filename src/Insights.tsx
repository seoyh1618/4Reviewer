import { useEffect, useState } from "react";
import { Download, ChartColumnIncreasing } from "lucide-react";
import { MonthlyChart, Metrics } from "./Dashboard";
import { Button, SectionTitle, Platform, Empty, PageHeading } from "./ui";
import { won, monthlyData, exportCsv } from "./lib";
import { platformLabel, today } from "../shared/domain.mjs";
import type { Review, Payment } from "./types";

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
  const platformData = Array.from(new Set(filteredItems.map(platformLabel)))
    .map((p) => ({
      name: p,
      rows: filteredItems.filter((i) => platformLabel(i) === p),
    }))
    .filter((x) => x.rows.length)
    .sort((a, b) => b.rows.length - a.rows.length);
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
          <Button onClick={() => exportCsv(items)}>
            <Download size={16} />
            전체 데이터 내보내기
          </Button>
        </div>
      </div>
      <p className="insight-period-summary" role="status">
        <strong>{periodLabel}</strong>
        <span>
          구매·리뷰는 구매일 기준의 현재 상태, 실제 입금액은 입금일 기준이에요.
        </span>
      </p>
      <Metrics
        items={filteredItems}
        period={{
          label: periodLabel,
          received: filteredPayments.reduce((sum, p) => sum + p.amount, 0),
        }}
      />
      <div className="dashboard-panels">
        <section className="panel">
          <SectionTitle
            title="구매와 페이백 추이"
            note={`${period.year ? periodLabel : "최근 6개월"} · 구매일과 입금일 기준`}
          />
          <MonthlyChart
            key={prefix}
            items={filteredItems}
            payments={filteredPayments}
            data={monthly}
          />
        </section>
        <section className="panel">
          <SectionTitle
            title="플랫폼별 활동"
            note={`${periodLabel} · 구매 상품 수 기준`}
          />
          <div className="platform-stats">
            {platformData.length ? (
              platformData.map((p) => (
                <div key={p.name}>
                  <div className="flex-between">
                    <Platform name={p.name} />
                    <b>
                      {p.rows.length}
                      <small>
                        건 ·{" "}
                        {Math.round(
                          (p.rows.length / filteredItems.length) * 100,
                        )}
                        %
                      </small>
                    </b>
                  </div>
                  <progress value={p.rows.length} max={filteredItems.length} />
                </div>
              ))
            ) : (
              <Empty
                title={
                  period.year
                    ? "선택한 기간에 구매한 상품이 없어요"
                    : "아직 기록이 없어요"
                }
                description={
                  period.year
                    ? "다른 연도나 월을 선택해 보세요."
                    : "상품을 등록하면 통계가 쌓여요."
                }
              />
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <SectionTitle
          title="월별 상세 내역"
          note="구매 건수·리뷰 완료는 구매월 기준, 입금액은 입금월 기준"
        />
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
                <th>구매금액</th>
                <th>실제 입금액</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="insight-note">
        페이백은 구매대금의 환급을 포함하므로 수익과 같지 않습니다. 이 통계는
        직접 등록한 기록을 기준으로 계산됩니다.
      </p>
    </>
  );
}
