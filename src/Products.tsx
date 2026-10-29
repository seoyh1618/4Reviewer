import {
  useState,
  useEffect,
  useMemo,
  useId,
  useRef,
  type ReactNode,
} from "react";
import {
  Search,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Columns3,
  ScanLine,
  ClipboardList,
  Wallet,
  Kanban,
  Table2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
} from "lucide-react";
import {
  platforms,
  shippingMethods,
  settlement,
  daysUntil,
  platformLabel,
  remainingPayback,
} from "../shared/domain.mjs";
import {
  Button,
  Empty,
  Platform,
  ProductIcon,
  ReviewBadge,
  PaybackBadge,
  DueBadge,
  TypeIcon,
  PageHeading,
} from "./ui";
import { won, fullDate, exportCsv } from "./lib";
import ColumnPicker from "./ColumnPicker";
import ReviewProgress, { type ReviewStage } from "./ReviewProgress";
import ReviewKanban from "./ReviewKanban";
import ReviewKpis from "./ReviewKpis";
import type { Review, Filters } from "./types";

import {
  compareReviews,
  parseReviewSort,
  nextReviewSort,
  reviewSortColumns,
  reviewSortLabel,
} from "../shared/review-sorting.mjs";

const PAGE_SIZE = 20;

function matchesStatus(item: Review, status: string) {
  if (!status) return true;
  if (status === "todo" || status === "done")
    return item.reviewStatus === status;
  if (status === "pending") return remainingPayback(item) > 0;
  if (status === "paid") return settlement(item) === "done";
  if (status === "partial") return settlement(item) === "partial";
  return (
    status === "urgent" &&
    item.reviewStatus === "todo" &&
    !!item.dueDate &&
    (daysUntil(item.dueDate) ?? 99) <= 3
  );
}

