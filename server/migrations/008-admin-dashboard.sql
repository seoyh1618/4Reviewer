-- Membership is granted only by an operator with database administration access.
-- The application can read this table but cannot promote users.
CREATE TABLE admin_memberships (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_at text NOT NULL,
  granted_by text NOT NULL
);
CREATE TABLE member_daily_activity (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date text NOT NULL,
  first_seen_at text NOT NULL,
  last_seen_at text NOT NULL,
  PRIMARY KEY(user_id, activity_date)
);
CREATE INDEX member_activity_date ON member_daily_activity(activity_date,user_id);
CREATE INDEX users_joined ON users(created_at,id);
CREATE INDEX reviews_created ON reviews(created_at);
CREATE INDEX review_history_recorded ON review_history(recorded_at,id);
-- Recover only timestamps backed by retained login and review-write evidence.
INSERT INTO member_daily_activity(user_id,activity_date,first_seen_at,last_seen_at)
SELECT user_id,to_char(stamp AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD'),
  to_char(min(stamp) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  to_char(max(stamp) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM (
  SELECT user_id,to_timestamp(authenticated_at/1000.0) AS stamp FROM sessions WHERE authenticated_at>0
  UNION ALL SELECT user_id,recorded_at FROM review_history WHERE event_type<>'baseline'
) evidence GROUP BY user_id,to_char(stamp AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD');
COMMENT ON TABLE admin_memberships IS '운영자 승인으로 부여한 관리자 권한. 앱 DB 계정은 조회만 가능.';
COMMENT ON TABLE member_daily_activity IS '한국 날짜별 로그인·인증된 서비스 사용. 도입 이전은 보유 로그인·리뷰 변경 이력만 복원.';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_app') THEN
    EXECUTE format('REVOKE ALL ON %I.admin_memberships FROM reviewer_app',current_schema());
    EXECUTE format('GRANT SELECT ON %I.admin_memberships TO reviewer_app',current_schema());
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I.member_daily_activity TO reviewer_app',current_schema());
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_dbeaver') THEN
    EXECUTE format('GRANT SELECT ON %I.admin_memberships,%I.member_daily_activity TO reviewer_dbeaver',current_schema(),current_schema());
  END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES(8);
