-- Historical Creem tables remain untouched for already-applied installations.
-- New checkout, fulfillment, and support records use Lemon Squeezy-only tables.
CREATE TABLE IF NOT EXISTS lemon_checkout_requests (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('credit', 'support')),
    user_id TEXT,
    variant_id TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    public_attribution INTEGER NOT NULL DEFAULT 0 CHECK (public_attribution IN (0, 1)),
    public_display_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK ((kind = 'credit' AND user_id IS NOT NULL AND credits > 0) OR (kind = 'support' AND user_id IS NULL AND credits = 0)),
    CHECK (public_attribution = 1 OR public_display_name IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_lemon_checkout_requests_user_created
ON lemon_checkout_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lemon_credit_orders (
    provider_order_id TEXT PRIMARY KEY,
    checkout_request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    credits_total INTEGER NOT NULL CHECK (credits_total > 0),
    credits_refunded INTEGER NOT NULL DEFAULT 0 CHECK (credits_refunded >= 0 AND credits_refunded <= credits_total),
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    refunded_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount_minor >= 0 AND refunded_amount_minor <= amount_minor),
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'partial_refund', 'refunded')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (checkout_request_id) REFERENCES lemon_checkout_requests(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS lemon_credit_order_grant_credits
AFTER INSERT ON lemon_credit_orders
BEGIN
    INSERT INTO formula_ai_credit_balances (user_id, balance, lifetime_purchased, lifetime_consumed, updated_at)
    VALUES (NEW.user_id, NEW.credits_total, NEW.credits_total, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
        balance = formula_ai_credit_balances.balance + NEW.credits_total,
        lifetime_purchased = formula_ai_credit_balances.lifetime_purchased + NEW.credits_total,
        updated_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS lemon_credit_order_remove_refunded_credits
AFTER UPDATE OF credits_refunded ON lemon_credit_orders
WHEN NEW.credits_refunded > OLD.credits_refunded
BEGIN
    UPDATE formula_ai_credit_balances
    SET balance = MAX(0, balance - (NEW.credits_refunded - OLD.credits_refunded)), updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id;
END;

CREATE TABLE IF NOT EXISTS lemon_support_contributions (
    provider_order_id TEXT PRIMARY KEY,
    checkout_request_id TEXT NOT NULL UNIQUE,
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    currency TEXT NOT NULL,
    usd_amount_minor INTEGER,
    refunded_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount_minor >= 0 AND refunded_amount_minor <= amount_minor),
    refunded_usd_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (refunded_usd_amount_minor >= 0 AND (usd_amount_minor IS NULL OR refunded_usd_amount_minor <= usd_amount_minor)),
    public_attribution INTEGER NOT NULL DEFAULT 0 CHECK (public_attribution IN (0, 1)),
    public_display_name TEXT,
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'partial_refund', 'refunded')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (checkout_request_id) REFERENCES lemon_checkout_requests(id),
    CHECK (public_attribution = 1 OR public_display_name IS NULL)
);

CREATE TABLE IF NOT EXISTS lemon_webhook_events (
    event_key TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    provider_order_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
