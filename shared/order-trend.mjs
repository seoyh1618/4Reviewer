import { today } from "./domain.mjs";

export function recentOrderMonths(end = today().slice(0, 7), count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${end}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - count + index + 1);
    return date.toISOString().slice(0, 7);
  });
}

/** Calendar buckets shared by order and review activity charts.
 * @param {"month"|"day"} mode
 * @param {string[]} months
 * @param {string} month
 */
export function trendKeys(mode, months, month) {
  return mode === "month"
    ? months
    : Array.from(
        {
          length: new Date(
            Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
          ).getUTCDate(),
        },
        (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
      );
}

/** Aggregate recorded purchase prices, never deposits or review fees.
 * @param {import("../src/types").Review[]} items
 * @param {"month"|"day"} mode
 * @param {string[]} months
 * @param {string} month
 */
export function orderTrend(items, mode, months, month) {
  const keys = trendKeys(mode, months, month);
  const rows = new Map(keys.map((key) => [key, { key, amount: 0, count: 0 }]));
  for (const item of items) {
    const key =
      mode === "month" ? item.purchaseDate.slice(0, 7) : item.purchaseDate;
    const row = rows.get(key);
    if (row) {
      row.amount += item.price;
      row.count += 1;
    }
  }
  return [...rows.values()];
}
