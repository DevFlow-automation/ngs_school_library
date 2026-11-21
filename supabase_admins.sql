-- Таблица дополнительных администраторов и кураторов библиотеки
-- Выполните этот SQL один раз в Supabase Dashboard -> SQL Editor

CREATE TABLE IF NOT EXISTS library_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'supervisor' CHECK (role IN ('supervisor', 'admin')),
  note TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_admins_active
  ON library_admins(is_active, created_at DESC);

ALTER TABLE library_admins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'library_admins' AND policyname = 'Allow all operations on library_admins'
  ) THEN
    CREATE POLICY "Allow all operations on library_admins"
      ON library_admins
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
