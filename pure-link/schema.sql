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
    expires_at TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
