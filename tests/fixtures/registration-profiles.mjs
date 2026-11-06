import assert from "node:assert/strict";
import { emptyRegistrationProfile } from "../../shared/registration-profiles.mjs";

export async function checkRegistrationProfiles(request, a, b) {
  const list = async (cookie) =>
    (await request("/registration-profiles", "GET", undefined, cookie)).body
      .profiles;
  assert.equal((await request("/registration-profiles")).status, 401);
  const initial = await list(a.cookie);
  assert.equal(initial.length, 1, "legacy settings become a profile");
  assert.equal(initial[0].isDefault, true);
  assert.deepEqual(await list(b.cookie), []);
  const input = emptyRegistrationProfile();
  input.values.purchaser = "묶음 테스트";
  input.values.platform = "네이버";
  input.details = {
    phone: "010-0000-1234",
    address: "테스트 주소 101호",
    email: "profile@example.test",
    bank: "테스트은행",
    accountNumber: "001-234-5678",
    accountHolder: "예금주 테스트",
  };
  assert.equal(
    (
      await request(
        "/registration-profiles",
        "POST",
        { ...input, user_id: b.body.user.id },
        a.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/registration-profiles",
        "POST",
        { ...input, details: { ...input.details, email: "invalid" } },
        a.cookie,
      )
    ).status,
    400,
  );
  const created = await request(
    "/registration-profiles",
    "POST",
    input,
    a.cookie,
  );
  assert.equal(created.status, 201);
  const id = created.body.id;
  let p = created.body.profiles.find((p) => p.id === id);
  assert.deepEqual(p.details, input.details);
  assert.equal(p.isDefault, false);
  assert.deepEqual(await list(b.cookie), []);
  for (const method of ["PUT", "DELETE"]) {
    const body = method === "PUT" ? { ...input, version: 1 } : { version: 1 };
    assert.equal(
      (await request(`/registration-profiles/${id}`, method, body, b.cookie))
        .status,
      404,
    );
  }
  const competing = await Promise.all(
    ["수정 A", "수정 B"].map((address) =>
      request(
        `/registration-profiles/${id}`,
        "PUT",
        { ...input, version: 1, details: { ...input.details, address } },
        a.cookie,
      ),
    ),
  );
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
  p = (await list(a.cookie)).find((p) => p.id === id);
  const selected = await request(
    `/registration-profiles/${id}`,
    "PUT",
    { ...input, version: p.version, makeDefault: true },
    a.cookie,
  );
  assert.equal(selected.status, 200);
  assert.equal(selected.body.profiles.filter((p) => p.isDefault).length, 1);
  assert.equal(selected.body.profiles.find((p) => p.isDefault).id, id);
  const defaults = (
    await request("/registration-defaults", "GET", undefined, a.cookie)
  ).body.defaults;
  assert.equal(defaults.values.purchaser, input.values.purchaser);
  assert.equal(defaults.values.platform, "네이버");
  const legacy = await request(
    "/registration-defaults",
    "PUT",
    {
      values: { ...defaults.values, purchaser: "기존 화면 수정" },
      enabledFields: defaults.enabledFields,
      version: defaults.version,
    },
    a.cookie,
  );
  assert.equal(legacy.status, 200);
  p = (await list(a.cookie)).find((p) => p.id === id);
  assert.equal(p.values.purchaser, "기존 화면 수정");
  assert.deepEqual(
    p.details,
    input.details,
    "legacy writes preserve contact and bank details",
  );
  assert.equal(
    (
      await request(
        `/registration-profiles/${id}`,
        "DELETE",
        { version: 1 },
        a.cookie,
      )
    ).status,
    409,
  );
  const deleted = await request(
    `/registration-profiles/${id}`,
    "DELETE",
    { version: p.version },
    a.cookie,
  );
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.profiles.length, 1);
  assert.equal(deleted.body.profiles[0].id, initial[0].id);
  assert.equal(deleted.body.profiles[0].isDefault, true);
  const restored = (
    await request("/registration-defaults", "GET", undefined, a.cookie)
  ).body.defaults;
  assert.deepEqual(restored.values, initial[0].values);
  return restored;
}
