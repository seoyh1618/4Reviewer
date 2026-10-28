import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ShoppingBag,
  ClipboardCheck,
  ScanLine,
  Plus,
  CalendarClock,
  ChevronRight,
  CheckCircle2,
  LayoutDashboard,
} from "lucide-react";
import {
  today,
  totals,
  daysUntil,
  platformLabel,
  remainingPayback,
} from "../shared/domain.mjs";
import { won, monthlyData, dateLabel } from "./lib";
import {
  Button,
  DueBadge,
  Empty,
  Platform,
  ProductIcon,
  ReviewBadge,
  PaybackBadge,
  SectionTitle,
  TextLink,
  TypeIcon,
  PageHeading,
} from "./ui";
import type { Review, Payment, Page } from "./types";
import { earningsSummary } from "../shared/earnings.mjs";
import Earnings from "./Earnings";
export function Metrics({
  items,
  period,
}: {
  items: Review[];
  period?: { label: string; received: number };
}) {
  const t = totals(items);
  const cards = [
    {
      label: "받을 페이백",
      value: t.pending,
      unit: "원",
      detail: `입금 대기 ${items.filter((i) => remainingPayback(i) > 0).length}건`,
      Icon: Wallet,
      tone: "blue",
      focus: true,
    },
    {
      label: "작성해야 할 리뷰",
      value: t.todo,
      unit: "건",
      detail: `전체 ${t.count}건 중 ${t.done}건 완료`,
      Icon: ClipboardCheck,
      tone: "orange",
    },
    {
      label: "정산 금액",
      value: period?.received ?? t.received,
      unit: "원",
      detail: period
        ? `${period.label} 실제 입금액`
        : "지금까지 받은 정산 금액",
      Icon: ArrowDownLeft,
      tone: "green",
    },
    {
      label: "누적 구매금액",
      value: t.purchase,
      unit: "원",
      detail: period
        ? `${period.label} 구매 ${t.count}건`
        : `등록 상품 ${t.count}개`,
      Icon: ShoppingBag,
      tone: "violet",
    },
  ];
  return (
    <div className="metrics">
      {cards.map((c) => (
        <section
          key={c.label}
          aria-label={c.label}
          className={`metric-card ${c.focus ? "metric-focus" : ""}`}
        >
          <div className="metric-top">
            <span>{c.label}</span>
            <span className={`metric-icon ${c.tone}`}>
              <c.Icon size={18} />
            </span>
          </div>
          <div
            className="metric-value"
            style={
              won(c.value).length > 9
                ? {
                    fontSize: `min(22px, calc((100cqw - 22px) / ${won(c.value).length * 0.63}))`,
                  }
                : undefined
            }
          >
            {won(c.value)}
            <small>{c.unit}</small>
          </div>
          <div className="metric-detail">
            {c.focus && <span className="tiny-dot" />}
            {c.detail}
          </div>
        </section>
      ))}
    </div>
  );
}
export function MonthlyChart({
  items,
  payments,
  data: suppliedData,
}: {
  items: Review[];
  payments: Payment[];
  data?: ReturnType<typeof monthlyData>;
}) {
  const data = suppliedData ?? monthlyData(items, payments);
  const dense = data.length > 6;
  const max = Math.max(...data.flatMap((d) => [d.purchase, d.received]), 1);
  const chartRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [focusedMonth, setFocusedMonth] = useState<string | null>(null);
  const [pinnedMonth, setPinnedMonth] = useState<string | null>(null);
  const activeMonth = hoveredMonth ?? focusedMonth ?? pinnedMonth;
  const activeIndex = data.findIndex((d) => d.key === activeMonth);
  const active = data[activeIndex];
  const dismiss = () => {
    setHoveredMonth(null);
    setFocusedMonth(null);
    setPinnedMonth(null);
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !chartRef.current?.contains(target) ||
        !target.closest(".bar-group, .chart-tooltip")
      ) {
        setHoveredMonth(null);
        setFocusedMonth(null);
        setPinnedMonth(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHoveredMonth(null);
        setFocusedMonth(null);
        setPinnedMonth(null);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <div
      className="chart-content"
      ref={chartRef}
      onPointerLeave={() => setHoveredMonth(null)}
    >
      <div className="chart-legend">
        <span>
          <i className="legend-purchase" />
          구매금액
        </span>
        <span>
          <i className="legend-received" />
          입금액
        </span>
        <small>단위: 원</small>
      </div>
      <div className="chart-plot">
        <div className="chart-scroll">
          <div
            className={`bar-chart ${dense ? "bar-chart-year" : ""}`}
            role="group"
            aria-label="월별 구매금액과 입금액"
          >
            <div className="chart-grid" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            {data.map((d) => (
              <button
                type="button"
                className={`bar-group ${d.key === today().slice(0, 7) ? "current" : ""} ${d.key === activeMonth ? "selected" : ""}`}
                key={d.key}
                aria-label={`${d.key.replace("-", "년 ")}월, 구매금액 ${won(d.purchase)}원, 입금액 ${won(d.received)}원`}
                aria-pressed={pinnedMonth === d.key}
                aria-describedby={activeMonth === d.key ? tooltipId : undefined}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") setHoveredMonth(d.key);
                }}
                onFocus={() => setFocusedMonth(d.key)}
                onBlur={() => setFocusedMonth(null)}
                onClick={() => {
                  if (pinnedMonth === d.key) dismiss();
                  else {
                    setPinnedMonth(d.key);
                    setHoveredMonth(null);
                  }
                }}
              >
                <span className="bar-value" aria-hidden="true">
                  {d.received ? won(d.received) : "0"}
                </span>
                <span className="bar-pair" aria-hidden="true">
                  <span
                    className="chart-bar purchase"
                    style={{ height: `${(d.purchase / max) * 130}px` }}
                  />
                  <span
                    className="chart-bar received"
                    style={{ height: `${(d.received / max) * 130}px` }}
                  />
                </span>
                <span className="bar-month" aria-hidden="true">
                  {d.label}
                </span>
              </button>
            ))}
          </div>
        </div>
        {active && (
          <div
            id={tooltipId}
            role="tooltip"
            className="chart-tooltip"
            style={{
              left: dense
                ? "clamp(0px, calc(50% - 110px), calc(100% - 220px))"
                : `clamp(0px, calc(${((activeIndex + 0.5) / data.length) * 100}% - 110px), calc(100% - 220px))`,
            }}
          >
            <strong>{active.key.replace("-", "년 ")}월</strong>
            <dl>
              <div>
                <dt>
                  <i className="legend-purchase" />
                  구매금액
                </dt>
                <dd>{won(active.purchase)}원</dd>
              </div>
              <div>
                <dt>
                  <i className="legend-received" />
                  실제 입금액
                </dt>
                <dd>{won(active.received)}원</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
      <p className="chart-hint">
        {dense
          ? "좌우로 이동해 월별 막대를 선택하면 금액을 확인할 수 있어요."
          : "월별 막대를 선택하면 구매금액과 입금액을 확인할 수 있어요."}
      </p>
      <p className="chart-caption">
        구매일 기준 구매액 · 실제 입금일 기준 입금액(추가 리뷰비 포함)
      </p>
    </div>
  );
}
export default function Dashboard({
  items,
  payments,
  onNavigate,
  onOpen,
  onAdd,
}: {
  items: Review[];
  payments: Payment[];
  onNavigate: (p: Page, status?: string) => void;
  onOpen: (i: Review) => void;
  onAdd: (ocr?: boolean) => void;
}) {
  const upcoming = items
    .filter((i) => i.reviewStatus === "todo")
    .sort((a, b) => {
      if (a.dueDate && b.dueDate)
        return (
          a.dueDate.localeCompare(b.dueDate) ||
          a.createdAt.localeCompare(b.createdAt)
        );
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  const urgent = upcoming.filter(
    (i) => i.dueDate && (daysUntil(i.dueDate) ?? 99) <= 3,
  );
  const recent = [...items]
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
    .slice(0, 5);
  return (
    <>
      <div className="page-title">
        <PageHeading
          icon={LayoutDashboard}
          title="리뷰 대시보드"
          subtitle="작성할 리뷰와 받을 페이백을 한눈에 확인하세요."
        />
        <div className="page-actions">
          <Button onClick={() => onAdd(true)}>
            <ScanLine size={17} />
            주문내역 가져오기
          </Button>
          <Button variant="primary" onClick={() => onAdd()}>
            <Plus size={17} />
            상품 등록
          </Button>
        </div>
      </div>
      <Metrics items={items} />
      <Earnings summary={earningsSummary(items)} />
      <button
        className="attention-banner"
        onClick={() => onNavigate("products", "urgent")}
      >
        <span className="attention-icon">
          <CalendarClock size={21} />
        </span>
        <span>
          <b>마감 확인이 필요한 리뷰 {urgent.length}건</b>
        </span>
        <span className="attention-link">
          마감 리뷰 보기
          <ChevronRight size={16} />
        </span>
      </button>
      <div className="dashboard-panels">
        <section className="panel">
          <SectionTitle
            title="월별 활동"
            note="최근 6개월의 구매와 페이백 흐름"
            action={
              <TextLink onClick={() => onNavigate("insights")}>
                통계 보기
              </TextLink>
            }
          />
          <MonthlyChart items={items} payments={payments} />
        </section>
        <section className="panel deadline-panel">
          <SectionTitle
            title="다가오는 리뷰"
            action={<span className="count-chip">{upcoming.length}</span>}
          />
          {upcoming.length ? (
            <div className="deadline-list">
              <div
                className="deadline-items"
                role="region"
                aria-label="작성 전 리뷰 목록"
                tabIndex={0}
              >
                {upcoming.map((i, n) => (
                  <button
                    className="deadline-row"
                    key={i.id}
                    onClick={() => onOpen(i)}
                  >
                    <ProductIcon platform={i.platform} index={n} />
                    <span className="deadline-text">
                      <strong>{i.name}</strong>
                      <span>
                        <TypeIcon type={i.reviewType} />
                        {i.reviewType}
                        <i>·</i>
                        {i.dueDate
                          ? `${dateLabel(i.dueDate)} 마감`
                          : "마감 미정"}
                      </span>
                    </span>
                    {i.dueDate ? (
                      <DueBadge date={i.dueDate} />
                    ) : (
                      <ReviewBadge item={i} />
                    )}
                  </button>
                ))}
              </div>
              <TextLink onClick={() => onNavigate("products", "todo")}>
                작성 전 리뷰 전체 보기
              </TextLink>
            </div>
          ) : (
            <div className="all-done">
              <CheckCircle2 size={30} />
              <strong>작성할 리뷰가 없어요</strong>
              <p>새로운 상품을 등록해 보세요.</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel recent-panel">
        <SectionTitle
          title="최근 등록한 상품"
          action={
            <TextLink onClick={() => onNavigate("products")}>
              전체 상품 보기
            </TextLink>
          }
        />
        {!recent.length ? (
          <Empty
            action={
              <Button onClick={() => onAdd()} variant="primary">
                <Plus size={16} />첫 상품 등록
              </Button>
            }
          />
        ) : (
          <>
            <div className="table-wrap desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>상품 정보</th>
                    <th>플랫폼</th>
                    <th>구매금액</th>
                    <th>리뷰 상태</th>
                    <th>페이백</th>
                    <th>구매일</th>
                    <th>
                      <span className="sr-only">상세</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((i, n) => (
                    <tr key={i.id}>
                      <td>
                        <button
                          className="product-name-button"
                          onClick={() => onOpen(i)}
                        >
                          <ProductIcon platform={i.platform} index={n} />
                          <span>
                            <strong>{i.name}</strong>
                            <small>
                              {i.seller || "판매처 미입력"} <i>·</i>{" "}
                              {i.sku || "SKU 미입력"}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <Platform name={platformLabel(i)} />
                      </td>
                      <td className="money-cell">
                        {won(i.price)}
                        <small>원</small>
                      </td>
                      <td>
                        <ReviewBadge item={i} />
                      </td>
                      <td>
                        <PaybackBadge item={i} />
                      </td>
                      <td className="muted">{dateLabel(i.purchaseDate)}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`${i.name} 상세`}
                          onClick={() => onOpen(i)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-cards">
              {recent.map((i) => (
                <button
                  key={i.id}
                  className="mobile-product"
                  onClick={() => onOpen(i)}
                >
                  <div className="flex-between">
                    <Platform name={platformLabel(i)} />
                    <small>{dateLabel(i.purchaseDate)}</small>
                  </div>
                  <strong>{i.name}</strong>
                  <div className="flex-between">
                    <span className="inline-badges">
                      <ReviewBadge item={i} />
                      <PaybackBadge item={i} />
                    </span>
                    <b>{won(i.price)}원</b>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
