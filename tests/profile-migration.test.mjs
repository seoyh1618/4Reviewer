import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { openDatabase } from "../server/database.mjs";
import {
  emptyRegistrationProfile,
  registrationProfileSchema,
} from "../shared/registration-profiles.mjs";

test("profile validation preserves leading zero account numbers and rejects unwanted fields", () => {
  const input = emptyRegistrationProfile();
  input.values.purchaser = "테스트";
  input.details.accountNumber = "001-000-1234";
  assert.equal(
    registrationProfileSchema.parse(input).details.accountNumber,
    "001-000-1234",
  );
  assert.equal(
    registrationProfileSchema.safeParse({ ...input, user_id: "other" }).success,
    false,
  );
  assert.equal(
    registrationProfileSchema.safeParse({
      ...input,
      details: { ...input.details, email: "bad" },
    }).success,
    false,
  );
  assert.equal(
    registrationProfileSchema.safeParse({
      ...input,
      values: { ...input.values, purchaser: "" },
    }).success,
    false,
  );
});

test("SQLite upgrade preserves old defaults as one editable default profile, only once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reviewer-profile-migration-"));
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(dir, "migration.sqlite");
  let db;
  try {
    db = await openDatabase();
    await db
      .prepare(
        "INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        "migration-user",
        "migration@example.test",
        "테스트",
        "unused",
        "2026-11-01",
      );
    await db
      .prepare(
        "INSERT INTO registration_defaults(user_id,purchaser,platform,platform_other,shipping_method,review_type,additional_review_fee,enabled_fields,version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        "migration-user",
        "이전 이름",
        "기타",
        "개인 마켓",
        "빈박스",
        "텍스트 리뷰",
        2500,
        '["purchaser","platform"]',
        9,
        "2026-11-01",
      );
    await db.prepare("DROP TABLE registration_profiles").run();
    await db.prepare("DROP TABLE admin_memberships").run();
    await db.prepare("DROP TABLE member_daily_activity").run();
    for (const index of [
      "users_joined",
      "reviews_created",
      "review_history_recorded",
    ])
      await db.prepare(`DROP INDEX ${index}`).run();
    await db.prepare("PRAGMA user_version=6").run();
    await db.close();
    db = await openDatabase();
    const rows = await db.prepare("SELECT * FROM registration_profiles").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].purchaser, "이전 이름");
    assert.equal(rows[0].platform_other, "개인 마켓");
    assert.equal(rows[0].additional_review_fee, 2500);
    assert.equal(rows[0].is_default, 1);
    assert.equal(rows[0].address, "");
    assert.equal(
      (await db.prepare("SELECT version FROM registration_defaults").get())
        .version,
      9,
    );
    await db.close();
    db = await openDatabase();
    assert.equal(
      (await db.prepare("SELECT * FROM registration_profiles").all()).length,
      1,
    );
  } finally {
    await db?.close();
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  "PostgreSQL upgrade migrates existing defaults without changing their versions",
  { skip: !process.env.TEST_DATABASE_ADMIN_URL },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_ADMIN_URL);
    assert.match(url.pathname, /_test$/);
    const pool = new pg.Pool({ connectionString: url.href });
    const client = await pool.connect();
    const schema = `profile_test_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(
        `SET LOCAL search_path = "${schema}", pg_catalog, pg_temp`,
      );
      await client.query("CREATE TABLE users(id text PRIMARY KEY)");
      await client.query(
        "CREATE TABLE schema_migrations(version integer PRIMARY KEY)",
      );
      await client.query(
        await readFile(
          new URL(
            "../server/migrations/004-registration-defaults.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await client.query("INSERT INTO users VALUES ('migration-user')");
      await client.query(
        "INSERT INTO registration_defaults(user_id,purchaser,platform,additional_review_fee,enabled_fields,version,updated_at) VALUES('migration-user','기존 이름','네이버',3000,'[\"purchaser\"]',7,'2026-11-01')",
      );
      await client.query(
        await readFile(
          new URL(
            "../server/migrations/007-registration-profiles.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const row = (await client.query("SELECT * FROM registration_profiles"))
        .rows[0];
      assert.equal(row.purchaser, "기존 이름");
      assert.equal(row.is_default, 1);
      assert.deepEqual(row.enabled_fields, ["purchaser"]);
      assert.equal(
        (await client.query("SELECT version FROM registration_defaults"))
          .rows[0].version,
        7,
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  },
);
