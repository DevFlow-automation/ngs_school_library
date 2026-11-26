import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  getServerSupabase,
  verifyAdminCanAccessStudent,
} from '@/lib/adminAuth';
import { formatAdminSenderName } from '@/lib/adminTypes';

export const dynamic = 'force-dynamic';

function isMissingMetricsColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const msg = String(err.message || '').toLowerCase();
  return (
    err.code === 'PGRST204' ||
    err.code === '42703' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

function clampFloat(value: unknown, min: number, max: number, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(min, Math.min(max, num));
  return Math.round(clamped * 10) / 10;
}

export async function POST(req: NextRequest) {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Требуется авторизация администратора' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
    const bookId = typeof body?.bookId === 'string' ? body.bookId.trim() : '';

    if (!studentId || !bookId) {
      return NextResponse.json(
        { ok: false, error: 'Не указаны ученик или книга' },
        { status: 400 }
      );
    }

    const access = await verifyAdminCanAccessStudent(admin, studentId);
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: access.errorMessage || 'Нет доступа к этому ученику' },
        { status: access.errorStatus || 403 }
      );
    }

    const currentChapter = clampInt(body?.currentChapter, 0, 5000, 0);
    const currentPage = clampInt(body?.currentPage, 0, 50000, 0);
    const progressPercent = clampInt(body?.progressPercent, 0, 100, 0);
    const readingSeconds = clampInt(body?.readingSeconds, 0, 10_000_000, 0);
    const pagesTurned = clampInt(body?.pagesTurned, 0, 1_000_000, 0);
    const fastTurnsCount = clampInt(body?.fastTurnsCount, 0, pagesTurned, 0);
    const avgSecondsPerPage = clampFloat(body?.avgSecondsPerPage, 0, 3600, 0);

    const rawMin = body?.minSecondsPerPage;
    const minSecondsPerPage =
      rawMin === null || rawMin === undefined || rawMin === ''
        ? null
        : clampFloat(rawMin, 0.1, 3600, 0);

    const isBookmarked = Boolean(body?.isBookmarked);
    const notifyStudent = Boolean(body?.notifyStudent);
    const bookTitle = typeof body?.bookTitle === 'string' ? body.bookTitle.trim() : '';
    const notifyReason = typeof body?.notifyReason === 'string' ? body.notifyReason.trim() : '';
    const lastReadAt =
      typeof body?.lastReadAt === 'string' && !Number.isNaN(Date.parse(body.lastReadAt))
        ? body.lastReadAt
        : new Date().toISOString();

    const fullPayload = {
      student_id: studentId,
      book_id: bookId,
      is_bookmarked: isBookmarked,
      current_chapter: currentChapter,
      current_page: currentPage,
      progress_percent: progressPercent,
      reading_seconds: readingSeconds,
      pages_turned: pagesTurned,
      fast_turns_count: fastTurnsCount,
      avg_seconds_per_page: avgSecondsPerPage,
      min_seconds_per_page: minSecondsPerPage,
      last_read_at: lastReadAt,
    };

    const basePayload = {
      student_id: studentId,
      book_id: bookId,
      is_bookmarked: isBookmarked,
      current_chapter: currentChapter,
      current_page: currentPage,
      progress_percent: progressPercent,
      last_read_at: lastReadAt,
    };

    const supabase = getServerSupabase();
    let savedRow: unknown = null;
    let metricsSkipped = false;

    const { data, error } = await supabase
      .from('reading_progress')
      .upsert(fullPayload, { onConflict: 'student_id,book_id' })
      .select('*')
      .maybeSingle();

    if (error) {
      if (isMissingMetricsColumnError(error)) {
        metricsSkipped = true;
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('reading_progress')
          .upsert(basePayload, { onConflict: 'student_id,book_id' })
          .select('*')
          .maybeSingle();
        if (fallbackError) throw fallbackError;
        savedRow = fallbackData;
      } else {
        throw error;
      }
    } else {
      savedRow = data;
    }

    if (notifyStudent) {
      const senderName = formatAdminSenderName(admin);
      const label = bookTitle || 'книге';
      const baseText = `📖 Прогресс по книге «${label}» обновлён администратором: Глава ${currentChapter + 1}, стр. ${currentPage + 1} (${progressPercent}%).`;
      const message = notifyReason ? `${baseText}\nКомментарий: ${notifyReason}` : baseText;
      try {
        await supabase.from('student_messages').insert([
          {
            student_id: studentId,
            book_id: bookId,
            book_title: bookTitle || null,
            sender_name: senderName,
            message,
            is_read: false,
          },
        ]);
      } catch {
        // Таблица student_messages может отсутствовать — прогресс уже сохранён
      }
    }

    return NextResponse.json({
      ok: true,
      row: savedRow,
      metricsSkipped,
    });
  } catch (err) {
    console.error('Ошибка обновления прогресса ученика:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось сохранить прогресс чтения' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Требуется авторизация администратора' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const progressId = typeof body?.progressId === 'string' ? body.progressId.trim() : '';
    const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
    const bookId = typeof body?.bookId === 'string' ? body.bookId.trim() : '';
    const keepBookmark = Boolean(body?.keepBookmark);

    if (!progressId && (!studentId || !bookId)) {
      return NextResponse.json(
        { ok: false, error: 'Не указана запись прогресса для сброса' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Сохраняем снимок до сброса, чтобы админ мог откатить случайную очистку
    let query = supabase.from('reading_progress').select('*');
    if (progressId) {
      query = query.eq('id', progressId);
    } else {
      query = query.eq('student_id', studentId).eq('book_id', bookId);
    }
    const { data: existingRow } = await query.maybeSingle();

    const targetStudentId = String(existingRow?.student_id || studentId || '').trim();
    if (targetStudentId) {
      const access = await verifyAdminCanAccessStudent(admin, targetStudentId);
      if (!access.allowed) {
        return NextResponse.json(
          { ok: false, error: access.errorMessage || 'Нет доступа к этому ученику' },
          { status: access.errorStatus || 403 }
        );
      }
    }

    const targetId = existingRow?.id || progressId;

    const zeroFull = {
      current_chapter: 0,
      current_page: 0,
      progress_percent: 0,
      reading_seconds: 0,
      pages_turned: 0,
      fast_turns_count: 0,
      avg_seconds_per_page: 0,
      min_seconds_per_page: null,
    };
    const zeroBase = {
      current_chapter: 0,
      current_page: 0,
      progress_percent: 0,
    };

    if (keepBookmark && existingRow?.is_bookmarked) {
      let upd = supabase.from('reading_progress').update(zeroFull);
      upd = targetId
        ? upd.eq('id', targetId)
        : upd.eq('student_id', studentId).eq('book_id', bookId);
      const { error: updErr } = await upd;
      if (updErr) {
        if (isMissingMetricsColumnError(updErr)) {
          let fb = supabase.from('reading_progress').update(zeroBase);
          fb = targetId
            ? fb.eq('id', targetId)
            : fb.eq('student_id', studentId).eq('book_id', bookId);
          const { error: fbErr } = await fb;
          if (fbErr) throw fbErr;
        } else {
          throw updErr;
        }
      }
    } else {
      // Сначала обнуляем (на случай если DELETE ограничен RLS), затем удаляем строку
      let upd = supabase.from('reading_progress').update(zeroFull);
      upd = targetId
        ? upd.eq('id', targetId)
        : upd.eq('student_id', studentId).eq('book_id', bookId);
      const { error: updErr } = await upd;
      if (updErr && isMissingMetricsColumnError(updErr)) {
        let fb = supabase.from('reading_progress').update(zeroBase);
        fb = targetId
          ? fb.eq('id', targetId)
          : fb.eq('student_id', studentId).eq('book_id', bookId);
        await fb;
      }

      let del = supabase.from('reading_progress').delete();
      del = targetId
        ? del.eq('id', targetId)
        : del.eq('student_id', studentId).eq('book_id', bookId);
      await del;
    }

    return NextResponse.json({
      ok: true,
      previousRow: existingRow || null,
    });
  } catch (err) {
    console.error('Ошибка сброса прогресса ученика:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось сбросить прогресс' },
      { status: 500 }
    );
  }
}
