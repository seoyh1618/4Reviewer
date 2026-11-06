import { randomBytes } from "node:crypto";
import { hashToken, lockedUser } from "./credentials.mjs";
import { recordMemberActivity } from "./member-activity.mjs";
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
  ...(u.is_admin ? { isAdmin: true } : {}),
});

export function sessionHandlers(db) {
  async function readSession(req, res, next) {
    const token = cookieToken(req);
    if (token) {
      const u = await db
        .prepare(
          "SELECT users.*, sessions.authenticated_at, sessions.auth_method, CASE WHEN admin_memberships.user_id IS NULL THEN 0 ELSE 1 END AS is_admin FROM sessions JOIN users ON users.id=sessions.user_id LEFT JOIN admin_memberships ON admin_memberships.user_id=users.id WHERE token=? AND expires_at>? AND users.is_demo=0",
        )
        .get(hashToken(token), Date.now());
      if (u) {
        req.user = u;
        if (req.path !== "/health" && !req.path.startsWith("/admin"))
          await recordMemberActivity(db, u.id);
      }
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
      await recordMemberActivity(db, user.id);
      user.is_admin = !!(await db
        .prepare("SELECT user_id FROM admin_memberships WHERE user_id=?")
        .get(user.id));
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
