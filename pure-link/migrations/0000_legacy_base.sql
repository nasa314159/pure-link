-- Establish the original table shape when migrations run against a new D1 database.
-- On the existing PureLink database this statement is a no-op.

CREATE TABLE IF NOT EXISTS links (
    slug TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'url',
    is_affiliate INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

