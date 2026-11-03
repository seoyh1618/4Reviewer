CREATE TABLE account_recovery (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,question_id TEXT NOT NULL,answer_hash TEXT NOT NULL,code_hash TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),updated_at TEXT NOT NULL);
CREATE TABLE recovery_tokens (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recovery_version INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX recovery_tokens_user ON recovery_tokens(user_id);
CREATE INDEX recovery_tokens_expiry ON recovery_tokens(expires_at);
CREATE TABLE recovery_attempts (bucket TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX recovery_attempts_expiry ON recovery_attempts(expires_at);
CREATE TABLE account_security_events (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,event_kind TEXT NOT NULL CHECK(event_kind IN ('recovery_setup','password_reset')),created_at TEXT NOT NULL);
CREATE INDEX account_security_events_user ON account_security_events(user_id,created_at);
PRAGMA user_version=5;
