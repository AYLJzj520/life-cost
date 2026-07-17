ALTER TABLE items ADD COLUMN end_mode TEXT NOT NULL DEFAULT 'date';
ALTER TABLE items ADD COLUMN planned_days INTEGER;
ALTER TABLE items ADD COLUMN exclude_weekends INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN renewed_from_id TEXT;

CREATE INDEX IF NOT EXISTS idx_items_renewed_from_id ON items (renewed_from_id);
