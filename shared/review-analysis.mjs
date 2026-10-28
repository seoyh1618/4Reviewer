import { settlement } from "./domain.mjs";
import { trendKeys } from "./order-trend.mjs";

// Mutually exclusive current stages: a deposit made before writing a review
// does not move that review out of the pre-review stage.
export function reviewStages(items) {
  const stages = { todo: 0, reviewed: 0, settled: 0 };
  for (const item of items) {
    if (item.reviewStatus !== "done") stages.todo += 1;
    else if (settlement(item) === "done") stages.settled += 1;
    else stages.reviewed += 1;
  }
  return {
    ...stages,
    total: items.length,
    completion: items.length
      ? ((stages.reviewed + stages.settled) / items.length) * 100
      : 0,
  };
}

// Activity follows the actual review date, including reviews for older orders.
// Missing dates are not replaced with purchase dates or settlement dates.
export function reviewActivity(items, mode, months, month) {
  const rows = new Map(
    trendKeys(mode, months, month).map((key) => [
      key,
      { key, count: 0, physical: 0, empty: 0, unspecified: 0 },
    ]),
  );
  for (const item of items) {
    if (item.reviewStatus !== "done" || !item.reviewedAt) continue;
    const key =
      mode === "month" ? item.reviewedAt.slice(0, 7) : item.reviewedAt;
    const row = rows.get(key);
    if (!row) continue;
    row.count += 1;
    if (item.shippingMethod === "실배송") row.physical += 1;
    else if (item.shippingMethod === "빈박스") row.empty += 1;
    else row.unspecified += 1;
  }
  return [...rows.values()];
}
