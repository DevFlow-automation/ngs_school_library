import { supabase } from '@/lib/supabase';
import { formatReadingDuration, formatTurnSpeed } from '@/lib/readingMetrics';

export const AUTO_WARNING_SENDER_NAME = 'Система контроля чтения (Авто)';

export type AutoWarningReason =
  | 'fast_pages'
  | 'fast_chapters'
  | 'chapter_skip'
  | 'unverified_completion'
  | 'autoclicker';

export interface AutoWarningParams {
  studentId: string;
  bookId: string;
  bookTitle: string;
  reason: AutoWarningReason;
  /** Дополнительные детали для текста сообщения */
  fastStreak?: number;
  pagesTurned?: number;
  fastTurnsCount?: number;
  avgSecondsPerPage?: number;
  readingSeconds?: number;
  fromChapter?: number; // 1-based
  toChapter?: number; // 1-based
  completionReason?: string;
  autoclickerDetail?: string;
}

const COOLDOWN_STORAGE_KEY = 'ngs_auto_warnings_cooldown_v1';
const SAME_REASON_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 часов на один и тот же тип предупреждения по книге
const ANY_BOOK_WARNING_COOLDOWN_MS = 2 * 60 * 1000; // 2 минуты между разными авто-предупреждениями по одной книге

const REASON_SIGNATURE: Record<AutoWarningReason, string> = {
  fast_pages: 'быстрое перелистывание страниц',
  fast_chapters: 'быстрое перелистывание глав',
  chapter_skip: 'перескок по главам',
  unverified_completion: 'книга не засчитана как прочитанная',
  autoclicker: 'подозрение на автокликер',
};

const inFlightKeys = new Set<string>();
const memoryCooldowns = new Map<string, number>();

export function isAutoWarningMessage(senderName?: string | null): boolean {
  if (!senderName) return false;
  const normalized = senderName.toLowerCase();
  return (
    normalized.includes('система контроля чтения') ||
    normalized.includes('(авто)') ||
    normalized.startsWith('авто')
  );
}

function readCooldownStore(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function writeCooldownStore(store: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    // Очищаем записи старше 48 часов, чтобы не засорять localStorage
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const pruned: Record<string, number> = {};
    for (const [k, ts] of Object.entries(store)) {
      if (typeof ts === 'number' && ts >= cutoff) {
        pruned[k] = ts;
      }
    }
    window.localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Игнорируем ограничения квоты хранилища
  }
}

function getLastSentTimestamp(key: string): number {
  const memTs = memoryCooldowns.get(key) || 0;
  const store = readCooldownStore();
  const lsTs = typeof store[key] === 'number' ? store[key] : 0;
  return Math.max(memTs, lsTs);
}

function markSentTimestamp(studentId: string, bookId: string, reason: AutoWarningReason, now: number) {
  const reasonKey = `${studentId}:${bookId}:${reason}`;
  const bookKey = `${studentId}:${bookId}:any`;
  memoryCooldowns.set(reasonKey, now);
  memoryCooldowns.set(bookKey, now);

  const store = readCooldownStore();
  store[reasonKey] = now;
  store[bookKey] = now;
  writeCooldownStore(store);
}

