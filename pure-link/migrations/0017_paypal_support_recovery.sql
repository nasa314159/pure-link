-- M1B financial-correctness hardening for the PayPal support rail (additive).
--
-- 1. Durable webhook recovery: verified events retain the minimal provider
--    resource identifiers needed to re-derive the financial outcome from
--    PayPal's authenticated APIs after a processing failure. No payloads and
--    no personal data are stored — order/capture/refund identifiers only.
-- 2. Dispute lifecycle: contributions track the provider-evidenced dispute
--    state separately from the ledger-derived refund status, so refund
--    accounting can never silently clear an unresolved dispute.

ALTER TABLE paypal_support_webhook_events ADD COLUMN paypal_order_id TEXT
  CHECK (paypal_order_id IS NULL OR length(paypal_order_id) BETWEEN 5 AND 64);
ALTER TABLE paypal_support_webhook_events ADD COLUMN paypal_capture_id TEXT
  CHECK (paypal_capture_id IS NULL OR length(paypal_capture_id) BETWEEN 5 AND 64);
ALTER TABLE paypal_support_webhook_events ADD COLUMN paypal_refund_id TEXT
  CHECK (paypal_refund_id IS NULL OR length(paypal_refund_id) BETWEEN 5 AND 64);

ALTER TABLE paypal_support_contributions ADD COLUMN dispute_state TEXT NOT NULL
  DEFAULT 'none' CHECK (dispute_state IN ('none', 'open', 'resolved'));
