ALTER TABLE sessions ADD COLUMN authenticated_at INTEGER NOT NULL DEFAULT 0;
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
  expires_at INTEGER NOT NULL
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
PRAGMA user_version=6;
