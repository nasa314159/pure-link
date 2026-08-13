ALTER TABLE users
ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1));

CREATE TABLE formula_ai_daily_usage_next (
    user_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0 AND request_count <= 100),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, usage_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO formula_ai_daily_usage_next (user_id, usage_date, request_count, updated_at)
SELECT user_id, usage_date, request_count, updated_at
FROM formula_ai_daily_usage;

DROP TABLE formula_ai_daily_usage;

ALTER TABLE formula_ai_daily_usage_next RENAME TO formula_ai_daily_usage;