export default function Products({
  preferenceKey,
  items,
  onOpen,
  onProgress,
  onAdd,
  filters,
  setFilters,
  payback = false,
}: {
  preferenceKey: string;
  items: Review[];
  onOpen: (r: Review) => void;
  onProgress: (r: Review, stage: ReviewStage) => void;
  onAdd: (ocr?: boolean) => void;
  filters: Filters;
  setFilters: (v: Filters) => void;
  payback?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 600px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 600px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [layout, setLayout] = useState(() => {
    try {
      return localStorage.getItem(`${preferenceKey}:layout`) === "kanban"
        ? "kanban"
        : "table";
    } catch {
      return "table";
    }
  });
  const kanban = !mobile && !payback && layout === "kanban";
  useEffect(() => {
    if (payback) return;
    try {
      localStorage.setItem(`${preferenceKey}:layout`, layout);
    } catch {
      // View switching remains available without browser storage.
    }
  }, [preferenceKey, layout, payback]);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(preferenceKey) || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter(
            (key): key is string =>
              typeof key === "string" && key !== "product",
          )
        : [];
    } catch {
      return [];
    }
  });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnPickerId = useId();
  const statusCountId = useId();
  const columnTrigger = useRef<HTMLButtonElement>(null);
  const closeColumns = () => {
    setColumnsOpen(false);
    columnTrigger.current?.focus();
  };
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(hiddenColumns));
    } catch {
      // Column selection remains usable when browser storage is unavailable.
    }
  }, [preferenceKey, hiddenColumns]);
  const f = (key: keyof Filters, value: string) =>
    setFilters({ ...filters, [key]: value });
  useEffect(
    () => setPage(1),
    [
      filters.search,
      filters.platform,
      filters.shippingMethod,
      filters.status,
      filters.sort,
      payback,
    ],
  );
  const matchingItems = useMemo(
    () =>
      items.filter((i) => {
        const match = [
          i.name,
          i.sku,
          i.seller,
          platformLabel(i),
          i.orderNumber,
          i.purchaser,
          i.contact,
          i.kakaoName,
          i.depositor,
        ].some((v) => v.toLowerCase().includes(filters.search.toLowerCase()));
        return (
          match &&
          (!filters.platform || i.platform === filters.platform) &&
          (!filters.shippingMethod ||
            i.shippingMethod === filters.shippingMethod)
        );
      }),
    [items, filters.search, filters.platform, filters.shippingMethod],
  );
  const filtered = useMemo(
    () =>
      matchingItems
        .filter((i) => matchesStatus(i, filters.status))
        .sort(compareReviews(filters.sort)),
    [matchingItems, filters.status, filters.sort],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const tabs = payback
    ? [
        ["", "전체"],
        ["pending", "입금 대기"],
        ["partial", "부분 입금"],
        ["paid", "입금 완료"],
      ]
    : [
        ["", "전체 상품"],
        ["todo", "작성 전"],
        ["done", "리뷰 완료"],
        ["urgent", "마감 임박"],
        ["paid", "정산 완료"],
      ];
  const cellText = (value: string) => (
    <span className="table-text" title={value || undefined}>
      {value || "—"}
    </span>
  );
  const cellDate = (value: string) => (
    <time dateTime={value || undefined}>{value ? fullDate(value) : "—"}</time>
  );
  const cellMoney = (value: number) => (
    <span className="money-cell">
      {won(value)}
      <small>원</small>
    </span>
  );
  type Column = {
    key: string;
    label: string;
    render: (i: Review, n: number) => ReactNode;
    extended?: boolean;
  };
  const productColumn: Column = {
    key: "product",
    label: "상품명 / 판매처",
    render: (i, n) => (
      <button className="product-name-button" onClick={() => onOpen(i)}>
        <ProductIcon platform={i.platform} index={n} />
        <span>
          <strong title={i.name}>{i.name}</strong>
          <small>
            {i.seller || "판매처 미입력"}
            {i.sku && <> · {i.sku}</>}
          </small>
        </span>
      </button>
    ),
  };
  const progressColumn: Column = {
    key: "progress",
    label: "진행 단계",
    render: (i) => (
      <ReviewProgress item={i} onStart={(stage) => onProgress(i, stage)} />
    ),
  };
  const reviewColumns: Column[] = [
    productColumn,
    { key: "purchaser", label: "계정주", render: (i) => cellText(i.purchaser) },
    {
      key: "purchaseDate",
      label: "구매일",
      render: (i) => cellDate(i.purchaseDate),
    },
    { key: "price", label: "구매가", render: (i) => cellMoney(i.price) },
    {
      key: "platform",
      label: "구매 플랫폼",
      render: (i) => <Platform name={platformLabel(i)} />,
    },
    {
      key: "shipping",
      label: "리뷰 타입",
      render: (i) => cellText(i.shippingMethod),
    },
    {
      key: "reviewType",
      label: "리뷰 가이드",
      render: (i) => (
        <span className="type-label">
          <TypeIcon type={i.reviewType} />
          {i.reviewType}
        </span>
      ),
    },
    {
      key: "reviewStatus",
      label: "리뷰 작성",
      render: (i) => <ReviewBadge item={i} />,
    },
    {
      key: "reviewedAt",
      label: "리뷰 작성일",
      render: (i) => cellDate(i.reviewedAt),
      extended: true,
    },
    {
      key: "dueDate",
      label: "리뷰 마감일",
      render: (i) => (
        <span className="table-date-stack">
          {cellDate(i.dueDate)}
          {i.reviewStatus !== "done" && i.dueDate && (
            <DueBadge date={i.dueDate} />
          )}
        </span>
      ),
    },
    {
      key: "payback",
      label: "페이백",
      render: (i) => <PaybackBadge item={i} />,
    },
    {
      key: "expected",
      label: "예상 페이백",
      render: (i) => cellMoney(i.expectedPayback),
      extended: true,
    },
    {
      key: "additionalReviewFee",
      label: "추가 리뷰비",
      render: (i) => cellMoney(i.additionalReviewFee),
      extended: true,
    },
    {
      key: "received",
      label: "입금액",
      render: (i) => cellMoney(i.receivedAmount),
      extended: true,
    },
    {
      key: "paidAt",
      label: "정산일",
      render: (i) => cellDate(i.paidAt),
      extended: true,
    },
    {
      key: "depositor",
      label: "입금자명",
      render: (i) => cellText(i.depositor),
      extended: true,
    },
    {
      key: "contact",
      label: "연락처",
      render: (i) => cellText(i.contact),
      extended: true,
    },
    {
      key: "kakaoName",
      label: "카톡 이름",
      render: (i) => cellText(i.kakaoName),
      extended: true,
    },
  ];
  const paybackColumns: Column[] = [
    productColumn,
    { key: "purchaser", label: "계정주", render: (i) => cellText(i.purchaser) },
    {
      key: "platform",
      label: "구매 플랫폼",
      render: (i) => <Platform name={platformLabel(i)} />,
    },
    {
      key: "expected",
      label: "예상 페이백",
      render: (i) => cellMoney(i.expectedPayback),
    },
    {
      key: "additionalReviewFee",
      label: "추가 리뷰비",
      render: (i) => cellMoney(i.additionalReviewFee),
    },
    {
      key: "received",
      label: "입금액",
      render: (i) => cellMoney(i.receivedAmount),
    },
    {
      key: "remaining",
      label: "남은 금액",
      render: (i) => cellMoney(remainingPayback(i)),
    },
    {
      key: "payback",
      label: "정산 상태",
      render: (i) => <PaybackBadge item={i} />,
    },
    { key: "paidAt", label: "정산일", render: (i) => cellDate(i.paidAt) },
    {
      key: "depositor",
      label: "입금자명",
      render: (i) => cellText(i.depositor),
      extended: true,
    },
    {
      key: "contact",
      label: "연락처",
      render: (i) => cellText(i.contact),
      extended: true,
    },
    {
      key: "kakaoName",
      label: "카톡 이름",
      render: (i) => cellText(i.kakaoName),
      extended: true,
    },
  ];
  const allColumns = [
    ...(payback ? paybackColumns : reviewColumns),
    progressColumn,
  ];
  const columns = allColumns.filter(
    (c) => c.key === "product" || !hiddenColumns.includes(c.key),
  );
  const tableColumns: Column[] = [
    ...columns.filter((c) => c.key !== "progress"),
    {
      key: "detail",
      label: "상세",
      render: (i) => (
        <button
          className="icon-button"
          aria-label={`${i.name} 상세`}
          onClick={() => onOpen(i)}
        >
          <ChevronRight size={16} />
        </button>
      ),
    },
    ...columns.filter((c) => c.key === "progress"),
  ];
  const columnClass = (key: string) =>
    key === "product"
      ? "sticky-product"
      : key === "progress"
        ? "sticky-progress"
        : key === "detail"
          ? "detail-column"
          : undefined;
  const activeSort = parseReviewSort(filters.sort);
  const sortColumn = (key: string) =>
    f("sort", nextReviewSort(filters.sort, key));
  const mobileSortKeys = payback
    ? ["product", "paidAt", "remaining", "platform", "shipping"]
    : ["product", "purchaseDate", "price", "platform", "shipping"];
  const sortButton = (key: string, label: string, mobile = false) => {
    const selected = activeSort.key === key;
    const Icon = selected
      ? activeSort.direction === "asc"
        ? ArrowUp
        : ArrowDown
      : ArrowUpDown;
    return (
      <button
        type="button"
        className={`column-sort-button ${selected ? "is-sorted" : ""}`}
        aria-label={`${label} 정렬`}
        aria-pressed={mobile ? selected : undefined}
        title={`${label} · 누르면 ${parseReviewSort(nextReviewSort(filters.sort, key)).direction === "asc" ? "오름차순" : "내림차순"}`}
        onClick={() => sortColumn(key)}
      >
        <span>{label}</span>
        <Icon size={13} aria-hidden="true" />
      </button>
    );
  };
  return (
    <>
      <div className="page-title reviews-page-title">
        <PageHeading
          icon={payback ? Wallet : ClipboardList}
          title={payback ? "페이백 관리" : "내 리뷰"}
          subtitle={
            payback
              ? "받을 페이백부터 입금 완료까지, 정산 현황을 확인하세요."
              : "상품별 리뷰 진행 상황과 정산 내역을 한곳에서 관리하세요."
          }
        />
        <div
          className={`page-actions ${!payback ? "review-view-actions" : ""}`}
        >
          <Button
            className="data-export-button"
            onClick={() => {
              exportCsv(filtered);
            }}
          >
            <Download size={17} />
            내보내기
          </Button>
          {!payback && !mobile && (
            <Button
              className="review-view-toggle"
              aria-pressed={kanban}
              onClick={() => {
                setLayout(kanban ? "table" : "kanban");
                setColumnsOpen(false);
              }}
            >
              {kanban ? <Table2 size={17} /> : <Kanban size={17} />}
              {kanban ? "테이블뷰로 보기" : "칸반뷰로 보기"}
            </Button>
          )}
          <Button variant="primary" onClick={() => onAdd()}>
            <Plus size={17} />
            상품 등록
          </Button>
        </div>
      </div>
      {!payback && (
        <ReviewKpis
          items={matchingItems}
          filtered={
            !!(filters.search || filters.platform || filters.shippingMethod)
          }
        />
      )}
      {payback && (
        <div className="payback-summary">
          <div>
            <span>받을 페이백</span>
            <strong>
              {won(items.reduce((s, i) => s + remainingPayback(i), 0))}
              <small>원</small>
            </strong>
          </div>
          <div>
            <span>실제 입금액</span>
            <strong>
              {won(items.reduce((s, i) => s + i.receivedAmount, 0))}
              <small>원</small>
            </strong>
          </div>
          <div>
            <span>입금 대기 상품</span>
            <strong>
              {items.filter((i) => remainingPayback(i) > 0).length}
              <small>개</small>
            </strong>
          </div>
        </div>
      )}
      <section
        className={`panel product-panel ${kanban ? "product-panel--kanban" : ""}`}
      >
        <div
          className={`list-tabs ${payback ? "payback-tabs" : "review-tabs"}`}
          role="tablist"
          aria-label="상품 진행 상태"
        >
          {tabs.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-label={label}
              aria-describedby={`${statusCountId}-${key || "all"}`}
              aria-selected={filters.status === key}
              className={filters.status === key ? "active" : ""}
              onClick={() => f("status", key)}
            >
              {label}
              <span
                id={`${statusCountId}-${key || "all"}`}
                className="status-count"
                aria-label={`${matchingItems.filter((i) => matchesStatus(i, key)).length}개`}
              >
                {matchingItems.filter((i) => matchesStatus(i, key)).length}
              </span>
            </button>
          ))}
        </div>
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="상품 검색"
              placeholder="상품, 계정주, 연락처, 카톡 이름 검색"
              value={filters.search}
              onChange={(e) => f("search", e.target.value)}
            />
          </div>
          <div className="filter-controls">
            <select
              aria-label="플랫폼 필터"
              value={filters.platform}
              onChange={(e) => f("platform", e.target.value)}
            >
              <option value="">모든 플랫폼</option>
              {platforms.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select
              aria-label="리뷰 타입 필터"
              value={filters.shippingMethod}
              onChange={(e) => f("shippingMethod", e.target.value)}
            >
              <option value="">모든 리뷰 타입</option>
              {shippingMethods.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
            <select
              aria-label="정렬"
              value={filters.sort}
              onChange={(e) => f("sort", e.target.value)}
            >
              <option value="recent">최근 구매순</option>
              <option value="due">마감 임박순</option>
              <option value="price">구매금액순</option>
              {!["recent", "due", "price"].includes(filters.sort) && (
                <option value={filters.sort}>
                  {reviewSortLabel(filters.sort)}
                </option>
              )}
            </select>
            {!kanban && (
              <button
                type="button"
                className="column-trigger"
                ref={columnTrigger}
                aria-label="표시할 열"
                aria-expanded={columnsOpen}
                aria-controls={columnPickerId}
                onClick={() => setColumnsOpen(!columnsOpen)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeColumns();
                }}
              >
                <Columns3 size={15} />
                표시할 열<span className="column-count">{columns.length}</span>
                <ChevronDown
                  size={14}
                  className={columnsOpen ? "chevron-open" : ""}
                />
              </button>
            )}
          </div>
        </div>
        <div
          className="mobile-column-sorting"
          role="group"
          aria-label="정렬할 열"
        >
          {mobileSortKeys.map((key) => (
            <div key={key}>
              {sortButton(key, reviewSortColumns[key].label, true)}
            </div>
          ))}
        </div>
        <span className="sr-only" role="status">
          {reviewSortLabel(filters.sort)}
        </span>
        {(filters.platform || filters.shippingMethod) && (
          <div className="mobile-applied-filters" aria-label="적용된 필터">
            {filters.platform && (
              <button
                type="button"
                aria-label={`플랫폼 ${filters.platform} 선택 해제`}
                onClick={() => f("platform", "")}
              >
                {filters.platform}
                <X size={13} aria-hidden="true" />
              </button>
            )}
            {filters.shippingMethod && (
              <button
                type="button"
                aria-label={`리뷰 타입 ${filters.shippingMethod} 선택 해제`}
                onClick={() => f("shippingMethod", "")}
              >
                {filters.shippingMethod}
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {!kanban && columnsOpen && (
          <ColumnPicker
            id={columnPickerId}
            columns={allColumns}
            hidden={hiddenColumns}
            onChange={setHiddenColumns}
            onClose={closeColumns}
          />
        )}
        {!filtered.length ? (
          <Empty
            title={
              items.length
                ? "검색 결과가 없어요"
                : "첫 번째 상품을 등록해 보세요"
            }
            description={
              items.length
                ? "검색어 또는 필터를 바꿔 다시 확인해 주세요."
                : "주문내역을 올리면 상품 정보를 더 편하게 입력할 수 있어요."
            }
            action={
              items.length ? (
                <Button
                  onClick={() =>
                    setFilters({
                      search: "",
                      platform: "",
                      shippingMethod: "",
                      status: "",
                      sort: "recent",
                    })
                  }
                >
                  필터 초기화
                </Button>
              ) : (
                <Button onClick={() => onAdd(true)}>
                  <ScanLine size={16} />
                  주문내역으로 등록
                </Button>
              )
            }
          />
        ) : kanban ? (
          <ReviewKanban
            items={filtered}
            onOpen={onOpen}
            onProgress={onProgress}
          />
        ) : (
          <>
            <div
              className="table-wrap desktop-table product-table-scroll"
              role="region"
              aria-label={payback ? "페이백 목록" : "내 리뷰 목록"}
              tabIndex={0}
            >
              <table className="product-data-table">
                <thead>
                  <tr>
                    {tableColumns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={columnClass(c.key)}
                        aria-label={c.label}
                        aria-sort={
                          Object.hasOwn(reviewSortColumns, c.key)
                            ? activeSort.key === c.key
                              ? activeSort.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                            : undefined
                        }
                      >
                        {c.key === "detail" ? (
                          <span className="sr-only">{c.label}</span>
                        ) : Object.hasOwn(reviewSortColumns, c.key) ? (
                          sortButton(c.key, c.label)
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((i, n) => (
                    <tr key={i.id}>
                      {tableColumns.map((c) => (
                        <td key={c.key} className={columnClass(c.key)}>
                          {c.render(i, n)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-cards">
              {visible.map((i) => (
                <div className="mobile-review-card" key={i.id}>
                  <button
                    type="button"
                    className="mobile-product"
                    aria-label={`${i.name} 상세`}
                    aria-haspopup="dialog"
                    onClick={() => onOpen(i)}
                  >
                    <span className="mobile-card-heading">
                      <span className="mobile-card-platform">
                        <Platform name={platformLabel(i)} />
                        {i.shippingMethod && <small>{i.shippingMethod}</small>}
                      </span>
                      <span className="mobile-card-badges">
                        <ReviewBadge item={i} />
                        <PaybackBadge item={i} />
                      </span>
                    </span>
                    <span className="mobile-card-title">
                      <strong>{i.name}</strong>
                      <ChevronRight size={16} aria-hidden="true" />
                    </span>
                    <span className="mobile-card-summary">
                      <span className="mobile-card-context">
                        <time
                          dateTime={
                            payback ? i.paidAt || undefined : i.purchaseDate
                          }
                        >
                          {payback
                            ? i.paidAt
                              ? fullDate(i.paidAt)
                              : "정산일 미정"
                            : fullDate(i.purchaseDate)}
                        </time>
                        {i.reviewStatus === "todo" ? (
                          <DueBadge date={i.dueDate} />
                        ) : (
                          <span className="mobile-card-type">
                            {i.reviewType}
                          </span>
                        )}
                      </span>
                      <span className="mobile-card-amount">
                        <small>{payback ? "남은 페이백" : "구매가"}</small>
                        <b>{won(payback ? remainingPayback(i) : i.price)}원</b>
                      </span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <div className="pagination">
              <span>
                전체 <b>{filtered.length}</b>개 중{" "}
                {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="이전 페이지"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  {currentPage} <small>/ {pageCount}</small>
                </span>
                <button
                  className="icon-button"
                  aria-label="다음 페이지"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
