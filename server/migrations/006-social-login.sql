ALTER TABLE sessions ADD COLUMN authenticated_at bigint NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN auth_method text NOT NULL DEFAULT 'password';
CREATE TABLE social_identities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK(provider IN ('google','kakao','naver')),
  subject text NOT NULL,
  created_at text NOT NULL,
  last_login_at text,
  UNIQUE(provider,subject),
  UNIQUE(user_id,provider)
);
CREATE TABLE oauth_flows (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  provider text NOT NULL,
  intent text NOT NULL CHECK(intent IN ('login','link','reauth','signup')),
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL,
  verifier text NOT NULL,
  nonce text NOT NULL,
  subject text,
  remember integer NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX oauth_flows_expiry ON oauth_flows(expires_at);
CREATE TABLE social_auth_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_kind text NOT NULL CHECK(event_kind IN ('signup','login','link','unlink','reauth','password_setup')),
  created_at text NOT NULL
);
CREATE INDEX social_auth_events_user ON social_auth_events(user_id,created_at);
COMMENT ON TABLE social_identities IS '소셜 로그인 연결. 제공자 고유 ID만 저장하며 이메일로 계정을 자동 병합하지 않음.';
COMMENT ON TABLE oauth_flows IS '10분 후 만료되는 일회용 OAuth 진행 상태. 외부 액세스 토큰은 저장하지 않음.';
COMMENT ON TABLE social_auth_events IS '소셜 가입, 로그인, 계정 연결 및 해제 이력. 토큰과 비밀번호는 기록하지 않음.';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_app') THEN
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I.social_identities,%I.oauth_flows TO reviewer_app',current_schema(),current_schema());
    EXECUTE format('GRANT SELECT,INSERT ON %I.social_auth_events TO reviewer_app',current_schema());
    EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON %I.social_auth_events FROM reviewer_app',current_schema());
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_dbeaver') THEN
    EXECUTE format('GRANT SELECT ON %I.social_identities,%I.social_auth_events TO reviewer_dbeaver',current_schema(),current_schema());
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON %I.social_identities,%I.social_auth_events FROM reviewer_dbeaver',current_schema(),current_schema());
    EXECUTE format('REVOKE ALL ON %I.oauth_flows FROM reviewer_dbeaver',current_schema());
  END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES(6);
