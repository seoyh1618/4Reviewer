CREATE TABLE account_recovery (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  answer_hash text NOT NULL,
  code_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at text NOT NULL
);
CREATE TABLE recovery_tokens (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recovery_version integer NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX recovery_tokens_user ON recovery_tokens(user_id);
CREATE INDEX recovery_tokens_expiry ON recovery_tokens(expires_at);
CREATE TABLE recovery_attempts (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX recovery_attempts_expiry ON recovery_attempts(expires_at);
CREATE TABLE account_security_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_kind text NOT NULL CHECK(event_kind IN ('recovery_setup','password_reset')),
  created_at text NOT NULL
);
CREATE INDEX account_security_events_user ON account_security_events(user_id,created_at);
COMMENT ON TABLE account_recovery IS '비밀번호 복구 수단. 답변은 scrypt 해시, 무작위 복구코드는 SHA-256 해시만 저장.';
COMMENT ON TABLE account_security_events IS '복구 수단 변경 및 비밀번호 재설정 이력. 비밀값은 기록하지 않음.';
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_app') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.account_recovery, %I.recovery_tokens, %I.recovery_attempts TO reviewer_app',current_schema(),current_schema(),current_schema());
    EXECUTE format('GRANT SELECT, INSERT ON %I.account_security_events TO reviewer_app',current_schema());
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I.account_security_events FROM reviewer_app',current_schema());
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='reviewer_dbeaver') THEN
    EXECUTE format('GRANT SELECT ON %I.account_recovery, %I.recovery_tokens, %I.recovery_attempts, %I.account_security_events TO reviewer_dbeaver',current_schema(),current_schema(),current_schema(),current_schema());
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I.account_recovery, %I.recovery_tokens, %I.recovery_attempts, %I.account_security_events FROM reviewer_dbeaver',current_schema(),current_schema(),current_schema(),current_schema());
  END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES(5);
