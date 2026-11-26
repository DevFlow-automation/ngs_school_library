import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  getServerSupabase,
  verifyAdminCanAccessStudent,
} from '@/lib/adminAuth';
import { hasClassRestrictions } from '@/lib/adminTypes';
import { isMissingPointAdjustmentsTableError } from '@/lib/pointAdjustments';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Требуется авторизация администратора' },
      { status: 401 }
    );
  }

  const adjustmentId = String(context?.params?.id || '').trim();
  if (!adjustmentId) {
    return NextResponse.json(
      { ok: false, error: 'Не указан идентификатор записи' },
      { status: 400 }
    );
  }

  try {
    const supabase = getServerSupabase();

    if (hasClassRestrictions(admin)) {
      const { data: adjRow, error: lookupError } = await supabase
        .from('student_point_adjustments')
        .select('id, student_id')
        .eq('id', adjustmentId)
        .maybeSingle();

      if (lookupError) {
        if (isMissingPointAdjustmentsTableError(lookupError)) {
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
        throw lookupError;
      }

      if (!adjRow) {
        return NextResponse.json({ ok: false, error: 'Запись не найдена' }, { status: 404 });
      }

      const access = await verifyAdminCanAccessStudent(admin, adjRow.student_id);
      if (!access.allowed) {
        return NextResponse.json(
          { ok: false, error: access.errorMessage || 'Нет доступа к этому ученику' },
          { status: access.errorStatus || 403 }
        );
      }
    }

    const { error } = await supabase
      .from('student_point_adjustments')
      .delete()
      .eq('id', adjustmentId);

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Ошибка удаления записи начисления баллов:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось удалить запись' },
      { status: 500 }
    );
  }
}
