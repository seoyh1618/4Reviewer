import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { today, platformLabel } from "../shared/domain.mjs";
import {
  Button,
  Empty,
  ReviewBadge,
  Platform,
  TypeIcon,
  PageHeading,
} from "./ui";
import { fullDate } from "./lib";
import type { Review } from "./types";
export default function Calendar({
  items,
  onOpen,
  onAdd,
}: {
  items: Review[];
  onOpen: (i: Review) => void;
  onAdd: () => void;
}) {
  const [month, setMonth] = useState(today().slice(0, 7)),
    [selected, setSelected] = useState(today());
  const [year, m] = month.split("-").map(Number);
  const offset = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const dates = Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, i) =>
      i >= offset && i < offset + count
        ? `${month}-${String(i - offset + 1).padStart(2, "0")}`
        : "",
  );
  const completedItems = items.filter(
    (i) => i.reviewStatus === "done" && i.reviewedAt,
  );
  const selectedItems = completedItems.filter((i) => i.reviewedAt === selected);
  const monthItems = completedItems.filter((i) =>
    i.reviewedAt.startsWith(month),
  );
  function move(delta: number) {
    const d = new Date(Date.UTC(year, m - 1 + delta, 1));
    const key = d.toISOString().slice(0, 7);
    setMonth(key);
    setSelected(`${key}-01`);
  }
  return (
    <>
      <div className="page-title">
        <PageHeading
          icon={CalendarDays}
          title="리뷰 캘린더"
          subtitle="리뷰 처리일 기준으로 완료한 리뷰를 확인하세요."
        />
        <Button variant="primary" onClick={onAdd}>
          <Plus size={17} />
          상품 등록
        </Button>
      </div>
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="calendar-heading">
            <h2>
              {year}년 {m}월{" "}
              <span className="count-chip">처리 {monthItems.length}건</span>
            </h2>
            <div>
              <Button
                onClick={() => {
                  setMonth(today().slice(0, 7));
                  setSelected(today());
                }}
              >
                오늘
              </Button>
              <button
                className="icon-button"
                aria-label="이전 달"
                onClick={() => move(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="다음 달"
                onClick={() => move(1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="calendar-grid calendar-week">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {dates.map((d, i) => {
              const rows = monthItems.filter((r) => r.reviewedAt === d);
              return d ? (
                <button
                  key={d}
                  aria-label={`${d} 리뷰 처리 ${rows.length}건`}
                  aria-pressed={selected === d}
                  className={`calendar-day ${selected === d ? "selected" : ""} ${d === today() ? "today" : ""}`}
                  onClick={() => setSelected(d)}
                >
                  <span className="calendar-number">{Number(d.slice(8))}</span>
                  <div className="calendar-events">
                    {rows.slice(0, 2).map((r) => (
                      <span className="calendar-event done" key={r.id}>
                        {r.name}
                      </span>
                    ))}
                    {rows.length > 2 && <small>+{rows.length - 2}건</small>}
                  </div>
                  {rows.length > 0 && (
                    <div className="calendar-dots">
                      {rows.slice(0, 3).map((r) => (
                        <i key={r.id} className="done" />
                      ))}
                    </div>
                  )}
                </button>
              ) : (
                <div className="calendar-day outside" key={`blank-${i}`} />
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i className="done" />
              리뷰 처리 완료
            </span>
          </div>
        </section>
        <section className="panel agenda-panel">
          <div className="section-title">
            <div>
              <h2>{fullDate(selected)}</h2>
              <p>{selectedItems.length}건의 리뷰 처리</p>
            </div>
            <CalendarDays size={20} />
          </div>
          {selectedItems.length ? (
            selectedItems.map((i) => (
              <button
                key={i.id}
                className="agenda-item"
                onClick={() => onOpen(i)}
              >
                <div className="flex-between">
                  <Platform name={platformLabel(i)} />
                  <ReviewBadge item={i} />
                </div>
                <strong>{i.name}</strong>
                <span className="type-label">
                  <TypeIcon type={i.reviewType} />
                  {i.reviewType}
                </span>
              </button>
            ))
          ) : (
            <Empty
              title="처리한 리뷰가 없어요"
              description="리뷰 완료 처리 후 날짜별 내역을 확인할 수 있어요."
            />
          )}
        </section>
      </div>
    </>
  );
}
