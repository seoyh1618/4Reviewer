import { randomUUID } from "node:crypto";
import { z } from "zod";
import { emptyRegistrationDefaults } from "../shared/registration-defaults.mjs";
import {
  emptyProfileDetails,
  registrationProfileSchema,
} from "../shared/registration-profiles.mjs";

export function registrationProfileStore(db) {
  const decode = (row) => ({
    id: row.id,
    values: {
      purchaser: row.purchaser,
      platform: row.platform,
      platformOther: row.platform_other,
      shippingMethod: row.shipping_method,
      reviewType: row.review_type,
      additionalReviewFee: row.additional_review_fee,
    },
    details: {
      phone: row.phone,
      address: row.address,
      email: row.email,
      bank: row.bank,
      accountNumber: row.account_number,
      accountHolder: row.account_holder,
    },
    enabledFields: JSON.parse(row.enabled_fields),
    isDefault: row.is_default === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  const list = async (userId) =>
    (
      await db
        .prepare(
          "SELECT * FROM registration_profiles WHERE user_id=? ORDER BY created_at,id",
        )
        .all(userId)
    ).map(decode);
  // Serialize default changes and legacy writes for a user, across app instances.
  const lock = async (userId) => {
    if (db.dialect === "postgres")
      await db
        .prepare("SELECT id FROM users WHERE id=? FOR UPDATE")
        .get(userId);
  };
  const values = (p) => [
    p.values.purchaser,
    p.values.platform,
    p.values.platformOther,
    p.values.shippingMethod,
    p.values.reviewType,
    p.values.additionalReviewFee,
    JSON.stringify(p.enabledFields),
  ];
  const details = (p) => [
    p.details.phone,
    p.details.address,
    p.details.email,
    p.details.bank,
    p.details.accountNumber,
    p.details.accountHolder,
  ];
  const insert = async (userId, p, isDefault) => {
    const id = randomUUID(),
      now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO registration_profiles(id,user_id,purchaser,platform,platform_other,shipping_method,review_type,additional_review_fee,enabled_fields,phone,address,email,bank,account_number,account_holder,is_default,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
      )
      .run(
        id,
        userId,
        ...values(p),
        ...details(p),
        Number(isDefault),
        now,
        now,
      );
    return id;
  };
  // Keep the old endpoint usable by a browser that was open during deployment.
  const syncDefaults = async (userId, p) => {
    p ||= emptyRegistrationDefaults();
    await db
      .prepare(
        "INSERT INTO registration_defaults(user_id,purchaser,platform,platform_other,shipping_method,review_type,additional_review_fee,enabled_fields,version,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET purchaser=excluded.purchaser,platform=excluded.platform,platform_other=excluded.platform_other,shipping_method=excluded.shipping_method,review_type=excluded.review_type,additional_review_fee=excluded.additional_review_fee,enabled_fields=excluded.enabled_fields,version=registration_defaults.version+1,updated_at=excluded.updated_at",
      )
      .run(userId, ...values(p), new Date().toISOString());
  };
  const syncFromLegacy = async (userId, defaults) => {
    const active = (await list(userId)).find((p) => p.isDefault);
    if (!active)
      return insert(
        userId,
        { ...defaults, details: emptyProfileDetails() },
        true,
      );
    await db
      .prepare(
        "UPDATE registration_profiles SET purchaser=?,platform=?,platform_other=?,shipping_method=?,review_type=?,additional_review_fee=?,enabled_fields=?,version=version+1,updated_at=? WHERE user_id=? AND id=?",
      )
      .run(...values(defaults), new Date().toISOString(), userId, active.id);
  };
  return { list, lock, values, details, insert, syncDefaults, syncFromLegacy };
}

export function registerRegistrationProfileRoutes(app, db, store) {
  const conflict = () =>
    Object.assign(new Error("stale profile"), { status: 409 });
  app.get("/api/registration-profiles", async (req, res) =>
    res.json({ profiles: await store.list(req.user.id) }),
  );
  const save = async (req, res, creating) => {
    const parsed = registrationProfileSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0].message });
    const p = parsed.data;
    const result = await db.transaction(async () => {
      await store.lock(req.user.id);
      const all = await store.list(req.user.id);
      const old = creating ? null : all.find((p) => p.id === req.params.id);
      if (!creating && !old)
        return { status: 404, error: "등록 정보를 찾을 수 없습니다." };
      if (creating && all.length >= 50)
        return {
          status: 400,
          error: "등록 정보는 최대 50개까지 저장할 수 있어요.",
        };
      if (p.version !== (old?.version ?? 0)) throw conflict();
      const isDefault = !!(old?.isDefault || p.makeDefault || !all.length);
      if (isDefault)
        await db
          .prepare(
            "UPDATE registration_profiles SET is_default=0,version=version+1,updated_at=? WHERE user_id=? AND is_default=1 AND id<>?",
          )
          .run(new Date().toISOString(), req.user.id, old?.id || "");
      let id = old?.id;
      if (creating) id = await store.insert(req.user.id, p, isDefault);
      else {
        const updated = await db
          .prepare(
            "UPDATE registration_profiles SET purchaser=?,platform=?,platform_other=?,shipping_method=?,review_type=?,additional_review_fee=?,enabled_fields=?,phone=?,address=?,email=?,bank=?,account_number=?,account_holder=?,is_default=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?",
          )
          .run(
            ...store.values(p),
            ...store.details(p),
            Number(isDefault),
            new Date().toISOString(),
            id,
            req.user.id,
            p.version,
          );
        if (!updated.changes) throw conflict();
      }
      if (isDefault) await store.syncDefaults(req.user.id, p);
      return { profiles: await store.list(req.user.id), id };
    });
    if (result.error)
      return res.status(result.status).json({ error: result.error });
    res.status(creating ? 201 : 200).json(result);
  };
  app.post("/api/registration-profiles", (req, res) => save(req, res, true));
  app.put("/api/registration-profiles/:id", (req, res) =>
    save(req, res, false),
  );
  app.delete("/api/registration-profiles/:id", async (req, res) => {
    const parsed = z
      .object({ version: z.number().int().positive() })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "삭제할 정보를 다시 확인해 주세요." });
    const result = await db.transaction(async () => {
      await store.lock(req.user.id);
      const all = await store.list(req.user.id),
        old = all.find((p) => p.id === req.params.id);
      if (!old) return null;
      if (old.version !== parsed.data.version) throw conflict();
      await db
        .prepare(
          "DELETE FROM registration_profiles WHERE id=? AND user_id=? AND version=?",
        )
        .run(old.id, req.user.id, old.version);
      if (old.isDefault) {
        const next = all.find((p) => p.id !== old.id);
        if (next)
          await db
            .prepare(
              "UPDATE registration_profiles SET is_default=1,version=version+1,updated_at=? WHERE id=? AND user_id=?",
            )
            .run(new Date().toISOString(), next.id, req.user.id);
        await store.syncDefaults(req.user.id, next);
      }
      return { profiles: await store.list(req.user.id) };
    });
    if (!result)
      return res.status(404).json({ error: "등록 정보를 찾을 수 없습니다." });
    res.json(result);
  });
}
