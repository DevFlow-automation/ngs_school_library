import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin, getServerSupabase } from '@/lib/adminAuth';
import { canAdminAccessClass, hasClassRestrictions } from '@/lib/adminTypes';
import { normalizeStudentClass, normalizeStudentName } from '@/lib/studentNormalize';

export const dynamic = 'force-dynamic';

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string };
  const msg = `${err.code || ''} ${err.message || ''} ${err.details || ''}`.toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Требуется авторизация администратора' },
      { status: 401 }
    );
  }

  const id = String(params?.id || '').trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Некорректный ID ученика' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const rawName = typeof body?.full_name === 'string' ? body.full_name : '';
    const rawClass = typeof body?.grade_class === 'string' ? body.grade_class : '';

    const nextName = normalizeStudentName(rawName);
    const nextClass = normalizeStudentClass(rawClass);

    if (nextName.length < 2 || nextName.length > 100) {
      return NextResponse.json(
        { ok: false, error: 'ФИО ученика должно содержать от 2 до 100 символов' },
        { status: 400 }
      );
    }

    if (nextClass.length < 1 || nextClass.length > 20) {
      return NextResponse.json(
        { ok: false, error: 'Укажите корректный класс ученика (например, 7 «А»)' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    const { data: existing, error: fetchError } = await supabase
      .from('students')
      .select('id, full_name, grade_class')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Ученик не найден' }, { status: 404 });
    }

    if (!canAdminAccessClass(admin, existing.grade_class)) {
      return NextResponse.json(
        { ok: false, error: 'Нет доступа к ученику из другого класса' },
        { status: 403 }
      );
    }

    if (hasClassRestrictions(admin) && !canAdminAccessClass(admin, nextClass)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Вы можете указывать только закреплённые за вами классы: ${admin.assigned_classes.join(', ')}`,
        },
        { status: 403 }
      );
    }

    const { data: duplicate, error: dupError } = await supabase
      .from('students')
      .select('id')
      .eq('full_name', nextName)
      .eq('grade_class', nextClass)
      .neq('id', id)
      .maybeSingle();

    if (dupError) throw dupError;
    if (duplicate) {
      return NextResponse.json(
        {
          ok: false,
          error: `Ученик «${nextName}» (${nextClass}) уже существует в базе.`,
        },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('students')
      .update({ full_name: nextName, grade_class: nextClass })
      .eq('id', id)
      .select('id, full_name, grade_class, created_at')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Не удалось обновить данные ученика. Проверьте права доступа (RLS UPDATE) для таблицы students в Supabase.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true, student: updated });
  } catch (err) {
    console.error('Ошибка обновления ученика:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось обновить данные ученика' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Требуется авторизация администратора' },
      { status: 401 }
    );
  }

  const id = String(params?.id || '').trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Некорректный ID ученика' }, { status: 400 });
  }

  try {
    const supabase = getServerSupabase();

    const { data: existing, error: fetchError } = await supabase
      .from('students')
      .select('id, full_name, grade_class')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Ученик не найден' }, { status: 404 });
    }

    if (!canAdminAccessClass(admin, existing.grade_class)) {
      return NextResponse.json(
        { ok: false, error: 'Нет доступа к ученику из другого класса' },
        { status: 403 }
      );
    }

    // Очищаем связанные записи на случай, если в БД нет ON DELETE CASCADE
    const { error: progressDelError } = await supabase
      .from('reading_progress')
      .delete()
      .eq('student_id', id);
    if (progressDelError && !isMissingTableError(progressDelError)) {
      console.warn('Не удалось удалить reading_progress перед удалением ученика:', progressDelError);
    }

    try {
      const { error: msgDelError } = await supabase
        .from('student_messages')
        .delete()
        .eq('student_id', id);
      if (msgDelError && !isMissingTableError(msgDelError)) {
        console.warn('Не удалось удалить student_messages перед удалением ученика:', msgDelError);
      }
    } catch {
      // Таблица student_messages может отсутствовать
    }

    try {
      const { error: adjDelError } = await supabase
        .from('student_point_adjustments')
        .delete()
        .eq('student_id', id);
      if (adjDelError && !isMissingTableError(adjDelError)) {
        console.warn(
          'Не удалось удалить student_point_adjustments перед удалением ученика:',
          adjDelError
        );
      }
    } catch {
      // Таблица student_point_adjustments может отсутствовать
    }

    const { data: deleted, error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (deleteError) throw deleteError;

    if (!deleted) {
      const { data: stillExists } = await supabase
        .from('students')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (stillExists) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Не удалось удалить ученика. Проверьте права доступа (RLS DELETE) для таблицы students в Supabase.',
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error('Ошибка удаления ученика:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось удалить ученика' },
      { status: 500 }
    );
  }
}
