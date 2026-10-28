import test from "node:test";
import assert from "node:assert/strict";
import { earningsSummary, earningsByMonth } from "../shared/earnings.mjs";

const item = (overrides = {}) => ({
  id: "a",
  price: 10000,
  additionalReviewFee: 3000,
  shippingMethod: "빈박스",
  receivedAmount: 0,
  purchaseDate: "2025-12-15",
  reviewStatus: "todo",
  ...overrides,
});

test("physical product value counts immediately, including zero fees and unreviewed products", () => {
  assert.deepEqual(
    earningsSummary([
      item({ shippingMethod: "실배송", additionalReviewFee: 0 }),
    ]),
    {
      cashReceived: 0,
      cashPending: 0,
      productValue: 10000,
      productCount: 1,
      total: 10000,
    },
  );
  assert.equal(
    earningsSummary([item({ shippingMethod: "실배송", price: 0 })])
      .productCount,
    1,
  );
});

test("reimbursed principal never becomes income; partial fees stay pending", () => {
  for (const [receivedAmount, cashReceived, cashPending] of [
    [0, 0, 3000],
    [4000, 0, 3000],
    [10000, 0, 3000],
    [11500, 1500, 1500],
    [13000, 3000, 0],
  ]) {
    assert.deepEqual(earningsSummary([item({ receivedAmount })]), {
      cashReceived,
      cashPending,
      productValue: 0,
      productCount: 0,
      total: cashReceived,
    });
  }
});

test("mixed delivery totals separate cash, pending fees and noncash product value", () => {
  assert.deepEqual(
    earningsSummary([
      item({ receivedAmount: 13000 }),
      item({ shippingMethod: "실배송", price: 20000, receivedAmount: 500 }),
      item({ shippingMethod: "실배송", price: 15000, additionalReviewFee: 0 }),
      item({
        shippingMethod: "",
        expectedPayback: 10000,
        receivedAmount: 11000,
      }),
    ]),
    {
      cashReceived: 4500,
      cashPending: 4500,
      productValue: 35000,
      productCount: 2,
      total: 39500,
    },
  );
  assert.deepEqual(earningsSummary([]), {
    cashReceived: 0,
    cashPending: 0,
    productValue: 0,
    productCount: 0,
    total: 0,
  });
});

test("monthly income allocates cross-year split deposits before period selection", () => {
  const rows = [
    item({ receivedAmount: 13000 }),
    item({
      id: "b",
      shippingMethod: "실배송",
      price: 20000,
      receivedAmount: 500,
      purchaseDate: "2026-01-10",
    }),
  ];
  const payments = [
    { reviewId: "a", amount: 1000, paidAt: "2026-02-02" },
    { reviewId: "b", amount: 500, paidAt: "2026-02-03" },
    { reviewId: "a", amount: 8000, paidAt: "2025-12-20" },
    { reviewId: "a", amount: 4000, paidAt: "2026-01-03" },
    { reviewId: "deleted", amount: 90000, paidAt: "2026-01-03" },
  ];
  const original = JSON.stringify(payments);
  const months = earningsByMonth(rows, payments);
  assert.deepEqual(months.get("2025-12"), {
    cashReceived: 0,
    productValue: 0,
    productCount: 0,
    total: 0,
  });
  assert.deepEqual(months.get("2026-01"), {
    cashReceived: 2000,
    productValue: 20000,
    productCount: 1,
    total: 22000,
  });
  assert.deepEqual(months.get("2026-02"), {
    cashReceived: 1500,
    productValue: 0,
    productCount: 0,
    total: 1500,
  });
  assert.equal(
    [...months.values()].reduce((sum, m) => sum + m.total, 0),
    earningsSummary(rows).total,
  );
  assert.equal(JSON.stringify(payments), original);
});

test("corrections and delivery-type changes recompute income without double counting", () => {
  const corrected = item({ receivedAmount: 11000 });
  assert.equal(earningsSummary([corrected]).cashReceived, 1000);
  assert.equal(
    earningsByMonth(
      [corrected],
      [{ reviewId: "a", amount: 11000, paidAt: "2026-02-02" }],
    ).get("2026-02").total,
    1000,
  );
  assert.equal(
    earningsSummary([item({ shippingMethod: "실배송", receivedAmount: 3000 })])
      .total,
    13000,
  );
  assert.equal(earningsSummary([item({ receivedAmount: 3000 })]).total, 0);
});
