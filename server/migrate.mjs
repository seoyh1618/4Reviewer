import { readFile } from "node:fs/promises";
import { postgresPool, schemaName } from "./database.mjs";
const pool = postgresPool();
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(44001234)");
  const schema = schemaName();
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.query(
    `SET LOCAL search_path = "${schema}", pg_catalog, pg_temp`,
  );
  const existing = await client.query(
    "SELECT to_regclass('schema_migrations') AS name",
  );
  if (!existing.rows[0].name) {
    await client.query(
      await readFile(
        new URL("./migrations/001-initial.sql", import.meta.url),
        "utf8",
      ),
    );
  }
  const usernames = await client.query(
    "SELECT version FROM schema_migrations WHERE version=2",
  );
  if (!usernames.rowCount)
    await client.query(
      await readFile(
        new URL("./migrations/002-usernames.sql", import.meta.url),
        "utf8",
      ),
    );
  const history = await client.query(
    "SELECT version FROM schema_migrations WHERE version=3",
  );
  if (!history.rowCount)
    await client.query(
      await readFile(
        new URL("./migrations/003-review-history.sql", import.meta.url),
        "utf8",
      ),
    );
  await client.query("COMMIT");
  console.log("Database schema ready: version 3");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
