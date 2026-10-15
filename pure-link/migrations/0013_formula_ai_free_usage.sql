ALTER TABLE formula_ai_daily_usage
ADD COLUMN free_count INTEGER NOT NULL DEFAULT 0 CHECK (free_count >= 0 AND free_count <= 100);

UPDATE formula_ai_daily_usage
SET free_count = MIN(
    request_count,
    COALESCE(
        (SELECT CASE WHEN users.is_admin = 1 THEN 100 ELSE 5 END
         FROM users WHERE users.id = formula_ai_daily_usage.user_id),
        5
    )
);
