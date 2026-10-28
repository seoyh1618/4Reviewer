import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOrderText,
  reviewSchema,
  totals,
  settlement,
  csvCell,
  normalizeReview,
  platformLabel,
  expectedSettlement,
  remainingPayback,
  normalizePayback,
} from "../shared/domain.mjs";
const base = {
  name: "테스트 상품",
  platform: "쿠팡",
  price: 24900,
  platformOther: "",
  shippingMethod: "빈박스",
  expectedPayback: 24900,
  receivedAmount: 0,
  purchaseDate: "2026-10-28",
  dueDate: "2026-11-02",
  reviewType: "사진 리뷰",
  reviewStatus: "todo",
};
test("amount totals distinguish spending, pending, partial and actual payment", () => {
  const partial = { ...base, receivedAmount: 10000 };
  assert.equal(settlement(partial), "partial");
  assert.deepEqual(totals([{ ...base, extraFee: 1000 }, partial]), {
    purchase: 49800,
    expected: 49800,
    received: 10000,
    pending: 39800,
    todo: 2,
    done: 0,
    count: 2,
  });
  assert.equal(settlement({ ...base, shippingMethod: "실배송" }), "none");
});
test("OCR only extracts supported evidence; no guessed price or product", () => {
  assert.deepEqual(
    parseOrderText(
      "쿠팡\n상품명: 데일리 텀블러\n판매처: 리빙 스토어\n주문번호: ORDER-7824\n주문일: 2026. 10. 28.\n총 결제금액: 24,900원",
    ),
    {
      platform: "쿠팡",
      name: "데일리 텀블러",
      seller: "리빙 스토어",
      price: 24900,
      purchaseDate: "2026-10-28",
      orderNumber: "ORDER-7824",
    },
  );
  assert.deepEqual(parseOrderText("random words\n123456\n배송비 3000원"), {});
  assert.equal(parseOrderText("주문일: 2026.02.31.").purchaseDate, undefined);
});
test("validation rejects impossible dates, decimals, overpayment and payment without date", () => {
  assert.equal(reviewSchema.safeParse(base).success, true);
  for (const changes of [
    { price: -1 },
    { price: 1.5 },
    { additionalReviewFee: -1 },
    { additionalReviewFee: 1.5 },
    { price: 1000000000, additionalReviewFee: 1 },
    { purchaseDate: "2026-02-31" },
    { receivedAmount: 25000, paidAt: "2026-10-28" },
    { receivedAmount: 100 },
    { name: "   " },
    { platform: "unknown" },
    { platform: "기타", platformOther: "  " },
    { shippingMethod: "일반배송" },
    { reviewedAt: "2026-02-31", reviewStatus: "done" },
    { reviewedAt: "2026-10-28", reviewStatus: "todo" },
    { kakaoName: "x".repeat(101) },
  ])
    assert.equal(
      reviewSchema.safeParse({ ...base, ...changes }).success,
      false,
    );
});
test("CSV escapes formulas, quotes, delimiters and line breaks", () => {
  assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
  assert.equal(csvCell(" +cmd"), `"' +cmd"`);
  assert.equal(csvCell('a,"b"\nc'), `"a,""b""\nc"`);
});

test("custom platform and legacy fields survive normalization without changing totals", () => {
  const custom = reviewSchema.parse({
    ...base,
    platform: "기타",
    platformOther: " G마켓 ",
    shippingMethod: "빈박스",
  });
  assert.equal(platformLabel(custom), "G마켓");
  assert.equal(custom.shippingMethod, "빈박스");
  const old = normalizeReview({
    ...base,
    platform: "옥션",
    extraFee: 1000,
    shippingMethod: undefined,
  });
  assert.equal(old.platform, "기타");
  assert.equal(platformLabel(old), "옥션");
  assert.equal(old.shippingMethod, "");
  assert.equal(old.reviewedAt, "");
  assert.equal(old.kakaoName, "");
  assert.equal(old.additionalReviewFee, 0);
  assert.equal("extraFee" in old, false);
  assert.equal(reviewSchema.safeParse(old).success, true);
  assert.equal(
    reviewSchema.safeParse(normalizeReview({ ...base, platform: "기타" }))
      .success,
    true,
  );
  assert.equal(parseOrderText("11번가 주문내역").platform, "11번가");
});

