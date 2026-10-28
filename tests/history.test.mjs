import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const item = {
  name: "이력 검증 상품",
  seller: "검증 판매처",
  platform: "기타",
  platformOther: "검증 마켓",
  shippingMethod: "빈박스",
  price: 10000,
  additionalReviewFee: 1000,
  purchaseDate: "2026-10-28",
  reviewType: "사진 리뷰",
  reviewStatus: "todo",
};
for (const dialect of ["sqlite", "postgres"]) {
  test(
    `${dialect}: queryable user totals and immutable review/payment history survive corrections and product deletion`,
    {
      skip: dialect === "postgres" && !process.env.TEST_DATABASE_URL,
      timeout: 60000,
    },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "reviewer-history-"));
      const dbPath = join(directory, "test.sqlite");
      const postgres = dialect === "postgres";
      const port = postgres ? 3204 : 3203;
      const base = `http://127.0.0.1:${port}`;
      let child,
        sqlite,
        pool,
        logs = "";
      const userIds = [];
      const stop = async () => {
        if (!child || child.exitCode !== null) return;
        const closed = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGTERM");
        await closed;
      };
      const request = async (route, method = "GET", body, cookie = "") => {
        const res = await fetch(base + "/api" + route, {
          method,
          headers: { "Content-Type": "application/json", cookie },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return {
          status: res.status,
          body: await res.json(),
          cookie: res.headers.get("set-cookie")?.split(";")[0],
        };
      };
      const query = async (sql, args = []) =>
        postgres
          ? (
              await pool.query(
                sql.replace(
                  /\?/g,
                  (() => {
                    let n = 0;
                    return () => `$${++n}`;
                  })(),
                ),
                args,
              )
            ).rows
          : sqlite.prepare(sql).all(...args);
      try {
        if (postgres) {
          assert.match(
            new URL(process.env.TEST_DATABASE_URL).pathname,
            /_test$/,
          );
          pool = new pg.Pool({
            connectionString: process.env.TEST_DATABASE_URL,
            options: "-c search_path=reviewer,pg_catalog",
          });
        }
        child = spawn(process.execPath, ["server/index.mjs"], {
          env: {
            ...process.env,
            DATABASE_URL: postgres ? process.env.TEST_DATABASE_URL : "",
            PGHOST: "",
            DATABASE_PATH: dbPath,
            PORT: String(port),
            SIGNUP_CODE: "3333",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stderr.on("data", (chunk) => {
          logs += chunk;
        });
        let ready = false;
        for (let i = 0; i < 150; i++) {
          try {
            if ((await fetch(base + "/api/health")).ok) {
              ready = true;
              break;
            }
          } catch {}
          if (child.exitCode !== null) throw new Error(logs);
          await delay(30);
        }
        assert.ok(ready, logs);
        if (!postgres) sqlite = new DatabaseSync(dbPath);
        const signup = async () => {
          const result = await request("/auth/signup", "POST", {
            username: "hist_" + randomUUID().replaceAll("-", "").slice(0, 20),
            password: "Pass1234",
            signupCode: "3333",
          });
          assert.equal(result.status, 201);
          userIds.push(result.body.user.id);
          return result;
        };
        const a = await signup(),
          b = await signup();
        const userId = a.body.user.id;
        let r = (await request("/reviews", "POST", item, a.cookie)).body.review;
        assert.ok(r?.id);
        const reviewId = r.id;
        const history = () =>
          query(
            "SELECT * FROM review_history WHERE user_id=? AND review_id=? ORDER BY id",
            [userId, reviewId],
          );
        const payments = () =>
          query(
            "SELECT * FROM payment_history WHERE user_id=? AND review_id=? ORDER BY id",
            [userId, reviewId],
          );
        const summary = async () =>
          (
            await query("SELECT * FROM user_review_summary WHERE user_id=?", [
              userId,
            ])
          )[0];
        const asNumber = (n) => Number(n);
        let current = (
          await query("SELECT * FROM review_details WHERE id=?", [reviewId])
        )[0];
        assert.equal(current.product_name, item.name);
        assert.equal(current.platform_name, "검증 마켓");
        assert.equal(current.seller, item.seller);
        assert.equal(asNumber(current.pending_product), 10000);
        assert.equal(asNumber(current.pending_review_fee), 1000);
        assert.equal(current.settlement_status, "pending");
        assert.equal(asNumber((await summary()).registered_count), 1);
        assert.equal(asNumber((await summary()).todo_empty_box_count), 1);
        assert.equal(
          asNumber(
            (
              await query("SELECT * FROM user_review_summary WHERE user_id=?", [
                b.body.user.id,
              ])
            )[0].registered_count,
          ),
          0,
        );
        assert.equal(
          (
            await request(
              `/reviews/${reviewId}`,
              "PUT",
              { ...r, name: "다른 사용자" },
              b.cookie,
            )
          ).status,
          404,
        );
        assert.equal((await history()).length, 1);
        const update = async (patch) => {
          const result = await request(
            `/reviews/${reviewId}`,
            "PUT",
            { ...r, ...patch },
            a.cookie,
          );
          assert.equal(result.status, 200, JSON.stringify(result.body));
          r = result.body.review;
          return result;
        };
        await update({ reviewStatus: "done", reviewedAt: "2026-10-28" });
        await update({
          receivedAmount: 4000,
          paidAt: "2026-10-28",
          depositor: "검증 입금자",
        });
        assert.equal(asNumber((await summary()).pending_product), 6000);
        assert.equal(asNumber((await summary()).pending_review_fee), 1000);
        assert.equal(asNumber((await summary()).partially_paid_count), 1);
        const beforeConflict = (await history()).length;
        assert.equal(
          (
            await request(
              `/reviews/${reviewId}`,
              "PUT",
              { ...r, version: 1 },
              a.cookie,
            )
          ).status,
          409,
        );
        assert.equal((await history()).length, beforeConflict);
        await update({ receivedAmount: 11000 });
        assert.equal(asNumber((await summary()).settled_count), 1);
        assert.equal(asNumber((await summary()).received_total), 11000);
        await update({ paidAt: "2026-10-29" });
        let ledger = await payments();
        assert.equal(ledger.length, 5); // Two initial deposits, their removals and a corrected entry.
        assert.equal(ledger[0].paid_at_after, "2026-10-28");
        assert.equal(ledger[4].paid_at_after, "2026-10-29");
        assert.equal(ledger[0].depositor, "검증 입금자");
        await update({ receivedAmount: 9000 });
        assert.equal(asNumber((await summary()).received_total), 9000);
        assert.equal(asNumber((await summary()).pending_product), 1000);
        assert.equal(asNumber((await summary()).pending_review_fee), 1000);
        // Data and audit entries roll back as one transaction.
        const beforeRollback = (await history()).length;
        const client = postgres ? await pool.connect() : null;
        try {
          if (postgres) {
            await client.query("BEGIN");
            await client.query(
              "UPDATE reviews SET version=version+1 WHERE id=$1",
              [reviewId],
            );
            await client.query("ROLLBACK");
          } else {
            sqlite.exec("BEGIN");
            sqlite
              .prepare("UPDATE reviews SET version=version+1 WHERE id=?")
              .run(reviewId);
            sqlite.exec("ROLLBACK");
          }
        } finally {
          client?.release();
        }
        assert.equal((await history()).length, beforeRollback);
        for (const table of ["review_history", "payment_history"]) {
          await assert.rejects(
            query(`UPDATE ${table} SET event_type='baseline' WHERE user_id=?`, [
              userId,
            ]),
          );
          await assert.rejects(
            query(`DELETE FROM ${table} WHERE user_id=?`, [userId]),
          );
        }
        const response = await request(
          `/reviews/${reviewId}`,
          "DELETE",
          { version: r.version },
          a.cookie,
        );
        assert.equal(response.status, 200);
        const events = await history();
        ledger = await payments();
        assert.equal(events.length, 7);
        assert.equal(events[0].event_type, "created");
        assert.equal(events[1].review_status_before, "todo");
        assert.equal(events[1].review_status_after, "done");
        assert.equal(events[3].settlement_status_after, "done");
        assert.equal(events[5].settlement_status_before, "done");
        assert.equal(events[5].settlement_status_after, "partial");
        assert.equal(events[6].event_type, "deleted");
        assert.equal(events[6].product_name, item.name);
        assert.equal(ledger.length, 8);
        assert.equal(asNumber(ledger[7].amount_before), 9000);
        assert.equal(ledger[7].event_type, "deleted");
        assert.equal(ledger[7].product_name, item.name);
        assert.equal(
          (await query("SELECT * FROM payments WHERE user_id=?", [userId]))
            .length,
          0,
        );
        const totals = await summary();
        assert.equal(asNumber(totals.registered_count), 1);
        assert.equal(asNumber(totals.deleted_count), 1);
        assert.equal(asNumber(totals.active_review_count), 0);
        assert.equal(asNumber(totals.received_total), 0);
        assert.equal(asNumber(totals.ever_review_done_count), 1);
        assert.equal(asNumber(totals.ever_settled_count), 1);
        // Physical delivery with no cash owed is not a completed cash settlement.
        const physical = await request(
          "/reviews",
          "POST",
          { ...item, shippingMethod: "실배송", additionalReviewFee: 0 },
          a.cookie,
        );
        assert.equal(physical.status, 201);
        current = (
          await query("SELECT * FROM review_details WHERE id=?", [
            physical.body.review.id,
          ])
        )[0];
        assert.equal(current.settlement_status, "none");
        assert.equal(asNumber(current.product_payback), 0);
        assert.equal(asNumber((await summary()).todo_physical_count), 1);
        assert.equal(asNumber((await summary()).settled_count), 0);
        assert.equal(
          (await request("/reviews", "GET", undefined, b.cookie)).body.reviews
            .length,
          0,
        );
      } finally {
        await stop();
        for (const id of userIds)
          await query("DELETE FROM users WHERE id=?", [id]);
        for (const id of userIds) {
          assert.equal(
            (await query("SELECT * FROM review_history WHERE user_id=?", [id]))
              .length,
            0,
          );
          assert.equal(
            (await query("SELECT * FROM payment_history WHERE user_id=?", [id]))
              .length,
            0,
          );
        }
        sqlite?.close();
        await pool?.end();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test("SQLite history migration records honest baselines once, including existing payments", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "reviewer-history-migration-"),
  );
  const filename = join(directory, "legacy.sqlite");
  const previousPath = process.env.DATABASE_PATH;
  let db;
  try {
    const legacy = new DatabaseSync(filename);
    legacy.exec(
      await readFile(new URL("../server/sqlite.sql", import.meta.url), "utf8"),
    );
    legacy
      .prepare(
        "INSERT INTO users(id,username,name,password,created_at) VALUES(?,?,?,?,?)",
      )
      .run("history-migration", "legacy_history", "", "unused", "2026-01-01");
    legacy
      .prepare(
        "INSERT INTO reviews(id,user_id,data,created_at,updated_at,version) VALUES(?,?,?,?,?,?)",
      )
      .run(
        "history-old",
        "history-migration",
        JSON.stringify({ ...item, receivedAmount: 4000, paidAt: "2026-02-01" }),
        "2026-01-01",
        "2026-02-01",
        4,
      );
    legacy
      .prepare(
        "INSERT INTO payments(id,user_id,review_id,amount,paid_at) VALUES(?,?,?,?,?)",
      )
      .run(
        "payment-old",
        "history-migration",
        "history-old",
        4000,
        "2026-02-01",
      );
    legacy.close();
    process.env.DATABASE_PATH = filename;
    const { openDatabase } = await import("../server/database.mjs");
    db = await openDatabase();
    let row = await db.prepare("SELECT * FROM review_history").get();
    assert.equal(row.event_type, "baseline");
    assert.equal(row.version_after, 4);
    assert.equal(row.review_created_at, "2026-01-01");
    assert.equal(row.before_data, null);
    const payment = await db.prepare("SELECT * FROM payment_history").get();
    assert.equal(payment.event_type, "baseline");
    assert.equal(payment.amount_after, 4000);
    assert.equal(payment.paid_at_after, "2026-02-01");
    await db.close();
    db = await openDatabase();
    assert.equal(
      (await db.prepare("SELECT * FROM review_history").all()).length,
      1,
    );
    assert.equal(
      (await db.prepare("SELECT * FROM payment_history").all()).length,
      1,
    );
  } finally {
    await db?.close();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "PostgreSQL v2 upgrade preserves records, seeds baselines once and restricts history writes",
  { skip: !process.env.TEST_DATABASE_ADMIN_URL, timeout: 60000 },
  async () => {
    const connectionString = process.env.TEST_DATABASE_ADMIN_URL;
    assert.match(new URL(connectionString).pathname, /_test$/);
    const schema =
      "history_upgrade_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const pool = new pg.Pool({
      connectionString,
      options: `-c search_path=${schema},pg_catalog`,
    });
    const migrate = () =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["server/migrate.mjs"], {
          env: {
            ...process.env,
            DATABASE_URL: connectionString,
            PGSCHEMA: schema,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let logs = "";
        child.stdout.on("data", (c) => {
          logs += c;
        });
        child.stderr.on("data", (c) => {
          logs += c;
        });
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(logs)),
        );
      });
    try {
      await pool.query(`CREATE SCHEMA "${schema}"`);
      for (const name of ["001-initial.sql", "002-usernames.sql"])
        await pool.query(
          await readFile(
            new URL("../server/migrations/" + name, import.meta.url),
            "utf8",
          ),
        );
      const original = { ...item, receivedAmount: 4000, paidAt: "2026-02-01" };
      await pool.query(
        "INSERT INTO users(id,username,password,created_at) VALUES('legacy','legacy_history','unused','2026-01-01')",
      );
      await pool.query(
        "INSERT INTO reviews(id,user_id,data,created_at,updated_at,version) VALUES('legacy-review','legacy',$1,'2026-01-01','2026-02-01',4)",
        [JSON.stringify(original)],
      );
      await pool.query(
        "INSERT INTO payments(id,user_id,review_id,amount,paid_at) VALUES('legacy-payment','legacy','legacy-review',4000,'2026-02-01')",
      );
      await migrate();
      await migrate();
      const history = (await pool.query("SELECT * FROM review_history")).rows;
      assert.equal(history.length, 1);
      assert.equal(history[0].event_type, "baseline");
      assert.equal(history[0].before_data, null);
      assert.deepEqual(history[0].after_data, original);
      assert.equal(history[0].review_created_at, "2026-01-01");
      assert.equal(history[0].version_after, 4);
      const payments = (await pool.query("SELECT * FROM payment_history")).rows;
      assert.equal(payments.length, 1);
      assert.equal(payments[0].event_type, "baseline");
      assert.equal(Number(payments[0].amount_after), 4000);
      assert.equal(payments[0].paid_at_after, "2026-02-01");
      assert.deepEqual(
        (await pool.query("SELECT data FROM reviews")).rows[0].data,
        original,
      );
      const totals = (await pool.query("SELECT * FROM user_review_summary"))
        .rows[0];
      assert.equal(Number(totals.registered_count), 1);
      assert.equal(Number(totals.received_total), 4000);
      const grants = (
        await pool.query(
          "SELECT has_table_privilege('reviewer_app','review_history','SELECT') AS can_read,has_table_privilege('reviewer_app','review_history','INSERT,UPDATE,DELETE,TRUNCATE') AS can_write",
        )
      ).rows[0];
      assert.equal(grants.can_read, true);
      assert.equal(grants.can_write, false);
      await assert.rejects(
        pool.query(
          "INSERT INTO reviews(id,user_id,data,created_at,updated_at) VALUES('invalid','missing',$1,'2026-01-01','2026-01-01')",
          [JSON.stringify(item)],
        ),
        { code: "23503" },
      );
      assert.equal(
        (await pool.query("SELECT * FROM review_history")).rowCount,
        1,
      );
      // Direct SQL edits also capture before/after values and the database actor.
      await pool.query(
        "UPDATE payments SET amount=3000,paid_at='2026-02-02' WHERE id='legacy-payment'",
      );
      const change = (
        await pool.query(
          "SELECT * FROM payment_history WHERE event_type='updated'",
        )
      ).rows[0];
      assert.equal(Number(change.amount_before), 4000);
      assert.equal(Number(change.amount_after), 3000);
      assert.equal(change.paid_at_before, "2026-02-01");
      assert.equal(change.paid_at_after, "2026-02-02");
      await assert.rejects(
        pool.query(
          "UPDATE reviews SET user_id='other' WHERE id='legacy-review'",
        ),
        /identity cannot change/,
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  },
);
