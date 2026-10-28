import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const connectionString = process.env.TEST_DATABASE_URL;
test(
  "PostgreSQL ownership, privileges, concurrent updates, ledger and persistent sessions",
  { skip: !connectionString, timeout: 60000 },
  async () => {
    const url = new URL(connectionString);
    assert.match(
      url.pathname,
      /_test$/,
      "Only an isolated test database is allowed",
    );
    const pool = new pg.Pool({
      connectionString,
      options: "-c search_path=reviewer,pg_catalog",
    });
    const port = 3197,
      base = `http://127.0.0.1:${port}`;
    const users = [];
    let child,
      logs = "";
    const stop = async () => {
      if (!child || child.exitCode !== null) return;
      const closed = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await closed;
    };
    const start = async () => {
      child = spawn(process.execPath, ["server/index.mjs"], {
        env: {
          ...process.env,
          DATABASE_URL: connectionString,
          PGSCHEMA: "reviewer",
          PORT: String(port),
          SIGNUP_CODE: "pg-test-only",
          COOKIE_SECURE: "true",
          APP_ORIGIN: base,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stderr.on("data", (chunk) => {
        logs += chunk.toString();
      });
      for (let i = 0; i < 100; i++) {
        try {
          const r = await fetch(base + "/api/health");
          if (r.ok) {
            assert.equal((await r.json()).database, "postgres");
            return;
          }
        } catch {}
        if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
        await delay(50);
      }
      throw new Error("Postgres API startup timeout");
    };
    const req = async (route, method = "GET", data, cookie = "") => {
      const response = await fetch(base + "/api" + route, {
        method,
        headers: { "Content-Type": "application/json", cookie },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
        header: response.headers.get("set-cookie"),
      };
    };
    try {
      await assert.rejects(
        pool.query("CREATE TABLE reviewer.should_not_create(id integer)"),
        { code: "42501" },
      );
      await assert.rejects(pool.query("CREATE DATABASE should_not_create"), {
        code: "42501",
      });
      await start();
      const signup = async (idOnly = false) => {
        const r = await req("/auth/signup", "POST", {
          ...(idOnly ? { username: `pg_${randomUUID().replaceAll("-", "").slice(0, 22)}` } : { email: `pg-${randomUUID()}@example.test` }),
          password: "Postgres-test-pass-1234",
          signupCode: "pg-test-only",
        });
        assert.equal(r.status, 201);
        users.push(r.body.user.id);
        assert.match(r.header, /Secure/);
        assert.match(r.header, /HttpOnly/);
        return r;
      };
      const a = await signup(true),
        b = await signup();
      assert.equal(a.body.user.email, null);
      assert.equal(b.body.user.username, null);
      const byId = await req("/auth/login", "POST", { identifier: a.body.user.username.toUpperCase(), password: "Postgres-test-pass-1234" });
      assert.equal(byId.status, 200);
      assert.equal(byId.body.user.id, a.body.user.id);
      assert.equal((await req("/auth/username", "PATCH", { username: a.body.user.username, currentPassword: "Postgres-test-pass-1234" }, b.cookie)).status, 409);
      const stored = await pool.query(
        "SELECT password FROM users WHERE id=$1",
        [users[0]],
      );
      assert.match(stored.rows[0].password, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
      const tokens = await pool.query(
        "SELECT token FROM sessions WHERE user_id=$1",
        [users[0]],
      );
      assert.notEqual(tokens.rows[0].token, a.cookie.split("=")[1]);
      const created = await req(
        "/reviews",
        "POST",
        {
          name: "PG 동시 정산 검사",
          platform: "쿠팡",
          price: 10000,
          shippingMethod: "빈박스",
          additionalReviewFee: 1000,
          purchaseDate: "2026-10-28",
          reviewType: "사진 리뷰",
          reviewStatus: "done",
          reviewedAt: "2026-10-28",
        },
        a.cookie,
      );
      assert.equal(created.status, 201);
      const item = created.body.review;
      assert.equal(
        (await req("/reviews", "GET", undefined, b.cookie)).body.reviews.length,
        0,
      );
      assert.equal(
        (
          await req(
            `/reviews/${item.id}`,
            "PUT",
            { ...item, name: "타인 수정" },
            b.cookie,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await req(
            `/reviews/${item.id}`,
            "DELETE",
            { version: item.version },
            b.cookie,
          )
        ).status,
        404,
      );
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          req(
            `/reviews/${item.id}`,
            "PUT",
            { ...item, receivedAmount: 4000, paidAt: "2026-10-28" },
            a.cookie,
          ),
        ),
      );
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 5);
      const list = (await req("/reviews", "GET", undefined, a.cookie)).body;
      assert.equal(list.reviews[0].version, 2);
      assert.equal(list.payments.length, 1);
      assert.equal(list.payments[0].amount, 4000);
      assert.equal(list.payments[0].reviewId, item.id);
      assert.equal(list.payments[0].paidAt, "2026-10-28");
      const groupResults = await Promise.all(
        Array.from({ length: 2 }, () =>
          req("/template-groups", "POST", { name: "동시 생성" }, a.cookie),
        ),
      );
      assert.deepEqual(groupResults.map((r) => r.status).sort(), [201, 409]);
      const group = groupResults.find((r) => r.status === 201).body.group;
      const defaults = (await req("/templates", "GET", undefined, a.cookie))
        .body.templates;
      const changed = {
        ...defaults[0],
        body: "실제 사용 후 작성한 템플릿입니다.",
        groupId: group.id,
      };
      const edits = await Promise.all(
        Array.from({ length: 2 }, () =>
          req(`/templates/${changed.id}`, "PUT", changed, a.cookie),
        ),
      );
      assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (await req("/templates", "GET", undefined, b.cookie)).body.templates[0]
          .version,
        0,
      );
      await stop();
      await start();
      assert.equal(
        (await req("/auth/me", "GET", undefined, a.cookie)).body.user.id,
        users[0],
      );
      assert.equal(
        (await req("/reviews", "GET", undefined, a.cookie)).body.payments[0]
          .amount,
        4000,
      );
      assert.equal(
        (await req("/auth/logout", "POST", {}, a.cookie)).status,
        200,
      );
      assert.equal(
        (await req("/reviews", "GET", undefined, a.cookie)).status,
        401,
      );
    } finally {
      await stop();
      for (const id of users)
        await pool.query("DELETE FROM users WHERE id=$1", [id]);
      await pool.end();
    }
  },
);
