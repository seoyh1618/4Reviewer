import type { Page } from "@playwright/test";

// Synthetic checkout captures: no customer images or personal information.
export async function qualityOrderImage(
  page: Page,
  variant: "columns" | "small" | "dark",
) {
  const base64 = await page.evaluate(async (variant) => {
    const small = variant !== "columns";
    const width = small ? 390 : 900;
    const fontSize = small ? 13 : 20;
    const font = `${fontSize}px "Pretendard Variable"`;
    await document.fonts.load(
      font,
      "네이버 주문상세 상품명 구매일 결제금액 데일리 머그 판매처 리빙 스토어",
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = small ? 650 : 740;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = variant === "dark" ? "#202124" : "#fafafa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle =
      variant === "dark" ? "#d1d5db" : small ? "#888888" : "#333333";
    ctx.font = font;
    const write = (text: string, x: number, y: number) =>
      ctx.fillText(text, x, y);
    write("네이버 주문상세", 20, 40);
    write("주문번호 202611030001", 20, 85);
    write("주문일 2026.11.03", 20, 120);
    write("상품명 데일리 머그", 20, 190);
    write("판매처 리빙 스토어", 20, 230);
    const valuesX = small ? 300 : 750;
    for (const [i, [label, value]] of [
      ["총 상품금액", "25,000원"],
      ["쿠폰할인", "3,000원"],
      ["배송비", "0원"],
      ["총 결제금액", "22,000원"],
    ].entries()) {
      write(label, 20, 350 + i * 60);
      write(value, valuesX, 350 + i * 60);
    }
    return canvas
      .toDataURL(small ? "image/jpeg" : "image/png", 0.8)
      .split(",")[1];
  }, variant);
  return {
    name: `quality-${variant}.${variant === "columns" ? "png" : "jpg"}`,
    mimeType: variant === "columns" ? "image/png" : "image/jpeg",
    buffer: Buffer.from(base64, "base64"),
  };
}
