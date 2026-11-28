-- PayPal voluntary support is intentionally isolated from AI-credit checkout
-- requests, orders, balances, and their credit-granting triggers. No user ID,
-- pack ID, or credit count exists on this rail, so a PayPal event can never
-- reach a fulfillment path. Payer identity (email, payer ID, full profile) is
-- deliberately absent: only the consent-controlled attribution columns below
-- are ever stored, and they hold supporter-entered text exclusively.
--
-- Money is exact integer minor units (US cents): expected/verified amounts are
-- never floats, and currency is pinned to USD by CHECK constraints.

-- Local checkout identity created before any money moves. One row per support
-- checkout; the durable PayPal request ids make create and capture each
-- individually idempotent across retries and parallel callers.
CREATE TABLE IF NOT EXISTS paypal_support_checkouts (
    id TEXT PRIMARY KEY,
    -- Stable create-order idempotency key (PayPal-Request-Id), fixed per row.
    paypal_request_id TEXT NOT NULL UNIQUE CHECK (length(paypal_request_id) <= 64),
    -- PayPal Orders v2 identity. Unique so a re-used or forged order id can
    -- never attach to two local checkouts.
    paypal_order_id TEXT UNIQUE CHECK (paypal_order_id IS NULL OR length(paypal_order_id) BETWEEN 5 AND 64),
    expected_amount_minor INTEGER NOT NULL CHECK (expected_amount_minor >= 300 AND expected_amount_minor <= 30000),
    expected_currency TEXT NOT NULL CHECK (expected_currency = 'USD'),
    -- Expected recipient merchant identity, snapshotted at create time and
    -- re-verified against PayPal's payee on every lookup/capture.
    merchant_id TEXT NOT NULL CHECK (length(merchant_id) BETWEEN 3 AND 64),
    public_name INTEGER NOT NULL DEFAULT 0 CHECK (public_name IN (0, 1)),
    public_message INTEGER NOT NULL DEFAULT 0 CHECK (public_message IN (0, 1)),
    public_amount INTEGER NOT NULL DEFAULT 0 CHECK (public_amount IN (0, 1)),
    public_display_name TEXT CHECK (public_display_name IS NULL OR length(public_display_name) <= 60),
    public_message_text TEXT CHECK (public_message_text IS NULL OR length(public_message_text) <= 2000),
    -- pending          local checkout created, buyer has not approved yet
    -- approved         PayPal reports the order APPROVED; capture initiated or due
    -- capture_pending  capture initiated but completion unconfirmed (uncertain outcome)
    -- completed        capture verified and contribution recorded
    -- failed           capture denied/declined, or order voided
    -- expired          stale abandoned checkout (record retained, never deleted)
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'capture_pending', 'completed', 'failed', 'expired')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (public_name = 1 OR public_display_name IS NULL),
    CHECK (public_message = 1 OR public_message_text IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_paypal_support_checkouts_status
ON paypal_support_checkouts(status, updated_at);

-- One row per verified capture. All accounting entry points (browser return,
-- approval webhook, capture webhook, operator reconciliation) converge on the
-- same idempotent insert: the capture identity is the primary key.
CREATE TABLE IF NOT EXISTS paypal_support_contributions (
    paypal_capture_id TEXT PRIMARY KEY CHECK (length(paypal_capture_id) BETWEEN 5 AND 64),
    paypal_order_id TEXT NOT NULL UNIQUE CHECK (length(paypal_order_id) BETWEEN 5 AND 64),
    checkout_request_id TEXT NOT NULL UNIQUE REFERENCES paypal_support_checkouts(id),
    merchant_id TEXT NOT NULL CHECK (length(merchant_id) BETWEEN 3 AND 64),
    -- Exact verified gross amount in US cents; equals the checkout expectation.
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 300 AND amount_minor <= 30000),
    currency TEXT NOT NULL CHECK (currency = 'USD'),
    -- capture_pending keeps the money visible while PayPal reports PENDING.
    -- refunded/reversed rows stay for accounting (they are never deleted).
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('capture_pending', 'completed', 'partially_refunded', 'refunded', 'reversed', 'disputed')),
    refunded_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount_minor >= 0 AND refunded_amount_minor <= amount_minor),
    public_name INTEGER NOT NULL DEFAULT 0 CHECK (public_name IN (0, 1)),
    public_message INTEGER NOT NULL DEFAULT 0 CHECK (public_message IN (0, 1)),
    public_amount INTEGER NOT NULL DEFAULT 0 CHECK (public_amount IN (0, 1)),
    public_display_name TEXT CHECK (public_display_name IS NULL OR length(public_display_name) <= 60),
    public_message_text TEXT CHECK (public_message_text IS NULL OR length(public_message_text) <= 2000),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (public_name = 1 OR public_display_name IS NULL),
    CHECK (public_message = 1 OR public_message_text IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_paypal_support_contributions_created
ON paypal_support_contributions(created_at);

-- Append-only refund/reversal ledger observed from verified PayPal events.
-- Rows may precede their capture record (a refund event can arrive before the
-- capture is processed), so paypal_capture_id carries no foreign key; the
-- guards below constrain rows only once the contribution exists.
CREATE TABLE IF NOT EXISTS paypal_support_refunds (
    id TEXT PRIMARY KEY,
    paypal_capture_id TEXT NOT NULL CHECK (length(paypal_capture_id) BETWEEN 5 AND 64),
    -- PayPal refund identity for merchant refunds; NULL for reversals, which
    -- PayPal identifies by capture. Exactly one of the dedupe keys below is
    -- derived per observed operation.
    paypal_refund_id TEXT UNIQUE CHECK (paypal_refund_id IS NULL OR length(paypal_refund_id) BETWEEN 5 AND 64),
    -- Stable per-operation request/dedupe key (e.g. refund:<refund-id> or
    -- reversal:<capture-id>); UNIQUE makes each observed operation idempotent.
    paypal_request_id TEXT NOT NULL UNIQUE CHECK (length(paypal_request_id) <= 96),
    kind TEXT NOT NULL CHECK (kind IN ('refund', 'reversal')),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 30000),
    currency TEXT NOT NULL CHECK (currency = 'USD'),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((kind = 'refund' AND paypal_refund_id IS NOT NULL) OR (kind = 'reversal' AND paypal_refund_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_paypal_support_refunds_capture
ON paypal_support_refunds(paypal_capture_id, created_at);

-- Every verified webhook delivery is recorded before processing. Unverified
-- deliveries are refused and never retained. State machine:
-- verified -> processing -> processed | failed. A processed row acknowledges
-- replay identically; a failed row is the durable recovery record that the
-- operator reconciliation endpoint reprocesses.
CREATE TABLE IF NOT EXISTS paypal_support_webhook_events (
    event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 8 AND 128),
    event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
    state TEXT NOT NULL DEFAULT 'verified' CHECK (state IN ('verified', 'processing', 'processed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT CHECK (last_error IS NULL OR length(last_error) <= 200),
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_paypal_support_webhook_events_state
ON paypal_support_webhook_events(state, updated_at);

-- The ledger is append-only: when the contribution exists, reject any
-- cumulative refund/reversal above the original verified amount at the
-- database edge (rows for captures not yet recorded are retained so a refund
-- event that precedes its capture processing is never lost).
CREATE TRIGGER IF NOT EXISTS paypal_support_refund_insert_amount_guard
BEFORE INSERT ON paypal_support_refunds
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM paypal_support_contributions WHERE paypal_capture_id = NEW.paypal_capture_id
) AND NEW.amount_minor > (
    SELECT amount_minor - COALESCE((
        SELECT SUM(refund.amount_minor)
        FROM paypal_support_refunds refund
        WHERE refund.paypal_capture_id = NEW.paypal_capture_id AND refund.status = 'completed'
    ), 0)
    FROM paypal_support_contributions WHERE paypal_capture_id = NEW.paypal_capture_id
)
BEGIN
    SELECT RAISE(ABORT, 'PayPal support refund exceeds contribution amount');
END;

CREATE TRIGGER IF NOT EXISTS paypal_support_refund_update_amount_guard
BEFORE UPDATE OF paypal_capture_id, kind, amount_minor, status ON paypal_support_refunds
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM paypal_support_contributions WHERE paypal_capture_id = NEW.paypal_capture_id
) AND NEW.amount_minor > (
    SELECT amount_minor - COALESCE((
        SELECT SUM(refund.amount_minor)
        FROM paypal_support_refunds refund
        WHERE refund.paypal_capture_id = NEW.paypal_capture_id
          AND refund.status = 'completed' AND refund.id != OLD.id
    ), 0)
    FROM paypal_support_contributions WHERE paypal_capture_id = NEW.paypal_capture_id
)
BEGIN
    SELECT RAISE(ABORT, 'PayPal support refund exceeds contribution amount');
END;
