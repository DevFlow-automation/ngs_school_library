export interface AdminProgressRow {
  id?: string;
  student_id?: string;
  book_id: string;
  is_bookmarked: boolean;
  current_chapter: number;
  current_page: number;
  progress_percent: number;
  reading_seconds?: number | null;
  pages_turned?: number | null;
  fast_turns_count?: number | null;
  avg_seconds_per_page?: number | null;
  min_seconds_per_page?: number | null;
  last_read_at?: string | null;
}

export interface ResetProgressBackup {
  backupId: string;
  studentId: string;
  studentName: string;
  bookId: string;
  bookTitle: string;
  resetAt: string;
  snapshot: AdminProgressRow;
}

const STORAGE_KEY = 'ngs_admin_reset_progress_backups_v1';
const MAX_BACKUPS = 40;

function readAllBackups(): ResetProgressBackup[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ResetProgressBackup[]) : [];
  } catch {
    return [];
  }
}

function writeAllBackups(items: ResetProgressBackup[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_BACKUPS)));
  } catch {
    // localStorage может быть недоступен в приватном режиме
  }
}

export function saveResetBackup(entry: Omit<ResetProgressBackup, 'backupId' | 'resetAt'>): ResetProgressBackup {
  const backup: ResetProgressBackup = {
    ...entry,
    backupId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    resetAt: new Date().toISOString(),
  };

  const existing = readAllBackups();
  writeAllBackups([backup, ...existing]);
  return backup;
}

export function getResetBackupsForStudent(studentId: string): ResetProgressBackup[] {
  if (!studentId) return [];
  return readAllBackups().filter((item) => item.studentId === studentId);
}

export function removeResetBackup(backupId: string): void {
  const existing = readAllBackups();
  writeAllBackups(existing.filter((item) => item.backupId !== backupId));
}
