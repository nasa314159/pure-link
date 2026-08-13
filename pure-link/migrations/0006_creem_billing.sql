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
