-- Upgrade the original PureLink links table without discarding legacy records.
-- Legacy `type`, `is_affiliate`, and `view_count` columns remain available until
-- a later, verified rebuild removes them.

ALTER TABLE links ADD COLUMN content_type TEXT;
ALTER TABLE links ADD COLUMN signature TEXT;
ALTER TABLE links ADD COLUMN theme TEXT NOT NULL DEFAULT 'paper';
ALTER TABLE links ADD COLUMN management_token_hash TEXT;
ALTER TABLE links ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE links ADD COLUMN updated_at TEXT;
ALTER TABLE links ADD COLUMN expires_at TEXT;

UPDATE links
SET content_type = CASE
    WHEN type = 'url' THEN 'url'
    ELSE 'formula'
END
WHERE content_type IS NULL;

UPDATE links
SET updated_at = created_at
WHERE updated_at IS NULL;

