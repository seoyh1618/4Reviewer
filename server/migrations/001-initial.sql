CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  password text NOT NULL,
  is_demo integer NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  created_at text NOT NULL
);
CREATE TABLE sessions (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at bigint NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE reviews (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
  created_at text NOT NULL,
  updated_at text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  rowid bigint GENERATED ALWAYS AS IDENTITY,
  UNIQUE(user_id,id)
);
CREATE INDEX reviews_user ON reviews(user_id,created_at DESC,rowid DESC);
CREATE TABLE activities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id text NOT NULL,
  label text NOT NULL,
  amount bigint NOT NULL DEFAULT 0,
  created_at text NOT NULL
);
CREATE INDEX activities_user ON activities(user_id,created_at DESC);
CREATE TABLE payments (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id text NOT NULL,
  amount bigint NOT NULL CHECK(amount>0),
  paid_at text NOT NULL,
  FOREIGN KEY(user_id,review_id) REFERENCES reviews(user_id,id) ON DELETE CASCADE
);
CREATE INDEX payments_user ON payments(user_id,paid_at);
CREATE TABLE review_templates (
  id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
  created_at text NOT NULL,
  updated_at text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  rowid bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY(user_id,id)
);
CREATE INDEX templates_user ON review_templates(user_id,created_at DESC,rowid DESC);
CREATE TABLE template_groups (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at text NOT NULL,
  rowid bigint GENERATED ALWAYS AS IDENTITY,
  UNIQUE(user_id,name)
);
INSERT INTO schema_migrations(version) VALUES(1);
