import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
const dummySalt = randomBytes(16).toString("hex");
const dummyKey = randomBytes(64);
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export async function hashSecret(value) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(value, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}
export async function secretMatches(value, stored) {
  const parts = stored?.split(":");
  const valid =
    parts?.length === 2 &&
    /^[a-f0-9]{32}$/.test(parts[0]) &&
    /^[a-f0-9]{128}$/.test(parts[1]);
  const key = await derive(value, valid ? parts[0] : dummySalt, 64);
  return (
    timingSafeEqual(key, valid ? Buffer.from(parts[1], "hex") : dummyKey) &&
    !!valid
  );
}
export const passwordMatches = (password, user) =>
  secretMatches(password, user?.password);
// Password reset, recovery changes and login session creation share this lock.
export const lockedUser = (db, id) =>
  db
    .prepare(
      `SELECT * FROM users WHERE id=? AND is_demo=0${db.dialect === "postgres" ? " FOR UPDATE" : ""}`,
    )
    .get(id);
