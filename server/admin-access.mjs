// Database-operator tool. Read JSON from stdin, never passwords from argv.
import { randomUUID } from "node:crypto";
import { openDatabase } from "./database.mjs";
import { hashSecret, passwordMatches } from "./credentials.mjs";
import { usernamePattern, passwordMinLength } from "../shared/auth.mjs";
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 4096) throw new Error("Input too large");
}
const { username, password, action = "grant" } = JSON.parse(input);
if (
  typeof username !== "string" ||
  !new RegExp(`^${usernamePattern}$`).test(username) ||
  username !== username.toLowerCase() ||
  username === "demo" ||
  !["grant", "revoke"].includes(action)
)
  throw new Error("Invalid administrator account");
if (
  action === "grant" &&
  (typeof password !== "string" ||
    password.length < passwordMinLength ||
    password.length > 128)
)
  throw new Error("Invalid password length");
const db = await openDatabase();
try {
  const result = await db.transaction(async () => {
    let user = await db
      .prepare(
        `SELECT * FROM users WHERE lower(username)=?${db.dialect === "postgres" ? " FOR UPDATE" : ""}`,
      )
      .get(username);
    if (action === "revoke") {
      if (user)
        await db
          .prepare("DELETE FROM admin_memberships WHERE user_id=?")
          .run(user.id);
      return { action, username };
    }
    if (user && (user.is_demo || !(await passwordMatches(password, user))))
      throw new Error(
        "Existing account credentials do not match; no changes made",
      );
    const created = !user;
    const stamp = new Date().toISOString();
    if (!user) {
      user = { id: randomUUID() };
      await db
        .prepare(
          "INSERT INTO users(id,username,name,password,created_at) VALUES(?,?,?,?,?)",
        )
        .run(user.id, username, "", await hashSecret(password), stamp);
    }
    await db
      .prepare(
        "INSERT INTO admin_memberships(user_id,granted_at,granted_by) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING",
      )
      .run(user.id, stamp, "database-operator");
    return { action, username, created, userId: user.id };
  });
  console.log(JSON.stringify(result));
} finally {
  await db.close();
}
