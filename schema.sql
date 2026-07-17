CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK (price > 0),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  end_mode TEXT NOT NULL DEFAULT 'date' CHECK (end_mode IN ('date', 'duration')),
  planned_days INTEGER,
  exclude_weekends INTEGER NOT NULL DEFAULT 0 CHECK (exclude_weekends IN (0, 1)),
  auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1)),
  renewed_from_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_end_date ON items (end_date);
CREATE INDEX IF NOT EXISTS idx_items_renewed_from_id ON items (renewed_from_id);
