import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

export function schemaName() {
  const name = process.env.PGSCHEMA || "reviewer";
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error("Invalid PGSCHEMA");
  return name;
}
export function postgresPool() {
  return new pg.Pool({
    ...(process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {}),
    options: `-c search_path=${schemaName()},pg_catalog`,
    max: 8,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    types: {
      getTypeParser: (oid, format) =>
        [114, 3802].includes(oid)
          ? (value) => value
          : oid === 20
            ? Number
            : pg.types.getTypeParser(oid, format),
    },
  });
}
// All application SQL is static; values always use bind parameters.
const postgresSql = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};
export async function openDatabase() {
  const context = new AsyncLocalStorage();
  const postgres = !!(process.env.DATABASE_URL || process.env.PGHOST);
  let pool, sqlite;
  let queue = Promise.resolve();
  const serialize = (fn) => {
    const next = queue.then(fn);
    queue = next.catch(() => {});
    return next;
  };
  if (postgres) {
    pool = postgresPool();
    pool.on("error", (error) =>
      console.error("Database connection error:", error.code),
    );
    const migrated = await pool.query(
      "SELECT version FROM schema_migrations WHERE version=2",
    );
    if (!migrated.rowCount) {
      await pool.end();
      throw new Error("Database migration required: run server/migrate.mjs");
    }
  } else {
    const { DatabaseSync } = await import("node:sqlite");
    const file =
      process.env.DATABASE_PATH || path.resolve("data/reviewer.sqlite");
    mkdirSync(path.dirname(file), { recursive: true });
    sqlite = new DatabaseSync(file);
    sqlite.exec(readFileSync(new URL("./sqlite.sql", import.meta.url), "utf8"));
    // SQLite cannot drop NOT NULL in place. Preserve accounts and all references
    // while making room for accounts that sign up with only a username.
    sqlite.exec("PRAGMA foreign_keys=OFF");
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const columns = sqlite.prepare("PRAGMA table_info(users)").all();
      if (columns.find((column) => column.name === "email").notnull) {
        sqlite.exec(
          "CREATE TABLE users_identifiers (id TEXT PRIMARY KEY,email TEXT UNIQUE,username TEXT,name TEXT NOT NULL,password TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,CHECK(email IS NOT NULL OR username IS NOT NULL))",
        );
        sqlite.exec(
          columns.some((column) => column.name === "username")
            ? "INSERT INTO users_identifiers SELECT id,email,username,name,password,is_demo,created_at FROM users"
            : "INSERT INTO users_identifiers SELECT id,email,NULL,name,password,is_demo,created_at FROM users",
        );
        sqlite.exec(
          "DROP TABLE users; ALTER TABLE users_identifiers RENAME TO users",
        );
      } else if (!columns.some((column) => column.name === "username")) {
        sqlite.exec("ALTER TABLE users ADD COLUMN username TEXT");
      }
      sqlite.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(lower(username))",
      );
      if (sqlite.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("Account migration failed foreign-key validation");
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    } finally {
      sqlite.exec("PRAGMA foreign_keys=ON");
    }
  }
  const execute = (mode, sql, args) => {
    const active = context.getStore();
    if (postgres)
      return (active || pool)
        .query(postgresSql(sql), args)
        .then((r) =>
          mode === "get"
            ? r.rows[0]
            : mode === "all"
              ? r.rows
              : { changes: r.rowCount },
        );
    const run = () => sqlite.prepare(sql)[mode](...args);
    return active ? Promise.resolve().then(run) : serialize(run);
  };
  return {
    dialect: postgres ? "postgres" : "sqlite",
    prepare: (sql) =>
      Object.fromEntries(
        ["get", "all", "run"].map((mode) => [
          mode,
          (...args) => execute(mode, sql, args),
        ]),
      ),
    async transaction(fn) {
      if (context.getStore()) return fn();
      const run = async (client) => {
        const exec = (sql) => (postgres ? client.query(sql) : sqlite.exec(sql));
        await exec("BEGIN");
        try {
          const result = await context.run(client || true, fn);
          await exec("COMMIT");
          return result;
        } catch (error) {
          await exec("ROLLBACK");
          throw error;
        }
      };
      if (!postgres) return serialize(() => run(null));
      const client = await pool.connect();
      try {
        return await run(client);
      } finally {
        client.release();
      }
    },
    async close() {
      if (postgres) await pool.end();
      else {
        await queue;
        sqlite.close();
      }
    },
  };
}
