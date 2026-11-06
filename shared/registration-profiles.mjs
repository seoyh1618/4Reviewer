import { z } from "zod";
import {
  emptyRegistrationDefaults,
  registrationDefaultsSchema,
} from "./registration-defaults.mjs";

export const emptyProfileDetails = () => ({
  phone: "",
  address: "",
  email: "",
  bank: "",
  accountNumber: "",
  accountHolder: "",
});
export const emptyRegistrationProfile = () => ({
  values: emptyRegistrationDefaults().values,
  version: 0,
  details: emptyProfileDetails(),
  enabledFields: ["purchaser", "platform"],
  makeDefault: false,
});
export const registrationProfileSchema = z
  .object({
    values: z.unknown(),
    enabledFields: z.unknown(),
    version: z.number().int().min(0).max(2_147_483_646),
    details: z
      .object({
        phone: z.string().trim().max(40),
        address: z.string().trim().max(400),
        email: z
          .string()
          .trim()
          .max(254)
          .refine(
            (v) => !v || z.email().safeParse(v).success,
            "올바른 이메일을 입력해 주세요.",
          ),
        bank: z.string().trim().max(80),
        accountNumber: z.string().trim().max(80),
        accountHolder: z.string().trim().max(80),
      })
      .strict(),
    makeDefault: z.boolean().default(false),
  })
  .strict()
  .transform((data, ctx) => {
    const parsed = registrationDefaultsSchema.safeParse({
      values: data.values,
      enabledFields: data.enabledFields,
      version: data.version,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue(issue);
      return z.NEVER;
    }
    if (!parsed.data.values.purchaser) {
      ctx.addIssue({
        code: "custom",
        message: "묶음을 구분할 이름(계정주)을 입력해 주세요.",
        path: ["values", "purchaser"],
      });
      return z.NEVER;
    }
    if (
      parsed.data.values.platform === "기타" &&
      !parsed.data.values.platformOther
    ) {
      ctx.addIssue({
        code: "custom",
        message: "기타 플랫폼 이름을 입력해 주세요.",
        path: ["values", "platformOther"],
      });
      return z.NEVER;
    }
    return { ...data, ...parsed.data };
  });
export const profileLabel = (profile) =>
  `${profile.values.purchaser || "기본 정보"} · ${profile.values.platform === "기타" ? profile.values.platformOther || "기타" : profile.values.platform}`;
