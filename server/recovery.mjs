import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { passwordMinLength } from "../shared/auth.mjs";
import {
  recoveryQuestions,
  normalizeAnswer,
  normalizeRecoveryCode,
} from "../shared/recovery.mjs";
import {
  hashSecret,
  hashToken,
  secretMatches,
  passwordMatches,
  lockedUser,
} from "./credentials.mjs";

const questionIds = recoveryQuestions.map((question) => question.id);
export const recoverySetupSchema = z
  .object({
    questionId: z.enum(questionIds),
    answer: z
      .string()
      .max(128)
      .transform(normalizeAnswer)
      .pipe(z.string().min(4).max(128)),
    answerConfirmation: z.string().max(128).transform(normalizeAnswer),
  })
  .refine((value) => value.answer === value.answerConfirmation);
export function validRecoveryAnswer(data, user, password) {
  return ![
    user.username,
    user.email,
    password,
    "1234",
    "123456",
    "password",
    "비밀번호",
    "모름",
    "없음",
  ]
    .filter(Boolean)
    .map(normalizeAnswer)
    .includes(data.answer);
}
const newCode = () =>
  randomBytes(16).toString("hex").toUpperCase().match(/.{4}/g).join("-");
const accountBucket = (id) => hashToken(`recovery:user:${id}`);
const failedVerification =
  "복구 정보를 확인할 수 없습니다. 입력 내용을 확인해 주세요. 반복해서 실패했다면 15분 후 다시 시도해 주세요.";
const failedReset =
  "재설정 시간이 지났거나 이미 사용된 요청입니다. 처음부터 다시 인증해 주세요.";