export function buildAutoWarningMessage(params: AutoWarningParams): string {
  const safeTitle = params.bookTitle || params.bookId;

  switch (params.reason) {
    case 'fast_pages': {
      const detailsParts: string[] = [];
      if (params.fastTurnsCount && params.pagesTurned) {
        detailsParts.push(`быстрых перелистываний: ${params.fastTurnsCount} из ${params.pagesTurned}`);
      } else if (params.fastStreak && params.fastStreak >= 2) {
        detailsParts.push(`${params.fastStreak} стр. подряд быстрее нормы`);
      }
      if (params.avgSecondsPerPage && params.avgSecondsPerPage > 0) {
        detailsParts.push(`средняя скорость ${formatTurnSpeed(params.avgSecondsPerPage)}`);
      }
      const details = detailsParts.length > 0 ? ` (${detailsParts.join(', ')})` : '';
      return `Автоматическое предупреждение по книге «${safeTitle}»: зафиксировано слишком быстрое перелистывание страниц${details}. Пожалуйста, читай внимательнее и в спокойном темпе — быстрые перелистывания не приносят баллы, и книга может не засчитаться.`;
    }

    case 'fast_chapters': {
      const countText =
        params.fastStreak && params.fastStreak >= 2
          ? ` (${params.fastStreak} глав подряд за слишком короткое время)`
          : '';
      return `Автоматическое предупреждение по книге «${safeTitle}»: зафиксировано слишком быстрое перелистывание глав${countText}. Пожалуйста, читай главы целиком и не спеши переходить к следующей.`;
    }

    case 'chapter_skip': {
      const jumpInfo =
        params.fromChapter && params.toChapter
          ? ` (переход с главы ${params.fromChapter} сразу на главу ${params.toChapter})`
          : '';
      const timeInfo =
        typeof params.readingSeconds === 'number' && params.readingSeconds > 0
          ? ` Время чтения: ${formatReadingDuration(params.readingSeconds)}.`
          : '';
      return `Автоматическое предупреждение по книге «${safeTitle}»: зафиксирован перескок по главам${jumpInfo}.${timeInfo} Вернись и прочитай пропущенные главы по порядку, чтобы чтение засчиталось честно.`;
    }

    case 'unverified_completion': {
      const reasonText = params.completionReason
        ? ` Причина: ${params.completionReason}`
        : '';
      return `Автоматическое предупреждение по книге «${safeTitle}»: книга не засчитана как прочитанная на 100%.${reasonText} Прочитай произведение внимательно в спокойном темпе.`;
    }

    case 'autoclicker': {
      const detail = params.autoclickerDetail ? ` (${params.autoclickerDetail})` : '';
      return `Автоматическое предупреждение по книге «${safeTitle}»: зафиксировано подозрение на автокликер или автоматическое перелистывание${detail}. Дальнейшее чтение требует подтверждения внимания.`;
    }
  }
}

/**
 * Автоматически отправляет предупреждение ученику в таблицу student_messages
 * с защитой от повторных отправок (cooldown в памяти/localStorage + проверка последних записей в БД).
 * Возвращает true, если новое сообщение действительно было записано.
 */
export async function sendAutoReadingWarning(params: AutoWarningParams): Promise<boolean> {
  const { studentId, bookId, bookTitle, reason } = params;
  if (!studentId || !bookId) return false;

  const now = Date.now();
  const reasonKey = `${studentId}:${bookId}:${reason}`;
  const bookKey = `${studentId}:${bookId}:any`;

  if (inFlightKeys.has(reasonKey)) return false;

  // Проверка локального cooldown
  const lastSameReason = getLastSentTimestamp(reasonKey);
  if (lastSameReason > 0 && now - lastSameReason < SAME_REASON_COOLDOWN_MS) {
    return false;
  }

  // Между разными типами по одной книге держим паузу 2 минуты (кроме итогового незачёта книги)
  if (reason !== 'unverified_completion') {
    const lastAnyForBook = getLastSentTimestamp(bookKey);
    if (lastAnyForBook > 0 && now - lastAnyForBook < ANY_BOOK_WARNING_COOLDOWN_MS) {
      return false;
    }
  }

  inFlightKeys.add(reasonKey);
  try {
    // Дополнительная защита от дубликатов на случай смены устройства / очистки localStorage
    const sinceIso = new Date(now - SAME_REASON_COOLDOWN_MS).toISOString();
    const { data: recentRows, error: selectError } = await supabase
      .from('student_messages')
      .select('id, sender_name, message, created_at')
      .eq('student_id', studentId)
      .eq('book_id', bookId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(10);

    if (selectError) {
      // Если таблица student_messages ещё не создана — тихо выходим без падения читалки
      return false;
    }

    const signature = REASON_SIGNATURE[reason];
    const hasRecentSameReason = (recentRows || []).some(
      (row) =>
        isAutoWarningMessage(row.sender_name) &&
        typeof row.message === 'string' &&
        row.message.toLowerCase().includes(signature)
    );

    if (hasRecentSameReason) {
      markSentTimestamp(studentId, bookId, reason, now);
      return false;
    }

    const messageText = buildAutoWarningMessage(params);
    const { error: insertError } = await supabase.from('student_messages').insert([
      {
        student_id: studentId,
        book_id: bookId,
        book_title: bookTitle || bookId,
        sender_name: AUTO_WARNING_SENDER_NAME,
        message: messageText,
        is_read: false,
      },
    ]);

    if (insertError) {
      console.error('Ошибка отправки авто-предупреждения:', insertError);
      return false;
    }

    markSentTimestamp(studentId, bookId, reason, now);
    return true;
  } catch (err) {
    console.error('Ошибка при обработке авто-предупреждения:', err);
    return false;
  } finally {
    inFlightKeys.delete(reasonKey);
  }
}
