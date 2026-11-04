import { randomBytes, randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  hashSecret,
  hashToken,
  lockedUser,
  passwordMatches,
} from "./credentials.mjs";
import {
  authorizationUrl,
  exchangeIdentity,
  providerNames,
  socialConfig,
} from "./social-providers.mjs";
import { usernamePattern, passwordMinLength } from "../shared/auth.mjs";

const lifetime = 10 * 60000;
const random = () => randomBytes(32).toString("base64url");
const cookie = (req, name) =>
  (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + "="))
    ?.slice(name.length + 1) || "";
const options = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "lax",
  path: "/",
});
const secureName = (name) =>
  `${process.env.COOKIE_SECURE === "true" ? "__Host-" : ""}${name}`;
const browserCookie = (provider) => secureName(`reviewer_oauth_${provider}`);
const fail = (status, message) => Object.assign(new Error(message), { status });
const unique = (error) =>
  error.code === "23505" ||
  [1555, 2067].includes(error.errcode) ||
  error.code?.startsWith("ERR_SQLITE_CONSTRAINT");

export function registerSocialRoutes(
  app,
  db,
  {
    setSession,
    cookieToken,
    publicUser,
    config = socialConfig(),
    exchange = exchangeIdentity,
    previewProviders = (process.env.SOCIAL_AUTH_PREVIEW_PROVIDERS || "")
      .split(",")
      .map((id) => id.trim()),
  },
) {
  // Display control for providers awaiting review; OAuth still verifies every login.
  const listedProviders = (req) =>
    Object.keys(config)
      .filter(
        (id) => !previewProviders.includes(id) || req.query.preview === id,
      )
      .map((id) => ({ id, name: providerNames[id] }));
  const audit = (userId, provider, event) =>
    db
      .prepare(
        "INSERT INTO social_auth_events(id,user_id,provider,event_kind,created_at) VALUES(?,?,?,?,?)",
      )
      .run(randomUUID(), userId, provider, event, new Date().toISOString());
  const sessionHash = (req) => hashToken(cookieToken(req));
  const guard = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error.status)
        return res.status(error.status).json({ error: error.message });
      if (unique(error))
        return res.status(409).json({
          error: "이미 사용 중인 아이디 또는 연결된 소셜 계정입니다.",
        });
      next(error);
    }
  };
  async function activeSession(req, user) {
    if (!user || user.password !== req.user?.password)
      throw fail(401, "다시 로그인해 주세요.");
    const session = await db
      .prepare(
        "SELECT * FROM sessions WHERE token=? AND user_id=? AND expires_at>?",
      )
      .get(sessionHash(req), user.id, Date.now());
    if (!session) throw fail(401, "다시 로그인해 주세요.");
    return session;
  }
  async function verifiedAccount(req, user, suppliedPassword) {
    const session = await activeSession(req, user);
    if (user.password) {
      if (
        typeof suppliedPassword !== "string" ||
        suppliedPassword.length > 128 ||
        !(await passwordMatches(suppliedPassword, user))
      )
        throw fail(401, "현재 비밀번호를 확인해 주세요.");
    } else {
      if (
        session.authenticated_at < Date.now() - lifetime ||
        !(await db
          .prepare(
            "SELECT id FROM social_identities WHERE user_id=? AND provider=?",
          )
          .get(user.id, session.auth_method))
      )
        throw fail(
          403,
          "연결된 소셜 계정으로 본인 확인 후 다시 시도해 주세요.",
        );
    }
  }
  const requireUser = (req) => {
    if (!req.user) throw fail(401, "로그인이 필요합니다.");
  };
  async function pending(req) {
    const token = cookie(req, secureName("reviewer_social_signup"));
    if (!token) return null;
    const flow = await db
      .prepare(
        "SELECT * FROM oauth_flows WHERE state_hash=? AND intent='signup' AND expires_at>?",
      )
      .get(hashToken(token), Date.now());
    return flow &&
      flow.browser_hash === hashToken(cookie(req, browserCookie(flow.provider)))
      ? flow
      : null;
  }

  app.use(
    "/api/auth/social",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (req) => req.method === "GET" && !req.path.endsWith("/callback"),
      message: { error: "시도가 많습니다. 잠시 후 다시 시도해 주세요." },
    }),
  );
  app.get("/api/auth/social/providers", (req, res) =>
    res.json({
      providers: listedProviders(req),
    }),
  );
  app.get(
    "/api/auth/social/accounts",
    guard(async (req, res) => {
      requireUser(req);
      const identities = await db
        .prepare(
          "SELECT provider,created_at FROM social_identities WHERE user_id=? ORDER BY created_at",
        )
        .all(req.user.id);
      res.json({
        hasPassword: !!req.user.password,
        providers: listedProviders(req),
        identities,
        recentAuthentication: req.user.authenticated_at > Date.now() - lifetime,
      });
    }),
  );
  app.get(
    "/api/auth/social/pending",
    guard(async (req, res) => {
      const flow = await pending(req);
      res.json({ provider: flow?.provider || null });
    }),
  );
  app.post(
    "/api/auth/social/cancel",
    guard(async (req, res) => {
      const flow = await pending(req);
      if (flow)
        await db
          .prepare("DELETE FROM oauth_flows WHERE state_hash=?")
          .run(flow.state_hash);
      res.clearCookie(secureName("reviewer_social_signup"), options());
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/auth/social/signup",
    guard(async (req, res) => {
      if (req.user)
        throw fail(
          409,
          "이미 로그인되어 있습니다. 계정 설정에서 소셜 계정을 연결해 주세요.",
        );
      const parsed = z
        .object({
          username: z
            .string()
            .trim()
            .regex(new RegExp(`^${usernamePattern}$`))
            .transform((v) => v.toLowerCase()),
        })
        .safeParse(req.body);
      if (!parsed.success)
        throw fail(400, "아이디는 영문, 숫자, 밑줄로 4~30자 입력해 주세요.");
      const user = await db.transaction(async () => {
        const flow = await pending(req);
        if (!flow)
          throw fail(
            400,
            "인증 시간이 만료되었습니다. 소셜 로그인을 다시 시작해 주세요.",
          );
        if (
          !(
            await db
              .prepare(
                "DELETE FROM oauth_flows WHERE state_hash=? AND intent='signup'",
              )
              .run(flow.state_hash)
          ).changes
        )
          throw fail(409, "이미 처리된 요청입니다.");
        const user = {
          id: randomUUID(),
          email: null,
          username: parsed.data.username,
          password: "",
        };
        await db
          .prepare(
            "INSERT INTO users(id,email,username,name,password,is_demo,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            user.id,
            null,
            user.username,
            "",
            "",
            0,
            new Date().toISOString(),
          );
        await db
          .prepare(
            "INSERT INTO social_identities(id,user_id,provider,subject,created_at,last_login_at) VALUES(?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            user.id,
            flow.provider,
            flow.subject,
            new Date().toISOString(),
            new Date().toISOString(),
          );
        await audit(user.id, flow.provider, "signup");
        req.body.remember = !!flow.remember;
        await setSession(req, res, user, flow.provider);
        return user;
      });
      res.clearCookie(secureName("reviewer_social_signup"), options());
      res.status(201).json({ user: publicUser(user) });
    }),
  );
  app.post(
    "/api/auth/social/password",
    guard(async (req, res) => {
      requireUser(req);
      const parsed = z
        .object({
          password: z.string().min(passwordMinLength).max(128),
          passwordConfirmation: z.string(),
        })
        .refine((v) => v.password === v.passwordConfirmation)
        .safeParse(req.body);
      if (!parsed.success)
        throw fail(400, "비밀번호를 8~128자로 두 번 동일하게 입력해 주세요.");
      const password = await hashSecret(parsed.data.password);
      await db.transaction(async () => {
        const user = await lockedUser(db, req.user.id);
        await verifiedAccount(req, user, req.body?.currentPassword);
        if (user.password)
          throw fail(409, "이미 비밀번호가 설정되어 있습니다.");
        await db
          .prepare("UPDATE users SET password=? WHERE id=?")
          .run(password, user.id);
        await db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
        await audit(user.id, req.user.auth_method, "password_setup");
        await setSession(req, res, { ...user, password }, "password");
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/auth/social/:provider/start",
    guard(async (req, res) => {
      const provider = req.params.provider;
      if (!Object.hasOwn(config, provider))
        throw fail(404, "사용할 수 없는 로그인 방식입니다.");
      const parsed = z
        .object({
          intent: z.enum(["login", "link", "reauth"]).default("login"),
          remember: z.boolean().default(true),
          currentPassword: z.string().max(128).optional(),
        })
        .safeParse(req.body || {});
      if (!parsed.success) throw fail(400, "요청을 확인해 주세요.");
      const { intent, remember, currentPassword } = parsed.data;
      if (intent === "login" && req.user)
        throw fail(409, "계정 설정에서 연결해 주세요.");
      const state = random(),
        binding = random();
      const flow = { provider, intent, verifier: random(), nonce: random() };
      await db.transaction(async () => {
        if (intent !== "login") {
          requireUser(req);
          const user = await lockedUser(db, req.user.id);
          if (intent === "link")
            await verifiedAccount(req, user, currentPassword);
          else {
            await activeSession(req, user);
            if (
              !(await db
                .prepare(
                  "SELECT id FROM social_identities WHERE user_id=? AND provider=?",
                )
                .get(user.id, provider))
            )
              throw fail(
                403,
                "현재 계정에 연결된 로그인 방식으로 확인해 주세요.",
              );
          }
        }
        await db
          .prepare("DELETE FROM oauth_flows WHERE expires_at<=?")
          .run(Date.now());
        await db
          .prepare(
            "INSERT INTO oauth_flows(state_hash,browser_hash,provider,intent,user_id,session_hash,verifier,nonce,remember,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            hashToken(state),
            hashToken(binding),
            provider,
            intent,
            req.user?.id || null,
            intent === "login" ? "" : sessionHash(req),
            flow.verifier,
            flow.nonce,
            remember ? 1 : 0,
            Date.now() + lifetime,
          );
      });
      res.cookie(browserCookie(provider), binding, {
        ...options(),
        maxAge: lifetime,
      });
      res.json({
        url: authorizationUrl(provider, config[provider], flow, state),
      });
    }),
  );
  app.get("/api/auth/social/:provider/callback", async (req, res) => {
    res.set("Referrer-Policy", "no-referrer");
    const provider = req.params.provider;
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    try {
      if (!Object.hasOwn(config, provider) || !state || state.length > 256)
        throw new Error("Invalid callback");
      const flow = await db.transaction(async () => {
        const found = await db
          .prepare(
            "SELECT * FROM oauth_flows WHERE state_hash=? AND provider=? AND intent<>'signup' AND expires_at>?",
          )
          .get(hashToken(state), provider, Date.now());
        if (
          !found ||
          found.browser_hash !== hashToken(cookie(req, browserCookie(provider)))
        )
          throw new Error("Invalid state");
        if (
          !(
            await db
              .prepare("DELETE FROM oauth_flows WHERE state_hash=?")
              .run(found.state_hash)
          ).changes
        )
          throw new Error("Replayed state");
        return found;
      });
      if (req.query.error || !code || code.length > 4096)
        return res.redirect(303, "/?social=cancelled");
      const subject = await exchange(
        provider,
        config[provider],
        flow,
        code,
        state,
      );
      const result = await db.transaction(async () => {
        if (flow.intent !== "login") {
          if (
            !req.user ||
            req.user.id !== flow.user_id ||
            sessionHash(req) !== flow.session_hash
          )
            throw new Error("Session changed");
          const user = await lockedUser(db, req.user.id);
          await activeSession(req, user);
          const identity = await db
            .prepare(
              "SELECT * FROM social_identities WHERE provider=? AND subject=?",
            )
            .get(provider, subject);
          if (flow.intent === "reauth") {
            if (identity?.user_id !== user.id)
              throw new Error("Identity mismatch");
            await db
              .prepare(
                "UPDATE sessions SET authenticated_at=?,auth_method=? WHERE token=?",
              )
              .run(Date.now(), provider, sessionHash(req));
          } else {
            if (identity && identity.user_id !== user.id)
              throw new Error("Identity already linked");
            if (!identity)
              await db
                .prepare(
                  "INSERT INTO social_identities(id,user_id,provider,subject,created_at) VALUES(?,?,?,?,?)",
                )
                .run(
                  randomUUID(),
                  user.id,
                  provider,
                  subject,
                  new Date().toISOString(),
                );
          }
          await audit(user.id, provider, flow.intent);
          return flow.intent === "reauth" ? "verified" : "linked";
        }
        if (req.user) throw new Error("Session changed");
        const identity = await db
          .prepare(
            "SELECT * FROM social_identities WHERE provider=? AND subject=?",
          )
          .get(provider, subject);
        if (identity) {
          const user = await lockedUser(db, identity.user_id);
          if (
            !user ||
            !(await db
              .prepare(
                "SELECT id FROM social_identities WHERE id=? AND user_id=?",
              )
              .get(identity.id, user.id))
          )
            throw new Error("Identity removed");
          req.body = { remember: !!flow.remember };
          if (!(await setSession(req, res, user, provider)))
            throw new Error("Session rejected");
          await db
            .prepare("UPDATE social_identities SET last_login_at=? WHERE id=?")
            .run(new Date().toISOString(), identity.id);
          await audit(user.id, provider, "login");
          return "logged_in";
        }
        const ticket = random();
        await db
          .prepare(
            "INSERT INTO oauth_flows(state_hash,browser_hash,provider,intent,user_id,session_hash,verifier,nonce,subject,remember,expires_at) VALUES(?,?,?,'signup',NULL,'','','',?,?,?)",
          )
          .run(
            hashToken(ticket),
            flow.browser_hash,
            provider,
            subject,
            flow.remember,
            Date.now() + lifetime,
          );
        res.cookie(secureName("reviewer_social_signup"), ticket, {
          ...options(),
          maxAge: lifetime,
        });
        return "signup";
      });
      res.redirect(303, `/?social=${result}`);
    } catch {
      res.redirect(303, "/?social=failed");
    }
  });
  app.delete(
    "/api/auth/social/:provider",
    guard(async (req, res) => {
      requireUser(req);
      const provider = req.params.provider;
      if (!Object.hasOwn(providerNames, provider))
        throw fail(404, "로그인 방식을 확인해 주세요.");
      await db.transaction(async () => {
        const user = await lockedUser(db, req.user.id);
        await verifiedAccount(req, user, req.body?.currentPassword);
        const identities = await db
          .prepare("SELECT provider FROM social_identities WHERE user_id=?")
          .all(user.id);
        if (!identities.some((v) => v.provider === provider))
          throw fail(404, "연결되지 않은 계정입니다.");
        if (!user.password && identities.length < 2)
          throw fail(
            409,
            "다른 로그인 수단을 먼저 연결하거나 비밀번호를 설정해 주세요.",
          );
        await db
          .prepare(
            "DELETE FROM social_identities WHERE user_id=? AND provider=?",
          )
          .run(user.id, provider);
        await db
          .prepare(
            "DELETE FROM sessions WHERE user_id=? AND auth_method=? AND token<>?",
          )
          .run(user.id, provider, sessionHash(req));
        await db
          .prepare("DELETE FROM oauth_flows WHERE user_id=?")
          .run(user.id);
        await audit(user.id, provider, "unlink");
      });
      res.json({ ok: true });
    }),
  );
}
