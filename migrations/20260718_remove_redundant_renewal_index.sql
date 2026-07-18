CREATE UNIQUE INDEX IF NOT EXISTS idx_items_unique_renewed_from_id
  ON items (renewed_from_id)
  WHERE renewed_from_id IS NOT NULL;

DROP INDEX IF EXISTS idx_items_renewed_from_id;