test("additional review fees are receivables, not purchases or actual deposits", () => {
  const review = reviewSchema.parse({
    ...base,
    additionalReviewFee: 3000,
    reviewStatus: "done",
  });
  assert.equal(expectedSettlement(review), 27900);
  assert.equal(remainingPayback(review), 27900);
  assert.equal(totals([review]).purchase, 24900);
  assert.equal(totals([review]).received, 0);
  assert.equal(totals([review]).pending, 27900);
  const partial = { ...review, receivedAmount: 24900, paidAt: "2026-10-28" };
  assert.equal(reviewSchema.safeParse(partial).success, true);
  assert.equal(settlement(partial), "partial");
  assert.equal(remainingPayback(partial), 3000);
  const full = { ...partial, receivedAmount: 27900 };
  assert.equal(reviewSchema.safeParse(full).success, true);
  assert.equal(settlement(full), "done");
  assert.equal(remainingPayback(full), 0);
  assert.equal(
    reviewSchema.safeParse({ ...full, receivedAmount: 27901 }).success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({ ...full, additionalReviewFee: 0 }).success,
    false,
  );
  assert.equal(settlement({ ...review, shippingMethod: "실배송" }), "pending");
  assert.equal(
    settlement({
      ...review,
      shippingMethod: "실배송",
      receivedAmount: 3000,
    }),
    "done",
  );
  assert.equal(
    normalizeReview({ ...base, extraFee: 9000 }).additionalReviewFee,
    0,
  );
});

test("shipping determines payback: empty box includes price, real delivery includes only review fees", () => {
  const legacy = { ...base, price: 200000, expectedPayback: 0 };
  const corrected = normalizeReview(legacy);
  assert.equal(corrected.expectedPayback, 200000);
  assert.equal(corrected.paybackMode, "shipping");
  assert.equal(legacy.expectedPayback, 0);
  assert.equal(totals([legacy]).purchase, 200000);
  assert.equal(totals([legacy]).pending, 200000);
  assert.equal(totals([legacy]).received, 0);
  const { expectedPayback, ...withoutPayback } = base;
  assert.equal(reviewSchema.parse(withoutPayback).expectedPayback, base.price);
  assert.equal(
    reviewSchema.parse({ ...legacy, paybackMode: "purchase" }).expectedPayback,
    200000,
  );
  const custom = reviewSchema.parse({
    ...base,
    expectedPayback: 10000,
    paybackMode: "custom",
  });
  assert.equal(custom.paybackMode, "shipping");
  assert.equal(
    normalizePayback({ ...custom, price: 30000 }).expectedPayback,
    30000,
  );
  assert.equal(
    normalizeReview({
      ...legacy,
      shippingMethod: "실배송",
      paybackMode: "custom",
    }).expectedPayback,
    0,
  );
  assert.equal(
    reviewSchema.safeParse({ ...withoutPayback, paybackMode: "custom" })
      .success,
    true,
  );
  const repriced = normalizePayback({ ...corrected, price: 250000 });
  assert.equal(repriced.expectedPayback, 250000);
  assert.equal(
    expectedSettlement({ ...repriced, additionalReviewFee: 3000 }),
    253000,
  );
  assert.equal(
    remainingPayback({
      ...repriced,
      additionalReviewFee: 3000,
      receivedAmount: 50000,
    }),
    203000,
  );
  assert.equal(
    settlement({
      ...repriced,
      additionalReviewFee: 3000,
      receivedAmount: 253000,
    }),
    "done",
  );
  const real = reviewSchema.parse({
    ...legacy,
    shippingMethod: "실배송",
    additionalReviewFee: 3000,
    expectedPayback: 999999,
    paybackMode: "purchase",
  });
  assert.equal(real.expectedPayback, 0);
  assert.equal(expectedSettlement(real), 3000);
  assert.equal(remainingPayback({ ...real, receivedAmount: 1000 }), 2000);
  assert.equal(remainingPayback({ ...real, additionalReviewFee: 0 }), 0);
  assert.equal(settlement({ ...real, additionalReviewFee: 0 }), "none");
  assert.equal(totals([real]).purchase, 200000);
  assert.equal(totals([real]).pending, 3000);
  assert.equal(
    reviewSchema.safeParse({
      ...real,
      receivedAmount: 3001,
      paidAt: "2026-10-28",
    }).success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({
      ...real,
      price: 1000000000,
      additionalReviewFee: 1000000000,
    }).success,
    true,
  );
  assert.equal(
    normalizePayback({ ...legacy, shippingMethod: "", expectedPayback: 12000 })
      .expectedPayback,
    12000,
  );
  const historicPaid = normalizeReview({
    ...real,
    additionalReviewFee: 0,
    receivedAmount: 200000,
  });
  assert.equal(historicPaid.receivedAmount, 200000);
  assert.equal(remainingPayback(historicPaid), 0);
  assert.equal(settlement(historicPaid), "done");
});

