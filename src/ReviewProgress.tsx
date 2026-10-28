import { Check } from "lucide-react";
import { settlement } from "../shared/domain.mjs";
import type { Review } from "./types";

export type ReviewStage = "review" | "payment";

export default function ReviewProgress({
  item,
  onStart,
  paymentLabel = "정산 완료 전환",
  disabled = false,
}: {
  item: Review;
  onStart: (stage: ReviewStage) => void;
  paymentLabel?: string;
  disabled?: boolean;
}) {
  const reviewed = item.reviewStatus === "done";
  const paid = settlement(item) === "done";
  const complete = reviewed && paid;
  const nextStage: ReviewStage = reviewed ? "payment" : "review";
  const nextLabel = reviewed ? paymentLabel : "리뷰 완료";
  return (
    <div
      className="review-progress"
      role="group"
      aria-label={`${item.name} 진행 단계`}
    >
      {complete ? (
        <span className="review-progress-complete">
          <Check size={14} aria-hidden="true" />
          정산 완료
        </span>
      ) : (
        <button
          type="button"
          className="review-progress-action"
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => onStart(nextStage)}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}
