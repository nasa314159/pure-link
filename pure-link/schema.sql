-- PureLink MVP schema for new databases.
-- Existing databases should apply the numbered files in migrations/ instead.

CREATE TABLE IF NOT EXISTS links (
    slug TEXT PRIMARY KEY,
    content_type TEXT NOT NULL CHECK (content_type IN ('url', 'formula', 'card')),
    content TEXT NOT NULL,
    signature TEXT,
    theme TEXT NOT NULL DEFAULT 'paper' CHECK (theme IN ('paper', 'mist', 'night')),
    is_affiliate INTEGER NOT NULL DEFAULT 0 CHECK (is_affiliate IN (0, 1)),
    management_token_hash TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('phishing', 'malware', 'impersonation', 'copyright', 'privacy', 'other')),
    details TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'actioned', 'dismissed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_status_created_at
ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS daily_metrics (
    metric_date TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'none',
    country_code TEXT NOT NULL DEFAULT 'ZZ',
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (metric_date, metric_name, content_type, country_code)
);

CREATE TABLE IF NOT EXISTS rate_limits (
    bucket_key TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_subject TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
ON user_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    return_to TEXT NOT NULL DEFAULT '/account',
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_owner_created
ON links(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS formula_ai_daily_usage (
    user_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0 AND request_count <= 100),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, usage_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