async function event(db, userId, kind) {
  await db
    .prepare(
      "INSERT INTO account_security_events(id,user_id,event_kind,created_at) VALUES(?,?,?,?)",
    )
    .run(randomUUID(), userId, kind, new Date().toISOString());
}
// Caller holds the user lock, or is creating this user in the same transaction.
export async function saveRecovery(db, userId, data) {
  const code = newCode();
  const answerHash = await hashSecret(data.answer);
  await db
    .prepare(
      `INSERT INTO account_recovery(user_id,question_id,answer_hash,code_hash,version,updated_at)
    VALUES(?,?,?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET question_id=excluded.question_id,
    answer_hash=excluded.answer_hash,code_hash=excluded.code_hash,version=account_recovery.version+1,updated_at=excluded.updated_at`,
    )
    .run(
      userId,
      data.questionId,
      answerHash,
      hashToken(normalizeRecoveryCode(code)),
      new Date().toISOString(),
    );
  await db.prepare("DELETE FROM recovery_tokens WHERE user_id=?").run(userId);
  await db
    .prepare("DELETE FROM recovery_attempts WHERE bucket=?")
    .run(accountBucket(userId));
  await event(db, userId, "recovery_setup");
  return code;
}
async function attempt(db, bucket) {
  const now = Date.now();
  await db
    .prepare("DELETE FROM recovery_attempts WHERE expires_at<=?")
    .run(now);
  const row = await db
    .prepare(
      `INSERT INTO recovery_attempts(bucket,attempts,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET attempts=recovery_attempts.attempts+1 RETURNING attempts`,
    )
    .get(bucket, now + 15 * 60000);
  return row.attempts <= 5;
}
export function registerRecoveryRoutes(app, db) {
  app.use(
    ["/api/auth/recovery", "/api/auth/recovery-settings"],
    rateLimit({
      windowMs: 15 * 60000,
      limit: 40,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "요청이 많습니다. 15분 후 다시 시도해 주세요." },
    }),
  );
  app.get("/api/auth/recovery-settings", async (req, res) => {
    if (!req.user)
      return res.status(401).json({ error: "로그인이 필요합니다." });
    const row = await db
      .prepare(
        "SELECT question_id,updated_at FROM account_recovery WHERE user_id=?",
      )
      .get(req.user.id);
    res.json({
      configured: !!row,
      questionId: row?.question_id || null,
      updatedAt: row?.updated_at || null,
    });
  });
  app.put("/api/auth/recovery-settings", async (req, res) => {
    if (!req.user)
      return res.status(401).json({ error: "로그인이 필요합니다." });
    const parsed = recoverySetupSchema.safeParse(req.body);
    const password = z
      .string()
      .min(1)
      .max(128)
      .safeParse(req.body?.currentPassword);
    if (!parsed.success || !password.success)
      return res
        .status(400)
        .json({
          error:
            "질문을 선택하고 같은 답변을 4~128자로 두 번 입력해 주세요. 현재 비밀번호도 필요합니다.",
        });
    const result = await db.transaction(async () => {
      const user = await lockedUser(db, req.user.id);
      if (
        !user ||
        user.password !== req.user.password ||
        !(await passwordMatches(password.data, user))
      )
        return null;
      if (!validRecoveryAnswer(parsed.data, user, password.data))
        return { invalid: true };
      return { recoveryCode: await saveRecovery(db, user.id, parsed.data) };
    });
    if (!result)
      return res
        .status(401)
        .json({ error: "현재 비밀번호를 확인하거나 다시 로그인해 주세요." });
    if (result.invalid)
      return res
        .status(400)
        .json({
          error:
            "답변은 아이디·이메일·비밀번호와 다르게, 다른 사람이 추측하기 어려운 내용으로 입력해 주세요.",
        });
    res.json({ recoveryCode: result.recoveryCode });
  });
  const verifySchema = z.object({
    identifier: z
      .string()
      .trim()
      .min(1)
      .max(254)
      .transform((v) => v.toLowerCase()),
    questionId: z.enum(questionIds),
    answer: z.string().min(1).max(128).transform(normalizeAnswer),
    recoveryCode: z.string().min(1).max(100).transform(normalizeRecoveryCode),
  });
  app.post("/api/auth/recovery/verify", async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error: "계정, 인증 질문, 답변과 복구코드를 모두 입력해 주세요.",
        });
    const data = parsed.data;
    const token = await db.transaction(async () => {
      const found = await db
        .prepare(
          data.identifier.includes("@")
            ? "SELECT id FROM users WHERE email=? AND is_demo=0"
            : "SELECT id FROM users WHERE lower(username)=? AND is_demo=0",
        )
        .get(data.identifier);
      const user = found && (await lockedUser(db, found.id));
      const row =
        user &&
        (await db
          .prepare("SELECT * FROM account_recovery WHERE user_id=?")
          .get(user.id));
      const allowed = await attempt(
        db,
        user
          ? accountBucket(user.id)
          : hashToken(`recovery:unknown:${data.identifier}`),
      );
      const answerOK = await secretMatches(data.answer, row?.answer_hash);
      const codeOK = timingSafeEqual(
        Buffer.from(hashToken(data.recoveryCode), "hex"),
        Buffer.from(row?.code_hash || hashToken("dummy"), "hex"),
      );
      if (
        !allowed ||
        !row ||
        !answerOK ||
        !codeOK ||
        row.question_id !== data.questionId
      )
        return null;
      const token = randomBytes(32).toString("hex");
      await db
        .prepare("DELETE FROM recovery_tokens WHERE expires_at<=?")
        .run(Date.now());
      await db
        .prepare(
          "INSERT INTO recovery_tokens(token_hash,user_id,recovery_version,expires_at) VALUES(?,?,?,?)",
        )
        .run(hashToken(token), user.id, row.version, Date.now() + 10 * 60000);
      return token;
    });
    if (!token) return res.status(401).json({ error: failedVerification });
    res.json({ resetToken: token, expiresIn: 600 });
  });
  const resetSchema = z
    .object({
      resetToken: z.string().regex(/^[a-f0-9]{64}$/),
      password: z.string().min(passwordMinLength).max(128),
      passwordConfirmation: z.string().max(128),
    })
    .refine((value) => value.password === value.passwordConfirmation);
  app.post("/api/auth/recovery/reset", async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error: "새 비밀번호를 8~128자로 두 번 동일하게 입력해 주세요.",
        });
    const data = parsed.data;
    const code = await db.transaction(async () => {
      const tokenHash = hashToken(data.resetToken);
      const found = await db
        .prepare("SELECT user_id FROM recovery_tokens WHERE token_hash=?")
        .get(tokenHash);
      if (!found) return null;
      const user = await lockedUser(db, found.user_id);
      const token = await db
        .prepare("SELECT * FROM recovery_tokens WHERE token_hash=?")
        .get(tokenHash);
      const recovery =
        user &&
        (await db
          .prepare("SELECT version FROM account_recovery WHERE user_id=?")
          .get(user.id));
      if (
        !token ||
        !recovery ||
        token.expires_at <= Date.now() ||
        token.recovery_version !== recovery.version
      )
        return null;
      const code = newCode();
      await db
        .prepare("UPDATE users SET password=? WHERE id=?")
        .run(await hashSecret(data.password), user.id);
      await db
        .prepare(
          "UPDATE account_recovery SET code_hash=?,version=version+1,updated_at=? WHERE user_id=?",
        )
        .run(
          hashToken(normalizeRecoveryCode(code)),
          new Date().toISOString(),
          user.id,
        );
      await db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      await db
        .prepare("DELETE FROM recovery_tokens WHERE user_id=?")
        .run(user.id);
      await db
        .prepare("DELETE FROM recovery_attempts WHERE bucket=?")
        .run(accountBucket(user.id));
      await event(db, user.id, "password_reset");
      return code;
    });
    if (!code) return res.status(400).json({ error: failedReset });
    res.clearCookie("reviewer_session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
    });
    res.json({ recoveryCode: code });
  });
}
