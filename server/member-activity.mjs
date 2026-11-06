// Keep one row per user and Korean calendar date, with at most one write per
// five minutes. Do not retain IP addresses, user agents or navigation history.
export async function recordMemberActivity(db, userId, now = new Date()) {
  const stamp = now.toISOString();
  const date = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const threshold = new Date(now.getTime() - 5 * 60000).toISOString();
  await db
    .prepare(
      `INSERT INTO member_daily_activity(user_id,activity_date,first_seen_at,last_seen_at)
    VALUES(?,?,?,?) ON CONFLICT(user_id,activity_date) DO UPDATE SET last_seen_at=excluded.last_seen_at
    WHERE member_daily_activity.last_seen_at<?`,
    )
    .run(userId, date, stamp, stamp, threshold);
}
