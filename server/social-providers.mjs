import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash } from "node:crypto";

export const providerNames = {
  google: "Google",
  kakao: "카카오",
  naver: "네이버",
};
const endpoints = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
  },
  kakao: {
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    profile: "https://kapi.kakao.com/v2/user/me",
  },
  naver: {
    authorize: "https://nid.naver.com/oauth2.0/authorize",
    token: "https://nid.naver.com/oauth2.0/token",
    profile: "https://openapi.naver.com/v1/nid/me",
  },
};
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: 8000 },
);
export function socialConfig(env = process.env) {
  let origin;
  try {
    const url = new URL(env.APP_ORIGIN);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return {};
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      return {};
    origin = url.origin;
  } catch {
    return {};
  }
  return Object.fromEntries(
    Object.keys(providerNames).flatMap((provider) => {
      const prefix = provider.toUpperCase();
      const id = env[`${prefix}_CLIENT_ID`]?.trim();
      const secret = env[`${prefix}_CLIENT_SECRET`]?.trim();
      return id && secret
        ? [
            [
              provider,
              {
                id,
                secret,
                redirectUri: `${origin}/api/auth/social/${provider}/callback`,
              },
            ],
          ]
        : [];
    }),
  );
}
export function authorizationUrl(provider, config, flow, state) {
  const url = new URL(endpoints[provider].authorize);
  const params = {
    client_id: config.id,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
  };
  if (provider === "google")
    Object.assign(params, {
      scope: "openid",
      nonce: flow.nonce,
      prompt: "select_account",
    });
  if (provider !== "naver")
    Object.assign(params, {
      code_challenge_method: "S256",
      code_challenge: createHash("sha256")
        .update(flow.verifier)
        .digest("base64url"),
    });
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return url.href;
}
// Dependencies are injected by unit tests, never from request data or environment URLs.
export async function exchangeIdentity(
  provider,
  config,
  flow,
  code,
  state,
  { fetcher = fetch, keys = googleKeys } = {},
) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.id,
    client_secret: config.secret,
    redirect_uri: config.redirectUri,
    code,
  });
  if (provider !== "naver") params.set("code_verifier", flow.verifier);
  if (provider === "naver") params.set("state", state);
  const read = async (url, options) => {
    const response = await fetcher(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Provider rejected request");
    const body = await response.json();
    if (!body || typeof body !== "object" || body.error)
      throw new Error("Provider rejected response");
    return body;
  };
  const token = await read(endpoints[provider].token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params,
  });
  let subject;
  if (provider === "google") {
    const { payload } = await jwtVerify(token.id_token, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: config.id,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "nonce"],
      maxTokenAge: "10m",
      clockTolerance: 10,
    });
    if (
      payload.nonce !== flow.nonce ||
      (payload.azp && payload.azp !== config.id) ||
      (Array.isArray(payload.aud) &&
        payload.aud.length > 1 &&
        payload.azp !== config.id)
    )
      throw new Error("Identity mismatch");
    subject = payload.sub;
  } else {
    if (typeof token.access_token !== "string" || !token.access_token)
      throw new Error("Missing token");
    const profile = await read(endpoints[provider].profile, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/json",
      },
    });
    if (provider === "kakao") {
      if (!Number.isSafeInteger(profile.id) || profile.id <= 0)
        throw new Error("Invalid identity");
      subject = String(profile.id);
    } else {
      if (profile.resultcode !== "00") throw new Error("Invalid identity");
      subject = profile.response?.id;
    }
  }
  if (typeof subject !== "string" || !subject || subject.length > 255)
    throw new Error("Missing identity");
  return subject;
}
