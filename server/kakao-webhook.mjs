import express from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { hashToken, lockedUser } from "./credentials.mjs";

// Kakao's server callback has its own authentication, not a browser session/CSRF token.
export function registerKakaoWebhook(
  app,
  db,
  {
    appId = process.env.KAKAO_APP_ID,
    adminKey = process.env.KAKAO_ADMIN_KEY,
  } = {},
) {
  app.post(
    "/api/auth/social/kakao/unlink-webhook",
    express.urlencoded({ extended: false, limit: "4kb" }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      if (!appId || !adminKey) return res.sendStatus(503);
      const supplied = hashToken(req.get("authorization") || "");
      const expected = hashToken(`KakaoAK ${adminKey}`);
      if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)))
        return res.sendStatus(401);
      const subject = req.body?.user_id;
      if (
        req.body?.app_id !== appId ||
        typeof subject !== "string" ||
        !/^[1-9]\d{0,19}$/.test(subject)
      )
        return res.sendStatus(400);
      try {
        await db.transaction(async () => {
          const identity = await db
            .prepare(
              "SELECT user_id FROM social_identities WHERE provider='kakao' AND subject=?",
            )
            .get(subject);
          if (identity) {
            const user = await lockedUser(db, identity.user_id);
            if (user) {
              const removed = await db
                .prepare(
                  "DELETE FROM social_identities WHERE user_id=? AND provider='kakao' AND subject=?",
                )
                .run(user.id, subject);
              await db
                .prepare(
                  "DELETE FROM sessions WHERE user_id=? AND auth_method='kakao'",
                )
                .run(user.id);
              await db
                .prepare(
                  "DELETE FROM oauth_flows WHERE user_id=? AND provider='kakao'",
                )
                .run(user.id);
              if (removed.changes)
                await db
                  .prepare(
                    "INSERT INTO social_auth_events(id,user_id,provider,event_kind,created_at) VALUES(?,?,?,?,?)",
                  )
                  .run(
                    randomUUID(),
                    user.id,
                    "kakao",
                    "unlink",
                    new Date().toISOString(),
                  );
            }
          }
          await db
            .prepare(
              "DELETE FROM oauth_flows WHERE provider='kakao' AND subject=?",
            )
            .run(subject);
        });
        res.sendStatus(200);
      } catch {
        // Request a retry rather than acknowledging a deletion that did not commit.
        console.error("Kakao unlink processing failed");
        res.sendStatus(503);
      }
    },
  );
}
