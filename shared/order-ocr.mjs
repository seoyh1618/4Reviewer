const aliases = [
  ["쿠팡", /쿠팡|coupang|판매자\s*로켓|로켓\s*(?:배송|와우|프레시)/i],
  ["11번가", /11\s*(?:번가|st(?:reet)?)/i],
  ["무신사", /무신사|musinsa/i],
  ["오늘의집", /오늘의\s*집|ohou/i],
  ["올리브영", /올리브\s*영|olive\s*young/i],
  ["SSG닷컴", /ssg(?:닷컴|\.com)?|쓱닷컴/i],
  ["컬리", /(?:마켓|뷰티)?컬리|kurly/i],
  ["2마켓", /2마켓/],
  ["네이버", /네이버(?!\s*페이)|naver(?!\s*pay)|smartstore|스마트\s*스토어/i],
];
const key = (value) => String(value).replace(/\s+/g, "").toLowerCase();
const unique = (values) => [
  ...new Map(values.map((v) => [key(v), v])).values(),
];
const normalizedLines = (text) =>
  String(text)
    .normalize("NFKC")
    .replace(/[ㆍᆞ•∙・]/g, "·")
    .split(/\r?\n/)
    .map((s) => s.replace(/[^\S\n]+/g, " ").trim())
    .filter(Boolean);
const datePattern = /(20\d{2})\s*[.년/-]\s*(\d{1,2})\s*[.월/-]\s*(\d{1,2})/;
const boundary =
  /주문\s*(?:번호|상세|내역|정보|일)|20\d{2}\s*[.년/-]|상품\s*준비|배송\s*(?:중|완료|준비)|도착\s*(?:보장|예정)|결제\s*완료/;
const cardAction =
  /^(?:옵션|사이즈|색상|수량|주문\s*취소|배송\s*조회|장바구니\s*담기|교환|반품|구매\s*확정|리뷰\s*쓰기)/;
const quantityPattern = /^(?:수량\s*[:：]?\s*)?(\d+)\s*(?:개|점|ea)\s*$/i;
const amountPattern =
  /^(?:₩\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\s*(?:원|KRW))?\s*$/i;
