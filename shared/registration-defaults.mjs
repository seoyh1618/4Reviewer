import { z } from "zod";
import {
  platforms,
  shippingMethods,
  reviewTypes,
  normalizePayback,
} from "./domain.mjs";

export const registrationFields = [
  { key: "purchaser", label: "계정주" },
  { key: "platform", label: "구매 플랫폼" },
  { key: "shippingMethod", label: "리뷰 타입" },
  { key: "reviewType", label: "리뷰 가이드" },
  { key: "additionalReviewFee", label: "리뷰비" },
];
export const emptyRegistrationDefaults = () => ({
  values: {
    purchaser: "",
    platform: "쿠팡",
    platformOther: "",
    shippingMethod: "실배송",
    reviewType: "사진 리뷰",
    additionalReviewFee: 0,
  },
  enabledFields: [],
  version: 0,
  updatedAt: null,
});
export const registrationDefaultsSchema = z
  .object({
    values: z
      .object({
        purchaser: z.string().trim().max(80),
        platform: z.enum(platforms),
        platformOther: z.string().trim().max(80),
        shippingMethod: z.enum(shippingMethods),
        reviewType: z.enum(reviewTypes),
        additionalReviewFee: z.number().int().min(0).max(1_000_000_000),
      })
      .strict(),
    enabledFields: z
      .array(z.enum(registrationFields.map((field) => field.key)))
      .max(5)
      .refine(
        (fields) => new Set(fields).size === fields.length,
        "중복된 항목이 있습니다.",
      ),
    version: z.number().int().min(0).max(2_147_483_646),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.enabledFields.includes("purchaser") && !data.values.purchaser)
      ctx.addIssue({
        code: "custom",
        message: "자동 채움할 계정주를 입력해 주세요.",
        path: ["values", "purchaser"],
      });
    if (
      data.enabledFields.includes("platform") &&
      data.values.platform === "기타" &&
      !data.values.platformOther
    )
      ctx.addIssue({
        code: "custom",
        message: "기타 플랫폼 이름을 입력해 주세요.",
        path: ["values", "platformOther"],
      });
  })
  .transform((data) => ({
    ...data,
    values: {
      ...data.values,
      platformOther:
        data.values.platform === "기타" ? data.values.platformOther : "",
    },
  }));

export function selectedRegistrationDefaults(
  defaults,
  fields = defaults?.enabledFields ?? [],
) {
  if (!defaults) return {};
  const selected = {};
  for (const { key } of registrationFields) {
    if (!fields.includes(key)) continue;
    selected[key] = defaults.values[key];
    if (key === "platform")
      selected.platformOther = defaults.values.platformOther;
  }
  return selected;
}

// Keep input layers separate: removing an image or deselecting a default must
// never erase a user's edits or revive values from a removed OCR result.
export function composeRegistrationInput(base, defaults, ocr, manual) {
  let result = { ...base };
  for (const layer of [defaults, ocr, manual]) {
    if (Object.hasOwn(layer, "platform"))
      result.platformOther = layer.platformOther || "";
    result = { ...result, ...layer };
  }
  return normalizePayback(result);
}
