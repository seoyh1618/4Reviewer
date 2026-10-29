import test from "node:test";
import assert from "node:assert/strict";
import {
  compareReviews,
  parseReviewSort,
  nextReviewSort,
} from "../shared/review-sorting.mjs";
const rows = [
  {
    id: "a",
    name: "상품 10",
    price: 9000,
    purchaseDate: "2026-01-02",
    dueDate: "",
    platform: "기타",
    platformOther: "Z마켓",
    shippingMethod: "실배송",
  },
  {
    id: "b",
    name: "상품 2",
    price: 100,
    purchaseDate: "2026-01-01",
    dueDate: "2026-01-03",
    platform: "네이버",
    shippingMethod: "빈박스",
  },
  {
    id: "c",
    name: "상품 1",
    price: 20000,
    purchaseDate: "2026-01-03",
    dueDate: "2026-01-04",
    platform: "쿠팡",
    shippingMethod: "실배송",
  },
];
const ids = (sort) => [...rows].sort(compareReviews(sort)).map((r) => r.id);
test("review column sorting uses numbers, Korean labels and dates with empty values last", () => {
  assert.deepEqual(ids("price:asc"), ["b", "a", "c"]);
  assert.deepEqual(ids("price"), ["c", "a", "b"]);
  assert.deepEqual(ids("product:asc"), ["c", "b", "a"]);
  assert.deepEqual(ids("recent"), ["c", "a", "b"]);
  assert.deepEqual(ids("purchaseDate:asc"), ["b", "a", "c"]);
  assert.deepEqual(ids("due"), ["b", "c", "a"]);
  assert.deepEqual(ids("dueDate:desc"), ["c", "b", "a"]);
  assert.deepEqual(ids("shipping:asc"), ["b", "a", "c"]);
  assert.deepEqual(ids("shipping:desc"), ["a", "c", "b"]);
  assert.deepEqual(ids("platform:asc"), ["b", "c", "a"]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["a", "b", "c"],
  );
});
test("sort headers toggle, retain legacy URLs and safely default invalid keys", () => {
  assert.equal(nextReviewSort("recent", "purchaseDate"), "purchaseDate:asc");
  assert.equal(
    nextReviewSort("purchaseDate:asc", "purchaseDate"),
    "purchaseDate:desc",
  );
  assert.equal(nextReviewSort("recent", "price"), "price:desc");
  assert.equal(nextReviewSort("recent", "platform"), "platform:asc");
  for (const value of [
    "",
    "unknown:asc",
    "__proto__:asc",
    "__proto__",
    "constructor",
    "product:invalid",
    "price:asc:extra",
  ]) {
    assert.deepEqual(parseReviewSort(value), {
      key: "purchaseDate",
      direction: "desc",
    });
  }
});
