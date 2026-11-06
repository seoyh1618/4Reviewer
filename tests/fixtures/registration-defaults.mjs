import assert from "node:assert/strict";
import { checkRegistrationProfiles } from "./registration-profiles.mjs";

export async function checkRegistrationDefaults(request, a, b) {
  assert.equal((await request("/registration-defaults")).status, 401);
  assert.equal(
    (await request("/registration-defaults", "PUT", {})).status,
    401,
  );
  const initial = (
    await request("/registration-defaults", "GET", undefined, a.cookie)
  ).body.defaults;
  assert.equal(initial.version, 0);
  assert.deepEqual(initial.enabledFields, []);
  const input = {
    values: {
      purchaser: "기본 계정",
      platform: "기타",
      platformOther: "개인 마켓",
      shippingMethod: "빈박스",
      reviewType: "텍스트 리뷰",
      additionalReviewFee: 2500,
    },
    enabledFields: [
      "purchaser",
      "platform",
      "shippingMethod",
      "reviewType",
      "additionalReviewFee",
    ],
    version: 0,
  };
  assert.equal(
    (
      await request(
        "/registration-defaults",
        "PUT",
        { ...input, user_id: b.body.user.id },
        a.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/registration-defaults",
        "PUT",
        { ...input, enabledFields: ["receivedAmount"] },
        a.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/registration-defaults",
        "PUT",
        { ...input, values: { ...input.values, additionalReviewFee: -1 } },
        a.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/registration-defaults",
        "PUT",
        { ...input, values: { ...input.values, platformOther: "" } },
        a.cookie,
      )
    ).status,
    400,
  );
  const created = await request(
    "/registration-defaults",
    "PUT",
    input,
    a.cookie,
  );
  assert.equal(created.status, 200);
  assert.equal(created.body.defaults.version, 1);
  assert.deepEqual(created.body.defaults.values, input.values);
  assert.equal(
    (await request("/registration-defaults", "PUT", input, a.cookie)).status,
    409,
  );
  const other = await request(
    `/registration-defaults?user_id=${a.body.user.id}`,
    "GET",
    undefined,
    b.cookie,
  );
  assert.equal(other.body.defaults.version, 0);
  assert.equal(other.body.defaults.values.purchaser, "");
  const competing = await Promise.all([
    request(
      "/registration-defaults",
      "PUT",
      { ...input, version: 1, enabledFields: [] },
      a.cookie,
    ),
    request(
      "/registration-defaults",
      "PUT",
      {
        ...input,
        version: 1,
        values: { ...input.values, purchaser: "다른 창" },
      },
      a.cookie,
    ),
  ]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
  const latest = (
    await request("/registration-defaults", "GET", undefined, a.cookie)
  ).body.defaults;
  assert.equal(latest.version, 2);
  const cleared = await request(
    "/registration-defaults",
    "PUT",
    {
      ...input,
      version: 2,
      enabledFields: [],
      values: {
        ...input.values,
        purchaser: "",
        platform: "쿠팡",
        platformOther: "stale",
        additionalReviewFee: 0,
      },
    },
    a.cookie,
  );
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.body.defaults.enabledFields, []);
  assert.equal(cleared.body.defaults.values.purchaser, "");
  assert.equal(cleared.body.defaults.values.platformOther, "");
  assert.equal(cleared.body.defaults.values.additionalReviewFee, 0);
  return checkRegistrationProfiles(request, a, b);
}
