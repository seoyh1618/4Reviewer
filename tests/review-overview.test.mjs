import test from "node:test";
import assert from "node:assert/strict";
import {
  remainingPayback,
  remainingPaybackParts,
  reviewOverview,
} from "../shared/domain.mjs";

const empty = {
  price: 10000,
  shippingMethod: "빈박스",
  additionalReviewFee: 3000,
  receivedAmount: 0,
  reviewStatus: "todo",
};

test("receivable breakdown applies deposits to product reimbursement before review fees", () => {
  for (const [receivedAmount, product, reviewFee] of [
    [0, 10000, 3000],
    [4000, 6000, 3000],
    [10000, 0, 3000],
    [11500, 0, 1500],
    [13000, 0, 0],
    [20000, 0, 0],
  ]) {
    const item = { ...empty, receivedAmount };
    assert.deepEqual(remainingPaybackParts(item), { product, reviewFee });
    assert.equal(product + reviewFee, remainingPayback(item));
  }
  const real = { ...empty, shippingMethod: "실배송", receivedAmount: 500 };
  assert.deepEqual(remainingPaybackParts(real), {
    product: 0,
    reviewFee: 2500,
  });
  assert.deepEqual(remainingPaybackParts({ ...real, additionalReviewFee: 0 }), {
    product: 0,
    reviewFee: 0,
  });
  const legacy = {
    ...empty,
    shippingMethod: "",
    expectedPayback: 900,
    additionalReviewFee: 100,
    receivedAmount: 100,
  };
  assert.deepEqual(remainingPaybackParts(legacy), {
    product: 800,
    reviewFee: 100,
  });
  assert.equal(legacy.expectedPayback, 900);
});

test("review overview distinguishes paid, zero settlement and pending review types", () => {
  const items = [
    { ...empty, receivedAmount: 4000 },
    {
      ...empty,
      price: 20000,
      shippingMethod: "실배송",
      additionalReviewFee: 2000,
    },
    { ...empty, reviewStatus: "done", receivedAmount: 13000 },
    {
      ...empty,
      reviewStatus: "done",
      shippingMethod: "실배송",
      additionalReviewFee: 0,
    },
    {
      ...empty,
      shippingMethod: "",
      expectedPayback: 900,
      additionalReviewFee: 100,
      receivedAmount: 100,
    },
    { ...empty, receivedAmount: 13000 },
    {
      ...empty,
      reviewStatus: "done",
      shippingMethod: "실배송",
      additionalReviewFee: 2000,
      receivedAmount: 500,
    },
  ];
  const before = structuredClone(items);
  const result = reviewOverview(items);
  for (const [key, value] of Object.entries({
    count: 7,
    settled: 2,
    todo: 4,
    done: 3,
    todoPhysical: 1,
    todoEmpty: 2,
    todoUnspecified: 1,
    donePhysical: 2,
    doneEmpty: 1,
    doneUnspecified: 0,
    received: 30600,
    pending: 13400,
    pendingProduct: 6800,
    pendingReviewFee: 6600,
    partial: 3,
  }))
    assert.equal(result[key], value, key);
  assert.equal(result.pendingProduct + result.pendingReviewFee, result.pending);
  assert.deepEqual(items, before);
  const withLegacyDone = reviewOverview([
    ...items,
    { ...items[4], reviewStatus: "done" },
  ]);
  assert.equal(withLegacyDone.doneUnspecified, 1);
  assert.equal(
    withLegacyDone.donePhysical +
      withLegacyDone.doneEmpty +
      withLegacyDone.doneUnspecified,
    withLegacyDone.done,
  );
  assert(Object.values(reviewOverview([])).every((value) => value === 0));
});
