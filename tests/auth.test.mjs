import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, scryptSync, createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";

test(
  "email and username login, legacy migration, unique IDs and authenticated ID changes",
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "reviewer-auth-"));
    const database = join(dir, "auth.sqlite");
    const port = 3198;
    const base = `http://127.0.0.1:${port}/api`;
    const password = "Reviewer-auth-1234";
    const salt = randomBytes(16).toString("hex");
    const seed = new DatabaseSync(database);
    seed.exec(
      (
        await readFile(new URL("../server/sqlite.sql", import.meta.url), "utf8")
      ).replace(
        /CREATE TABLE IF NOT EXISTS users .*?;/,
        "CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);",
      ),
    );
    assert.ok(
      !seed
        .prepare("PRAGMA table_info(users)")
        .all()
        .some((c) => c.name === "username"),
    );
    seed
      .prepare(
        "INSERT INTO users(id,email,name,password,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        "legacy",
        "legacy@example.test",
        "",
        `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
        new Date().toISOString(),
      );
    const token = randomBytes(32).toString("hex");
    seed
      .prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)")
      .run(
        createHash("sha256").update(token).digest("hex"),
        "legacy",
        Date.now() + 3600000,
      );
    const oldReview = JSON.stringify({ name: "기존 리뷰 보존", price: 12345 });
    seed
      .prepare(
        "INSERT INTO reviews(id,user_id,data,created_at,updated_at) VALUES(?,?,?,?,?)",
      )
      .run("old-review", "legacy", oldReview, "2026-10-28", "2026-10-28");
    seed.close();
    const legacyCookie = `reviewer_session=${token}`;
    let child;
    let logs = "";
    async function start() {
      child = spawn(process.execPath, ["server/index.mjs"], {
        env: {
          ...process.env,
          DATABASE_URL: "",
          PGHOST: "",
          DATABASE_PATH: database,
          PORT: String(port),
          SIGNUP_CODE: "3333",
          COOKIE_SECURE: "false",
          APP_ORIGIN: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stderr.on("data", (data) => {
        logs += data;
      });
      for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) throw new Error(logs);
        try {
          if ((await fetch(`${base}/health`)).ok) return;
        } catch {}
        await delay(50);
      }
      throw new Error(`Startup failed: ${logs}`);
    }
    async function stop() {
      if (!child || child.exitCode !== null) return;
      const stopped = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await stopped;
    }
    async function request(route, method = "GET", data, cookie = "") {
      const response = await fetch(base + route, {
        method,
        headers: { "Content-Type": "application/json", cookie },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      };
    }
    const signup = (email, username) =>
      request("/auth/signup", "POST", {
        email,
        username,
        password,
        signupCode: "3333",
      });
    const login = (identifier, enteredPassword = password) =>
      request("/auth/login", "POST", { identifier, password: enteredPassword });
    const update = (
      username,
      cookie = legacyCookie,
      currentPassword = password,
    ) =>
      request("/auth/username", "PATCH", { username, currentPassword }, cookie);
    try {
      await start();
      assert.deepEqual(
        (await request("/auth/me", "GET", undefined, legacyCookie)).body.user,
        { id: "legacy", email: "legacy@example.test", username: null },
      );
      assert.equal(
        (
          await request("/auth/login", "POST", {
            email: "legacy@example.test",
            password,
          })
        ).status,
        200,
      );
      const a = await signup(" New@Example.Test ", " Review_User ");
      assert.equal(a.status, 201);
      assert.equal(a.body.user.email, "new@example.test");
      assert.equal(a.body.user.username, "review_user");
      assert.deepEqual(Object.keys(a.body.user).sort(), [
        "email",
        "id",
        "username",
      ]);
      assert.equal(
        (await signup("other@example.test", "REVIEW_USER")).status,
        409,
      );
      assert.equal((await signup("new@example.test", "different")).status, 409);
      for (const invalid of [
        "abc",
        "a".repeat(31),
        "이름",
        "a@b.test",
        "bad name",
        "' OR 1=1 --",
      ]) {
        assert.equal(
          (await signup("invalid@example.test", invalid)).status,
          400,
        );
      }
      for (const identifier of [" NEW@EXAMPLE.TEST ", " REVIEW_USER "]) {
        const result = await login(identifier);
        assert.equal(result.status, 200);
        assert.equal(result.body.user.id, a.body.user.id);
      }
      for (const identifier of [
        "review_user",
        "new@example.test",
        "unknown_user",
        "' OR 1=1 --",
      ]) {
        const denied = await login(identifier, "wrong-password");
        assert.equal(denied.status, 401);
        assert.equal(denied.cookie, undefined);
      }
      assert.equal((await update("new_legacy", "")).status, 401);
      assert.equal(
        (await update("new_legacy", legacyCookie, "incorrect")).status,
        401,
      );
      assert.equal((await update("review_user")).status, 409);
      assert.equal((await update("not@username")).status, 400);
      const updated = await update("Legacy_Name");
      assert.equal(updated.status, 200);
      assert.equal(updated.body.user.username, "legacy_name");
      assert.equal((await login("LEGACY_NAME")).body.user.id, "legacy");
      assert.equal(
        (await request("/auth/me", "GET", undefined, a.cookie)).body.user
          .username,
        "review_user",
      );
      assert.equal((await update("renamed_user")).status, 200);
      assert.equal((await login("legacy_name")).status, 401);
      assert.equal((await login("renamed_user")).body.user.id, "legacy");
      const concurrent = await Promise.all([
        signup("race1@example.test", "race_user"),
        signup("race2@example.test", "RACE_USER"),
      ]);
      assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
      await stop();
      await start();
      const idOnly = await signup(undefined, "id_only_user");
      assert.equal(idOnly.status, 201);
      assert.equal(idOnly.body.user.email, null);
      assert.equal(
        (await login("ID_ONLY_USER")).body.user.id,
        idOnly.body.user.id,
      );
      assert.equal((await signup(undefined, "id_only_other")).status, 201);
      const emailOnly = await signup("emailonly@example.test", undefined);
      assert.equal(emailOnly.status, 201);
      assert.equal(emailOnly.body.user.username, null);
      assert.equal(
        (await login("EMAILONLY@example.test")).body.user.id,
        emailOnly.body.user.id,
      );
      assert.equal((await signup(undefined, undefined)).status, 400);
      assert.equal((await signup(undefined, "ID_ONLY_USER")).status, 409);
      assert.equal((await login("renamed_user")).body.user.id, "legacy");
      assert.equal((await login("legacy@example.test")).body.user.id, "legacy");
      assert.equal(
        (await request("/auth/me", "GET", undefined, legacyCookie)).body.user
          .username,
        "renamed_user",
      );
      const stored = new DatabaseSync(database, { readOnly: true });
      assert.deepEqual(stored.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(
        stored.prepare("SELECT data FROM reviews WHERE id='old-review'").get()
          .data,
        oldReview,
      );
      assert.equal(
        stored
          .prepare(
            "SELECT COUNT(*) AS count FROM users WHERE username='race_user'",
          )
          .get().count,
        1,
      );
      stored.close();
    } finally {
      await stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
