-- Additive hardening of the Ko-fi refund-ledger unit semantics; pairs with
-- the source-side currency validation. Stored amounts use a fixed two-decimal
-- scale, NOT ISO minor units: amount_minor is the displayed amount times 100
-- in every currency, including zero-decimal ones (1500 JPY is stored as
-- 150000, not 1500). A refund entered in an ISO minor-unit reading ("minor
-- units" taken as the yen itself) would pass the existing cumulative and
-- currency guards yet misstate the public net display, because 300 JPY
-- subtracted from a 150000-scale balance reads as 1497 JPY remaining.
-- For zero-decimal currencies every legitimate refund is a whole amount
-- recorded × 100, so the stored entry is always a multiple of 100; entries
-- that are not (for example amounts entered on the yen itself, whose value is
-- then not a whole amount on the stored scale) are refused at the database
-- edge rather than silently misstating the ledger. Operators must still apply
-- the documented fixed scale; this guard additionally verifies it.
CREATE TRIGGER IF NOT EXISTS kofi_refund_reconciliation_insert_zero_decimal_unit_guard
BEFORE INSERT ON kofi_refund_reconciliations
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id AND currency = 'JPY'
) AND NEW.amount_minor % 100 != 0
BEGIN
    SELECT RAISE(ABORT, 'Ko-fi refund unit mismatch');
END;

CREATE TRIGGER IF NOT EXISTS kofi_refund_reconciliation_update_zero_decimal_unit_guard
BEFORE UPDATE OF amount_minor, currency ON kofi_refund_reconciliations
FOR EACH ROW WHEN EXISTS (
    SELECT 1 FROM kofi_donations WHERE kofi_transaction_id = NEW.kofi_transaction_id AND currency = 'JPY'
) AND NEW.amount_minor % 100 != 0
BEGIN
    SELECT RAISE(ABORT, 'Ko-fi refund unit mismatch');
END;
