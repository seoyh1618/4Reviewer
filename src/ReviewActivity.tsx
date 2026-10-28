import { useEffect, useId, useMemo, useRef, useState } from "react";
import { reviewActivity } from "../shared/review-analysis.mjs";
import { recentOrderMonths } from "../shared/order-trend.mjs";
import { won } from "./lib";
import type { Review } from "./types";
import "./order-trend.css";

const label = (key: string) =>
  key.length === 7
    ? `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`
    : `${Number(key.slice(5, 7))}월 ${Number(key.slice(8))}일`;
const series = [
  { key: "physical", label: "실배송", color: "#2563eb" },
  { key: "empty", label: "빈박스", color: "#0d9488" },
  { key: "unspecified", label: "타입 미입력", color: "#64748b" },
] as const;

export default function ReviewActivity({
  items,
  months: suppliedMonths,
  initialMode = "month",
}: {
  items: Review[];
  months?: string[];
  initialMode?: "month" | "day";
}) {
  const defaultMonths = useMemo(() => recentOrderMonths(), []);
  const months = suppliedMonths ?? defaultMonths;
  const [mode, setMode] = useState(initialMode);
  const [month, setMonth] = useState(months.at(-1)!);
  const [selection, setSelection] = useState<string | null>(null);
  const [width, setWidth] = useState(600);
  const plot = useRef<HTMLDivElement>(null);
  const id = useId();
  const data = useMemo(
    () => reviewActivity(items, mode, months, month),
    [items, mode, months, month],
  );
  const totals = data.reduce(
    (sum, row) => ({
      count: sum.count + row.count,
      physical: sum.physical + row.physical,
      empty: sum.empty + row.empty,
      unspecified: sum.unspecified + row.unspecified,
    }),
    { count: 0, physical: 0, empty: 0, unspecified: 0 },
  );
  const visibleSeries = series.filter(
    (s) => s.key !== "unspecified" || totals.unspecified > 0,
  );
  const missingDates = items.filter(
    (item) => item.reviewStatus === "done" && !item.reviewedAt,
  ).length;
  const selected = data.findIndex((row) => row.key === selection);
  const index = selected >= 0 ? selected : data.length - 1;
  const active = data[index];
  const maximum = Math.max(
    1,
    ...data.flatMap((row) => visibleSeries.map((s) => row[s.key])),
  );
  const tickStep = Math.max(1, Math.ceil(maximum / 4));
  const top = Math.ceil(maximum / tickStep) * tickStep;
  const left = 34,
    right = width - 12,
    bottom = 192;
  const step = (right - left) / data.length;
  const x = (i: number) => left + step * (i + 0.5);
  const y = (count: number) => bottom - (count / top) * 158;
  const barWidth = Math.min(26, (step * 0.7) / visibleSeries.length);
  const tickCount = Math.min(width < 600 ? 6 : 12, data.length);
  const ticks = new Set(
    Array.from({ length: tickCount }, (_, i) =>
      tickCount === 1
        ? 0
        : Math.round((i * (data.length - 1)) / (tickCount - 1)),
    ),
  );
  useEffect(() => {
    if (!plot.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(220, entry.contentRect.width)),
    );
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  const selectAt = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const position = ((clientX - rect.left) * width) / rect.width;
    const target = Math.max(
      0,
      Math.min(data.length - 1, Math.floor((position - left) / step)),
    );
    setSelection(data[target].key);
  };
  return (
    <div
      className="order-trend review-activity"
      role="region"
      aria-label="리뷰 활동"
    >
      <div className="order-trend-controls">
        <div
          role="group"
          aria-label="리뷰 활동 집계 단위"
          className="order-trend-tabs"
        >
          {(["month", "day"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setSelection(null);
              }}
            >
              {value === "month" ? "월별" : "일별"}
            </button>
          ))}
        </div>
        {mode === "day" ? (
          <select
            aria-label="일별 리뷰 조회 월"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setSelection(null);
            }}
          >
            {months.map((key) => (
              <option key={key} value={key}>
                {label(key)}
              </option>
            ))}
          </select>
        ) : (
          <span className="order-period">
            {label(months[0])} – {label(months.at(-1)!)}
          </span>
        )}
      </div>
      <div className="review-activity-summary">
        <div className="order-trend-summary">
          <div>
            <span>기간 작성 리뷰</span>
            <strong>
              {won(totals.count)}
              <small>건</small>
            </strong>
          </div>
        </div>
        <ul
          className="review-activity-legend"
          aria-label="리뷰 타입별 작성 건수"
        >
          {visibleSeries.map((s) => (
            <li key={s.key}>
              <i style={{ background: s.color }} aria-hidden="true" />
              {s.label} <strong>{won(totals[s.key])}건</strong>
            </li>
          ))}
        </ul>
      </div>
      <div
        className="order-trend-plot review-activity-plot"
        ref={plot}
        role="group"
        aria-label="리뷰 활동 차트 탐색"
        aria-describedby={`${id}-help`}
        tabIndex={0}
        onFocus={() => setSelection((current) => current ?? active.key)}
        onBlur={() => setSelection(null)}
        onPointerLeave={(event) => {
          if (
            event.pointerType === "mouse" &&
            document.activeElement !== event.currentTarget
          )
            setSelection(null);
        }}
        onKeyDown={(event) => {
          const target =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? data.length - 1
                : event.key === "ArrowLeft"
                  ? Math.max(0, index - 1)
                  : event.key === "ArrowRight"
                    ? Math.min(data.length - 1, index + 1)
                    : null;
          if (target !== null) {
            event.preventDefault();
            setSelection(data[target].key);
          } else if (event.key === "Escape") setSelection(null);
        }}
      >
        <span className="sr-only" id={`${id}-help`}>
          차트를 터치하거나 좌우 방향키로 날짜별 리뷰 건수를 확인하세요. Home과
          End로 처음과 마지막 날짜로 이동합니다.
        </span>
        <svg
          viewBox={`0 0 ${width} 226`}
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse")
              selectAt(event.clientX, event.currentTarget);
          }}
          onClick={(event) => selectAt(event.clientX, event.currentTarget)}
        >
          <title id={`${id}-title`}>
            {mode === "month" ? "월별" : "일별"} 리뷰 활동 막대 차트
          </title>
          <desc id={`${id}-description`}>
            리뷰 작성일 기준 완료 리뷰 {totals.count}건.{" "}
            {visibleSeries
              .map((s) => `${s.label} ${totals[s.key]}건`)
              .join(", ")}
            .
          </desc>
          <text x="0" y="14" className="order-axis-label">
            단위: 건
          </text>
          {Array.from(
            { length: top / tickStep + 1 },
            (_, i) => i * tickStep,
          ).map((count) => (
            <g key={count} aria-hidden="true">
              <line
                x1={left}
                x2={right}
                y1={y(count)}
                y2={y(count)}
                className="order-grid-line"
              />
              <text
                x={left - 8}
                y={y(count) + 4}
                textAnchor="end"
                className="order-axis-label"
              >
                {won(count)}
              </text>
            </g>
          ))}
          {data.map((row, i) => (
            <g key={row.key} aria-hidden="true">
              {selection === row.key && (
                <rect
                  x={left + step * i}
                  y={26}
                  width={step}
                  height={bottom - 26}
                  fill="#eff6ff"
                />
              )}
              {visibleSeries.map(
                (s, j) =>
                  row[s.key] > 0 && (
                    <rect
                      key={s.key}
                      x={
                        x(i) -
                        (barWidth * visibleSeries.length) / 2 +
                        j * barWidth +
                        barWidth * 0.08
                      }
                      y={y(row[s.key])}
                      width={barWidth * 0.84}
                      height={bottom - y(row[s.key])}
                      rx={Math.min(3, barWidth / 4)}
                      fill={s.color}
                    />
                  ),
              )}
              {ticks.has(i) && (
                <text
                  x={x(i)}
                  y="218"
                  textAnchor="middle"
                  className="order-axis-label"
                >
                  {mode === "month"
                    ? `${Number(row.key.slice(5, 7))}월`
                    : `${i + 1}일`}
                </text>
              )}
            </g>
          ))}
        </svg>
        {!totals.count && (
          <span className="order-trend-empty">
            이 기간에 작성한 리뷰가 없어요
          </span>
        )}
        {selection && (
          <output
            aria-live="polite"
            className="trend-tooltip review-activity-detail"
            style={{
              left: `clamp(76px, ${(x(index) / width) * 100}%, calc(100% - 76px))`,
            }}
          >
            <span>{label(active.key)}</span>
            <strong>리뷰 {active.count}건</strong>
            {visibleSeries.map((s) => (
              <span key={s.key}>
                {s.label} {active[s.key]}건
              </span>
            ))}
          </output>
        )}
      </div>
      {missingDates > 0 && (
        <p className="review-activity-note">
          전체 완료 리뷰 중 작성일이 없는 {missingDates}건은 추이에서 제외돼요.
        </p>
      )}
    </div>
  );
}
