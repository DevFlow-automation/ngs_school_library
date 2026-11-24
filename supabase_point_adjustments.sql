-- Таблица ручных начислений и списаний баллов ученикам с историей и причинами
-- Выполните этот SQL один раз в Supabase Dashboard -> SQL Editor

CREATE TABLE IF NOT EXISTS student_point_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK (points <> 0),
  reason TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT 'Администратор библиотеки',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_point_adjustments_student_id
  ON student_point_adjustments(student_id, created_at DESC);

ALTER TABLE student_point_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'student_point_adjustments'
      AND policyname = 'Allow all operations on student_point_adjustments'
  ) THEN
    CREATE POLICY "Allow all operations on student_point_adjustments"
      ON student_point_adjustments
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
