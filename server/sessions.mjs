import { randomBytes } from "node:crypto";
import { hashToken, lockedUser } from "./credentials.mjs";
export function cookieToken(req) {
  const c = (req.headers.cookie || "")
    .split(";")
    .find((c) => c.trim().startsWith("reviewer_session="));
  return c ? c.trim().slice("reviewer_session=".length) : "";
}
export const publicUser = (u) => ({
  id: u.id,
  email: u.email || null,
  username: u.username || null,
});

export function sessionHandlers(db) {
  async function readSession(req, res, next) {
    const token = cookieToken(req);
    if (token) {
      const u = await db
        .prepare(
          "SELECT users.*, sessions.authenticated_at, sessions.auth_method FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>? AND users.is_demo=0",
        )
        .get(hashToken(token), Date.now());
      if (u) req.user = u;
    }
    next();
  }
  async function setSession(req, res, user, authMethod = "password") {
    const old = cookieToken(req);
    const token = randomBytes(32).toString("hex");
    const persistent = req.body?.remember !== false;
    const ttl = persistent ? 7 * 86400000 : 86400000;
    const created = await db.transaction(async () => {
      const current = await lockedUser(db, user.id);
      if (!current || current.password !== user.password) return false;
      if (old)
        await db
          .prepare("DELETE FROM sessions WHERE token=?")
          .run(hashToken(old));
      await db
        .prepare(
          "INSERT INTO sessions (token,user_id,expires_at,authenticated_at,auth_method) VALUES (?,?,?,?,?)",
        )
        .run(
          hashToken(token),
          user.id,
          Date.now() + ttl,
          Date.now(),
          authMethod,
        );
      return true;
    });
    if (!created) return false;
    res.cookie("reviewer_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      ...(persistent ? { maxAge: ttl } : {}),
      path: "/",
    });
    return true;
  }
  return { readSession, setSession };
}
