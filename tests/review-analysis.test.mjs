import test from "node:test";
import assert from "node:assert/strict";
import { reviewStages, reviewActivity } from "../shared/review-analysis.mjs";

test("review stages are disjoint and zero-payback physical reviews can be completed", () => {
  const base = {
    shippingMethod: "빈박스",
    price: 10000,
    receivedAmount: 0,
    reviewStatus: "todo",
  };
  const result = reviewStages([
    base,
    { ...base, receivedAmount: 10000 },
    { ...base, reviewStatus: "done", receivedAmount: 5000 },
    { ...base, reviewStatus: "done", receivedAmount: 10000 },
    { ...base, shippingMethod: "실배송", reviewStatus: "done" },
  ]);
  assert.deepEqual(result, {
    todo: 2,
    reviewed: 2,
    settled: 1,
    total: 5,
    completion: 60,
  });
  assert.equal(result.todo + result.reviewed + result.settled, result.total);
});
test("empty review stages have zero counts and rate", () => {
  assert.deepEqual(reviewStages([]), {
    todo: 0,
    reviewed: 0,
    settled: 0,
    total: 0,
    completion: 0,
  });
});

test("review activity uses completion dates across order periods and excludes undated and pending reviews", () => {
  const base = {
    purchaseDate: "2024-12-01",
    reviewedAt: "2025-01-03",
    reviewStatus: "done",
    shippingMethod: "실배송",
  };
  const items = [
    base,
    { ...base, shippingMethod: "빈박스", receivedAmount: 10000 },
    { ...base, shippingMethod: "" },
    { ...base, reviewedAt: "2025-02-04" },
    { ...base, reviewedAt: "" },
    { ...base, reviewStatus: "todo" },
    { ...base, reviewedAt: "2024-12-31" },
  ];
  assert.deepEqual(
    reviewActivity(
      items,
      "month",
      ["2025-01", "2025-02", "2025-03"],
      "2025-01",
    ),
    [
      { key: "2025-01", count: 3, physical: 1, empty: 1, unspecified: 1 },
      { key: "2025-02", count: 1, physical: 1, empty: 0, unspecified: 0 },
      { key: "2025-03", count: 0, physical: 0, empty: 0, unspecified: 0 },
    ],
  );
  const days = reviewActivity(items, "day", ["2025-01"], "2025-01");
  assert.equal(days.length, 31);
  assert.equal(days[2].count, 3);
  assert.equal(
    days.reduce((sum, day) => sum + day.count, 0),
    3,
  );
});

test("review activity includes leap day and records a completion only once regardless of payment", () => {
  const rows = reviewActivity(
    [
      {
        reviewedAt: "2024-02-29",
        reviewStatus: "done",
        shippingMethod: "실배송",
        receivedAmount: 0,
      },
      {
        reviewedAt: "2024-02-29",
        reviewStatus: "done",
        shippingMethod: "빈박스",
        receivedAmount: 15000,
      },
    ],
    "day",
    ["2024-02"],
    "2024-02",
  );
  assert.equal(rows.length, 29);
  assert.deepEqual(rows.at(-1), {
    key: "2024-02-29",
    count: 2,
    physical: 1,
    empty: 1,
    unspecified: 0,
  });
  assert.ok(rows.slice(0, 28).every((row) => row.count === 0));
});
