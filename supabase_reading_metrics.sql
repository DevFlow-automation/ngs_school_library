-- Добавление колонок таймера чтения и скорости перелистывания страниц в reading_progress
-- Выполните этот SQL один раз в Supabase Dashboard -> SQL Editor

ALTER TABLE reading_progress
  ADD COLUMN IF NOT EXISTS reading_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_turned INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fast_turns_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_seconds_per_page REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_seconds_per_page REAL;
