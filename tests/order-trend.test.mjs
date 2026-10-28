import test from "node:test";
import assert from "node:assert/strict";
import { recentOrderMonths, orderTrend } from "../shared/order-trend.mjs";

test("recent months cross years in calendar order", () => {
  assert.deepEqual(recentOrderMonths("2026-02", 3), [
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
});

test("orders aggregate purchase price and purchase date, excluding fees and deposits", () => {
  const rows = [
    {
      price: 10000,
      receivedAmount: 20000,
      additionalReviewFee: 10000,
      purchaseDate: "2025-12-31",
      paidAt: "2026-01-10",
    },
    { price: 7000, purchaseDate: "2026-01-01" },
    { price: 3000, purchaseDate: "2026-01-01" },
    { price: 2000, purchaseDate: "2026-01-31" },
    { price: 9000, purchaseDate: "2026-02-01" },
  ];
  const months = ["2025-12", "2026-01"];
  assert.deepEqual(orderTrend(rows, "month", months, "2026-01"), [
    { key: "2025-12", amount: 10000, count: 1 },
    { key: "2026-01", amount: 12000, count: 3 },
  ]);
  const daily = orderTrend(rows, "day", months, "2026-01");
  assert.equal(daily.length, 31);
  assert.deepEqual(daily[0], { key: "2026-01-01", amount: 10000, count: 2 });
  assert.deepEqual(daily[1], { key: "2026-01-02", amount: 0, count: 0 });
  assert.equal(daily[30].amount, 2000);
  assert.equal(
    daily.reduce((sum, row) => sum + row.amount, 0),
    12000,
  );
});

test("daily calendars include leap days and month boundaries", () => {
  for (const [month, days] of [
    ["2024-02", 29],
    ["2026-02", 28],
    ["2026-04", 30],
    ["2026-12", 31],
  ]) {
    const rows = orderTrend([], "day", [month], month);
    assert.equal(rows.length, days);
    assert.equal(rows[days - 1].key, `${month}-${days}`);
    assert.ok(rows.every((row) => row.amount === 0 && row.count === 0));
  }
});
