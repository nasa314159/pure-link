-- D1/SQLite cannot alter a CHECK constraint in place. Rebuild the isolated
-- support ledger with the wider public-message limit while preserving existing
-- rows, UTC timestamps, keys, relationships, index, and refund guards.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE ecpay_support_checkout_requests_v2 (
    id TEXT PRIMARY KEY,
    merchant_trade_no TEXT NOT NULL UNIQUE CHECK (length(merchant_trade_no) <= 20),
    expected_amount INTEGER NOT NULL CHECK (expected_amount >= 50 AND expected_amount <= 10000),
    public_name INTEGER NOT NULL DEFAULT 0 CHECK (public_name IN (0, 1)),
    public_message INTEGER NOT NULL DEFAULT 0 CHECK (public_message IN (0, 1)),
    public_amount INTEGER NOT NULL DEFAULT 0 CHECK (public_amount IN (0, 1)),
    public_display_name TEXT CHECK (public_display_name IS NULL OR length(public_display_name) <= 60),
    public_message_text TEXT CHECK (public_message_text IS NULL OR length(public_message_text) <= 2000),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (public_name = 1 OR public_display_name IS NULL),
    CHECK (public_message = 1 OR public_message_text IS NULL)
);
INSERT INTO ecpay_support_checkout_requests_v2 (
    id, merchant_trade_no, expected_amount, public_name, public_message, public_amount,
    public_display_name, public_message_text, status, created_at, updated_at
)
SELECT id, merchant_trade_no, expected_amount, public_name, public_message, public_amount,
    public_display_name, public_message_text, status, created_at, updated_at
FROM ecpay_support_checkout_requests;

CREATE TABLE ecpay_support_contributions_v2 (
    merchant_trade_no TEXT PRIMARY KEY,
    trade_no TEXT NOT NULL UNIQUE,
    checkout_request_id TEXT NOT NULL UNIQUE,
    amount INTEGER NOT NULL CHECK (amount >= 50 AND amount <= 10000),
    public_name INTEGER NOT NULL DEFAULT 0 CHECK (public_name IN (0, 1)),
    public_message INTEGER NOT NULL DEFAULT 0 CHECK (public_message IN (0, 1)),
    public_amount INTEGER NOT NULL DEFAULT 0 CHECK (public_amount IN (0, 1)),
    public_display_name TEXT CHECK (public_display_name IS NULL OR length(public_display_name) <= 60),
    public_message_text TEXT CHECK (public_message_text IS NULL OR length(public_message_text) <= 2000),
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status = 'paid'),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (checkout_request_id) REFERENCES ecpay_support_checkout_requests_v2(id),
    CHECK (public_name = 1 OR public_display_name IS NULL),
    CHECK (public_message = 1 OR public_message_text IS NULL)
);
INSERT INTO ecpay_support_contributions_v2 (
    merchant_trade_no, trade_no, checkout_request_id, amount, public_name, public_message,
    public_amount, public_display_name, public_message_text, status, created_at
)
SELECT merchant_trade_no, trade_no, checkout_request_id, amount, public_name, public_message,
    public_amount, public_display_name, public_message_text, status, created_at
FROM ecpay_support_contributions;

CREATE TABLE ecpay_support_reconciliations_v2 (
    id TEXT PRIMARY KEY,
    merchant_trade_no TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind = 'refund'),
    amount INTEGER NOT NULL CHECK (amount > 0),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_trade_no) REFERENCES ecpay_support_contributions_v2(merchant_trade_no)
);
INSERT INTO ecpay_support_reconciliations_v2 (id, merchant_trade_no, kind, amount, note, created_at)
SELECT id, merchant_trade_no, kind, amount, note, created_at
FROM ecpay_support_reconciliations;

DROP TABLE ecpay_support_reconciliations;
DROP TABLE ecpay_support_contributions;
DROP TABLE ecpay_support_checkout_requests;
ALTER TABLE ecpay_support_checkout_requests_v2 RENAME TO ecpay_support_checkout_requests;
ALTER TABLE ecpay_support_contributions_v2 RENAME TO ecpay_support_contributions;
ALTER TABLE ecpay_support_reconciliations_v2 RENAME TO ecpay_support_reconciliations;

CREATE INDEX idx_ecpay_support_reconciliations_trade
ON ecpay_support_reconciliations(merchant_trade_no, created_at);

CREATE TRIGGER ecpay_support_reconciliation_insert_unknown_guard
BEFORE INSERT ON ecpay_support_reconciliations
FOR EACH ROW WHEN NOT EXISTS (
    SELECT 1 FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
)
BEGIN
    SELECT RAISE(ABORT, 'Unknown ECPay support contribution');
END;

CREATE TRIGGER ecpay_support_reconciliation_insert_amount_guard
BEFORE INSERT ON ecpay_support_reconciliations
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
) AND NEW.amount > (
    SELECT amount - COALESCE((
        SELECT SUM(amount) FROM ecpay_support_reconciliations
        WHERE merchant_trade_no = NEW.merchant_trade_no AND kind = 'refund'
    ), 0)
    FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
)
BEGIN
    SELECT RAISE(ABORT, 'ECPay support refund exceeds contribution amount');
END;

CREATE TRIGGER ecpay_support_reconciliation_update_unknown_guard
BEFORE UPDATE OF merchant_trade_no, kind, amount ON ecpay_support_reconciliations
FOR EACH ROW WHEN NOT EXISTS (
    SELECT 1 FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
)
BEGIN
    SELECT RAISE(ABORT, 'Unknown ECPay support contribution');
END;

CREATE TRIGGER ecpay_support_reconciliation_update_amount_guard
BEFORE UPDATE OF merchant_trade_no, kind, amount ON ecpay_support_reconciliations
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
) AND NEW.amount > (
    SELECT amount - COALESCE((
        SELECT SUM(amount) FROM ecpay_support_reconciliations
        WHERE merchant_trade_no = NEW.merchant_trade_no AND kind = 'refund' AND id != OLD.id
    ), 0)
    FROM ecpay_support_contributions WHERE merchant_trade_no = NEW.merchant_trade_no
)
BEGIN
    SELECT RAISE(ABORT, 'ECPay support refund exceeds contribution amount');
END;

PRAGMA defer_foreign_keys = OFF;
