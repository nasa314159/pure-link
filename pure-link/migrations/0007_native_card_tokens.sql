-- Short-lived, opaque authorization for Android's verified multi-link Card creation flow.
-- Raw nativeCreateToken values are never persisted.
CREATE TABLE IF NOT EXISTS native_card_tokens (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_native_card_tokens_expiry
ON native_card_tokens(expires_at);
