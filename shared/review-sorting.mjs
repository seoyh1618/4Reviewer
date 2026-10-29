import { platformLabel, remainingPayback, settlement } from "./domain.mjs";

/** @type {Record<string, {label: string, value: (item: import('../src/types').Review) => string | number, descending?: boolean}>} */
export const reviewSortColumns = {
  product: { label: "상품명", value: (i) => i.name },
  purchaser: { label: "계정주", value: (i) => i.purchaser },
  purchaseDate: {
    label: "구매일",
    value: (i) => i.purchaseDate,
    descending: true,
  },
  price: { label: "구매가", value: (i) => i.price, descending: true },
  platform: { label: "플랫폼", value: platformLabel },
  shipping: { label: "리뷰 타입", value: (i) => i.shippingMethod },
  reviewType: { label: "리뷰 가이드", value: (i) => i.reviewType },
  reviewStatus: {
    label: "리뷰 작성",
    value: (i) => (i.reviewStatus === "done" ? 1 : 0),
  },
  reviewedAt: {
    label: "리뷰 작성일",
    value: (i) => i.reviewedAt,
    descending: true,
  },
  dueDate: { label: "리뷰 마감일", value: (i) => i.dueDate },
  payback: {
    label: "정산 상태",
    value: (i) => ({ pending: 0, partial: 1, done: 2, none: 3 })[settlement(i)],
  },
  expected: {
    label: "예상 페이백",
    value: (i) => i.expectedPayback,
    descending: true,
  },
  additionalReviewFee: {
    label: "추가 리뷰비",
    value: (i) => i.additionalReviewFee,
    descending: true,
  },
  received: {
    label: "입금액",
    value: (i) => i.receivedAmount,
    descending: true,
  },
  remaining: { label: "남은 금액", value: remainingPayback, descending: true },
  paidAt: { label: "정산일", value: (i) => i.paidAt, descending: true },
  depositor: { label: "입금자명", value: (i) => i.depositor },
  contact: { label: "연락처", value: (i) => i.contact },
  kakaoName: { label: "카톡 이름", value: (i) => i.kakaoName },
};
const aliases = {
  recent: "purchaseDate:desc",
  due: "dueDate:asc",
  price: "price:desc",
};
/** @param {string} value */
export function parseReviewSort(value) {
  const [key, direction, extra] = (
    Object.hasOwn(aliases, value) ? aliases[value] : value
  ).split(":");
  return Object.hasOwn(reviewSortColumns, key) &&
    ["asc", "desc"].includes(direction) &&
    !extra
    ? { key, direction }
    : { key: "purchaseDate", direction: "desc" };
}
/** @param {string} current @param {string} key */
export function nextReviewSort(current, key) {
  if (!Object.hasOwn(reviewSortColumns, key)) return "recent";
  const active = parseReviewSort(current);
  const direction =
    active.key === key
      ? active.direction === "asc"
        ? "desc"
        : "asc"
      : reviewSortColumns[key].descending
        ? "desc"
        : "asc";
  return `${key}:${direction}`;
}
/** @param {string} value */
export function reviewSortLabel(value) {
  const { key, direction } = parseReviewSort(value);
  return `${reviewSortColumns[key].label} ${direction === "asc" ? "오름차순" : "내림차순"}`;
}
const collator = new Intl.Collator("ko", {
  numeric: true,
  sensitivity: "base",
});
/** @param {string} sort */
export function compareReviews(sort) {
  const { key, direction } = parseReviewSort(sort);
  const get = reviewSortColumns[key].value;
  /** @param {import('../src/types').Review} a @param {import('../src/types').Review} b */
  return (a, b) => {
    const left = get(a),
      right = get(b);
    // Missing dates/text stay last in both directions; equal values retain input order.
    if (left === "" || left == null)
      return right === "" || right == null ? 0 : 1;
    if (right === "" || right == null) return -1;
    const order =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : collator.compare(String(left), String(right));
    return direction === "asc" ? order : -order;
  };
}
