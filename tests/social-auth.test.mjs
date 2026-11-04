import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../server/database.mjs";
import { registerSocialRoutes } from "../server/social-auth.mjs";
import {
  cookieToken,
  publicUser,
  sessionHandlers,
} from "../server/sessions.mjs";
import { hashSecret, hashToken } from "../server/credentials.mjs";

for (const dialect of ["sqlite", "postgres"])
  test(
    `${dialect}: social signup, binding, linking, reauthentication and credential guards`,
    {
      skip: dialect === "postgres" && !process.env.TEST_DATABASE_URL,
      timeout: 60000,
    },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "reviewer-social-"));
      const prior = { ...process.env };
      let db, server;
      const users = [];
      try {
        process.env.DATABASE_URL =
          dialect === "postgres" ? process.env.TEST_DATABASE_URL : "";
        process.env.PGHOST = "";
        process.env.DATABASE_PATH = join(dir, "test.sqlite");
        db = await openDatabase();
        const { readSession, setSession } = sessionHandlers(db);
        const app = express();
        app.use(express.json());
        app.use(readSession);
        let exchanges = 0;
        const config = Object.fromEntries(
          ["google", "kakao", "naver"].map((p) => [
            p,
            {
              id: "test-client",
              secret: "test-secret",
              redirectUri: `https://example.test/api/auth/social/${p}/callback`,
            },
          ]),
        );
        registerSocialRoutes(app, db, {
          cookieToken,
          publicUser,
          setSession,
          config,
          previewProviders: ["naver"],
          exchange: async (_p, _c, _f, code) => {
            exchanges++;
            return code;
          },
        });
        app.use((error, _req, res, _next) =>
          res.status(error.status || 500).json({ error: error.message }),
        );
        server = await new Promise((resolve) => {
          const s = app.listen(0, "127.0.0.1", () => resolve(s));
        });
        const base = `http://127.0.0.1:${server.address().port}/api/auth/social`;
        const jar = () => new Map();
        const request = async (path, method = "GET", body, store = jar()) => {
          const response = await fetch(base + path, {
            method,
            redirect: "manual",
            headers: {
              "content-type": "application/json",
              cookie: [...store].map(([k, v]) => `${k}=${v}`).join("; "),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
          for (const c of response.headers.getSetCookie()) {
            const [k, ...v] = c.split(";")[0].split("=");
            if (v.join("=")) store.set(k, v.join("="));
            else store.delete(k);
          }
          return {
            status: response.status,
            body: response.status === 303 ? null : await response.json(),
            location: response.headers.get("location"),
          };
        };
        assert.deepEqual(
          (await request("/providers")).body.providers.map((p) => p.id),
          ["google", "kakao"],
        );
        assert.deepEqual(
          (await request("/providers?preview=naver")).body.providers.map(
            (p) => p.id,
          ),
          ["google", "kakao", "naver"],
        );
        assert.deepEqual(
          (await request("/providers?preview=unknown")).body.providers.map(
            (p) => p.id,
          ),
          ["google", "kakao"],
        );
        const begin = async (provider, store, intent = "login", extra = {}) => {
          const result = await request(
            `/${provider}/start`,
            "POST",
            { intent, ...extra },
            store,
          );
          assert.equal(result.status, 200, JSON.stringify(result.body));
          return new URL(result.body.url).searchParams.get("state");
        };
        const callback = (provider, state, subject, store) =>
          request(
            `/${provider}/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(subject)}`,
            "GET",
            undefined,
            store,
          );
        const subject = `subject-${randomUUID()}`,
          username = `s_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
        const a = jar(),
          state = await begin("google", a);
        assert.equal(
          (await callback("google", state, subject, jar())).location,
          "/?social=failed",
        );
        assert.equal(exchanges, 0);
        assert.equal(
          (await callback("kakao", state, subject, a)).location,
          "/?social=failed",
        );
        assert.equal(exchanges, 0);
        assert.equal(
          (await callback("google", state, subject, a)).location,
          "/?social=signup",
        );
        assert.equal(
          (await callback("google", state, subject, a)).location,
          "/?social=failed",
        );
        assert.equal(exchanges, 1);
        assert.equal(
          (await request("/pending", "GET", undefined, a)).body.provider,
          "google",
        );
        // Removing the invitation code must not bypass provider authentication.
        assert.equal(
          (await request("/signup", "POST", { username }, jar())).status,
          400,
        );
        assert.equal(
          (await request("/signup", "POST", { username: "bad!" }, a)).status,
          400,
        );
        const signup = await request("/signup", "POST", { username }, a);
        assert.equal(signup.status, 201, JSON.stringify(signup.body));
        const id = signup.body.user.id;
        users.push(id);
        assert.equal(
          (await db.prepare("SELECT password FROM users WHERE id=?").get(id))
            .password,
          "",
        );
        assert.equal((await request("/google", "DELETE", {}, a)).status, 409);
        assert.equal(
          (await request("/pending", "GET", undefined, a)).body.provider,
          null,
        );
        const b = jar();
        const login = await begin("google", b);
        assert.equal(
          (await callback("google", login, subject, b)).location,
          "/?social=logged_in",
        );
        assert.equal(
          (
            await db
              .prepare("SELECT user_id FROM sessions WHERE token=?")
              .get(hashToken(b.get("reviewer_session")))
          ).user_id,
          id,
        );
        // Unlinked identities cannot reauthenticate an existing session.
        assert.equal(
          (await request("/naver/start", "POST", { intent: "reauth" }, a))
            .status,
          403,
        );
        const linkState = await begin("kakao", a, "link");
        assert.equal(
          (await callback("kakao", linkState, `k-${subject}`, a)).location,
          "/?social=linked",
        );
        const stale = await begin("naver", a, "link");
        a.set("reviewer_session", b.get("reviewer_session"));
        assert.equal(
          (await callback("naver", stale, `n-${subject}`, a)).location,
          "/?social=failed",
        );
        await db
          .prepare("UPDATE sessions SET authenticated_at=0 WHERE user_id=?")
          .run(id);
        assert.equal(
          (
            await request(
              "/password",
              "POST",
              {
                password: "LocalPassword123",
                passwordConfirmation: "LocalPassword123",
              },
              b,
            )
          ).status,
          403,
        );
        const reauth = await begin("google", b, "reauth");
        assert.equal(
          (await callback("google", reauth, "wrong-user", b)).location,
          "/?social=failed",
        );
        const good = await begin("google", b, "reauth");
        assert.equal(
          (await callback("google", good, subject, b)).location,
          "/?social=verified",
        );
        assert.equal(
          (
            await request(
              "/password",
              "POST",
              { password: "short", passwordConfirmation: "short" },
              b,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request(
              "/password",
              "POST",
              {
                password: "LocalPassword123",
                passwordConfirmation: "LocalPassword123",
              },
              b,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await db
              .prepare("SELECT count(*) AS n FROM sessions WHERE user_id=?")
              .get(id)
          ).n,
          1,
        );
        assert.equal(
          (await request("/google", "DELETE", { currentPassword: "wrong" }, b))
            .status,
          401,
        );
        assert.equal(
          (
            await request(
              "/google",
              "DELETE",
              { currentPassword: "LocalPassword123" },
              b,
            )
          ).status,
          200,
        );
        // Local user linking keeps the same ID and existing reviews.
        const localId = randomUUID();
        users.push(localId);
        await db
          .prepare(
            "INSERT INTO users(id,email,username,name,password,is_demo,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            localId,
            null,
            `l_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
            "",
            await hashSecret("ExistingPassword123"),
            0,
            new Date().toISOString(),
          );
        const reviewId = randomUUID(),
          now = new Date().toISOString();
        await db
          .prepare(
            "INSERT INTO reviews(id,user_id,data,created_at,updated_at,version) VALUES(?,?,?,?,?,1)",
          )
          .run(
            reviewId,
            localId,
            JSON.stringify({
              id: reviewId,
              name: "Existing review",
              price: 8900,
            }),
            now,
            now,
          );
        const reviewBefore = await db
          .prepare("SELECT * FROM reviews WHERE id=?")
          .get(reviewId);
        const c = jar();
        c.set("reviewer_session", "test-local-session-" + localId);
        await db
          .prepare(
            "INSERT INTO sessions(token,user_id,expires_at,authenticated_at,auth_method) VALUES(?,?,?,?,?)",
          )
          .run(
            hashToken(c.get("reviewer_session")),
            localId,
            Date.now() + 60000,
            Date.now(),
            "password",
          );
        assert.equal(
          (
            await request(
              "/google/start",
              "POST",
              { intent: "link", currentPassword: "wrong" },
              c,
            )
          ).status,
          401,
        );
        const localLink = await begin("google", c, "link", {
          currentPassword: "ExistingPassword123",
        });
        assert.equal(
          (await callback("google", localLink, subject, c)).location,
          "/?social=linked",
        );
        assert.deepEqual(
          await db.prepare("SELECT * FROM reviews WHERE id=?").get(reviewId),
          reviewBefore,
        );
        const duplicate = await begin("kakao", c, "link", {
          currentPassword: "ExistingPassword123",
        });
        assert.equal(
          (await callback("kakao", duplicate, `k-${subject}`, c)).location,
          "/?social=failed",
        );
        const d = jar(),
          expired = await begin("naver", d);
        await db
          .prepare("UPDATE oauth_flows SET expires_at=0 WHERE state_hash=?")
          .run(hashToken(expired));
        const before = exchanges;
        assert.equal(
          (await callback("naver", expired, "expired", d)).location,
          "/?social=failed",
        );
        assert.equal(exchanges, before);
        const events = await db
          .prepare("SELECT event_kind FROM social_auth_events WHERE user_id=?")
          .all(id);
        for (const kind of [
          "signup",
          "login",
          "link",
          "reauth",
          "password_setup",
          "unlink",
        ])
          assert(events.some((v) => v.event_kind === kind));
        if (dialect === "postgres")
          await assert.rejects(
            () =>
              db
                .prepare("DELETE FROM social_auth_events WHERE user_id=?")
                .run(id),
            { code: "42501" },
          );
      } finally {
        if (server) await new Promise((resolve) => server.close(resolve));
        if (db) {
          for (const id of users)
            await db.prepare("DELETE FROM users WHERE id=?").run(id);
          await db.close();
        }
        for (const key of Object.keys(process.env))
          if (!(key in prior)) delete process.env[key];
        Object.assign(process.env, prior);
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
