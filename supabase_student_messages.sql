-- Таблица сообщений от администратора ученикам (отображаются на странице профиля /profile)
-- Выполните этот SQL один раз в Supabase Dashboard -> SQL Editor

CREATE TABLE IF NOT EXISTS student_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  book_id TEXT,
  book_title TEXT,
  sender_name TEXT NOT NULL DEFAULT 'Администратор библиотеки',
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_messages_student_id
  ON student_messages(student_id, created_at DESC);

ALTER TABLE student_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_messages' AND policyname = 'Allow all operations on student_messages'
  ) THEN
    CREATE POLICY "Allow all operations on student_messages"
      ON student_messages
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
