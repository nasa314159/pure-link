-- Voluntary support is intentionally isolated from AI-credit checkout requests,
-- orders, balances, and their credit-granting triggers.
CREATE TABLE IF NOT EXISTS ecpay_support_checkout_requests (
    id TEXT PRIMARY KEY,
    merchant_trade_no TEXT NOT NULL UNIQUE CHECK (length(merchant_trade_no) <= 20),
    expected_amount INTEGER NOT NULL CHECK (expected_amount >= 50 AND expected_amount <= 10000),
    public_name INTEGER NOT NULL DEFAULT 0 CHECK (public_name IN (0, 1)),
    public_message INTEGER NOT NULL DEFAULT 0 CHECK (public_message IN (0, 1)),
    public_amount INTEGER NOT NULL DEFAULT 0 CHECK (public_amount IN (0, 1)),
    public_display_name TEXT CHECK (public_display_name IS NULL OR length(public_display_name) <= 60),
    public_message_text TEXT CHECK (public_message_text IS NULL OR length(public_message_text) <= 200),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (public_name = 1 OR public_display_name IS NULL),
    CHECK (public_message = 1 OR public_message_text IS NULL)
);

CREATE TABLE IF NOT EXISTS ecpay_support_contributions (
    merchant_trade_no TEXT PRIMARY KEY,
    trade_no TEXT NOT NULL UNIQUE,
    checkout_request_id TEXT NOT NULL UNIQUE,
    amount INTEGER NOT NULL CHECK (amount >= 50 AND amount <= 10000),
    public_name INTEGER NOT NULL DEFAULT 0 CHECK (public_name IN (0, 1)),
    public_message INTEGER NOT NULL DEFAULT 0 CHECK (public_message IN (0, 1)),
    public_amount INTEGER NOT NULL DEFAULT 0 CHECK (public_amount IN (0, 1)),
    public_display_name TEXT CHECK (public_display_name IS NULL OR length(public_display_name) <= 60),
    public_message_text TEXT CHECK (public_message_text IS NULL OR length(public_message_text) <= 200),
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status = 'paid'),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (checkout_request_id) REFERENCES ecpay_support_checkout_requests(id),
    CHECK (public_name = 1 OR public_display_name IS NULL),
    CHECK (public_message = 1 OR public_message_text IS NULL)
);

-- ECPay refunds are not invoked automatically by the Worker. After an operator
-- verifies a manual ECPay refund, this append-only reconciliation ledger makes
-- the public net total/history reflect that reversal without touching credits.
CREATE TABLE IF NOT EXISTS ecpay_support_reconciliations (
    id TEXT PRIMARY KEY,
    merchant_trade_no TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind = 'refund'),
    amount INTEGER NOT NULL CHECK (amount > 0),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_trade_no) REFERENCES ecpay_support_contributions(merchant_trade_no)
);
CREATE INDEX IF NOT EXISTS idx_ecpay_support_reconciliations_trade
ON ecpay_support_reconciliations(merchant_trade_no, created_at);

-- The manual ledger is append-only. Reject an unknown contribution and any
-- cumulative refund above the original verified support at the database edge.
CREATE TRIGGER IF NOT EXISTS ecpay_support_reconciliation_insert_guard
BEFORE INSERT ON ecpay_support_reconciliations
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
    ) THEN RAISE(ABORT, 'Unknown ECPay support contribution') END;
    SELECT CASE WHEN NEW.amount > (
        SELECT amount - COALESCE((
            SELECT SUM(amount) FROM ecpay_support_reconciliations
            WHERE merchant_trade_no = NEW.merchant_trade_no AND kind = 'refund'
        ), 0)
        FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
    ) THEN RAISE(ABORT, 'ECPay support refund exceeds contribution amount') END;
END;

CREATE TRIGGER IF NOT EXISTS ecpay_support_reconciliation_update_guard
BEFORE UPDATE OF merchant_trade_no, kind, amount ON ecpay_support_reconciliations
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
    ) THEN RAISE(ABORT, 'Unknown ECPay support contribution') END;
    SELECT CASE WHEN NEW.amount > (
        SELECT amount - COALESCE((
            SELECT SUM(amount) FROM ecpay_support_reconciliations
            WHERE merchant_trade_no = NEW.merchant_trade_no AND kind = 'refund' AND id != OLD.id
        ), 0)
        FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
    ) THEN RAISE(ABORT, 'ECPay support refund exceeds contribution amount') END;
END;
