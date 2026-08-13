CREATE TABLE IF NOT EXISTS formula_ai_daily_usage (
    user_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0 AND request_count <= 5),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, usage_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
