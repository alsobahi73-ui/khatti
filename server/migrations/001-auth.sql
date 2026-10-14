CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, full_name text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
 phone_e164 text NOT NULL UNIQUE, phone_verified_at timestamptz NOT NULL,
 privacy_version text NOT NULL, consent_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_roles (
 user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL CHECK (role IN ('passenger','driver')),
 PRIMARY KEY (user_id,role)
);
CREATE TABLE IF NOT EXISTS phone_limits (
 phone_e164 text PRIMARY KEY, last_requested_at timestamptz NOT NULL,
 day date NOT NULL, requests integer NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_challenges (
 id uuid PRIMARY KEY, phone_e164 text NOT NULL, full_name text NOT NULL, role text NOT NULL,
 code_digest text NOT NULL, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
 consumed_at timestamptz, privacy_version text NOT NULL, consent_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_digest text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS driver_documents (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), object_key text NOT NULL UNIQUE,
 content_type text NOT NULL, byte_size integer NOT NULL CHECK (byte_size>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS driver_profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id), vehicle_type text NOT NULL, plate text NOT NULL,
 vehicle_year integer NOT NULL, seats integer NOT NULL CHECK(seats BETWEEN 4 AND 60),
 document_id uuid NOT NULL REFERENCES driver_documents(id),
 review_status text NOT NULL CHECK(review_status IN ('pending_review','approved','rejected')),
 review_reason text, reviewed_by text, reviewed_at timestamptz, submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
 id uuid PRIMARY KEY, actor text NOT NULL, action text NOT NULL, entity_id uuid NOT NULL,
 reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS challenges_phone_idx ON auth_challenges(phone_e164);
INSERT INTO schema_migrations(version) VALUES ('001-auth') ON CONFLICT DO NOTHING;
