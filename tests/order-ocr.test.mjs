import test from "node:test";
import assert from "node:assert/strict";
import { parseOrderDocuments, parseOrderText } from "../shared/order-ocr.mjs";

test("multiple screenshots combine metadata and final payment without summing repeated totals", () => {
  const top =
    "네이버 주문상세\n주문번호 202610290001\n상품주문번호 99990001\n주문일시 2026.10.29 10:00\n상품명 데일리 머그\n판매처 리빙 스토어\n주문금액 25,000원";
  const bottom =
    "네이버페이 결제상세\n총 상품금액 25,000원\n쿠폰할인 3,000원\n배송비 0원\n총 결제금액 22,000원";
  const result = parseOrderDocuments([top, bottom, bottom]);
  assert.deepEqual(result.fields, {
    platform: "네이버",
    orderNumber: "202610290001",
    purchaseDate: "2026-10-29",
    seller: "리빙 스토어",
    name: "데일리 머그",
    price: 22000,
  });
  assert.deepEqual(result.warnings, []);
});
test("platform aliases and payment names don't confuse the shop with Npay", () => {
  for (const [text, platform] of [
    ["11st 주문내역\n네이버페이 결제", "11번가"],
    ["MUSINSA 주문상세\nNpay", "무신사"],
    ["NAVER 주문내역", "네이버"],
    ["판매자로켓 상품준비중", "쿠팡"],
  ]) {
    assert.equal(parseOrderText(text).platform, platform);
  }
});
test("quantity and product price may be on separate lines in order cards", () => {
  for (const receipt of [
    "네이버 주문상세\n배송중\n데일리 머그\n옵션: 블루\n25,000원\n수량 1개\n최종결제금액 22,000원",
    "무신사 주문상세\n배송준비\n데일리 머그\n사이즈: FREE\n1개\n25,000원\n실결제금액 22,000원",
    "11번가 주문내역\n배송중\n데일리 머그\n25,000원 / 1개\n결제금액 22,000원",
  ]) {
    assert.equal(parseOrderText(receipt).name, "데일리 머그");
    assert.equal(parseOrderText(receipt).price, 22000);
  }
});
test("a scrolled product card uses order context from the other screenshot", () => {
  const result = parseOrderDocuments([
    "네이버 주문상세\n주문일 2026.10.29",
    "데일리 머그\n25,000원\n1개",
    "총 결제금액 22,000원",
  ]);
  assert.equal(result.fields.name, "데일리 머그");
  assert.equal(result.fields.price, 22000);
  assert.equal(parseOrderText("Npay\n결제금액 22000원").platform, undefined);
});
test("different orders or platforms do not mix even with equal amounts", () => {
  for (const second of ["네이버\n주문번호 20002", "11번가\n주문번호 10001"]) {
    const result = parseOrderDocuments([
      "네이버\n주문번호 10001\n상품명 머그\n결제금액 10000원",
      second + "\n상품명 머그\n결제금액 10000원",
    ]);
    assert.deepEqual(result.fields, {});
    assert.match(result.warnings.join(""), /다른 플랫폼 또는 주문번호/);
  }
});
test("multiple products across screenshots or on one page never receive the order total", () => {
  for (const texts of [
    ["상품명 머그\n총 결제금액 30,000원", "상품명 접시"],
    ["상품명 머그\n상품명 접시\n총 결제금액 30,000원"],
    [
      "쿠팡 주문상세\n배송중\n머그\n10,000원 1개\n접시\n20,000원 1개\n총 결제금액 30,000원",
    ],
  ]) {
    const result = parseOrderDocuments(texts);
    assert.equal(result.fields.price, undefined);
    assert.equal(result.fields.name, undefined);
    assert.match(result.warnings.join(""), /상품이 여러 개/);
  }
});
test("conflicting dates and payment totals stay unresolved while other fields remain useful", () => {
  const result = parseOrderDocuments([
    "상품명 머그\n주문일 2026.10.29\n총 결제금액 20,000원",
    "주문일 2026.10.28\n총 결제금액 10,000원",
  ]);
  assert.equal(result.fields.name, "머그");
  assert.equal(result.fields.price, undefined);
  assert.equal(result.fields.purchaseDate, undefined);
  assert.equal(result.warnings.length, 2);
});
test("bad final totals cannot fall back to a valid item subtotal", () => {
  const result = parseOrderDocuments([
    "상품명 머그\n주문금액 30,000원",
    "총 결제금액 할인금액 1000원",
  ]);
  assert.equal(result.fields.price, undefined);
  assert.match(result.warnings.join(""), /결제금액/);
});
test("delivery and recipient information is not guessed as account or review information", () => {
  const result = parseOrderText(
    "배송예정일 2026.10.30\n배송비 3000원\n받는사람 김*수\n연락처 01012345678\n포인트 1000원",
  );
  assert.deepEqual(result, {});
  assert.equal(parseOrderText("상품명\n판매처 리빙 스토어").name, undefined);
  assert.equal(parseOrderText("판매처\n연락처 01012345678").seller, undefined);
  assert.equal(parseOrderText("주문번호\n2026.10.29").orderNumber, undefined);
});
