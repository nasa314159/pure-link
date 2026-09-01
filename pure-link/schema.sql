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

-- Short-lived, opaque authorization for verified Android multi-link Card creation.
-- The raw client token, clipboard data, and Card body are never stored here.
CREATE TABLE IF NOT EXISTS native_card_tokens (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_native_card_tokens_expiry
ON native_card_tokens(expires_at);

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

CREATE TABLE IF NOT EXISTS formula_ai_credit_balances (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    lifetime_purchased INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_purchased >= 0),
    lifetime_consumed INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_consumed >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing_checkout_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider = 'creem'),
    product_id TEXT NOT NULL,
    credits INTEGER NOT NULL CHECK (credits > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_user_created
ON billing_checkout_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_orders (
    provider_order_id TEXT PRIMARY KEY,
    provider_event_id TEXT NOT NULL UNIQUE,
    checkout_request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    credits_total INTEGER NOT NULL CHECK (credits_total > 0),
    credits_refunded INTEGER NOT NULL DEFAULT 0 CHECK (credits_refunded >= 0 AND credits_refunded <= credits_total),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'partially_refunded', 'refunded', 'disputed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (checkout_request_id) REFERENCES billing_checkout_requests(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_billing_orders_user_created
ON billing_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_events (
    provider_event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    provider_order_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS billing_order_grant_credits
AFTER INSERT ON billing_orders
BEGIN
    INSERT INTO formula_ai_credit_balances (
        user_id, balance, lifetime_purchased, lifetime_consumed, updated_at
    ) VALUES (
        NEW.user_id, NEW.credits_total, NEW.credits_total, 0, CURRENT_TIMESTAMP
    )
    ON CONFLICT(user_id) DO UPDATE SET
        balance = formula_ai_credit_balances.balance + NEW.credits_total,
        lifetime_purchased = formula_ai_credit_balances.lifetime_purchased + NEW.credits_total,
        updated_at = CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS billing_order_remove_refunded_credits
AFTER UPDATE OF credits_refunded ON billing_orders
WHEN NEW.credits_refunded > OLD.credits_refunded
BEGIN
    UPDATE formula_ai_credit_balances
    SET balance = MAX(0, balance - (NEW.credits_refunded - OLD.credits_refunded)),
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id;
END;

-- New provider records are intentionally separate from historical Creem tables.
CREATE TABLE IF NOT EXISTS lemon_checkout_requests (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('credit', 'support')),
    user_id TEXT,
    pack_id TEXT,
    variant_id TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    public_attribution INTEGER NOT NULL DEFAULT 0 CHECK (public_attribution IN (0, 1)),
    public_display_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK ((kind = 'credit' AND user_id IS NOT NULL AND pack_id IN ('small', 'standard', 'large') AND credits > 0) OR (kind = 'support' AND user_id IS NULL AND pack_id IS NULL AND credits = 0)),
    CHECK (public_attribution = 1 OR public_display_name IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_lemon_checkout_requests_user_created ON lemon_checkout_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lemon_credit_orders (
    provider_order_id TEXT PRIMARY KEY,
    checkout_request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    pack_id TEXT NOT NULL CHECK (pack_id IN ('small', 'standard', 'large')),
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
CREATE TRIGGER IF NOT EXISTS lemon_credit_order_grant_credits AFTER INSERT ON lemon_credit_orders BEGIN
    INSERT INTO formula_ai_credit_balances (user_id, balance, lifetime_purchased, lifetime_consumed, updated_at)
    VALUES (NEW.user_id, NEW.credits_total, NEW.credits_total, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET balance = formula_ai_credit_balances.balance + NEW.credits_total, lifetime_purchased = formula_ai_credit_balances.lifetime_purchased + NEW.credits_total, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER IF NOT EXISTS lemon_credit_order_remove_refunded_credits AFTER UPDATE OF credits_refunded ON lemon_credit_orders WHEN NEW.credits_refunded > OLD.credits_refunded BEGIN
    UPDATE formula_ai_credit_balances SET balance = MAX(0, balance - (NEW.credits_refunded - OLD.credits_refunded)), updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
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

CREATE TABLE IF NOT EXISTS ecpay_checkout_requests (
    id TEXT PRIMARY KEY,
    merchant_trade_no TEXT NOT NULL UNIQUE CHECK (length(merchant_trade_no) <= 20),
    user_id TEXT NOT NULL,
    pack_id TEXT NOT NULL CHECK (pack_id IN ('small', 'standard', 'large')),
    expected_amount INTEGER NOT NULL CHECK (expected_amount > 0),
    expected_credits INTEGER NOT NULL CHECK (expected_credits > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ecpay_orders (
    merchant_trade_no TEXT PRIMARY KEY,
    trade_no TEXT NOT NULL UNIQUE,
    checkout_request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    pack_id TEXT NOT NULL CHECK (pack_id IN ('small', 'standard', 'large')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    credits_total INTEGER NOT NULL CHECK (credits_total > 0),
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status = 'paid'),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (checkout_request_id) REFERENCES ecpay_checkout_requests(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TRIGGER IF NOT EXISTS ecpay_order_grant_credits AFTER INSERT ON ecpay_orders BEGIN
    INSERT INTO formula_ai_credit_balances (user_id, balance, lifetime_purchased, lifetime_consumed, updated_at)
    VALUES (NEW.user_id, NEW.credits_total, NEW.credits_total, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET balance = formula_ai_credit_balances.balance + NEW.credits_total, lifetime_purchased = formula_ai_credit_balances.lifetime_purchased + NEW.credits_total, updated_at = CURRENT_TIMESTAMP;
END;
