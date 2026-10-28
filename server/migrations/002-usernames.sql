ALTER TABLE users ADD COLUMN username text;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_login_identifier CHECK(email IS NOT NULL OR username IS NOT NULL);
CREATE UNIQUE INDEX users_username_unique ON users(lower(username));
INSERT INTO schema_migrations(version) VALUES(2);
