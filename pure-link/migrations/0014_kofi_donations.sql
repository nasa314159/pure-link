-- Ko-fi donation receipts are intentionally isolated from AI-credit checkout
-- requests, orders, balances, and their credit-granting triggers. Ko-fi lets a
-- supporter pay the creator directly (Ko-fi/PayPal/Stripe); the Worker only
-- records the provider-emitted webhook payload. No user ID, pack ID, or credit
-- count exists on this rail, and no email, personal message, or display name
-- is stored before an operator separately authorizes public attribution.
CREATE TABLE IF NOT EXISTS kofi_donations (
    -- Provider payment identifier. It is the deduplication anchor: repeated
    -- delivery is idempotent, and a conflicting payload reusing the identifier
    -- can never overwrite the recorded transaction.
    kofi_transaction_id TEXT PRIMARY KEY CHECK (length(kofi_transaction_id) BETWEEN 8 AND 64),
    -- Ko-fi delivery (message) identifier. UNIQUE collapses redelivery of the
    -- same webhook message.
    kofi_message_id TEXT NOT NULL UNIQUE CHECK (length(kofi_message_id) BETWEEN 8 AND 64),
    -- One-time donation or recurring monthly donation payment. Membership
    -- payments are never stored here during Phase 1.
    receipt_type TEXT NOT NULL CHECK (receipt_type IN ('donation', 'recurring_donation')),
    -- Exact original amount and currency. amount_minor is integer minor units
    -- converted on ingest without floating-point arithmetic; amount_text keeps
    -- the provider's literal decimal string for audit.
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 100000000),
    amount_text TEXT NOT NULL CHECK (length(amount_text) BETWEEN 1 AND 15),
    currency TEXT NOT NULL CHECK (length(currency) BETWEEN 3 AND 3),
    -- Ko-fi ISO-8601 UTC payment timestamp, validated on ingest.
    paid_at TEXT NOT NULL CHECK (length(paid_at) BETWEEN 20 AND 64),
    -- Public attribution is an operator decision recorded in PureLink, never
    -- implied from the Ko-fi is_public flag. Every new receipt is private.
    attribution_state TEXT NOT NULL DEFAULT 'private' CHECK (attribution_state IN ('private', 'authorized')),
    public_amount INTEGER NOT NULL DEFAULT 0 CHECK (public_amount IN (0, 1)),
    public_name INTEGER NOT NULL DEFAULT 0 CHECK (public_name IN (0, 1)),
    public_message INTEGER NOT NULL DEFAULT 0 CHECK (public_message IN (0, 1)),
    public_display_name TEXT CHECK (public_display_name IS NULL OR length(public_display_name) <= 60),
    public_message_text TEXT CHECK (public_message_text IS NULL OR length(public_message_text) <= 2000),
    ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (public_name = 1 OR public_display_name IS NULL),
    CHECK (public_message = 1 OR public_message_text IS NULL),
    CHECK (attribution_state = 'authorized' OR (public_amount = 0 AND public_name = 0 AND public_message = 0))
);

-- Every processed webhook delivery is recorded under its Ko-fi message id so
-- repeat delivery is acknowledged exactly like the first attempt, and
-- unsupported events are preserved without ever being recorded as donations.
CREATE TABLE IF NOT EXISTS kofi_webhook_events (
    event_key TEXT PRIMARY KEY,
    message_id TEXT NOT NULL CHECK (length(message_id) BETWEEN 1 AND 64),
    received_event TEXT NOT NULL CHECK (received_event IN ('donation', 'recurring_donation', 'membership', 'shop_order', 'commission')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_kofi_webhook_events_message
ON kofi_webhook_events(message_id, created_at);

-- Ko-fi does not emit refund webhooks, and refund state is never inferred from
-- later payment events. After an operator verifies the actual refund in the
-- Ko-fi/PayPal/Stripe console, this append-only ledger makes the public
-- supporter display reflect that reversal. It never touches AI credits.
CREATE TABLE IF NOT EXISTS kofi_refund_reconciliations (
    id TEXT PRIMARY KEY,
    kofi_transaction_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind = 'refund'),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 100000000),
    currency TEXT NOT NULL CHECK (length(currency) BETWEEN 3 AND 3),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kofi_transaction_id) REFERENCES kofi_donations(kofi_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_kofi_refund_reconciliations_transaction
ON kofi_refund_reconciliations(kofi_transaction_id, created_at);

-- The manual ledger is append-only. Reject an unknown donation and any
-- cumulative refund above the original verified donation at the database edge.
CREATE TRIGGER IF NOT EXISTS kofi_refund_reconciliation_insert_unknown_guard
BEFORE INSERT ON kofi_refund_reconciliations
FOR EACH ROW WHEN NOT EXISTS (
    SELECT 1 FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
)
BEGIN
    SELECT RAISE(ABORT, 'Unknown Ko-fi donation');
END;

CREATE TRIGGER IF NOT EXISTS kofi_refund_reconciliation_insert_currency_guard
BEFORE INSERT ON kofi_refund_reconciliations
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
) AND NEW.currency != (
    SELECT currency FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
)
BEGIN
    SELECT RAISE(ABORT, 'Ko-fi refund currency mismatch');
END;

CREATE TRIGGER IF NOT EXISTS kofi_refund_reconciliation_insert_amount_guard
BEFORE INSERT ON kofi_refund_reconciliations
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
) AND NEW.amount_minor > (
    SELECT amount_minor - COALESCE((
        SELECT SUM(amount_minor) FROM kofi_refund_reconciliations
        WHERE kofi_transaction_id = NEW.kofi_transaction_id AND kind = 'refund'
    ), 0)
    FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
)
BEGIN
    SELECT RAISE(ABORT, 'Ko-fi refund exceeds donation amount');
END;

CREATE TRIGGER IF NOT EXISTS kofi_refund_reconciliation_update_unknown_guard
BEFORE UPDATE OF kofi_transaction_id, kind, amount_minor, currency ON kofi_refund_reconciliations
FOR EACH ROW WHEN NOT EXISTS (
    SELECT 1 FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
)
BEGIN
    SELECT RAISE(ABORT, 'Unknown Ko-fi donation');
END;

CREATE TRIGGER IF NOT EXISTS kofi_refund_reconciliation_update_currency_guard
BEFORE UPDATE OF kofi_transaction_id, kind, amount_minor, currency ON kofi_refund_reconciliations
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
) AND NEW.currency != (
    SELECT currency FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
)
BEGIN
    SELECT RAISE(ABORT, 'Ko-fi refund currency mismatch');
END;

CREATE TRIGGER IF NOT EXISTS kofi_refund_reconciliation_update_amount_guard
BEFORE UPDATE OF kofi_transaction_id, kind, amount_minor, currency ON kofi_refund_reconciliations
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
) AND NEW.amount_minor > (
    SELECT amount_minor - COALESCE((
        SELECT SUM(amount_minor) FROM kofi_refund_reconciliations
        WHERE kofi_transaction_id = NEW.kofi_transaction_id AND kind = 'refund' AND id != OLD.id
    ), 0)
    FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id
)
BEGIN
    SELECT RAISE(ABORT, 'Ko-fi refund exceeds donation amount');
END;
