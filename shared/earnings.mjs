import { remainingPaybackParts } from "./domain.mjs";

// Product reimbursement is returned principal, not income. Use the same
// principal-first allocation as the receivables breakdown for partial deposits.
export function receivedReviewFee(item, receivedAmount = item.receivedAmount) {
  return (
    (item.additionalReviewFee ?? 0) -
    remainingPaybackParts({
      ...item,
      receivedAmount,
    }).reviewFee
  );
}

export function earningsSummary(items) {
  return items.reduce(
    (sum, item) => {
      const cash = receivedReviewFee(item);
      const product = item.shippingMethod === "실배송" ? item.price : 0;
      sum.cashReceived += cash;
      sum.cashPending += remainingPaybackParts(item).reviewFee;
      sum.productValue += product;
      sum.productCount += Number(item.shippingMethod === "실배송");
      sum.total += cash + product;
      return sum;
    },
    {
      cashReceived: 0,
      cashPending: 0,
      productValue: 0,
      productCount: 0,
      total: 0,
    },
  );
}

/**
 * Product value counts immediately on registration and is attributed to the
 * recorded purchase month. Cash review fees use actual deposit months. Allocate
 * ALL deposits before filtering periods, so prior-month principal isn't income.
 * @param {import("../src/types").Review[]} items
 * @param {import("../src/types").Payment[]} payments
 */
export function earningsByMonth(items, payments) {
  const months = new Map();
  const getMonth = (date) => {
    const key = date.slice(0, 7);
    if (!months.has(key))
      months.set(key, {
        cashReceived: 0,
        productValue: 0,
        productCount: 0,
        total: 0,
      });
    return months.get(key);
  };
  const reviews = new Map(items.map((item) => [item.id, item]));
  const cumulative = new Map();
  for (const item of items) {
    if (item.shippingMethod !== "실배송") continue;
    const month = getMonth(item.purchaseDate);
    month.productValue += item.price;
    month.productCount += 1;
    month.total += item.price;
  }
  for (const payment of [...payments].sort((a, b) =>
    a.paidAt.localeCompare(b.paidAt),
  )) {
    const item = reviews.get(payment.reviewId);
    if (!item) continue;
    const before = cumulative.get(item.id) ?? 0;
    const after = Math.min(item.receivedAmount, before + payment.amount);
    cumulative.set(item.id, after);
    const cash =
      receivedReviewFee(item, after) - receivedReviewFee(item, before);
    const month = getMonth(payment.paidAt);
    month.cashReceived += cash;
    month.total += cash;
  }
  return months;
}
