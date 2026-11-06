import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { adminPeriod } from "../server/admin.mjs";
import { recordMemberActivity } from "../server/member-activity.mjs";
import { reviewSchema } from "../shared/domain.mjs";

test("admin month boundaries use Korean time and reject invalid periods", () => {
  assert.deepEqual(adminPeriod("2024-02"), {
    month: "2024-02",
    startDate: "2024-02-01",
    endDate: "2024-03-01",
    start: "2024-01-31T15:00:00.000Z",
    end: "2024-02-29T15:00:00.000Z",
  });
  for (const value of ["2024-00", "2024-13", "2099-01", [], "bad"])
    assert.equal(adminPeriod(value), null);
});
for (const postgres of [false, true])
  test(
    `admin authorization, activity and aggregate accuracy (${postgres ? "PostgreSQL" : "SQLite"})`,
    { skip: postgres && !process.env.TEST_DATABASE_ADMIN_URL, timeout: 60000 },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "reviewer-admin-")),
        file = join(dir, "test.sqlite"),
        port = postgres ? 3212 : 3211;
      const schema = `admin_test_${randomUUID().replaceAll("-", "")}`;
      let operator,
        appPool,
        child,
        sqlite,
        logs = "";
      const db = {
        dialect: postgres ? "postgres" : "sqlite",
        prepare(sql) {
          const query = async (args) =>
            postgres
              ? (
                  await operator.query(
                    sql.replace(/\?/g, () => `$${++query.index}`),
                    args,
                  )
                ).rows
              : sqlite.prepare(sql).all(...args);
          query.index = 0;
          return {
            async all(...args) {
              return query(args);
            },
            async get(...args) {
              return (await query(args))[0];
            },
            async run(...args) {
              if (postgres) {
                let i = 0;
                return operator.query(
                  sql.replace(/\?/g, () => `$${++i}`),
                  args,
                );
              }
              return sqlite.prepare(sql).run(...args);
            },
          };
        },
      };
      async function req(route, method = "GET", body, cookie = "") {
        const r = await fetch(`http://127.0.0.1:${port}/api${route}`, {
          method,
          headers: { "Content-Type": "application/json", cookie },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return {
          status: r.status,
          body: await r.json(),
          cookie: r.headers.get("set-cookie")?.split(";")[0],
          headers: r.headers,
        };
      }
      try {
        if (postgres) {
          assert.match(
            new URL(process.env.TEST_DATABASE_ADMIN_URL).pathname,
            /_test$/,
          );
          await promisify(execFile)(process.execPath, ["server/migrate.mjs"], {
            env: {
              ...process.env,
              DATABASE_URL: process.env.TEST_DATABASE_ADMIN_URL,
              PGSCHEMA: schema,
            },
          });
          operator = new pg.Pool({
            connectionString: process.env.TEST_DATABASE_ADMIN_URL,
            options: `-c search_path=${schema},pg_catalog`,
          });
          await operator.query(
            `GRANT USAGE ON SCHEMA "${schema}" TO reviewer_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${schema}" TO reviewer_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO reviewer_app; REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON admin_memberships,review_history,payment_history FROM reviewer_app`,
          );
          appPool = new pg.Pool({
            connectionString: process.env.TEST_DATABASE_URL,
            options: `-c search_path=${schema},pg_catalog`,
          });
        }
        child = spawn(process.execPath, ["server/index.mjs"], {
          env: {
            ...process.env,
            PORT: String(port),
            DATABASE_URL: postgres ? process.env.TEST_DATABASE_URL : "",
            PGHOST: "",
            PGSCHEMA: postgres ? schema : "reviewer",
            DATABASE_PATH: file,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stderr.on("data", (v) => (logs += String(v)));
        let ready = false;
        for (let i = 0; i < 100; i++) {
          try {
            if ((await req("/health")).status === 200) {
              ready = true;
              break;
            }
          } catch {}
          await delay(50);
        }
        assert.ok(ready, logs);
        if (!postgres) sqlite = new DatabaseSync(file);
        assert.equal((await req("/admin/dashboard")).status, 401);
        const a = await req("/auth/signup", "POST", {
          username: "owner_admin",
          password: "TestAdmin1234",
          isAdmin: true,
          role: "admin",
        });
        const b = await req("/auth/signup", "POST", {
          username: "member_one",
          password: "TestMember1234",
        });
        const c = await req("/auth/signup", "POST", {
          email: "member@example.test",
          password: "TestMember1234",
        });
        for (const account of [a, b, c])
          assert.equal(account.status, 201, JSON.stringify(account.body));
        assert.equal(a.body.user.isAdmin, undefined);
        for (const path of [
          "/admin/dashboard",
          `/admin/members/${b.body.user.id}`,
        ])
          assert.equal(
            (await req(path, "GET", undefined, a.cookie)).status,
            403,
          );
        await db
          .prepare(
            "INSERT INTO admin_memberships(user_id,granted_at,granted_by) VALUES(?,?,?)",
          )
          .run(a.body.user.id, new Date().toISOString(), "test-operator");
        assert.equal(
          (await req("/auth/me", "GET", undefined, a.cookie)).body.user.isAdmin,
          true,
        );
        assert.equal(
          (
            await req("/auth/login", "POST", {
              identifier: "owner_admin",
              password: "TestAdmin1234",
            })
          ).body.user.isAdmin,
          true,
        );
        const start = await req("/admin/dashboard", "GET", undefined, a.cookie);
        assert.equal(start.status, 200, JSON.stringify(start.body));
        assert.equal(start.body.summary.total, 3);
        assert.equal(start.body.summary.active, 3);
        assert.equal(start.headers.get("cache-control"), "no-store");
        await db
          .prepare("UPDATE users SET created_at=? WHERE id=?")
          .run("2024-01-31T14:59:59.999Z", a.body.user.id);
        await db
          .prepare("UPDATE users SET created_at=? WHERE id=?")
          .run("2024-01-31T15:00:00.000Z", b.body.user.id);
        await db
          .prepare("UPDATE users SET created_at=? WHERE id=?")
          .run("2024-02-29T15:00:00.000Z", c.body.user.id);
        await recordMemberActivity(
          db,
          b.body.user.id,
          new Date("2024-02-01T01:00:00Z"),
        );
        await recordMemberActivity(
          db,
          b.body.user.id,
          new Date("2024-02-01T01:01:00Z"),
        );
        await recordMemberActivity(
          db,
          b.body.user.id,
          new Date("2024-02-01T01:06:00Z"),
        );
        await recordMemberActivity(
          db,
          b.body.user.id,
          new Date("2024-02-02T01:00:00Z"),
        );
        const activity = await db
          .prepare(
            "SELECT * FROM member_daily_activity WHERE user_id=? AND activity_date=?",
          )
          .get(b.body.user.id, "2024-02-01");
        assert.equal(activity.first_seen_at, "2024-02-01T01:00:00.000Z");
        assert.equal(activity.last_seen_at, "2024-02-01T01:06:00.000Z");
        const item = {
          name: "관리자 집계 테스트 상품",
          platform: "쿠팡",
          price: 10000,
          shippingMethod: "빈박스",
          additionalReviewFee: 1000,
          reviewType: "사진 리뷰",
          reviewStatus: "done",
          reviewedAt: "2024-02-02",
          purchaseDate: "2024-02-01",
          receivedAmount: 5000,
          paidAt: "2024-02-03",
          contact: "PRIVATE-PHONE",
          memo: "PRIVATE-MEMO",
          kakaoName: "PRIVATE-KAKAO",
        };
        // Seed historic creation times; never rewrite the append-only ledger.
        async function seedReview(input) {
          const data = reviewSchema.parse(input),
            id = randomUUID(),
            stamp = "2024-01-31T15:00:00.000Z";
          await db
            .prepare(
              "INSERT INTO reviews(id,user_id,data,created_at,updated_at) VALUES(?,?,?,?,?)",
            )
            .run(id, b.body.user.id, JSON.stringify(data), stamp, stamp);
          await db
            .prepare(
              "INSERT INTO payments(id,user_id,review_id,amount,paid_at) VALUES(?,?,?,?,?)",
            )
            .run(
              randomUUID(),
              b.body.user.id,
              id,
              data.receivedAmount,
              data.paidAt,
            );
          return { body: { review: { ...data, id, version: 1 } } };
        }
        const created = await seedReview(item);
        const second = await seedReview({
          ...item,
          name: "삭제할 상품",
          receivedAmount: 11000,
        });
        const paid = await req(
          `/reviews/${created.body.review.id}`,
          "PUT",
          {
            ...created.body.review,
            receivedAmount: 11000,
            paidAt: "2024-02-04",
          },
          b.cookie,
        );
        assert.equal(paid.status, 200);
        const deleted = await req(
          `/reviews/${second.body.review.id}`,
          "DELETE",
          { version: second.body.review.version },
          b.cookie,
        );
        assert.equal(deleted.status, 200);
        const result = await req(
          "/admin/dashboard?month=2024-02",
          "GET",
          undefined,
          a.cookie,
        );
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const s = result.body.summary;
        assert.equal(s.total, 3);
        assert.equal(s.joined, 1);
        assert.equal(s.active, 1);
        assert.equal(s.reviews, 1);
        assert.equal(s.registered, 2);
        assert.equal(s.completed, 1);
        assert.equal(s.settled, 1);
        assert.equal(s.received, 11000);
        assert.equal(s.monthlyDeposits, 11000);
        assert.equal(s.pending, 0);
        assert.equal(s.monthlyRegistrations, 2);
        assert.equal(result.body.trend.length, 29);
        assert.equal(result.body.trend[0].joined, 1);
        assert.equal(result.body.trend[0].active, 1);
        assert.equal(result.body.trend[1].active, 1);
        assert.deepEqual(result.body.platforms, [
          { name: "쿠팡", count: 1, received: 11000 },
        ]);
        const member = result.body.members.rows.find(
          (v) => v.id === b.body.user.id,
        );
        assert.equal(member.active_review_count, 1);
        assert.equal(member.deleted_count, 1);
        assert.equal(member.received_total, 11000);
        const detail = await req(
          `/admin/members/${b.body.user.id}`,
          "GET",
          undefined,
          a.cookie,
        );
        assert.equal(detail.status, 200);
        assert.equal(detail.body.reviews.length, 1);
        assert.equal(detail.body.reviews[0].product_name, item.name);
        for (const response of [result, detail])
          for (const secret of [
            "PRIVATE-PHONE",
            "PRIVATE-MEMO",
            "PRIVATE-KAKAO",
            "password",
            "account_number",
            "token",
          ])
            assert.ok(!JSON.stringify(response.body).includes(secret), secret);
        assert.equal(
          (
            await req(
              "/admin/dashboard?month=2024-02&status=new",
              "GET",
              undefined,
              a.cookie,
            )
          ).body.members.total,
          1,
        );
        assert.equal(
          (
            await req(
              "/admin/dashboard?month=2024-02&status=active",
              "GET",
              undefined,
              a.cookie,
            )
          ).body.members.total,
          1,
        );
        assert.equal(
          (
            await req(
              "/admin/dashboard?q=MEMBER_ONE",
              "GET",
              undefined,
              a.cookie,
            )
          ).body.members.total,
          1,
        );
        assert.equal(
          (await req("/admin/dashboard?q=%25", "GET", undefined, a.cookie)).body
            .members.total,
          0,
        );
        for (const q of ["month=2024-13", "sort=oops", "page=-1", "status=bad"])
          assert.equal(
            (await req(`/admin/dashboard?${q}`, "GET", undefined, a.cookie))
              .status,
            400,
          );
        assert.equal(
          (await req("/admin/dashboard?page=999", "GET", undefined, a.cookie))
            .body.members.page,
          1,
        );
        const last = await db
          .prepare(
            "SELECT MAX(last_seen_at) AS stamp FROM member_daily_activity WHERE user_id=?",
          )
          .get(a.body.user.id);
        await req("/admin/dashboard", "GET", undefined, a.cookie);
        assert.equal(
          (
            await db
              .prepare(
                "SELECT MAX(last_seen_at) AS stamp FROM member_daily_activity WHERE user_id=?",
              )
              .get(a.body.user.id)
          ).stamp,
          last.stamp,
        );
        if (postgres)
          for (const sql of [
            "INSERT INTO admin_memberships(user_id,granted_at,granted_by) VALUES('x','x','x')",
            "UPDATE admin_memberships SET granted_by='self'",
            "DELETE FROM admin_memberships",
            "TRUNCATE admin_memberships",
          ])
            await assert.rejects(appPool.query(sql), { code: "42501" });
        await db
          .prepare("DELETE FROM admin_memberships WHERE user_id=?")
          .run(a.body.user.id);
        assert.equal(
          (await req("/admin/dashboard", "GET", undefined, a.cookie)).status,
          403,
        );
        assert.equal(
          (await req("/auth/me", "GET", undefined, a.cookie)).body.user.isAdmin,
          undefined,
        );
        assert.equal(
          (await req("/reviews", "GET", undefined, c.cookie)).body.reviews
            .length,
          0,
        );
      } finally {
        if (child && child.exitCode === null) {
          const closed = new Promise((resolve) => child.once("exit", resolve));
          child.kill();
          await closed;
        }
        sqlite?.close();
        await appPool?.end();
        if (operator) {
          await operator.query(`DROP SCHEMA "${schema}" CASCADE`);
          await operator.end();
        }
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

test("operator provisioning never resets existing credentials and cannot promote demo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reviewer-admin-access-"));
  const file = join(dir, "test.sqlite");
  const run = (input) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["server/admin-access.mjs"], {
        env: {
          ...process.env,
          DATABASE_URL: "",
          PGHOST: "",
          DATABASE_PATH: file,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (v) => (output += v));
      child.stderr.resume();
      child.once("error", reject);
      child.once("exit", (code) => resolve({ code, output }));
      child.stdin.end(JSON.stringify(input));
    });
  try {
    const created = await run({
      username: "operator_test",
      password: "AdminPass1234",
    });
    assert.equal(created.code, 0);
    assert.equal(JSON.parse(created.output).created, true);
    assert.ok(!created.output.includes("AdminPass1234"));
    assert.equal(
      (await run({ username: "operator_test", password: "wrong-password" }))
        .code,
      1,
    );
    const repeated = await run({
      username: "operator_test",
      password: "AdminPass1234",
    });
    assert.equal(repeated.code, 0);
    assert.equal(JSON.parse(repeated.output).created, false);
    assert.equal(
      (await run({ username: "demo", password: "Example1234" })).code,
      1,
    );
    assert.equal(
      (await run({ username: "operator_test", action: "revoke" })).code,
      0,
    );
    const db = new DatabaseSync(file);
    try {
      assert.equal(
        db.prepare("SELECT count(*) AS count FROM admin_memberships").get()
          .count,
        0,
      );
      assert.equal(
        db.prepare("SELECT count(*) AS count FROM users").get().count,
        1,
      );
    } finally {
      db.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
