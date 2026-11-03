import test from "node:test";
import assert from "node:assert/strict";
import {
  composeRegistrationInput,
  selectedRegistrationDefaults,
  emptyRegistrationDefaults,
  registrationDefaultsSchema,
} from "../shared/registration-defaults.mjs";

test("registration default selection never includes money paid, dates or review status", () => {
  const defaults = emptyRegistrationDefaults();
  defaults.values.purchaser = "내 계정";
  defaults.values.receivedAmount = 100000;
  assert.deepEqual(
    selectedRegistrationDefaults(defaults, ["purchaser", "receivedAmount"]),
    { purchaser: "내 계정" },
  );
  assert.equal(
    registrationDefaultsSchema.safeParse({ ...defaults, updatedAt: undefined })
      .success,
    false,
  );
});
test("manual edits win over OCR, OCR wins over defaults, and removing layers restores the right values", () => {
  const base = {
    purchaser: "",
    platform: "쿠팡",
    platformOther: "",
    shippingMethod: "실배송",
    price: 0,
    additionalReviewFee: 0,
  };
  const defaults = {
    purchaser: "기본 계정",
    platform: "기타",
    platformOther: "기본 마켓",
    shippingMethod: "빈박스",
    additionalReviewFee: 2000,
  };
  const ocr = { purchaser: "수령자", platform: "네이버", price: 8900 };
  const manual = { purchaser: "직접 수정", additionalReviewFee: 0 };
  const filled = composeRegistrationInput(base, defaults, ocr, manual);
  assert.equal(filled.purchaser, "직접 수정");
  assert.equal(filled.platform, "네이버");
  assert.equal(filled.platformOther, "");
  assert.equal(filled.additionalReviewFee, 0);
  assert.equal(filled.expectedPayback, 8900);
  const noOcr = composeRegistrationInput(base, defaults, {}, manual);
  assert.equal(noOcr.platformOther, "기본 마켓");
  assert.equal(noOcr.price, 0);
  assert.equal(noOcr.purchaser, "직접 수정");
  const noDefaults = composeRegistrationInput(base, {}, ocr, manual);
  assert.equal(noDefaults.platform, "네이버");
  assert.equal(noDefaults.shippingMethod, "실배송");
  assert.equal(noDefaults.expectedPayback, 0);
});
