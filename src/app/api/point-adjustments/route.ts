import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, getServerSupabase } from '@/lib/adminAuth';
import { formatAdminSenderName } from '@/lib/adminTypes';
import {
  isMissingPointAdjustmentsTableError,
  type StudentPointAdjustment,
} from '@/lib/pointAdjustments';

export const dynamic = 'force-dynamic';

const MAX_ABS_POINTS = 10000;

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
    const rawPoints = Number(body?.points);
    const points = Number.isFinite(rawPoints) ? Math.trunc(rawPoints) : 0;
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
    const notifyStudent = body?.notifyStudent !== false;

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: 'Не указан ученик' },
        { status: 400 }
      );
    }

    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > MAX_ABS_POINTS) {
      return NextResponse.json(
        {
          ok: false,
          error: `Укажите целое число баллов (от −${MAX_ABS_POINTS} до +${MAX_ABS_POINTS}, кроме 0)`,
        },
        { status: 400 }
      );
    }

    if (reason.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'Укажите причину начисления или списания (минимум 2 символа)' },
        { status: 400 }
      );
    }

    const senderName = formatAdminSenderName(admin);
    const supabase = getServerSupabase();

    const { data, error } = await supabase
      .from('student_point_adjustments')
      .insert([
        {
          student_id: studentId,
          points,
          reason,
          sender_name: senderName,
        },
      ])
      .select('id, student_id, points, reason, sender_name, created_at')
      .single();

    if (error) {
      if (isMissingPointAdjustmentsTableError(error)) {
        return NextResponse.json(
          {
            ok: false,
            tableMissing: true,
            error:
              'Таблица student_point_adjustments ещё не создана в Supabase. Выполните SQL из файла supabase_point_adjustments.sql.',
          },
          { status: 503 }
        );
      }
      throw error;
    }

    if (notifyStudent) {
      const notifText =
        points > 0
          ? `🎁 Вам начислено +${points} б.\nПричина: ${reason}`
          : `⚖️ С вашего счёта списано ${Math.abs(points)} б.\nПричина: ${reason}`;
      try {
        await supabase.from('student_messages').insert([
          {
            student_id: studentId,
            book_id: null,
            book_title: null,
            sender_name: senderName,
            message: notifText,
            is_read: false,
          },
        ]);
      } catch {
        // Таблица student_messages может отсутствовать — начисление уже сохранено
      }
    }

    return NextResponse.json(
      { ok: true, adjustment: data as StudentPointAdjustment },
      { status: 201 }
    );
  } catch (err) {
    console.error('Ошибка начисления баллов ученику:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось сохранить изменение баллов' },
      { status: 500 }
    );
  }
}
