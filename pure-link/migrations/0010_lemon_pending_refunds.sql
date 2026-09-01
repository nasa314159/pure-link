-- A signed Lemon refund can arrive before its order_created webhook. Keep only
-- the verified cumulative monetary state until the local order is available.
CREATE TABLE IF NOT EXISTS lemon_pending_refunds (
    provider_order_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('partial_refund', 'refunded')),
    total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
    refunded_amount_minor INTEGER NOT NULL CHECK (refunded_amount_minor >= 0 AND refunded_amount_minor <= total_minor),
    total_usd_minor INTEGER NOT NULL CHECK (total_usd_minor >= 0),
    refunded_usd_amount_minor INTEGER NOT NULL CHECK (refunded_usd_amount_minor >= 0 AND refunded_usd_amount_minor <= total_usd_minor),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
