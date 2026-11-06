import {
  emptyRegistrationDefaults,
  registrationDefaultsSchema,
} from "../shared/registration-defaults.mjs";
import {
  registrationProfileStore,
  registerRegistrationProfileRoutes,
} from "./registration-profiles.mjs";

export function registerRegistrationDefaultsRoutes(app, db) {
  const profiles = registrationProfileStore(db);
  registerRegistrationProfileRoutes(app, db, profiles);
  const read = async (userId) => {
    const row = await db
      .prepare("SELECT * FROM registration_defaults WHERE user_id=?")
      .get(userId);
    return row
      ? {
          values: {
            purchaser: row.purchaser,
            platform: row.platform,
            platformOther: row.platform_other,
            shippingMethod: row.shipping_method,
            reviewType: row.review_type,
            additionalReviewFee: row.additional_review_fee,
          },
          enabledFields: JSON.parse(row.enabled_fields),
          version: row.version,
          updatedAt: row.updated_at,
        }
      : emptyRegistrationDefaults();
  };
  app.get("/api/registration-defaults", async (req, res) =>
    res.json({ defaults: await read(req.user.id) }),
  );
  app.put("/api/registration-defaults", async (req, res) => {
    const parsed = registrationDefaultsSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    const { values: v, enabledFields, version } = parsed.data;
    const now = new Date().toISOString();
    const saved = await db.transaction(async () => {
      await profiles.lock(req.user.id);
      const updated =
        version === 0
          ? await db
              .prepare(
                `INSERT INTO registration_defaults (user_id,purchaser,platform,platform_other,shipping_method,review_type,additional_review_fee,enabled_fields,version,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?) ON CONFLICT(user_id) DO NOTHING`,
              )
              .run(
                req.user.id,
                v.purchaser,
                v.platform,
                v.platformOther,
                v.shippingMethod,
                v.reviewType,
                v.additionalReviewFee,
                JSON.stringify(enabledFields),
                now,
              )
          : await db
              .prepare(
                `UPDATE registration_defaults SET purchaser=?,platform=?,platform_other=?,shipping_method=?,review_type=?,additional_review_fee=?,enabled_fields=?,version=version+1,updated_at=? WHERE user_id=? AND version=?`,
              )
              .run(
                v.purchaser,
                v.platform,
                v.platformOther,
                v.shippingMethod,
                v.reviewType,
                v.additionalReviewFee,
                JSON.stringify(enabledFields),
                now,
                req.user.id,
                version,
              );
      if (!updated.changes) return null;
      const defaults = await read(req.user.id);
      await profiles.syncFromLegacy(req.user.id, defaults);
      return defaults;
    });
    if (!saved)
      return res.status(409).json({
        error:
          "다른 화면에서 기본정보가 변경됐습니다. 다시 불러온 뒤 저장해 주세요.",
      });
    res.json({ defaults: saved });
  });
}