test("OCR reads an unlabelled order card, inline order metadata and final paid amount", () => {
  const receipt = `주문상세
2026. 10. 28 주문 주문번호 1234567890123
상품준비중 ㆍ내일(목) 새벽 도착 보장
# 판매자로켓|새벽, 데일리 두피 마사지기, 블루, 1세트
주문취소
8,900 원 1개 장바구니 담기
받는사람 정보
받는사람 김*수
연락처 010****1234
결제 정보
결제수단 총 상품가격 9,000 원
할인금액 -100 원
배송비 0 원
총 결제금액 8,900 원`;
  assert.deepEqual(parseOrderText(receipt), {
    platform: "쿠팡",
    name: "데일리 두피 마사지기, 블루, 1세트",
    price: 8900,
    purchaseDate: "2026-10-28",
    orderNumber: "1234567890123",
  });
  assert.equal(
    parseOrderText(receipt.replace("8,900 원 1개", "8,900 원ㆍ1개")).name,
    "데일리 두피 마사지기, 블루, 1세트",
  );
  assert.equal(
    parseOrderText(
      receipt.replace(
        "총 결제금액 8,900 원",
        "결제금액 9,000 원\n총 결제금액\n8,900 원",
      ),
    ).price,
    8900,
  );
  assert.equal(
    parseOrderText(
      receipt.replace("총 결제금액 8,900 원", "총 결제금액\n할인금액 100 원"),
    ).price,
    undefined,
  );
  assert.equal(
    parseOrderText("상품가격 9,000 원\n할인금액 -100 원\n배송비 0 원").price,
    undefined,
  );
});

test("OCR leaves ambiguous multi-item orders and unknown fields for manual input", () => {
  const multi = parseOrderText(`쿠팡 주문상세
2026. 10. 28 주문
상품준비중
첫 번째 상품
8,900 원 1개
두 번째 상품
3,000 원 1개
총 결제금액 11,900 원`);
  assert.equal(multi.name, undefined);
  assert.equal(multi.price, undefined);
  assert.deepEqual(
    parseOrderText(
      "배송 예정일 2026.10.30\n받는사람 김*수\n연락처 010****1234",
    ),
    {},
  );
  assert.equal(parseOrderText("총 결제금액 -100원").price, undefined);
  assert.equal(parseOrderText("총 결제금액 12.50원").price, undefined);
  assert.equal(parseOrderText("총 결제금액 1,000,000,001원").price, undefined);
  assert.equal(parseOrderText("총 결제금액 0원").price, 0);
  assert.equal(
    parseOrderText("2026. 02. 31 주문 주문번호 TEST-123").purchaseDate,
    undefined,
  );
});
