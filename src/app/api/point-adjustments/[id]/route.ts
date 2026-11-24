import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, getServerSupabase } from '@/lib/adminAuth';
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