const money = (text) => {
  const match = text.match(amountPattern);
  const value = match ? Number(match[1].replaceAll(",", "")) : NaN;
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000
    ? value
    : undefined;
};
function valuesFor(lines, pattern) {
  return lines.flatMap((line, index) => {
    const match = line.match(pattern);
    return match ? [match[1]?.trim() || lines[index + 1] || ""] : [];
  });
}
function analyze(text, hasOrderContext) {
  const lines = normalizedLines(text),
    source = lines.join("\n");
  const platforms = aliases
    .filter(([, re]) => re.test(source))
    .map(([name]) => name);
  // A payment-method logo alone does not establish the purchase platform.
  const names = valuesFor(
    lines,
    /^(?:상품\s*명|상품\s*이름|product\s*name)\s*[:：]?\s*(.*)$/i,
  ).filter(
    (v) =>
      /[가-힣a-z]/i.test(v) &&
      !/^(?:결제|주문|옵션|수량|배송|판매처|판매자|스토어명|구매일|받는사람|연락처)/.test(
        v,
      ),
  );
  const sellers = valuesFor(
    lines,
    /^(?:판매자(?:명|상호)?(?!\s*(?:로켓|정보))|판매처|스토어(?:명)?|상점명|업체명|seller)\s*[:：]?\s*(.*)$/i,
  ).filter(
    (v) =>
      /[가-힣a-z]/i.test(v) &&
      !/^(?:정보|연락처|사업자|전화|배송|주문|결제|상품명|구매일|받는사람)/.test(
        v,
      ),
  );
  const orders = valuesFor(
    lines.filter((line) => !/상품\s*주문\s*번호/.test(line)),
    /(?:주문\s*번호|order\s*(?:number|no\.?))\s*[:：#]?\s*(.*)$/i,
  )
    .filter((v) => !datePattern.test(v))
    .map((v) => v.match(/^([a-z0-9][a-z0-9_-]*)/i)?.[1])
    .filter((v) => v && /\d/.test(v));
  const dates = valuesFor(
    lines,
    /^(?:주문\s*(?:일자?|일시)|구매\s*(?:일자?|일시)|결제\s*(?:일자?|일시)|order\s*date)\s*[:：]?\s*(.*)$/i,
  );
  dates.push(
    ...lines.filter((line) =>
      /20\d{2}\s*[.년/-]\s*\d{1,2}\s*[.월/-]\s*\d{1,2}\s*[.일]?\s*주문(?:\s|$)/.test(
        line,
      ),
    ),
  );
  const validDates = dates.flatMap((line) => {
    const d = line.match(datePattern);
    if (!d) return [];
    const value = `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;
    return !isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
      ? [value]
      : [];
  });
  const cardEnd = lines.findIndex((line) =>
    /^(?:받는\s*사람|수령인|배송지\s*정보|결제\s*정보)/.test(line),
  );
  const cards = cardEnd < 0 ? lines : lines.slice(0, cardEnd);
  const itemAmount =
    /(\d[\d,]*)\s*원\s*[·/x×]?\s*(?:수량\s*[:：]?\s*)?(\d+)\s*(?:개|점|ea)(?:\s|$)/i;
  const entries = [];
  for (let index = 0; index < cards.length; index++) {
    const line = cards[index],
      inline = line.match(itemAmount);
    let price,
      quantity,
      start = index;
    if (inline) {
      price = money(inline[1]);
      quantity = Number(inline[2]);
    } else if (/원\s*$/.test(line) && money(line) !== undefined) {
      const next = cards[index + 1]?.match(quantityPattern);
      const prev = cards[index - 1]?.match(quantityPattern);
      if (!next && !prev) continue;
      price = money(line);
      quantity = Number((next || prev)[1]);
      if (prev) start--;
    } else continue;
    const parts = [];
    if (inline?.index) parts.push(line.slice(0, inline.index).trim());
    for (let i = start - 1; i >= Math.max(0, start - 8); i--) {
      const before = cards[i];
      if (
        boundary.test(before) ||
        itemAmount.test(before) ||
        quantityPattern.test(before) ||
        /^\d[\d,]*\s*원$/.test(before)
      )
        break;
      if (cardAction.test(before)) continue;
      if (
        aliases.some(
          ([name, re]) =>
            (before === name || /^[a-z\s]+$/i.test(before)) && re.test(before),
        )
      )
        break;
      parts.unshift(before);
    }
    const name = parts
      .join(" ")
      .replace(
        /^.*?(?:판매자\s*로켓|로켓\s*(?:배송|와우|프레시))\s*[|\[\],·'" ]*(?:새벽[|\[\],·'" ]*)?/,
        "",
      )
      .replace(/(?:배송\s*조회|주문\s*취소|장바구니\s*담기).*$/, "")
      .replace(/^[^\p{L}\p{N}]+/u, "")
      .trim();
    entries.push({
      name:
        name &&
        /[가-힣a-z]/i.test(name) &&
        !/^(?:받는|연락처|배송비|결제|할인)/.test(name)
          ? name
          : "",
      price,
      quantity,
    });
  }
  const itemKeys = unique(
    entries.map((e) => `${e.name}|${e.price}|${e.quantity}`),
  );
  if (
    !names.length &&
    (hasOrderContext ||
      platforms.length ||
      /주문\s*(?:상세|내역|정보)|결제\s*완료/.test(source))
  )
    names.push(...entries.map((e) => e.name).filter(Boolean));
  const multiItem =
    itemKeys.length > 1 ||
    unique(names).length > 1 ||
    /(?:총\s*[2-9]\d*\s*(?:개|건)\s*(?:의\s*)?상품|외\s*[1-9]\d*\s*(?:개|건)\s*(?:상품)?)/.test(
      source,
    );
  const prices = [];
  const priceLabels = [
    [
      3,
      /^(?:총\s*결제\s*금액|최종\s*결제\s*금액|실\s*결제\s*금액|실제\s*결제\s*금액|total\s*(?:payment|paid)?)\s*[:：]?\s*(.*)$/i,
    ],
    [2, /^(?:결제\s*금액|결제\s*합계)\s*[:：]?\s*(.*)$/i],
    [
      1,
      /^(?:총\s*주문\s*금액|주문\s*금액|상품\s*주문\s*금액)\s*[:：]?\s*(.*)$/i,
    ],
  ];
  let priceLabelFound = false;
  for (const [rank, pattern] of priceLabels) {
    const values = valuesFor(lines, pattern);
    if (!values.length) continue;
    priceLabelFound = true;
    // A malformed final amount cannot silently fall back to a subtotal.
    for (const raw of values) prices.push({ rank, value: money(raw) });
    break;
  }
  if (!priceLabelFound && itemKeys.length === 1 && entries[0].quantity === 1)
    prices.push({ rank: 0, value: entries[0].price });
  return {
    platforms: unique(platforms),
    names: unique(names),
    sellers: unique(sellers),
    orders: unique(orders),
    dates: unique(validDates),
    prices,
    multiItem,
  };
}

export function parseOrderDocuments(texts) {
  const hasOrderContext = texts.some(
    (text) =>
      /주문\s*(?:상세|내역|정보)|결제\s*완료/.test(text) ||
      aliases.some(([, re]) => re.test(text)),
  );
  const pages = texts.map((text) => analyze(text, hasOrderContext));
  const collect = (field) => unique(pages.flatMap((p) => p[field]));
  const platforms = collect("platforms"),
    orders = collect("orders");
  const fields = {},
    warnings = [];
  if (platforms.length > 1 || orders.length > 1)
    return {
      fields,
      warnings: [
        "서로 다른 플랫폼 또는 주문번호가 보여 자동 입력하지 않았어요. 같은 주문의 사진만 남겨 주세요.",
      ],
    };
  if (platforms.length === 1) fields.platform = platforms[0];
  if (orders.length === 1) fields.orderNumber = orders[0].slice(0, 100);
  for (const [field, group, label, max] of [
    ["purchaseDate", "dates", "구매일", 10],
    ["seller", "sellers", "판매처", 100],
  ]) {
    const values = collect(group);
    if (values.length === 1) fields[field] = values[0].slice(0, max);
    else if (values.length > 1)
      warnings.push(
        `${label}이 서로 다르게 읽혀 비워 두었어요. 원문을 확인해 입력해 주세요.`,
      );
  }
  const names = collect("names");
  const multiItem = pages.some((p) => p.multiItem) || names.length > 1;
  if (multiItem)
    warnings.push(
      "상품이 여러 개이거나 상품명이 서로 달라요. 등록할 상품명과 해당 상품의 구매금액을 직접 확인해 주세요.",
    );
  else {
    if (names.length === 1) fields.name = names[0].slice(0, 200);
    const prices = pages.flatMap((p) => p.prices);
    const rank = Math.max(...prices.map((p) => p.rank));
    const best = prices.filter((p) => p.rank === rank);
    const values = unique(best.map((p) => p.value));
    if (values.length === 1 && values[0] !== undefined)
      fields.price = values[0];
    else if (best.length)
      warnings.push(
        "결제금액이 불분명하거나 서로 달라요. 할인·배송비가 반영된 실제 구매금액을 확인해 주세요.",
      );
  }
  return { fields, warnings };
}

export function parseOrderText(text) {
  return parseOrderDocuments([text]).fields;
}
