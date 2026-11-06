CREATE TABLE admin_memberships (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,granted_at TEXT NOT NULL,granted_by TEXT NOT NULL);
CREATE TABLE member_daily_activity (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,activity_date TEXT NOT NULL,first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,PRIMARY KEY(user_id,activity_date));
CREATE INDEX member_activity_date ON member_daily_activity(activity_date,user_id);
CREATE INDEX users_joined ON users(created_at,id);
CREATE INDEX reviews_created ON reviews(created_at);
CREATE INDEX review_history_recorded ON review_history(recorded_at,id);
INSERT INTO member_daily_activity(user_id,activity_date,first_seen_at,last_seen_at)
SELECT user_id,date(stamp,'+9 hours'),min(stamp),max(stamp) FROM (
  SELECT user_id,strftime('%Y-%m-%dT%H:%M:%fZ',authenticated_at/1000.0,'unixepoch') AS stamp FROM sessions WHERE authenticated_at>0
  UNION ALL SELECT user_id,recorded_at FROM review_history WHERE event_type<>'baseline'
) GROUP BY user_id,date(stamp,'+9 hours');
PRAGMA user_version=8;
