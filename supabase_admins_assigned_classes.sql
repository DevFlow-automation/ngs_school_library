-- Добавление привязки классов к кураторам / классным руководителям
-- Выполните этот SQL один раз в Supabase Dashboard -> SQL Editor

ALTER TABLE library_admins
  ADD COLUMN IF NOT EXISTS assigned_classes TEXT[] NOT NULL DEFAULT '{}';
