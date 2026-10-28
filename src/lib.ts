import type { Review, ReviewInput, Payment } from "./types";
import {
  today,
  csvCell,
  platformLabel,
  settlement,
  settlementLabels,
  expectedSettlement,
} from "../shared/domain.mjs";
export const won = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
export const dateLabel = (d: string) =>
  d ? `${Number(d.slice(5, 7))}.${d.slice(8, 10)}` : "미정";
export const fullDate = (d: string) => (d ? d.replaceAll("-", ". ") : "미정");
export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch("/api" + url, {
      method,
      headers: method === "GET" ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
    return data;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new Error("연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export const emptyReview = (): ReviewInput => ({
  name: "",
  sku: "",
  orderNumber: "",
  purchaser: "",
  seller: "",
  platform: "쿠팡",
  platformOther: "",
  shippingMethod: "실배송",
  price: 0,
  expectedPayback: 0,
  paybackMode: "shipping",
  additionalReviewFee: 0,
  receivedAmount: 0,
  purchaseDate: today(),
  dueDate: "",
  reviewedAt: "",
  reviewType: "사진 리뷰",
  reviewStatus: "todo",
  paidAt: "",
  contact: "",
  kakaoName: "",
  depositor: "",
  memo: "",
});
export function exportCsv(items: Review[]) {
  const columns: [
    string,
    keyof Review | "paybackStatus" | "expectedSettlement",
  ][] = [
    ["SKU", "sku"],
    ["상품명", "name"],
    ["계정주", "purchaser"],
    ["플랫폼", "platform"],
    ["판매처", "seller"],
    ["주문번호", "orderNumber"],
    ["구매일", "purchaseDate"],
    ["구매금액", "price"],
    ["리뷰 타입", "shippingMethod"],
    ["리뷰 가이드", "reviewType"],
    ["리뷰 상태", "reviewStatus"],
    ["리뷰 작성일", "reviewedAt"],
    ["리뷰 마감일", "dueDate"],
    ["페이백 상태", "paybackStatus"],
    ["예상 페이백", "expectedPayback"],
    ["추가 리뷰비", "additionalReviewFee"],
    ["총 받을 금액", "expectedSettlement"],
    ["실제 입금액", "receivedAmount"],
    ["정산일", "paidAt"],
    ["연락처", "contact"],
    ["카톡 이름", "kakaoName"],
    ["입금자명", "depositor"],
    ["메모", "memo"],
  ];
  const text =
    "\uFEFF" +
    [
      columns.map((c) => csvCell(c[0])).join(","),
      ...items.map((i) =>
        columns
          .map(([, k]) =>
            csvCell(
              k === "expectedSettlement"
                ? expectedSettlement(i)
                : k === "paybackStatus"
                  ? settlementLabels[settlement(i)]
                  : k === "platform"
                    ? platformLabel(i)
                    : k === "reviewStatus"
                      ? i[k] === "done"
                        ? "완료"
                        : "작성 전"
                      : i[k],
            ),
          )
          .join(","),
      ),
    ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `For-Reviewer_${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function monthlyData(
  items: Review[],
  payments: Payment[],
  months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today() + "T12:00:00Z");
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 5 + i);
    return d.toISOString().slice(0, 7);
  }),
) {
  return months.map((key) => {
    const rows = items.filter((r) => r.purchaseDate.startsWith(key));
    return {
      key,
      label: `${Number(key.slice(5, 7))}월`,
      purchase: rows.reduce((a, r) => a + r.price, 0),
      received: payments
        .filter((p) => p.paidAt.startsWith(key))
        .reduce((a, p) => a + p.amount, 0),
      count: rows.length,
      reviews: rows.filter((r) => r.reviewStatus === "done").length,
    };
  });
}
