import { today } from "../shared/domain.mjs";

const PAGE_SIZE = 25;
const numericFields = new Set([
  "registered_count",
  "deleted_count",
  "active_review_count",
  "todo_count",
  "review_done_count",
  "settled_count",
  "purchase_total",
  "received_total",
  "pending_total",
  "purchase_amount",
  "received_amount",
  "review_fee",
  "count",
  "received",
]);
const numericRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      numericFields.has(key) ? Number(value) : value,
    ]),
  );
const summaryColumns = `s.registered_count,s.deleted_count,s.active_review_count,s.todo_count,
  s.review_done_count,s.settled_count,s.purchase_total,s.received_total,s.pending_total`;
const lastSeen = `(SELECT MAX(a.last_seen_at) FROM member_daily_activity a WHERE a.user_id=u.id)`;
const activeInMonth = `EXISTS(SELECT 1 FROM member_daily_activity a WHERE a.user_id=u.id AND a.activity_date>=? AND a.activity_date<?)`;
const daySql = (db, column) =>
  db.dialect === "postgres"
    ? `to_char(${column}::timestamptz AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')`
    : `date(${column},'+9 hours')`;

export function adminPeriod(month = today().slice(0, 7)) {
  if (
    typeof month !== "string" ||
    !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ||
    month > today().slice(0, 7)
  )
    return null;
  const startDate = `${month}-01`;
  const next = new Date(`${startDate}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const endDate = next.toISOString().slice(0, 10);
  return {
    month,
    startDate,
    endDate,
    start: new Date(`${startDate}T00:00:00+09:00`).toISOString(),
    end: new Date(`${endDate}T00:00:00+09:00`).toISOString(),
  };
}
const pageNumber = (v = "1") =>
  typeof v === "string" && /^[1-9]\d{0,5}$/.test(v) ? Number(v) : null;
const safeSearch = (v) =>
  v.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_");

export function registerAdminRoutes(app, db) {
  // readSession loads membership from the database on every request. A stale
  // client flag or an existing session cannot retain a revoked privilege.
  app.use("/api/admin", (req, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    if (!req.user?.is_admin)
      return res.status(403).json({ error: "관리자만 접근할 수 있습니다." });
    next();
  });
  app.get("/api/admin/dashboard", async (req, res) => {
    const period = adminPeriod(req.query.month),
      page = pageNumber(req.query.page);
    const search = req.query.q ?? "",
      status = req.query.status ?? "all",
      sort = req.query.sort ?? "recent";
    const orders = {
      recent: "last_seen_at DESC NULLS LAST,u.created_at DESC,u.id",
      reviews: "s.active_review_count DESC,u.created_at DESC,u.id",
      received: "s.received_total DESC,u.created_at DESC,u.id",
      joined: "u.created_at DESC,u.id",
    };
    if (
      !period ||
      !page ||
      typeof search !== "string" ||
      search.length > 100 ||
      !["all", "active", "new"].includes(status) ||
      !Object.hasOwn(orders, sort)
    )
      return res
        .status(400)
        .json({ error: "조회 기간 또는 검색 조건을 확인해 주세요." });
    const { start, end, startDate, endDate } = period;
    const result = await db.transaction(async () => {
      if (db.dialect === "postgres")
        await db
          .prepare("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
          .run();
      const members = await db
        .prepare(
          `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN created_at>=? AND created_at<? THEN 1 ELSE 0 END),0) AS joined
        FROM users WHERE is_demo=0`,
        )
        .get(start, end);
      const active = await db
        .prepare(
          `SELECT COUNT(DISTINCT a.user_id) AS count FROM member_daily_activity a
        JOIN users u ON u.id=a.user_id WHERE u.is_demo=0 AND a.activity_date>=? AND a.activity_date<?`,
        )
        .get(startDate, endDate);
      const activityStart = new Date(`${today()}T00:00:00+09:00`);
      activityStart.setUTCDate(activityStart.getUTCDate() - 29);
      const active30 = await db
        .prepare(
          `SELECT COUNT(DISTINCT a.user_id) AS count FROM member_daily_activity a
        JOIN users u ON u.id=a.user_id WHERE u.is_demo=0 AND a.activity_date>=?`,
        )
        .get(
          new Date(activityStart.getTime() + 9 * 3600000)
            .toISOString()
            .slice(0, 10),
        );
      const reviewTotals = await db
        .prepare(
          `SELECT COALESCE(SUM(s.active_review_count),0) AS reviews,
        COALESCE(SUM(s.registered_count),0) AS registered, COALESCE(SUM(s.review_done_count),0) AS completed,
        COALESCE(SUM(s.settled_count),0) AS settled, COALESCE(SUM(s.received_total),0) AS received,
        COALESCE(SUM(s.pending_total),0) AS pending FROM user_review_summary s JOIN users u ON u.id=s.user_id WHERE u.is_demo=0`,
        )
        .get();
      const registrations = await db
        .prepare(
          `SELECT COUNT(DISTINCT h.review_id) AS count FROM review_history h JOIN users u ON u.id=h.user_id
        WHERE u.is_demo=0 AND h.event_type IN ('created','baseline') AND h.review_created_at>=? AND h.review_created_at<?`,
        )
        .get(start, end);
      const deposits = await db
        .prepare(
          `SELECT COALESCE(SUM(p.amount),0) AS amount FROM payments p JOIN users u ON u.id=p.user_id
        WHERE u.is_demo=0 AND p.paid_at>=? AND p.paid_at<?`,
        )
        .get(startDate, endDate);
      const joins = await db
        .prepare(
          `SELECT ${daySql(db, "created_at")} AS day,COUNT(*) AS count FROM users
        WHERE is_demo=0 AND created_at>=? AND created_at<? GROUP BY ${daySql(db, "created_at")}`,
        )
        .all(start, end);
      const activity = await db
        .prepare(
          `SELECT a.activity_date AS day,COUNT(*) AS count FROM member_daily_activity a JOIN users u ON u.id=a.user_id
        WHERE u.is_demo=0 AND a.activity_date>=? AND a.activity_date<? GROUP BY a.activity_date`,
        )
        .all(startDate, endDate);
      const trend = [];
      const days =
        (Date.parse(`${endDate}T00:00:00Z`) -
          Date.parse(`${startDate}T00:00:00Z`)) /
        86400000;
      for (let d = 1; d <= days; d++) {
        const day = `${period.month}-${String(d).padStart(2, "0")}`;
        trend.push({
          day,
          joined: joins.find((v) => v.day === day)?.count ?? 0,
          active: activity.find((v) => v.day === day)?.count ?? 0,
          future: day > today(),
        });
      }
      const platforms = (
        await db
          .prepare(
            `SELECT r.platform_name AS name,COUNT(*) AS count,COALESCE(SUM(r.received_amount),0) AS received
        FROM reviews r JOIN users u ON u.id=r.user_id WHERE u.is_demo=0 GROUP BY r.platform_name ORDER BY count DESC,r.platform_name`,
          )
          .all()
      ).map(numericRow);
      // Return only a bounded ranking; retain the remainder as an explicit group.
      const topPlatforms = platforms.slice(0, 7);
      if (platforms.length > 7)
        topPlatforms.push({
          name: "그 외 플랫폼",
          count: platforms.slice(7).reduce((s, v) => s + v.count, 0),
          received: platforms.slice(7).reduce((s, v) => s + v.received, 0),
        });
      const where = ["u.is_demo=0"],
        args = [];
      if (search.trim()) {
        where.push(
          "(lower(COALESCE(u.username,'')) LIKE ? ESCAPE '!' OR lower(COALESCE(u.email,'')) LIKE ? ESCAPE '!')",
        );
        args.push(
          ...Array(2).fill(`%${safeSearch(search.trim().toLowerCase())}%`),
        );
      }
      if (status === "active") {
        where.push(activeInMonth);
        args.push(startDate, endDate);
      }
      if (status === "new") {
        where.push("u.created_at>=? AND u.created_at<?");
        args.push(start, end);
      }
      const whereSql = where.join(" AND ");
      const count = await db
        .prepare(`SELECT COUNT(*) AS count FROM users u WHERE ${whereSql}`)
        .get(...args);
      const pages = Math.max(1, Math.ceil(count.count / PAGE_SIZE)),
        currentPage = Math.min(page, pages);
      const rows = await db
        .prepare(
          `SELECT u.id,u.username,u.email,u.created_at,${lastSeen} AS last_seen_at,
        CASE WHEN ${activeInMonth} THEN 1 ELSE 0 END AS active,
        CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS is_admin,${summaryColumns}
        FROM users u JOIN user_review_summary s ON s.user_id=u.id LEFT JOIN admin_memberships m ON m.user_id=u.id
        WHERE ${whereSql} ORDER BY ${orders[sort]} LIMIT ? OFFSET ?`,
        )
        .all(
          startDate,
          endDate,
          ...args,
          PAGE_SIZE,
          (currentPage - 1) * PAGE_SIZE,
        );
      const recent = await db
        .prepare(
          `SELECT h.id,h.user_id,u.username,u.email,h.event_type,h.product_name,h.platform_name,h.recorded_at,
        h.review_status_before,h.review_status_after,h.settlement_status_before,h.settlement_status_after
        FROM review_history h JOIN users u ON u.id=h.user_id WHERE u.is_demo=0 AND h.event_type<>'baseline'
        ORDER BY h.recorded_at DESC,h.id DESC LIMIT 8`,
        )
        .all();
      const summary = Object.fromEntries(
        Object.entries({
          ...members,
          active: active.count,
          active30: active30.count,
          ...reviewTotals,
          monthlyRegistrations: registrations.count,
          monthlyDeposits: deposits.amount,
        }).map(([k, v]) => [k, Number(v)]),
      );
      return {
        month: period.month,
        summary,
        trend,
        platforms: topPlatforms,
        members: {
          rows: rows.map(numericRow),
          total: count.count,
          page: currentPage,
          pages,
          pageSize: PAGE_SIZE,
        },
        recent,
      };
    });
    res.json({
      ...result,
      updatedAt: new Date().toISOString(),
      timeZone: "Asia/Seoul",
    });
  });
  app.get("/api/admin/members/:id", async (req, res) => {
    const page = pageNumber(req.query.page);
    if (!page || req.params.id.length > 100)
      return res.status(400).json({ error: "조회 조건을 확인해 주세요." });
    const member = await db
      .prepare(
        `SELECT u.id,u.username,u.email,u.created_at,${lastSeen} AS last_seen_at,${summaryColumns}
      FROM users u JOIN user_review_summary s ON s.user_id=u.id WHERE u.id=? AND u.is_demo=0`,
      )
      .get(req.params.id);
    if (!member)
      return res.status(404).json({ error: "회원을 찾을 수 없습니다." });
    const pages = Math.max(1, Math.ceil(member.active_review_count / 20)),
      currentPage = Math.min(page, pages);
    const reviews = await db
      .prepare(
        `SELECT id,product_name,platform_name,review_mode,review_status,settlement_status,purchase_amount,
      received_amount,review_fee,pending_total,created_at FROM review_details WHERE user_id=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?`,
      )
      .all(req.params.id, 20, (currentPage - 1) * 20);
    res.json({
      member: numericRow(member),
      reviews: reviews.map(numericRow),
      page: currentPage,
      pages,
    });
  });
}
