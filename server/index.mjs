import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { openDatabase } from "./database.mjs";
import {
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { reviewSchema, normalizeReview } from "../shared/domain.mjs";
import { registerTemplateRoutes } from "./templates.mjs";
import {
  usernamePattern,
  usernameHelp,
  passwordMinLength,
  passwordHelp,
} from "../shared/auth.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = await openDatabase();
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const scryptAsync = promisify(scrypt);
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        workerSrc: ["'self'", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        upgradeInsecureRequests:
          process.env.COOKIE_SECURE === "true" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: process.env.COOKIE_SECURE === "true",
  }),
);
app.use(express.json({ limit: "64kb" }));
app.use("/api", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const allowed = process.env.APP_ORIGIN;
    if (
      req.get("sec-fetch-site") === "cross-site" ||
      (origin &&
        (allowed
          ? origin !== allowed
          : new URL(origin).host !== req.get("host")))
    )
      return res.status(403).json({ error: "허용되지 않은 요청입니다." });
    if (!req.is("application/json"))
      return res.status(415).json({ error: "JSON 요청이 필요합니다." });
  }
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: Number(process.env.API_RATE_LIMIT || 300),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." },
  }),
);
app.use(
  ["/api/auth/login", "/api/auth/signup", "/api/auth/username"],
  rateLimit({
    windowMs: 15 * 60000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "로그인 시도가 많습니다. 15분 후 다시 시도해 주세요." },
  }),
);
function cookieToken(req) {
  const c = (req.headers.cookie || "")
    .split(";")
    .find((c) => c.trim().startsWith("reviewer_session="));
  return c ? c.trim().slice("reviewer_session=".length) : "";
}
const publicUser = (u) => ({
  id: u.id,
  email: u.email || null,
  username: u.username || null,
});
app.use("/api", async (req, res, next) => {
  const token = cookieToken(req);
  if (token) {
    const u = await db
      .prepare(
        "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>? AND users.is_demo=0",
      )
      .get(hashToken(token), Date.now());
    if (u) req.user = u;
  }
  next();
});
async function setSession(req, res, user) {
  const old = cookieToken(req);
  if (old)
    await db.prepare("DELETE FROM sessions WHERE token=?").run(hashToken(old));
  const token = randomBytes(32).toString("hex");
  const persistent = req.body?.remember !== false;
  const ttl = persistent ? 7 * 86400000 : 86400000;
  await db
    .prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)")
    .run(hashToken(token), user.id, Date.now() + ttl);
  res.cookie("reviewer_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    ...(persistent ? { maxAge: ttl } : {}),
    path: "/",
  });
}
const usernameSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^${usernamePattern}$`), usernameHelp)
  .transform((v) => v.toLowerCase());
const credentialSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
    username: usernameSchema.optional(),
    password: z.string().min(passwordMinLength, passwordHelp).max(128),
  })
  .refine((value) => value.email || value.username, {
    message: "이메일 또는 아이디를 입력해 주세요.",
  });
const uniqueViolation = (error) =>
  error.code === "23505" ||
  error.code?.startsWith("ERR_SQLITE_CONSTRAINT") ||
  [1555, 2067].includes(error.errcode);
app.post("/api/auth/signup", async (req, res) => {
  if (req.body?.signupCode !== (process.env.SIGNUP_CODE || "3333"))
    return res
      .status(403)
      .json({ error: "회원가입 코드가 올바르지 않습니다." });
  const parsed = credentialSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: parsed.error.issues.some((issue) => issue.path[0] === "username")
        ? `아이디는 ${usernameHelp}`
        : parsed.error.issues.some((issue) => issue.path[0] === "password")
          ? `비밀번호는 ${passwordMinLength}~128자로 입력해 주세요.`
          : "올바른 이메일 또는 아이디를 입력해 주세요.",
    });
  const { email = null, password, username = null } = parsed.data;
  if (
    email &&
    (await db.prepare("SELECT id FROM users WHERE email=?").get(email))
  )
    return res.status(409).json({
      error: "가입할 수 없는 이메일입니다. 기존 계정으로 로그인해 주세요.",
    });
  if (
    username &&
    (await db
      .prepare("SELECT id FROM users WHERE lower(username)=?")
      .get(username))
  )
    return res.status(409).json({
      error: "이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.",
    });
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64);
  const user = { id: randomUUID(), email, username };
  try {
    await db
      .prepare(
        "INSERT INTO users (id,email,username,name,password,is_demo,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        user.id,
        email,
        username,
        "",
        `${salt}:${key.toString("hex")}`,
        0,
        new Date().toISOString(),
      );
  } catch (e) {
    if (uniqueViolation(e))
      return res
        .status(409)
        .json({ error: "이미 사용 중인 이메일 또는 아이디입니다." });
    throw e;
  }
  await setSession(req, res, user);
  res.status(201).json({ user: publicUser(user) });
});
const dummySalt = randomBytes(16).toString("hex");
const dummyKey = randomBytes(64);
async function passwordMatches(password, user) {
  const [salt, key] = user
    ? user.password.split(":")
    : [dummySalt, dummyKey.toString("hex")];
  const submitted = await scryptAsync(password, salt, 64);
  return timingSafeEqual(submitted, Buffer.from(key, "hex")) && !!user;
}
const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
app.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse({
    ...req.body,
    identifier: req.body?.identifier ?? req.body?.email,
  });
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "이메일 또는 아이디와 비밀번호를 확인해 주세요." });
  const { identifier, password } = parsed.data;
  const user = await db
    .prepare(
      identifier.includes("@")
        ? "SELECT * FROM users WHERE email=? AND is_demo=0"
        : "SELECT * FROM users WHERE lower(username)=? AND is_demo=0",
    )
    .get(identifier);
  if (!(await passwordMatches(password, user)))
    return res.status(401).json({
      error:
        "로그인 정보가 일치하지 않습니다. 이메일 또는 아이디와 비밀번호를 확인해 주세요.",
    });
  await setSession(req, res, user);
  res.json({ user: publicUser(user) });
});
app.post("/api/auth/logout", async (req, res) => {
  await db
    .prepare("DELETE FROM sessions WHERE token=?")
    .run(hashToken(cookieToken(req)));
  res.clearCookie("reviewer_session", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
  });
  res.json({ ok: true });
});
app.get("/api/auth/me", async (req, res) =>
  res.json({ user: req.user ? publicUser(req.user) : null }),
);
app.patch("/api/auth/username", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "로그인이 필요합니다." });
  const parsed = z
    .object({
      username: usernameSchema,
      currentPassword: z.string().min(1).max(128),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "아이디 형식과 현재 비밀번호를 확인해 주세요." });
  if (!(await passwordMatches(parsed.data.currentPassword, req.user)))
    return res
      .status(401)
      .json({ error: "현재 비밀번호가 일치하지 않습니다." });
  try {
    await db
      .prepare("UPDATE users SET username=? WHERE id=?")
      .run(parsed.data.username, req.user.id);
  } catch (error) {
    if (uniqueViolation(error))
      return res.status(409).json({
        error: "이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.",
      });
    throw error;
  }
  res.json({
    user: publicUser({ ...req.user, username: parsed.data.username }),
  });
});
app.use("/api/auth", async (_req, res) =>
  res.status(404).json({ error: "요청한 기능을 찾을 수 없습니다." }),
);
app.get("/api/health", async (_req, res) => {
  await db.prepare("SELECT 1 AS ready").get();
  res.json({
    ok: true,
    database: db.dialect,
    revision: process.env.APP_REVISION || "local",
  });
});
app.use("/api", async (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: "로그인이 필요합니다." }),
);
registerTemplateRoutes(app, db);
function decode(row) {
  return {
    ...normalizeReview(JSON.parse(row.data)),
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}
async function record(userId, id, label, amount = 0) {
  await db
    .prepare(
      "INSERT INTO activities (id,user_id,review_id,label,amount,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(randomUUID(), userId, id, label, amount, new Date().toISOString());
}
app.get("/api/reviews", async (req, res) =>
  res.json({
    reviews: (
      await db
        .prepare(
          "SELECT * FROM reviews WHERE user_id=? ORDER BY created_at DESC, rowid DESC",
        )
        .all(req.user.id)
    ).map(decode),
    activities: await db
      .prepare(
        'SELECT id,review_id AS "reviewId",label,amount,created_at AS "createdAt" FROM activities WHERE user_id=? ORDER BY created_at DESC LIMIT 100',
      )
      .all(req.user.id),
    payments: await db
      .prepare(
        'SELECT review_id AS "reviewId",amount,paid_at AS "paidAt" FROM payments WHERE user_id=?',
      )
      .all(req.user.id),
  }),
);
app.post("/api/reviews", async (req, res) => {
  const p = reviewSchema.safeParse(req.body);
  if (!p.success)
    return res.status(400).json({ error: p.error.issues[0].message });
  if (!p.data.shippingMethod)
    return res.status(400).json({ error: "리뷰 타입을 선택해 주세요." });
  const item = p.data,
    id = randomUUID(),
    stamp = new Date().toISOString();
  await db.transaction(async () => {
    await db
      .prepare(
        "INSERT INTO reviews (id,user_id,data,created_at,updated_at,version) VALUES(?,?,?,?,?,1)",
      )
      .run(id, req.user.id, JSON.stringify(item), stamp, stamp);
    await record(req.user.id, id, `${item.name} 등록`);
    if (item.receivedAmount)
      await db
        .prepare(
          "INSERT INTO payments (id,user_id,review_id,amount,paid_at) VALUES(?,?,?,?,?)",
        )
        .run(randomUUID(), req.user.id, id, item.receivedAmount, item.paidAt);
  });
  res.status(201).json({
    review: { ...item, id, createdAt: stamp, updatedAt: stamp, version: 1 },
  });
});
app.put("/api/reviews/:id", async (req, res) => {
  const row = await db
    .prepare("SELECT * FROM reviews WHERE id=? AND user_id=?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "상품을 찾을 수 없습니다." });
  if (req.body.version !== row.version)
    return res.status(409).json({
      error: "다른 화면에서 변경된 상품입니다. 새로고침 후 다시 확인해 주세요.",
    });
  const old = JSON.parse(row.data);
  const current = normalizeReview(old);
  const p = reviewSchema.safeParse({
    ...req.body,
    expectedPayback:
      req.body.expectedPayback === undefined
        ? current.expectedPayback
        : req.body.expectedPayback,
    additionalReviewFee:
      req.body.additionalReviewFee === undefined
        ? (old.additionalReviewFee ?? 0)
        : req.body.additionalReviewFee,
  });
  if (!p.success)
    return res.status(400).json({ error: p.error.issues[0].message });
  const item = p.data,
    stamp = new Date().toISOString();
  await db.transaction(async () => {
    const updated = await db
      .prepare(
        "UPDATE reviews SET data=?,updated_at=?,version=version+1 WHERE id=? AND user_id=? AND version=?",
      )
      .run(
        JSON.stringify({
          ...item,
          // Keep historic costs in storage only; they are no longer exposed or totaled.
          ...(old.extraFee !== undefined ? { extraFee: old.extraFee } : {}),
        }),
        stamp,
        row.id,
        req.user.id,
        row.version,
      );
    if (!updated.changes)
      throw Object.assign(new Error("concurrent review update"), {
        status: 409,
      });
    const delta = item.receivedAmount - old.receivedAmount;
    if (delta || item.paidAt !== old.paidAt) {
      // A reduction or date correction explicitly rebases the balance to its corrected date.
      if (delta < 0 || (delta === 0 && item.paidAt !== old.paidAt)) {
        await db
          .prepare("DELETE FROM payments WHERE review_id=? AND user_id=?")
          .run(row.id, req.user.id);
        if (item.receivedAmount)
          await db
            .prepare(
              "INSERT INTO payments (id,user_id,review_id,amount,paid_at) VALUES(?,?,?,?,?)",
            )
            .run(
              randomUUID(),
              req.user.id,
              row.id,
              item.receivedAmount,
              item.paidAt,
            );
      } else if (delta > 0)
        await db
          .prepare(
            "INSERT INTO payments (id,user_id,review_id,amount,paid_at) VALUES(?,?,?,?,?)",
          )
          .run(randomUUID(), req.user.id, row.id, delta, item.paidAt);
      await record(
        req.user.id,
        row.id,
        `${item.name} 입금 ${delta < 0 ? "정정" : "기록"}`,
        delta,
      );
    } else
      await record(
        req.user.id,
        row.id,
        `${item.name} ${old.reviewStatus !== item.reviewStatus ? (item.reviewStatus === "done" ? "리뷰 완료" : "리뷰 대기로 변경") : "수정"}`,
      );
  });
  res.json({
    review: {
      ...item,
      id: row.id,
      createdAt: row.created_at,
      updatedAt: stamp,
      version: row.version + 1,
    },
    payments: await db
      .prepare(
        'SELECT review_id AS "reviewId",amount,paid_at AS "paidAt" FROM payments WHERE review_id=? AND user_id=?',
      )
      .all(row.id, req.user.id),
  });
});
app.delete("/api/reviews/:id", async (req, res) => {
  const row = await db
    .prepare("SELECT * FROM reviews WHERE id=? AND user_id=?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "상품을 찾을 수 없습니다." });
  if (req.body.version !== row.version)
    return res.status(409).json({
      error: "상품이 변경되었습니다. 새로고침 후 다시 시도해 주세요.",
    });
  await db.transaction(async () => {
    const deleted = await db
      .prepare("DELETE FROM reviews WHERE id=? AND user_id=? AND version=?")
      .run(row.id, req.user.id, row.version);
    if (!deleted.changes)
      throw Object.assign(new Error("concurrent review delete"), {
        status: 409,
      });
    await record(req.user.id, row.id, `${JSON.parse(row.data).name} 삭제`);
  });
  res.json({ ok: true });
});
app.use("/api", async (_req, res) =>
  res.status(404).json({ error: "요청한 기능을 찾을 수 없습니다." }),
);
if (process.env.NODE_ENV === "production") {
  app.use(
    express.static(path.join(root, "dist"), {
      setHeaders(res, file) {
        if (file.endsWith(".html")) res.set("Cache-Control", "no-store");
      },
    }),
  );
  // Missing worker/modules must fail as assets, never return the SPA HTML.
  app.use(["/assets", "/ocr"], async (_req, res) => res.status(404).end());
  app.get("/{*path}", async (_req, res) =>
    res
      .set("Cache-Control", "no-store")
      .sendFile(path.join(root, "dist/index.html")),
  );
}
app.use((err, _req, res, _next) => {
  const conflict =
    err.status === 409 ||
    err.code === "23505" ||
    err.code?.startsWith("ERR_SQLITE_CONSTRAINT_UNIQUE");
  const status = conflict ? 409 : err.status === 400 ? 400 : 500;
  if (status === 500) console.error("Request failed:", err.code || err.name);
  res.status(status).json({
    error:
      status === 409
        ? "다른 화면에서 변경되었거나 이미 등록된 정보입니다. 새로고침 후 확인해 주세요."
        : status === 400
          ? "요청 내용을 확인해 주세요."
          : "저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  });
});
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`4Reviewer API ready on ${port}`),
);
const sessionCleanup = setInterval(() => {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?")
    .run(Date.now())
    .catch(() => console.error("Session cleanup failed"));
}, 3600000).unref();
function stop() {
  clearInterval(sessionCleanup);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
