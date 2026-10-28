import { useId } from "react";
import { Coins, Gift, TrendingUp, Clock3 } from "lucide-react";
import { earningsSummary } from "../shared/earnings.mjs";
import { won } from "./lib";
import "./earnings.css";

export default function Earnings({
  summary,
  periodLabel,
}: {
  summary: ReturnType<typeof earningsSummary>;
  periodLabel?: string;
}) {
  const id = useId();
  const cards = [
    {
      label: "총수익",
      value: summary.total,
      Icon: TrendingUp,
      tone: "blue",
      note: "현금 수익 + 상품 수익",
      detail: periodLabel
        ? `${periodLabel} 수익 합계`
        : `미입금 리뷰비 포함 ${won(summary.total + summary.cashPending)}원`,
    },
    {
      label: "현금 수익",
      value: summary.cashReceived,
      Icon: Coins,
      tone: "green",
      note: "입금된 추가 리뷰비",
      detail: `${periodLabel ? "기간 구매분 " : ""}입금 대기 ${won(summary.cashPending)}원`,
    },
    {
      label: "상품 수익",
      value: summary.productValue,
      Icon: Gift,
      tone: "violet",
      note: `실배송 ${won(summary.productCount)}건 · 상품가액 기준`,
      detail: "등록 즉시 반영 · 현금이 아닌 상품 가치",
    },
    {
      label: "미입금 리뷰비",
      value: summary.cashPending,
      Icon: Clock3,
      tone: "orange",
      note: "아직 받지 않은 추가 리뷰비",
      detail: periodLabel
        ? "선택 기간 구매분 · 현재 미입금액"
        : "입금되면 현금 수익에 반영",
    },
  ];
  return (
    <section
      className="earnings-section"
      aria-label="수익 요약"
      aria-describedby={`${id}-note`}
    >
      <div className="earnings-grid">
        {cards.map(({ label, value, Icon, tone, note, detail }) => (
          <section className="earnings-card" key={label} aria-label={label}>
            <div className="earnings-card-top">
              <h3>{label}</h3>
              <span className={`metric-icon ${tone}`} aria-hidden="true">
                <Icon size={18} />
              </span>
            </div>
            <div
              className="earnings-value"
              style={
                won(value).length > 9
                  ? {
                      fontSize: `min(22px, calc((100cqw - 22px) / ${won(value).length * 0.63}))`,
                    }
                  : undefined
              }
            >
              {won(value)}
              <small>원</small>
            </div>
            <p className="earnings-note">{note}</p>
            <p className="earnings-detail">{detail}</p>
          </section>
        ))}
      </div>
      <p className="earnings-basis" id={`${id}-note`}>
        상품값 환급은 수익에서 제외해요. 부분 입금은 상품 원가를 먼저 차감한 뒤
        리뷰비 수익으로 계산해요.
        {periodLabel && " 상품 수익은 구매일, 현금 수익은 입금일 기준이에요."}
      </p>
    </section>
  );
}
