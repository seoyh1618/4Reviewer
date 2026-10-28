import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
const port = 3187,
  base = `http://127.0.0.1:${port}`;
const item = {
  name: "개인 상품",
  sku: "PRIVATE-001",
  purchaser: "테스트 계정주",
  contact: "test-contact",
  kakaoName: "테스트 카톡",
  platform: "쿠팡",
  price: 30000,
  platformOther: "",
  shippingMethod: "빈박스",
  expectedPayback: 30000,
  receivedAmount: 0,
  purchaseDate: "2026-09-25",
  dueDate: "2026-10-29",
  reviewType: "사진 리뷰",
  reviewStatus: "todo",
  paidAt: "",
};
test("authenticated persistence, ownership isolation, optimistic concurrency and payment ledger", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "for-reviewer-api-"));
  const dbPath = join(dir, "test.sqlite");
  let child;
  async function start() {
    child = spawn(process.execPath, ["server/index.mjs"], {
      env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath },
      stdio: "pipe",
    });
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(base + "/api/health");
        if (r.ok) return;
      } catch {}
      await delay(50);
    }
    throw new Error("API startup timed out");
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const p = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await p;
  }
  async function request(
    route,
    method = "GET",
    data,
    cookie = "",
    headers = {},
  ) {
    const r = await fetch(base + "/api" + route, {
      method,
      headers: { "Content-Type": "application/json", cookie, ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
      setCookie: r.headers.get("set-cookie"),
    };
  }
  try {
    await start();
    assert.equal((await request("/reviews")).status, 401);
    for (const signupCode of [
      undefined,
      "",
      "1234",
      "33333",
      " 3333",
      3333,
      null,
      ["3333"],
    ]) {
      const denied = await request("/auth/signup", "POST", {
        email: "a@example.test",
        password: "long-password-a",
        signupCode,
      });
      assert.equal(denied.status, 403);
      assert.equal(denied.body.error, "회원가입 코드가 올바르지 않습니다.");
      assert.equal(denied.setCookie, null);
    }
    const signupDb = new DatabaseSync(dbPath, { readOnly: true });
    try {
      assert.equal(
        signupDb.prepare("SELECT COUNT(*) AS count FROM users").get().count,
        0,
      );
      assert.equal(
        signupDb.prepare("SELECT COUNT(*) AS count FROM sessions").get().count,
        0,
      );
    } finally {
      signupDb.close();
    }
    const a = await request("/auth/signup", "POST", {
      email: "a@example.test",
      password: "long-password-a",
      signupCode: "3333",
      remember: true,
    });
    assert.equal(a.status, 201);
    assert.deepEqual(Object.keys(a.body.user).sort(), [
      "email",
      "id",
      "username",
    ]);
    assert.match(a.setCookie, /HttpOnly/);
    assert.match(a.setCookie, /SameSite=Lax/);
    const b = await request("/auth/signup", "POST", {
      email: "b@example.test",
      password: "long-password-b",
      signupCode: "3333",
    });
    assert.equal(b.status, 201);
    assert.equal((await request("/templates")).status, 401);
    assert.equal(
      (await request("/template-groups", "POST", { name: "식품" })).status,
      401,
    );
    assert.deepEqual(
      (await request("/templates", "GET", undefined, a.cookie)).body.groups,
      [],
    );
    for (const name of ["", "   ", "가".repeat(41), null, 123]) {
      assert.equal(
        (await request("/template-groups", "POST", { name }, a.cookie)).status,
        400,
      );
    }
    const groupA = await request(
      "/template-groups",
      "POST",
      { name: "  식품 후기  ", user_id: b.body.user.id },
      a.cookie,
    );
    assert.equal(groupA.status, 201);
    assert.equal(groupA.body.group.name, "식품 후기");
    assert.equal(
      (
        await request(
          "/template-groups",
          "POST",
          { name: "식품 후기" },
          a.cookie,
        )
      ).status,
      409,
    );
    assert.deepEqual(
      (await request("/templates", "GET", undefined, b.cookie)).body.groups,
      [],
    );
    const groupB = await request(
      "/template-groups",
      "POST",
      { name: "식품 후기" },
      b.cookie,
    );
    assert.equal(groupB.status, 201);
    assert.notEqual(groupA.body.group.id, groupB.body.group.id);
    assert.deepEqual(
      (await request("/templates", "GET", undefined, a.cookie)).body.groups,
      [groupA.body.group],
    );
    const defaults = (await request("/templates", "GET", undefined, a.cookie))
      .body.templates;
    assert.equal(defaults.length, 6);
    assert.ok(defaults.every((t) => t.version === 0 && t.isStarter));
    assert.ok(defaults.every((t) => t.groupId === ""));
    const template = defaults[0];
    const editedTemplate = await request(
      `/templates/${template.id}`,
      "PUT",
      {
        ...template,
        title: "내가 수정한 템플릿",
        content: "실제 사용 후기\n줄바꿈 보존",
        groupId: groupA.body.group.id,
        user_id: b.body.user.id,
      },
      a.cookie,
    );
    assert.equal(editedTemplate.status, 200);
    assert.equal(editedTemplate.body.template.version, 1);
    assert.equal(editedTemplate.body.template.groupId, groupA.body.group.id);
    assert.equal(
      (await request("/templates", "GET", undefined, b.cookie)).body
        .templates[0].groupId,
      "",
    );
    assert.equal(
      (await request(`/templates/${template.id}`, "PUT", template, a.cookie))
        .status,
      409,
    );
    assert.equal(
      (await request("/templates", "GET", undefined, b.cookie)).body
        .templates[0].content,
      template.content,
    );
    assert.equal(
      (await request("/templates", "GET", undefined, a.cookie)).body.templates
        .length,
      6,
    );
    for (const changes of [
      { title: "  " },
      { content: "  " },
      { content: "가".repeat(5001) },
      { reviewType: "invalid" },
      { groupId: "not-a-group" },
      { groupId: "00000000-0000-4000-8000-000000000000" },
      { groupId: groupB.body.group.id },
    ]) {
      assert.equal(
        (
          await request(
            "/templates",
            "POST",
            { ...template, ...changes },
            a.cookie,
          )
        ).status,
        400,
      );
    }
    const customTemplate = await request(
      "/templates",
      "POST",
      {
        title: "나만의 템플릿",
        reviewType: "사진 리뷰",
        content: "사진 설명\n사용 경험",
        user_id: b.body.user.id,
      },
      a.cookie,
    );
    assert.equal(customTemplate.status, 201);
    assert.equal(customTemplate.body.template.isStarter, false);
    assert.equal(customTemplate.body.template.groupId, "");
    assert.equal(
      (
        await request(
          `/templates/${customTemplate.body.template.id}`,
          "PUT",
          customTemplate.body.template,
          b.cookie,
        )
      ).status,
      404,
    );
    let groupedTemplate = customTemplate.body.template;
    for (const groupId of [groupA.body.group.id, "", groupA.body.group.id]) {
      const moved = await request(
        `/templates/${groupedTemplate.id}`,
        "PUT",
        { ...groupedTemplate, groupId },
        a.cookie,
      );
      assert.equal(moved.status, 200);
      assert.equal(
        moved.body.template.content,
        customTemplate.body.template.content,
      );
      assert.equal(moved.body.template.groupId, groupId);
      groupedTemplate = moved.body.template;
    }
    const { groupId: omittedGroup, ...legacyTemplate } = groupedTemplate;
    const legacyTemplateUpdate = await request(
      `/templates/${groupedTemplate.id}`,
      "PUT",
      legacyTemplate,
      a.cookie,
    );
    assert.equal(legacyTemplateUpdate.status, 200);
    assert.equal(
      legacyTemplateUpdate.body.template.groupId,
      groupA.body.group.id,
    );
    const badGroupMove = await request(
      `/templates/${groupedTemplate.id}`,
      "PUT",
      { ...legacyTemplateUpdate.body.template, groupId: groupB.body.group.id },
      a.cookie,
    );
    assert.equal(badGroupMove.status, 400);
    assert.equal(
      (await request("/templates", "GET", undefined, b.cookie)).body.templates
        .length,
      6,
    );
    assert.equal(
      (
        await request("/auth/signup", "POST", {
          email: "weak@example.test",
          password: "123",
          signupCode: "3333",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "a@example.test",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/reviews", "POST", item, a.cookie, {
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
    for (const changes of [
      { shippingMethod: "" },
      { shippingMethod: "직배송" },
      { platform: "미등록 플랫폼" },
      { platform: "기타", platformOther: " " },
    ]) {
      assert.equal(
        (await request("/reviews", "POST", { ...item, ...changes }, a.cookie))
          .status,
        400,
      );
    }
    const created = await request(
      "/reviews",
      "POST",
      { ...item, user_id: b.body.user.id },
      a.cookie,
    );
    assert.equal(created.status, 201);
    const id = created.body.review.id;
    assert.equal(created.body.review.shippingMethod, "빈박스");
    assert.equal("extraFee" in created.body.review, false);
    assert.equal(
      (await request("/reviews", "GET", undefined, b.cookie)).body.reviews
        .length,
      0,
    );
    assert.equal(
      (
        await request(
          `/reviews/${id}`,
          "PUT",
          { ...item, version: 1 },
          b.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request(`/reviews/${id}`, "DELETE", { version: 1 }, b.cookie))
        .status,
      404,
    );
    const partial = await request(
      `/reviews/${id}`,
      "PUT",
      {
        ...item,
        version: 1,
        reviewStatus: "done",
        reviewedAt: "2026-09-28",
        receivedAmount: 10000,
        paidAt: "2026-09-30",
      },
      a.cookie,
    );
    assert.equal(partial.status, 200);
    assert.equal(partial.body.review.version, 2);
    assert.deepEqual(partial.body.payments, [
      { reviewId: id, amount: 10000, paidAt: "2026-09-30" },
    ]);
    assert.equal(
      (
        await request(
          `/reviews/${id}`,
          "PUT",
          { ...item, version: 1 },
          a.cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          `/reviews/${id}`,
          "PUT",
          { ...item, version: 2, receivedAmount: 50000, paidAt: "2026-10-01" },
          a.cookie,
        )
      ).status,
      400,
    );
    const full = await request(
      `/reviews/${id}`,
      "PUT",
      { ...partial.body.review, receivedAmount: 30000, paidAt: "2026-10-10" },
      a.cookie,
    );
    assert.equal(full.status, 200);
    assert.equal(full.body.payments.length, 2);
    assert.equal(
      full.body.payments.reduce((sum, p) => sum + p.amount, 0),
      30000,
    );
    const result = await request("/reviews", "GET", undefined, a.cookie);
    assert.equal(result.body.reviews[0].reviewStatus, "done");
    assert.deepEqual(
      result.body.payments
        .map((p) => [p.amount, p.paidAt])
        .sort((a, b) => a[0] - b[0]),
      [
        [10000, "2026-09-30"],
        [20000, "2026-10-10"],
      ],
    );
    await stop();
    await start();
    const persistedTemplates = (
      await request("/templates", "GET", undefined, a.cookie)
    ).body.templates;
    assert.equal(persistedTemplates.length, 7);
    assert.equal(
      persistedTemplates.find((t) => t.id === template.id).content,
      "실제 사용 후기\n줄바꿈 보존",
    );
    assert.equal(
      persistedTemplates.find((t) => t.id === template.id).version,
      1,
    );
    assert.equal(
      persistedTemplates.find((t) => t.id === customTemplate.body.template.id)
        .content,
      "사진 설명\n사용 경험",
    );
    assert.equal(
      (await request("/reviews", "GET", undefined, a.cookie)).body.reviews[0]
        .receivedAmount,
      30000,
    );
    const saved = (await request("/reviews", "GET", undefined, a.cookie)).body
      .reviews[0];
    assert.equal(saved.reviewedAt, "2026-09-28");
    assert.equal(saved.kakaoName, "테스트 카톡");
    assert.equal(saved.contact, "test-contact");
    assert.equal(saved.purchaser, "테스트 계정주");
    const db = new DatabaseSync(dbPath);
    const user = db
      .prepare("SELECT password FROM users WHERE email=?")
      .get("a@example.test");
    assert.ok(!user.password.includes("long-password-a"));
    const token = db
      .prepare("SELECT token FROM sessions WHERE user_id=?")
      .get(a.body.user.id).token;
    assert.notEqual(token, a.cookie.split("=")[1]);
    db.close();
    assert.equal((await request("/auth/demo", "POST", {})).status, 404);
    assert.equal(
      (await request("/reviews", "GET", undefined, a.cookie)).body.reviews
        .length,
      1,
    );
    assert.equal(
      (await request(`/reviews/${id}`, "DELETE", { version: 1 }, a.cookie))
        .status,
      409,
    );
    assert.equal(
      (
        await request(
          `/reviews/${id}`,
          "DELETE",
          { version: full.body.review.version },
          a.cookie,
        )
      ).status,
      200,
    );
    const deleted = await request("/reviews", "GET", undefined, a.cookie);
    assert.equal(deleted.body.reviews.length, 0);
    assert.equal(deleted.body.payments.length, 0);
    const feeCreated = await request("/reviews", "POST", item, a.cookie);
    assert.equal(feeCreated.body.review.additionalReviewFee, 0);
    const feeId = feeCreated.body.review.id;
    const feeAdded = await request(
      `/reviews/${feeId}`,
      "PUT",
      {
        ...feeCreated.body.review,
        additionalReviewFee: 2000,
        reviewStatus: "done",
        reviewedAt: "2026-10-28",
      },
      a.cookie,
    );
    assert.equal(feeAdded.status, 200);
    assert.equal(feeAdded.body.review.expectedPayback, 30000);
    assert.equal(feeAdded.body.review.additionalReviewFee, 2000);
    assert.equal(feeAdded.body.review.receivedAmount, 0);
    assert.equal(feeAdded.body.payments.length, 0);
    const { additionalReviewFee: omittedFee, ...legacyPayload } =
      feeAdded.body.review;
    const legacyUpdate = await request(
      `/reviews/${feeId}`,
      "PUT",
      { ...legacyPayload, memo: "기존 클라이언트 수정" },
      a.cookie,
    );
    assert.equal(legacyUpdate.status, 200);
    assert.equal(legacyUpdate.body.review.additionalReviewFee, 2000);
    assert.equal(
      (
        await request(
          `/reviews/${feeId}`,
          "PUT",
          legacyUpdate.body.review,
          b.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/reviews/${feeId}`,
          "PUT",
          {
            ...legacyUpdate.body.review,
            receivedAmount: 32001,
            paidAt: "2026-10-28",
          },
          a.cookie,
        )
      ).status,
      400,
    );
    const feePaid = await request(
      `/reviews/${feeId}`,
      "PUT",
      {
        ...legacyUpdate.body.review,
        receivedAmount: 32000,
        paidAt: "2026-10-28",
      },
      a.cookie,
    );
    assert.equal(feePaid.status, 200);
    assert.equal(feePaid.body.payments.length, 1);
    assert.equal(feePaid.body.payments[0].amount, 32000);
    for (const amount of [-1, 0.5, 1000]) {
      assert.equal(
        (
          await request(
            `/reviews/${feeId}`,
            "PUT",
            { ...feePaid.body.review, additionalReviewFee: amount },
            a.cookie,
          )
        ).status,
        400,
      );
    }
    await stop();
    await start();
    const feePersisted = (await request("/reviews", "GET", undefined, a.cookie))
      .body;
    assert.equal(feePersisted.reviews[0].additionalReviewFee, 2000);
    assert.equal(feePersisted.reviews[0].receivedAmount, 32000);
    assert.equal(feePersisted.payments[0].amount, 32000);
    const persistedGroups = (
      await request("/templates", "GET", undefined, a.cookie)
    ).body;
    assert.deepEqual(persistedGroups.groups, [groupA.body.group]);
    assert.equal(
      persistedGroups.templates.find(
        (t) => t.id === customTemplate.body.template.id,
      ).groupId,
      groupA.body.group.id,
    );
    assert.equal(
      (
        await request(
          `/reviews/${feeId}`,
          "DELETE",
          { version: feePaid.body.review.version },
          a.cookie,
        )
      ).status,
      200,
    );
    const automatic = await request(
      "/reviews",
      "POST",
      { ...item, price: 200000, expectedPayback: 0 },
      a.cookie,
    );
    assert.equal(automatic.status, 201);
    assert.equal(automatic.body.review.expectedPayback, 200000);
    assert.equal(automatic.body.review.paybackMode, "shipping");
    let purchaseReview = automatic.body.review;
    await stop();
    const legacyPaybackDb = new DatabaseSync(dbPath);
    const legacyPurchase = { ...item, price: 200000, expectedPayback: 0 };
    legacyPaybackDb
      .prepare("UPDATE reviews SET data=? WHERE id=?")
      .run(JSON.stringify(legacyPurchase), purchaseReview.id);
    legacyPaybackDb.close();
    await start();
    const correctedPurchase = (
      await request("/reviews", "GET", undefined, a.cookie)
    ).body;
    purchaseReview = correctedPurchase.reviews.find(
      (r) => r.id === purchaseReview.id,
    );
    assert.equal(purchaseReview.expectedPayback, 200000);
    assert.equal(purchaseReview.receivedAmount, 0);
    assert.equal(correctedPurchase.payments.length, 0);
    const storedLegacy = new DatabaseSync(dbPath, { readOnly: true });
    assert.equal(
      JSON.parse(
        storedLegacy
          .prepare("SELECT data FROM reviews WHERE id=?")
          .get(purchaseReview.id).data,
      ).expectedPayback,
      0,
    );
    storedLegacy.close();
    const repriced = await request(
      `/reviews/${purchaseReview.id}`,
      "PUT",
      { ...purchaseReview, paybackMode: undefined, price: 210000 },
      a.cookie,
    );
    assert.equal(repriced.status, 200);
    assert.equal(repriced.body.review.expectedPayback, 210000);
    const customPayback = await request(
      `/reviews/${purchaseReview.id}`,
      "PUT",
      {
        ...repriced.body.review,
        paybackMode: undefined,
        expectedPayback: 100000,
      },
      a.cookie,
    );
    assert.equal(customPayback.status, 200);
    assert.equal(customPayback.body.review.paybackMode, "shipping");
    assert.equal(customPayback.body.review.expectedPayback, 210000);
    const explicitZero = await request(
      `/reviews/${purchaseReview.id}`,
      "PUT",
      {
        ...customPayback.body.review,
        shippingMethod: "실배송",
        paybackMode: "custom",
        expectedPayback: 0,
      },
      a.cookie,
    );
    assert.equal(explicitZero.status, 200);
    const preserveZero = await request(
      `/reviews/${purchaseReview.id}`,
      "PUT",
      { ...explicitZero.body.review, paybackMode: undefined, price: 220000 },
      a.cookie,
    );
    assert.equal(preserveZero.status, 200);
    assert.equal(preserveZero.body.review.expectedPayback, 0);
    assert.equal(preserveZero.body.review.paybackMode, "shipping");
    assert.equal(
      (
        await request(
          `/reviews/${purchaseReview.id}`,
          "PUT",
          {
            ...preserveZero.body.review,
            receivedAmount: 1,
            paidAt: "2026-10-28",
          },
          a.cookie,
        )
      ).status,
      400,
    );
    const automaticAgain = await request(
      `/reviews/${purchaseReview.id}`,
      "PUT",
      {
        ...preserveZero.body.review,
        shippingMethod: "빈박스",
        paybackMode: "purchase",
        additionalReviewFee: 3000,
      },
      a.cookie,
    );
    assert.equal(automaticAgain.status, 200);
    assert.equal(automaticAgain.body.review.expectedPayback, 220000);
    const purchasePaid = await request(
      `/reviews/${purchaseReview.id}`,
      "PUT",
      {
        ...automaticAgain.body.review,
        receivedAmount: 223000,
        paidAt: "2026-10-28",
      },
      a.cookie,
    );
    assert.equal(purchasePaid.status, 200);
    assert.equal(purchasePaid.body.payments.length, 1);
    assert.equal(purchasePaid.body.payments[0].amount, 223000);
    assert.equal(
      (
        await request(
          `/reviews/${purchaseReview.id}`,
          "DELETE",
          { version: purchasePaid.body.review.version },
          a.cookie,
        )
      ).status,
      200,
    );
    await request("/auth/logout", "POST", {}, a.cookie);
    assert.equal(
      (await request("/reviews", "GET", undefined, a.cookie)).status,
      401,
    );
    const login = await request("/auth/login", "POST", {
      email: "a@example.test",
      password: "long-password-a",
      remember: false,
    });
    assert.equal(login.status, 200);
    assert.ok(!login.setCookie.includes("Expires="));
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
