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
