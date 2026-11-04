import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/database.mjs";
import { registerKakaoWebhook } from "../server/kakao-webhook.mjs";
for (const dialect of ["sqlite", "postgres"])
  test(
    `${dialect}: Kakao unlink authenticates the sender, removes identity and sessions, preserves independent user data`,
    { skip: dialect === "postgres" && !process.env.TEST_DATABASE_URL },
    async () => {
      const prior = { ...process.env },
        dir = await mkdtemp(join(tmpdir(), "reviewer-unlink-"));
      let db, server;
      const users = [randomUUID(), randomUUID()];
      try {
        process.env.DATABASE_URL =
          dialect === "postgres" ? process.env.TEST_DATABASE_URL : "";
        process.env.PGHOST = "";
        process.env.DATABASE_PATH = join(dir, "db.sqlite");
        db = await openDatabase();
        const app = express();
        app.use(express.json());
        registerKakaoWebhook(app, db, {
          appId: "123",
          adminKey: "test-only-admin-key",
        });
        server = await new Promise((resolve) => {
          const s = app.listen(0, "127.0.0.1", () => resolve(s));
        });
        const now = new Date().toISOString();
        for (const [i, id] of users.entries()) {
          await db
            .prepare(
              "INSERT INTO users(id,email,username,name,password,is_demo,created_at) VALUES(?,?,?,?,?,?,?)",
            )
            .run(id, null, `u_${id.slice(0, 8)}`, "", "", 0, now);
          await db
            .prepare(
              "INSERT INTO social_identities(id,user_id,provider,subject,created_at,last_login_at) VALUES(?,?,?,?,?,?)",
            )
            .run(randomUUID(), id, "kakao", String(100 + i), now, now);
          await db
            .prepare(
              "INSERT INTO sessions(token,user_id,expires_at,authenticated_at,auth_method) VALUES(?,?,?,?,?)",
            )
            .run(`test-${id}`, id, Date.now() + 60000, Date.now(), "kakao");
          await db
            .prepare(
              "INSERT INTO reviews(id,user_id,data,created_at,updated_at) VALUES(?,?,?,?,?)",
            )
            .run(
              randomUUID(),
              id,
              JSON.stringify({ name: "Preserved own review" }),
              now,
              now,
            );
        }
        const send = (
          auth = "KakaoAK test-only-admin-key",
          app_id = "123",
          user_id = "100",
        ) =>
          fetch(
            `http://127.0.0.1:${server.address().port}/api/auth/social/kakao/unlink-webhook`,
            {
              method: "POST",
              headers: {
                authorization: auth,
                "content-type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ app_id, user_id }),
            },
          );
        assert.equal((await send("wrong")).status, 401);
        assert.equal((await send(undefined, "456")).status, 400);
        assert.equal((await send()).status, 200);
        assert.equal((await send()).status, 200);
        assert.equal(
          await db
            .prepare("SELECT id FROM social_identities WHERE user_id=?")
            .get(users[0]),
          undefined,
        );
        assert.equal(
          await db
            .prepare("SELECT token FROM sessions WHERE user_id=?")
            .get(users[0]),
          undefined,
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM social_auth_events WHERE user_id=?",
              )
              .get(users[0])
          ).n,
          1,
        );
        assert(
          await db
            .prepare("SELECT id FROM social_identities WHERE user_id=?")
            .get(users[1]),
        );
        assert(
          await db
            .prepare("SELECT token FROM sessions WHERE user_id=?")
            .get(users[1]),
        );
        for (const id of users)
          assert(
            await db.prepare("SELECT id FROM reviews WHERE user_id=?").get(id),
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
