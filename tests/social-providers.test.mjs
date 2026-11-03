import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import {
  authorizationUrl,
  exchangeIdentity,
  socialConfig,
} from "../server/social-providers.mjs";

const config = {
  id: "test-client",
  secret: "test-secret",
  redirectUri: "https://example.test/api/auth/social/google/callback",
};
const flow = { verifier: "one-time-pkce-verifier", nonce: "one-time-nonce" };
test("social configuration requires explicit safe origin and both server credentials", () => {
  for (const origin of [
    "",
    "https://evil.test/path",
    "https://u:p@example.test",
    "http://example.test",
    "https://example.test/#fragment",
  ])
    assert.deepEqual(
      socialConfig({
        APP_ORIGIN: origin,
        GOOGLE_CLIENT_ID: "a",
        GOOGLE_CLIENT_SECRET: "b",
      }),
      {},
    );
  assert.equal(
    socialConfig({
      APP_ORIGIN: "https://example.test",
      GOOGLE_CLIENT_ID: "a",
      GOOGLE_CLIENT_SECRET: "b",
    }).google.redirectUri,
    config.redirectUri,
  );
  assert.deepEqual(
    socialConfig({ APP_ORIGIN: "https://example.test", GOOGLE_CLIENT_ID: "a" }),
    {},
  );
});
test("authorization uses fixed destinations, state and supported PKCE without client secrets", () => {
  for (const provider of ["google", "kakao", "naver"]) {
    const url = new URL(authorizationUrl(provider, config, flow, "state"));
    assert.equal(url.protocol, "https:");
    assert.equal(url.searchParams.get("state"), "state");
    assert.equal(url.searchParams.get("client_secret"), null);
    assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
    assert.equal(
      url.searchParams.get("code_challenge_method"),
      provider === "naver" ? null : "S256",
    );
    if (provider === "google") {
      assert.equal(url.searchParams.get("scope"), "openid");
      assert.equal(url.searchParams.get("nonce"), flow.nonce);
    }
  }
});
test("Google rejects invalid signatures, audience, issuer, expiry and nonce", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const sign = (payload = {}) =>
    new SignJWT({ sub: "stable-id", nonce: flow.nonce, ...payload })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(payload.iss || "https://accounts.google.com")
      .setAudience(payload.aud || config.id)
      .setIssuedAt()
      .setExpirationTime(payload.exp || "5m")
      .sign(privateKey);
  let token = await sign();
  const fetcher = async (url, options) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("client_secret"), config.secret);
    assert.equal(options.body.get("code_verifier"), flow.verifier);
    assert.equal(options.redirect, "error");
    return Response.json({ id_token: token });
  };
  const run = () =>
    exchangeIdentity("google", config, flow, "code", "state", {
      fetcher,
      keys: publicKey,
    });
  assert.equal(await run(), "stable-id");
  for (const payload of [
    { aud: "other-app" },
    { iss: "https://attacker.test" },
    { nonce: "wrong" },
    { sub: "" },
    { exp: 1 },
    { azp: "other-app" },
  ]) {
    token = await sign(payload);
    await assert.rejects(run);
  }
  const other = await generateKeyPair("RS256");
  token = await sign();
  await assert.rejects(() =>
    exchangeIdentity("google", config, flow, "code", "state", {
      fetcher,
      keys: other.publicKey,
    }),
  );
});
test("Kakao and Naver identify users without requiring optional email or profile fields", async () => {
  for (const provider of ["kakao", "naver"]) {
    let calls = 0;
    const fetcher = async (url, options) => {
      calls++;
      if (calls === 1) {
        assert.equal(options.body.get("code"), "code");
        assert.equal(options.body.get("client_secret"), config.secret);
        if (provider === "naver")
          assert.equal(options.body.get("state"), "state");
        return Response.json({ access_token: "private-token" });
      }
      assert.equal(options.headers.Authorization, "Bearer private-token");
      return Response.json(
        provider === "kakao"
          ? { id: 123456 }
          : { resultcode: "00", response: { id: "naver-stable-id" } },
      );
    };
    assert.equal(
      await exchangeIdentity(provider, config, flow, "code", "state", {
        fetcher,
      }),
      provider === "kakao" ? "123456" : "naver-stable-id",
    );
    await assert.rejects(() =>
      exchangeIdentity(provider, config, flow, "code", "state", {
        fetcher: async () => Response.json({ error: "denied" }),
      }),
    );
  }
});
