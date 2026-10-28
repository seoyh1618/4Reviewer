import { useState } from "react";
import {
  Check,
  ChevronUp,
  CornerDownRight,
  LockKeyhole,
  Plus,
} from "lucide-react";

type ColumnOption = { key: string; label: string; extended?: boolean };
const groups = [
  { label: "전체", keys: [] },
  {
    label: "상품 정보",
    keys: [
      "product",
      "purchaser",
      "purchaseDate",
      "price",
      "platform",
      "shipping",
    ],
  },
  {
    label: "리뷰 정보",
    keys: ["progress", "reviewType", "reviewStatus", "reviewedAt", "dueDate"],
  },
  {
    label: "정산 정보",
    keys: [
      "progress",
      "payback",
      "expected",
      "additionalReviewFee",
      "received",
      "remaining",
      "paidAt",
      "depositor",
    ],
  },
  { label: "연락처", keys: ["contact", "kakaoName"] },
];

export default function ColumnPicker({
  id,
  columns,
  hidden,
  onChange,
  onClose,
}: {
  id: string;
  columns: ColumnOption[];
  hidden: string[];
  onChange: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState("전체");
  const activeGroup = groups.find((g) => g.label === group)!;
  const options = columns.filter(
    (c) => group === "전체" || activeGroup.keys.includes(c.key),
  );
  const selectedCount = columns.filter((c) => !hidden.includes(c.key)).length;
  return (
    <section
      id={id}
      className="column-picker"
      aria-label="표시할 열 선택"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="column-picker-header">
        <div className="column-groups" role="group" aria-label="열 분류">
          {groups
            .filter(
              (g) =>
                !g.keys.length || columns.some((c) => g.keys.includes(c.key)),
            )
            .map((g) => (
              <button
                type="button"
                key={g.label}
                className="column-chip"
                aria-pressed={group === g.label}
                onClick={() => setGroup(g.label)}
              >
                {group === g.label && <Check size={13} />}
                {g.label}
              </button>
            ))}
        </div>
        <button
          type="button"
          className="icon-button column-picker-close"
          aria-label="열 선택 접기"
          onClick={onClose}
        >
          <ChevronUp size={16} />
        </button>
      </div>
      <p className="mobile-column-note">
        열 선택은 PC 표에 적용됩니다. 모바일 카드는 핵심 정보만 표시하며, 전체
        정보는 카드를 눌러 확인할 수 있어요.
      </p>
      <div className="column-picker-body">
        <div className="column-picker-summary">
          <span>
            <CornerDownRight size={15} />
            {group === "전체" ? "전체 열" : group}
            <small>
              {selectedCount} / {columns.length}개 표시
            </small>
          </span>
          <div className="column-presets">
            <button type="button" onClick={() => onChange([])}>
              전체 선택
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(columns.filter((c) => c.extended).map((c) => c.key))
              }
            >
              핵심 열만
            </button>
          </div>
        </div>
        <div
          className="column-options"
          role="group"
          aria-label={`${group} 표시 항목`}
        >
          {options.map((column) => {
            const fixed = column.key === "product";
            const selected = fixed || !hidden.includes(column.key);
            return (
              <button
                type="button"
                className="column-chip"
                key={column.key}
                aria-pressed={selected}
                aria-disabled={fixed || undefined}
                aria-label={`${column.label}${fixed ? " (고정)" : ""}`}
                onClick={() => {
                  if (!fixed)
                    onChange(
                      selected
                        ? [...hidden, column.key]
                        : hidden.filter((key) => key !== column.key),
                    );
                }}
              >
                {fixed ? (
                  <LockKeyhole size={13} />
                ) : selected ? (
                  <Check size={13} />
                ) : (
                  <Plus size={13} />
                )}
                {column.label}
                {fixed && <small>고정</small>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
