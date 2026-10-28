import { useId } from "react";
import { CheckCheck, CircleCheck, ClipboardList } from "lucide-react";
import {
  daysUntil,
  platformLabel,
  remainingPayback,
  settlement,
} from "../shared/domain.mjs";
import { Platform } from "./ui";
import { fullDate, won } from "./lib";
import ReviewProgress, { type ReviewStage } from "./ReviewProgress";
import type { Review } from "./types";
import "./review-kanban.css";

const stages = [
  { key: "todo", label: "작성 전", Icon: ClipboardList },
  { key: "reviewed", label: "리뷰 완료", Icon: CircleCheck },
  { key: "paid", label: "정산 완료", Icon: CheckCheck },
] as const;

function stageOf(item: Review) {
  if (item.reviewStatus === "todo") return "todo";
  return settlement(item) === "done" ? "paid" : "reviewed";
}

export default function ReviewKanban({
  items,
  onOpen,
  onProgress,
}: {
  items: Review[];
  onOpen: (item: Review) => void;
  onProgress: (item: Review, stage: ReviewStage) => void;
}) {
  const id = useId();
  return (
    <div className="review-kanban">
      <div className="kanban-summary">
        <span>
          전체 <b>{items.length}</b>건
        </span>
        <span className="kanban-mobile-hint">
          좌우로 밀어 진행 단계를 확인하세요.
        </span>
      </div>
      <div
        className="kanban-scroll"
        role="region"
        aria-label="리뷰 칸반 보드"
        tabIndex={0}
      >
        <div className="kanban-columns">
          {stages.map(({ key, label, Icon }) => {
            const records = items.filter((item) => stageOf(item) === key);
            return (
              <section
                className="kanban-column"
                key={key}
                aria-labelledby={`${id}-${key}`}
              >
                <header className="kanban-column-heading">
                  <Icon size={16} aria-hidden="true" />
                  <h2 id={`${id}-${key}`}>{label}</h2>
                  <span
                    className="kanban-count"
                    aria-label={`${records.length}건`}
                  >
                    {records.length}
                  </span>
                </header>
                <div
                  className="kanban-lane"
                  role="region"
                  aria-label={`${label} 카드 목록`}
                  tabIndex={0}
                >
                  {records.length ? (
                    <ul className="kanban-cards">
                      {records.map((item) => {
                        const state = settlement(item);
                        const days = daysUntil(item.dueDate);
                        const urgent =
                          key === "todo" && days !== null && days <= 3;
                        const date =
                          key === "todo"
                            ? item.dueDate
                            : key === "paid"
                              ? item.paidAt
                              : item.reviewedAt;
                        const dateLabel =
                          key === "todo"
                            ? "마감일"
                            : key === "paid"
                              ? "정산일"
                              : "리뷰 처리일";
                        return (
                          <li key={item.id} className="kanban-card">
                            <button
                              className="kanban-card-detail"
                              type="button"
                              aria-label={`${item.name} 상세`}
                              aria-haspopup="dialog"
                              onClick={() => onOpen(item)}
                            >
                              <span className="kanban-card-meta">
                                <Platform name={platformLabel(item)} />
                                <span>
                                  {item.shippingMethod || "타입 미입력"}
                                </span>
                              </span>
                              <strong
                                className="kanban-card-name"
                                title={item.name}
                              >
                                {item.name}
                              </strong>
                              <span
                                className="kanban-card-subtitle"
                                title={`${item.seller} · ${item.reviewType}`}
                              >
                                {item.seller ? `${item.seller} · ` : ""}
                                {item.reviewType}
                              </span>
                              <span className="kanban-card-field">
                                <span>{dateLabel}</span>
                                <span>
                                  {date ? (
                                    <time dateTime={date}>
                                      {fullDate(date)}
                                    </time>
                                  ) : (
                                    "미정"
                                  )}
                                </span>
                              </span>
                              <span className="kanban-card-field">
                                <span>구매가</span>
                                <b>{won(item.price)}원</b>
                              </span>
                            </button>
                            <div className="kanban-card-footer">
                              <span className="kanban-card-status">
                                {urgent ? (
                                  <span className="kanban-urgent">
                                    {days < 0
                                      ? "마감 지남"
                                      : days === 0
                                        ? "오늘 마감"
                                        : `마감 임박 D-${days}`}
                                  </span>
                                ) : state === "none" ? (
                                  "정산 없음"
                                ) : state === "done" ? (
                                  "입금 완료"
                                ) : (
                                  <>
                                    {state === "partial"
                                      ? "부분 입금 · "
                                      : "받을 금액 "}
                                    {won(remainingPayback(item))}원
                                  </>
                                )}
                              </span>
                              <ReviewProgress
                                item={item}
                                onStart={(stage) => onProgress(item, stage)}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="kanban-empty">이 단계의 리뷰가 없어요.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
