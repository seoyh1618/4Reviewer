import { z } from "zod";

export const platforms = [
  "쿠팡",
  "네이버",
  "11번가",
  "2마켓",
  "SSG닷컴",
  "무신사",
  "오늘의집",
  "올리브영",
  "컬리",
  "기타",
];
export const shippingMethods = ["실배송", "빈박스"];

export function platformLabel(item) {
  return item.platform === "기타"
    ? item.platformOther || "기타"
    : item.platform;
}

// Shipping determines product reimbursement. Keep unknown legacy shipping
// amounts as recorded until the user selects a delivery method.
export function normalizePayback(item) {
  return {
    ...item,
    paybackMode: shippingMethods.includes(item.shippingMethod)
      ? "shipping"
      : "custom",
    expectedPayback:
      item.shippingMethod === "빈박스"
        ? item.price
        : item.shippingMethod === "실배송"
          ? 0
          : (item.expectedPayback ?? 0),
  };
}

// Preserve old platform names as custom values without rewriting stored records.
// Unknown historic shipping stays unset instead of inventing a delivery method.
export function normalizeReview(item) {
  const { extraFee: _retiredExtraFee, ...data } = item;
  const knownPlatform = platforms.includes(data.platform);
  return {
    ...normalizePayback(data),
    platform: knownPlatform ? data.platform : "기타",
    platformOther: knownPlatform
      ? data.platformOther || (data.platform === "기타" ? "기타" : "")
      : data.platform,
    shippingMethod: data.shippingMethod || "",
    reviewedAt: data.reviewedAt || "",
    kakaoName: data.kakaoName || "",
    additionalReviewFee: data.additionalReviewFee ?? 0,
  };
}
export const reviewTypes = [
  "사진 리뷰",
  "텍스트 리뷰",
  "별점 리뷰",
  "동영상 리뷰",
  "구매만",
];
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
export const dateOffset = (days, base = today()) =>
  new Date(new Date(base + "T12:00:00Z").getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const daysUntil = (date) =>
  date
    ? Math.round(
        (new Date(date + "T12:00:00Z") - new Date(today() + "T12:00:00Z")) /
          86400000,
      )
    : null;
const date = z
  .string()
  .refine(
    (v) =>
      v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "올바른 날짜를 입력해 주세요.",
  );
const money = z.number().int().min(0).max(1_000_000_000);
export const expectedSettlement = (item) =>
  normalizePayback(item).expectedPayback + (item.additionalReviewFee ?? 0);
export const remainingPayback = (item) =>
  Math.max(0, expectedSettlement(item) - item.receivedAmount);
// Deposits cover product reimbursement first, then review fees. This is a
// reporting allocation; it does not rewrite the original payment history.
export function remainingPaybackParts(item) {
  const productTotal = normalizePayback(item).expectedPayback;
  const received = Math.max(0, item.receivedAmount ?? 0);
  return {
    product: Math.max(0, productTotal - received),
    reviewFee: Math.max(
      0,
      (item.additionalReviewFee ?? 0) - Math.max(0, received - productTotal),
    ),
  };
}
export const reviewSchema = z
  .object({
    name: z.string().trim().min(1, "상품명을 입력해 주세요.").max(200),
    sku: z.string().trim().max(80).default(""),
    orderNumber: z.string().trim().max(100).default(""),
    purchaser: z.string().trim().max(80).default(""),
    seller: z.string().trim().max(100).default(""),
    platform: z.enum(platforms),
    platformOther: z.string().trim().max(80).default(""),
    shippingMethod: z.enum([...shippingMethods, ""]).default(""),
    price: money,
    expectedPayback: money.optional(),
    paybackMode: z.enum(["shipping", "purchase", "custom"]).optional(),
    additionalReviewFee: money.default(0),
    receivedAmount: money.default(0),
    purchaseDate: date.refine((v) => !!v, "구매일을 입력해 주세요."),
    dueDate: date.default(""),
    reviewedAt: date.default(""),
    reviewType: z.enum(reviewTypes),
    reviewStatus: z.enum(["todo", "done"]),
    paidAt: date.default(""),
    contact: z.string().trim().max(100).default(""),
    kakaoName: z.string().trim().max(100).default(""),
    depositor: z.string().trim().max(100).default(""),
    memo: z.string().trim().max(2000).default(""),
  })
  .transform(normalizePayback)
  .refine((v) => v.platform !== "기타" || !!v.platformOther, {
    message: "기타 플랫폼 이름을 입력해 주세요.",
    path: ["platformOther"],
  })
  .refine((v) => !v.reviewedAt || v.reviewStatus === "done", {
    message: "리뷰 작성일은 리뷰 완료 상태에서 입력해 주세요.",
    path: ["reviewedAt"],
  })
  .refine((v) => expectedSettlement(v) <= 1_000_000_000, {
    message: "예상 페이백과 추가 리뷰비의 합계는 10억 원 이내로 입력해 주세요.",
    path: ["additionalReviewFee"],
  })
  .refine((v) => v.receivedAmount <= expectedSettlement(v), {
    message: "입금액은 예상 페이백과 추가 리뷰비의 합계를 초과할 수 없습니다.",
    path: ["receivedAmount"],
  })
  .refine((v) => !v.receivedAmount || !!v.paidAt, {
    message: "입금액이 있으면 입금일을 입력해 주세요.",
    path: ["paidAt"],
  })
  .transform((v) => ({
    ...v,
    platformOther: v.platform === "기타" ? v.platformOther : "",
  }));

export function settlement(item) {
  if (
    item.receivedAmount > 0 &&
    item.receivedAmount >= expectedSettlement(item)
  )
    return "done";
  if (expectedSettlement(item) === 0) return "none";
  return item.receivedAmount > 0 ? "partial" : "pending";
}
export const settlementLabels = {
  done: "입금 완료",
  partial: "부분 입금",
  pending: "입금 대기",
  none: "정산 없음",
};

export function totals(items) {
  return items.reduce(
    (s, i) => ({
      purchase: s.purchase + i.price,
      expected: s.expected + expectedSettlement(i),
      received: s.received + i.receivedAmount,
      pending: s.pending + remainingPayback(i),
      todo: s.todo + (i.reviewStatus === "todo" ? 1 : 0),
      done: s.done + (i.reviewStatus === "done" ? 1 : 0),
      count: s.count + 1,
    }),
    {
      purchase: 0,
      expected: 0,
      received: 0,
      pending: 0,
      todo: 0,
      done: 0,
      count: 0,
    },
  );
}
export function reviewOverview(items) {
  return items.reduce(
    (summary, item) => {
      const parts = remainingPaybackParts(item);
      const pending = item.reviewStatus === "todo";
      summary.settled += Number(settlement(item) === "done");
      summary.todoPhysical += Number(
        pending && item.shippingMethod === "실배송",
      );
      summary.todoEmpty += Number(pending && item.shippingMethod === "빈박스");
      summary.todoUnspecified += Number(
        pending && !shippingMethods.includes(item.shippingMethod),
      );
      summary.pendingProduct += parts.product;
      summary.pendingReviewFee += parts.reviewFee;
      summary.partial += Number(settlement(item) === "partial");
      return summary;
    },
    {
      ...totals(items),
      settled: 0,
      todoPhysical: 0,
      todoEmpty: 0,
      todoUnspecified: 0,
      pendingProduct: 0,
      pendingReviewFee: 0,
      partial: 0,
    },
  );
}
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

// Explicit labels take priority. Unlabelled product names need a single-item
// order card (name followed by price + quantity); unrelated text is not a name.
export function parseOrderText(text) {
  const lines = text
    .normalize("NFKC")
    .replace(/[ㆍᆞ•∙・]/g, "·")
    .split(/\r?\n/)
    .map((s) => s.replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean);
  const source = lines.join("\n");
  const result = {};
  const platform = platforms.find((p) => p !== "기타" && source.includes(p));
  if (platform) result.platform = platform;
  else if (/coupang|판매자\s*로켓|로켓\s*(?:배송|와우|프레시)/i.test(source))
    result.platform = "쿠팡";
  else if (/naver/i.test(source)) result.platform = "네이버";
  else if (/11\s*(?:번가|st)/i.test(source)) result.platform = "11번가";
  const label = (pattern) => {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pattern);
      if (match) return match[1]?.trim() || lines[i + 1] || "";
    }
    return "";
  };
  const name = label(
    /^(?:상품\s*명|상품\s*이름|product\s*name)\s*[:：]?\s*(.*)$/i,
  );
  const seller = label(
    /^(?:판매자(?!\s*로켓)|판매처|스토어|seller)\s*[:：]?\s*(.*)$/i,
  );
  if (seller) result.seller = seller.slice(0, 100);

  // Stop before recipient/payment details: those names and phone numbers are
  // not the buyer's review account or the person offering the review.
  const cardEnd = lines.findIndex((line) =>
    /^(?:받는\s*사람|배송지\s*정보|결제\s*정보)/.test(line),
  );
  const cardLines = cardEnd < 0 ? lines : lines.slice(0, cardEnd);
  const itemAmount = /(\d[\d,]*)\s*원\s*[·ㆍx×]?\s*\d+\s*개(?:\s|$)/;
  const itemRows = cardLines.flatMap((line, index) =>
    itemAmount.test(line) ? [index] : [],
  );
  if (name) result.name = name.slice(0, 200);
  else if (
    itemRows.length === 1 &&
    (result.platform || /주문\s*(?:상세|내역)/.test(source))
  ) {
    const index = itemRows[0];
    const candidates = [];
    const inlineName = cardLines[index].split(itemAmount)[0].trim();
    if (inlineName) candidates.push(inlineName);
    for (let i = index - 1; i >= Math.max(0, index - 8); i--) {
      const line = cardLines[i];
      if (
        /주문\s*(?:번호|상세|내역)|20\d{2}\s*[.년/-]|상품\s*준비|배송\s*(?:중|완료|준비)|도착\s*(?:보장|예정)/.test(
          line,
        )
      )
        break;
      if (
        /^(?:주문\s*취소|배송\s*조회|장바구니\s*담기|교환.*반품|구매\s*확정)\s*$/.test(
          line,
        )
      )
        continue;
      candidates.unshift(line);
    }
    const candidate = candidates
      .join(" ")
      .replace(
        /^.*?(?:판매자\s*로켓|로켓\s*(?:배송|와우|프레시))\s*[|\[\],·ㆍ'" ]*(?:새벽[|\[\],·ㆍ'" ]*)?/,
        "",
      )
      .replace(/(?:배송\s*조회|주문\s*취소|장바구니\s*담기).*$/, "")
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .trim();
    if (
      candidate &&
      /[가-힣a-z]/i.test(candidate) &&
      !/^(?:받는|연락처|배송비|결제|할인)/.test(candidate)
    )
      result.name = candidate.slice(0, 200);
  }

  // Never assign an order-wide total to one product when several item rows
  // are visible. Discount/shipping/subtotal figures are not the paid amount.
  if (itemRows.length <= 1) {
    const priceLine =
      label(
        /^(?:총\s*결제\s*금액|최종\s*결제\s*금액|total\s*(?:payment|paid)?)\s*[:：]?\s*(.*)$/i,
      ) || label(/^(?:결제\s*금액|주문\s*금액)\s*[:：]?\s*(.*)$/i);
    const price = priceLine.match(
      /^(?:₩\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\s*(?:원|KRW))?\s*$/i,
    );
    if (price && Number(price[1].replaceAll(",", "")) <= 1_000_000_000)
      result.price = Number(price[1].replaceAll(",", ""));
    else if (!priceLine && itemRows.length === 1) {
      const itemPrice = Number(
        cardLines[itemRows[0]].match(itemAmount)[1].replaceAll(",", ""),
      );
      // A unit price only identifies the purchase amount for a single unit.
      if (
        /원\s*[·ㆍx×]?\s*1\s*개(?:\s|$)/.test(cardLines[itemRows[0]]) &&
        itemPrice <= 1_000_000_000
      )
        result.price = itemPrice;
    }
  }
  const datePattern = /(20\d{2})\s*[.년/-]\s*(\d{1,2})\s*[.월/-]\s*(\d{1,2})/;
  const dateLine =
    label(
      /^(?:주문\s*일자?|구매\s*일자?|결제\s*일자?|order\s*date)\s*[:：]?\s*(.*)$/i,
    ) ||
    lines.find((line) =>
      /20\d{2}\s*[.년/-]\s*\d{1,2}\s*[.월/-]\s*\d{1,2}\s*[.일]?\s*주문(?:\s|$)/.test(
        line,
      ),
    ) ||
    "";
  const d = dateLine.match(datePattern);
  if (d) {
    const candidate = `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;
    if (date.safeParse(candidate).success) result.purchaseDate = candidate;
  }
  const order = label(
    /(?:주문\s*번호|order\s*(?:number|no\.?))\s*[:：#]?\s*(.*)$/i,
  );
  const orderId = order.match(/^([a-z0-9][a-z0-9_-]*)/i)?.[1];
  if (orderId && /\d/.test(orderId)) result.orderNumber = orderId.slice(0, 100);
  return result;
}
