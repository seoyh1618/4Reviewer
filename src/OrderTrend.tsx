import { useEffect, useId, useMemo, useRef, useState } from "react";
import { orderTrend, recentOrderMonths } from "../shared/order-trend.mjs";
import { won } from "./lib";
import type { Review } from "./types";
import "./order-trend.css";

const label = (key: string) =>
  key.length === 7
    ? `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`
    : `${Number(key.slice(5, 7))}월 ${Number(key.slice(8))}일`;
const axisAmount = (value: number) =>
  value >= 100000000
    ? `${Number((value / 100000000).toFixed(1))}억`
    : value >= 10000
      ? `${Number((value / 10000).toFixed(1))}만`
      : won(value);

export default function OrderTrend({
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
  const [mode, setMode] = useState<"month" | "day">(initialMode);
  const [month, setMonth] = useState(months.at(-1)!);
  const [selection, setSelection] = useState<string | null>(null);
  const [width, setWidth] = useState(600);
  const plot = useRef<HTMLDivElement>(null);
  const id = useId();
  const data = useMemo(
    () => orderTrend(items, mode, months, month),
    [items, mode, months, month],
  );
  const sum = data.reduce((a, row) => a + row.amount, 0);
  const count = data.reduce((a, row) => a + row.count, 0);
  const selected = data.findIndex((row) => row.key === selection);
  const index = selected >= 0 ? selected : data.length - 1;
  const active = data[index];
  const highest = Math.max(...data.map((row) => row.amount), 2);
  const magnitude = 10 ** Math.floor(Math.log10(highest));
  const top = Math.ceil(highest / magnitude) * magnitude;
  const left = 48,
    right = width - 18,
    bottom = 178;
  const x = (i: number) =>
    data.length === 1
      ? (left + right) / 2
      : left + ((right - left) * i) / (data.length - 1);
  const y = (amount: number) => bottom - (amount / top) * 148;
  const line = data
    .map((row, i) => `${i ? "L" : "M"}${x(i)},${y(row.amount)}`)
    .join(" ");
  const ticks = new Set(
    Array.from({ length: Math.min(6, data.length) }, (_, i) =>
      data.length === 1
        ? 0
        : Math.round((i * (data.length - 1)) / (Math.min(6, data.length) - 1)),
    ),
  );
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(220, entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const selectAt = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const position = ((clientX - rect.left) * width) / rect.width;
    const target = Math.round(
      ((position - left) / (right - left)) * (data.length - 1),
    );
    setSelection(data[Math.max(0, Math.min(data.length - 1, target))].key);
  };
  return (
    <div className="order-trend" role="region" aria-label="주문금액 추이">
      <div className="order-trend-controls">
        <div
          role="group"
          aria-label="주문금액 집계 단위"
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
            aria-label="일별 주문 조회 월"
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
      <div className="order-trend-summary">
        <div>
          <span>기간 주문금액</span>
          <strong>
            {won(sum)}
            <small>원</small>
          </strong>
        </div>
        <span>주문 {count}건</span>
      </div>
      <div
        className="order-trend-plot"
        ref={plot}
        role="group"
        aria-label="주문금액 차트 탐색"
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
          차트를 터치하거나 좌우 방향키로 날짜별 금액을 확인하세요. Home과 End로
          처음과 마지막 날짜로 이동합니다.
        </span>
        <svg
          viewBox={`0 0 ${width} 214`}
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse")
              selectAt(event.clientX, event.currentTarget);
          }}
          onClick={(event) => selectAt(event.clientX, event.currentTarget)}
        >
          <title id={`${id}-title`}>
            {mode === "month" ? "월별" : "일별"} 주문금액 라인 차트
          </title>
          <desc id={`${id}-description`}>
            구매일 기준 주문금액 합계 {won(sum)}원, 주문 {count}건.
          </desc>
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#3b82f6" stopOpacity=".16" />
              <stop offset="1" stopColor="#3b82f6" stopOpacity=".01" />
            </linearGradient>
          </defs>
          <text x="0" y="13" className="order-axis-label">
            단위: 원
          </text>
          {[0, 0.5, 1].map((fraction) => (
            <g key={fraction} aria-hidden="true">
              <line
                x1={left}
                x2={right}
                y1={y(top * fraction)}
                y2={y(top * fraction)}
                className="order-grid-line"
              />
              <text
                x={left - 8}
                y={y(top * fraction) + 4}
                textAnchor="end"
                className="order-axis-label"
              >
                {axisAmount(top * fraction)}
              </text>
            </g>
          ))}
          {data.length > 1 && (
            <path
              d={`${line} L${right},${bottom} L${left},${bottom} Z`}
              fill={`url(#${id}-area)`}
              aria-hidden="true"
            />
          )}
          <path d={line} className="order-line" aria-hidden="true" />
          {selection && (
            <line
              x1={x(index)}
              x2={x(index)}
              y1="24"
              y2={bottom}
              className="order-selection-line"
              aria-hidden="true"
            />
          )}
          {data.map((row, i) => (
            <g key={row.key} aria-hidden="true">
              {(mode === "month" || row.amount > 0 || i === index) && (
                <circle
                  cx={x(i)}
                  cy={y(row.amount)}
                  r={i === index ? 5 : 3}
                  className="order-point"
                />
              )}
              {ticks.has(i) && (
                <text
                  x={x(i)}
                  y="204"
                  textAnchor={
                    i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
                  }
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
        {!count && (
          <span className="order-trend-empty">
            이 기간에 등록된 주문이 없어요
          </span>
        )}
        {selection && (
          <output
            aria-live="polite"
            className="trend-tooltip order-trend-detail"
            style={{
              left: `clamp(76px, ${(x(index) / width) * 100}%, calc(100% - 76px))`,
            }}
          >
            <span>{label(active.key)}</span>
            <strong>
              {won(active.amount)}원 <small>· {active.count}건</small>
            </strong>
          </output>
        )}
      </div>
    </div>
  );
}
