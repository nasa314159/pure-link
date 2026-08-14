CREATE TABLE IF NOT EXISTS ecpay_checkout_requests (
    id TEXT PRIMARY KEY,
    merchant_trade_no TEXT NOT NULL UNIQUE CHECK (length(merchant_trade_no) <= 20),
    user_id TEXT NOT NULL,
    tier TEXT NOT NULL,
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
    ON CONFLICT(user_id) DO UPDATE SET balance = balance + NEW.credits_total, lifetime_purchased = lifetime_purchased + NEW.credits_total, updated_at = CURRENT_TIMESTAMP;
END;
