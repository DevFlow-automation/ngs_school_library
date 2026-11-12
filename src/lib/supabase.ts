import { createClient } from '@supabase/supabase-js';

// Публичный URL вашего проекта в Supabase
const supabaseUrl = 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  'https://jxflqkmnmjqwbadreqfz.supabase.co';

// Вставьте сюда ВАШ скопированный ключ anon (который начинается с eyJhbGciOi...)
const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4Zmxxa21ubWpnd2JhZHJlcWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NTc1MzEsImV4cCI6MjEwODIzMzUzMX0.5mRLX9t9QXfN8O7m5ul0ehjEimB3QAhTZGPgkoOJ_so';

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
