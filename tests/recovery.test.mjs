import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { hashToken, secretMatches } from "../server/credentials.mjs";
import { normalizeRecoveryCode } from "../shared/recovery.mjs";

for (const dialect of ["sqlite", "postgres"])
  test(
    `${dialect}: recovery requires both secrets, rotates codes, revokes sessions, preserves data and limits attempts`,
    {
      skip: dialect === "postgres" && !process.env.TEST_DATABASE_URL,
      timeout: 60000,
    },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "reviewer-recovery-"));
      const file = join(dir, "test.sqlite");
      const pgUrl =
        process.env.TEST_DATABASE_ADMIN_URL || process.env.TEST_DATABASE_URL;
      if (dialect === "postgres")
        assert.match(new URL(pgUrl).pathname, /_test$/);
      let store,
        child,
        logs = "";
      const users = [];
      const port = dialect === "postgres" ? 3194 : 3195;
      const base = `http://127.0.0.1:${port}/api`;
      async function start() {
        child = spawn(process.execPath, ["server/index.mjs"], {
          env: {
            ...process.env,
            DATABASE_URL:
              dialect === "postgres" ? process.env.TEST_DATABASE_URL : "",
            PGHOST: "",
            PGSCHEMA: "reviewer",
            DATABASE_PATH: file,
            PORT: String(port),
            SIGNUP_CODE: "3333",
            COOKIE_SECURE: "false",
            APP_ORIGIN: "",
            API_RATE_LIMIT: "2000",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stderr.on("data", (data) => {
          logs += data;
        });
        for (let i = 0; i < 100; i++) {
          if (child.exitCode !== null) throw new Error(logs);
          try {
            if ((await fetch(base + "/health")).ok) return;
          } catch {}
          await delay(50);
        }
        throw new Error(logs);
      }
      async function stop() {
        if (!child || child.exitCode !== null) return;
        const ended = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGTERM");
        await ended;
      }
      async function sql(query, ...params) {
        if (dialect === "sqlite") return store.prepare(query).all(...params);
        let index = 0;
        return (
          await store.query(
            query.replace(/\?/g, () => `$${++index}`),
            params,
          )
        ).rows;
      }
      async function request(
        route,
        method = "GET",
        data,
        cookie = "",
        headers = {},
      ) {
        const r = await fetch(base + route, {
          method,
          headers: { "Content-Type": "application/json", cookie, ...headers },
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
        return {
          status: r.status,
          body: await r.json(),
          cookie: r.headers.get("set-cookie")?.split(";")[0],
          cache: r.headers.get("cache-control"),
        };
      }
      const answer = "My Blue Paper Boat";
      const setup = {
        questionId: "secret_phrase",
        answer,
        answerConfirmation: answer,
      };
      const password = "BeforeReset123";
      const after = "AfterReset456";
      const username = `rec_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const email = `${username}@example.test`;
      const verify = (code, extra = {}) =>
        request("/auth/recovery/verify", "POST", {
          identifier: username,
          questionId: setup.questionId,
          answer,
          recoveryCode: code,
          ...extra,
        });
      const reset = (token, extra = {}) =>
        request("/auth/recovery/reset", "POST", {
          resetToken: token,
          password: after,
          passwordConfirmation: after,
          ...extra,
        });
      try {
        await start();
        store =
          dialect === "sqlite"
            ? new DatabaseSync(file)
            : new pg.Pool({
                connectionString: pgUrl,
                options: "-c search_path=reviewer,pg_catalog",
              });
        const a = await request("/auth/signup", "POST", {
          username,
          email,
          password,
          signupCode: "3333",
          recovery: setup,
        });
        assert.equal(a.status, 201);
        users.push(a.body.user.id);
        const code = a.body.recoveryCode;
        assert.match(code, /^([A-F0-9]{4}-){7}[A-F0-9]{4}$/);
        const b = await request("/auth/signup", "POST", {
          username: `b_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
          password,
          signupCode: "3333",
        });
        users.push(b.body.user.id);
        const state = await request(
          "/auth/recovery-settings",
          "GET",
          null,
          a.cookie,
        );
        assert.equal(state.cache, "no-store");
        assert.deepEqual(Object.keys(state.body).sort(), [
          "configured",
          "questionId",
          "updatedAt",
        ]);
        assert.equal(state.body.configured, true);
        assert.equal(
          (await request("/auth/recovery-settings", "GET", null, b.cookie)).body
            .configured,
          false,
        );
        assert.equal((await request("/auth/recovery-settings")).status, 401);
        const stored = (
          await sql(
            "SELECT * FROM account_recovery WHERE user_id=?",
            a.body.user.id,
          )
        )[0];
        assert.notEqual(stored.answer_hash, answer);
        assert.ok(
          await secretMatches(answer.toLowerCase(), stored.answer_hash),
        );
        assert.equal(stored.code_hash, hashToken(normalizeRecoveryCode(code)));
        // Recovery attempts do not reveal whether an account or its setup exists.
        const wrong = await verify(code, { answer: "incorrect" });
        assert.equal(wrong.status, 401);
        assert.deepEqual(
          (await verify(code, { identifier: "missing_user" })).body,
          wrong.body,
        );
        assert.deepEqual(
          (await verify(code, { identifier: b.body.user.username })).body,
          wrong.body,
        );
        assert.deepEqual((await verify("0000")).body, wrong.body);
        assert.deepEqual(
          (await verify(code, { questionId: "memorable_place" })).body,
          wrong.body,
        );
        const verified = await verify(code.toLowerCase().replaceAll("-", " "), {
          answer: "  MY   BLUE PAPER BOAT  ",
          identifier: email,
        });
        assert.equal(verified.status, 200);
        assert.equal(verified.body.expiresIn, 600);
        assert.equal(
          (
            await reset(verified.body.resetToken, {
              password: "short",
              passwordConfirmation: "short",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await reset(verified.body.resetToken, {
              passwordConfirmation: "mismatch",
            })
          ).status,
          400,
        );
        const storedToken = (
          await sql(
            "SELECT * FROM recovery_tokens WHERE user_id=?",
            a.body.user.id,
          )
        )[0];
        assert.equal(
          storedToken.token_hash,
          hashToken(verified.body.resetToken),
        );
        const retained = {
          values: {
            purchaser: "보존할 계정주",
            platform: "쿠팡",
            platformOther: "",
            shippingMethod: "실배송",
            reviewType: "사진 리뷰",
            additionalReviewFee: 1000,
          },
          enabledFields: ["purchaser"],
          version: 0,
        };
        assert.equal(
          (await request("/registration-defaults", "PUT", retained, a.cookie))
            .status,
          200,
        );
        const session2 = await request("/auth/login", "POST", {
          identifier: username,
          password,
        });
        // The same token racing against itself can only reset once.
        const concurrent = await Promise.all([
          reset(verified.body.resetToken),
          reset(verified.body.resetToken),
        ]);
        assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 400]);
        const rotated = concurrent.find((r) => r.status === 200).body
          .recoveryCode;
        assert.notEqual(rotated, code);
        for (const cookie of [a.cookie, session2.cookie])
          assert.equal(
            (await request("/auth/me", "GET", null, cookie)).body.user,
            null,
          );
        assert.equal((await reset(verified.body.resetToken)).status, 400);
        assert.equal(
          (
            await request("/auth/login", "POST", {
              identifier: username,
              password,
            })
          ).status,
          401,
        );
        const login = await request("/auth/login", "POST", {
          identifier: username,
          password: after,
        });
        assert.equal(login.status, 200);
        assert.equal(
          (await request("/registration-defaults", "GET", null, login.cookie))
            .body.defaults.values.purchaser,
          "보존할 계정주",
        );
        assert.equal((await verify(code)).status, 401);
        const expiring = await verify(rotated);
        assert.equal(expiring.status, 200);
        await sql(
          "UPDATE recovery_tokens SET expires_at=? WHERE user_id=?",
          Date.now() - 1000,
          a.body.user.id,
        );
        assert.equal((await reset(expiring.body.resetToken)).status, 400);
        const stale = await verify(rotated);
        assert.equal(stale.status, 200);
        assert.equal(
          (
            await request(
              "/auth/recovery-settings",
              "PUT",
              { ...setup, currentPassword: password },
              login.cookie,
            )
          ).status,
          401,
        );
        assert.equal(
          (
            await request(
              "/auth/recovery-settings",
              "PUT",
              {
                ...setup,
                answer: after,
                answerConfirmation: after,
                currentPassword: after,
              },
              login.cookie,
            )
          ).status,
          400,
        );
        const renewed = await request(
          "/auth/recovery-settings",
          "PUT",
          { ...setup, currentPassword: after },
          login.cookie,
        );
        assert.equal(renewed.status, 200);
        assert.equal((await reset(stale.body.resetToken)).status, 400);
        assert.equal((await verify(rotated)).status, 401);
        // Same-account email and username share a persistent five-attempt budget.
        for (let i = 0; i < 4; i++)
          assert.equal(
            (
              await verify(renewed.body.recoveryCode, {
                answer: "wrong",
                identifier: i % 2 ? email : username,
              })
            ).status,
            401,
          );
        await stop();
        await start();
        assert.equal((await verify(renewed.body.recoveryCode)).status, 401);
        assert.equal(
          (
            await request("/auth/login", "POST", {
              identifier: username,
              password: after,
            })
          ).status,
          200,
        );
        await sql(
          "UPDATE recovery_attempts SET expires_at=? WHERE bucket=?",
          Date.now() - 1,
          hashToken(`recovery:user:${a.body.user.id}`),
        );
        assert.equal((await verify(renewed.body.recoveryCode)).status, 200);
        const events = await sql(
          "SELECT event_kind FROM account_security_events WHERE user_id=?",
          a.body.user.id,
        );
        assert.equal(
          events.filter((v) => v.event_kind === "password_reset").length,
          1,
        );
        assert.equal(
          events.filter((v) => v.event_kind === "recovery_setup").length,
          2,
        );
        assert.equal(
          (
            await request("/auth/recovery/verify", "POST", {}, "", {
              origin: "https://unrelated.example",
            })
          ).status,
          403,
        );
      } finally {
        await stop();
        if (dialect === "postgres" && store) {
          for (const id of users) await sql("DELETE FROM users WHERE id=?", id);
          await store.end();
        } else store?.close();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
