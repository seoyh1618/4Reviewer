import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function openForm(page: Page) {
  const auth = await page.request.post("/api/auth/signup", {
    data: {
      email: `ocr-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(auth.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
}

async function orderImage(page: Page) {
  const base64 = await page.evaluate(async () => {
    await document.fonts.load(
      '16px "Pretendard Variable"',
      "주문상세 상품준비중 판매자로켓 새벽 데일리 두피 마사지기 블루 세트 받는사람 정보 총 결제금액 주문번호 주문취소",
    );
    const canvas = document.createElement("canvas");
    canvas.width = 821;
    canvas.height = 714;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 821, 714);
    ctx.fillStyle = "#111";
    ctx.font = '16px "Pretendard Variable"';
    [
      ["주문상세", 15, 35],
      ["2026. 10. 28 주문 - 주문번호 1234567890123", 15, 68],
      ["상품준비중 · 내일(목) 새벽 도착 보장", 35, 140],
      ["판매자로켓 새벽 데일리 두피 마사지기, 블루, 1세트", 110, 185],
      ["8,900 원 · 1개", 110, 220],
      ["주문취소", 650, 220],
      ["받는사람 정보", 15, 310],
      ["받는사람 김*수", 15, 355],
      ["연락처 010****1234", 15, 385],
      ["결제 정보", 15, 510],
      ["총 상품가격 9,000 원", 480, 555],
      ["할인금액 -100 원", 480, 585],
      ["배송비 0 원", 480, 615],
      ["총 결제금액 8,900 원", 480, 680],
    ].forEach(([text, x, y]) =>
      ctx.fillText(String(text), Number(x), Number(y)),
    );
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return {
    name: "single-order.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  };
}

for (const mobile of [false, true]) {
  test(`order screenshot automatically fills only evidenced fields (${mobile ? "mobile" : "desktop"})`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await openForm(page);
    const dialog = page.getByRole("dialog");
    const requests: string[] = [],
      errors: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    await dialog.getByLabel("리뷰비", { exact: true }).fill("1500");
    await dialog.getByLabel("리뷰 타입").selectOption("빈박스");
    await dialog
      .getByLabel("주문내역 이미지 업로드")
      .setInputFiles(await orderImage(page));
    await expect(dialog.getByRole("status")).toContainText(
      "찾은 정보를 채웠어요",
      { timeout: 100000 },
    );
    await expect(dialog.getByLabel("상품명")).toHaveValue(
      "데일리 두피 마사지기, 블루, 1세트",
    );
    await expect(dialog.getByLabel("구매 플랫폼")).toHaveValue("쿠팡");
    await expect(
      dialog.getByRole("spinbutton", { name: /^구매금액/ }),
    ).toHaveValue("8900");
    await expect(dialog.getByLabel("구매일", { exact: false })).toHaveValue(
      "2026-10-28",
    );
    await expect(dialog.getByLabel("주문번호", { exact: true })).toHaveValue(
      "1234567890123",
    );
    await expect(dialog.getByLabel("판매처", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("계정주", { exact: false })).toHaveValue("");
    await expect(dialog.getByLabel("연락처", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("리뷰비", { exact: true })).toHaveValue(
      "1500",
    );
    await expect(dialog.getByLabel("리뷰 타입")).toHaveValue("빈박스");
    expect(
      requests.filter(
        (url) =>
          /^https?:/.test(url) && !url.startsWith("http://127.0.0.1:3188/"),
      ),
    ).toEqual([]);
    expect(requests.filter((url) => /\/assets\/.*\.js/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
    await dialog.getByRole("button", { name: "상품 등록하기" }).click();
    await expect(dialog).toBeHidden();
    const { reviews } = await (await page.request.get("/api/reviews")).json();
    expect(reviews[0]).toMatchObject({
      price: 8900,
      expectedPayback: 8900,
      additionalReviewFee: 1500,
      receivedAmount: 0,
      orderNumber: "1234567890123",
      reviewStatus: "todo",
    });
  });
}

test("OCR load errors are readable, and the same image can be retried after an error or cancellation", async ({
  page,
}) => {
  await openForm(page);
  const dialog = page.getByRole("dialog");
  const file = await orderImage(page);
  await page.route("**/ocr/worker.min.js", (route) => route.abort());
  await dialog.getByLabel("주문내역 이미지 업로드").setInputFiles(file);
  await expect(dialog.getByRole("alert")).toHaveText(
    "주문내역을 읽지 못했습니다. 연결 상태를 확인하고 이미지를 다시 올려 주세요.",
    { timeout: 15000 },
  );
  await expect(dialog.getByLabel("상품명")).toHaveValue("");
  await page.unroute("**/ocr/worker.min.js");
  await dialog.getByLabel("주문내역 이미지 업로드").setInputFiles(file);
  await dialog.getByRole("button", { name: "인식 취소", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("인식을 취소했습니다");
  await dialog.getByLabel("상품명").fill("직접 입력한 상품");
  await dialog.getByLabel("주문내역 이미지 업로드").setInputFiles(file);
  await expect(dialog.getByRole("status")).toContainText(
    "찾은 정보를 채웠어요",
    { timeout: 100000 },
  );
  await expect(dialog.getByLabel("상품명")).toHaveValue(
    "데일리 두피 마사지기, 블루, 1세트",
  );
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("HTML is not cached and missing OCR/assets return 404 instead of app HTML", async ({
  request,
}) => {
  for (const path of ["/", "/index.html", "/reviews"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  for (const path of ["/assets/src-old-version.js", "/ocr/missing-worker.js"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("<!doctype");
  }
});
