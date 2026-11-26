import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  getServerSupabase,
  hashAdminPassword,
  hasPasswordCollision,
  isMissingAdminsTableError,
  isMissingAssignedClassesColumnError,
  isValidManagedRole,
  toPublicAdminRecord,
  type LibraryAdminDbRow,
} from '@/lib/adminAuth';
import { normalizeAssignedClasses } from '@/lib/adminTypes';

export const dynamic = 'force-dynamic';

async function requireSuperadmin(req: NextRequest) {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: 'Требуется авторизация' },
        { status: 401 }
      ),
    };
  }
  if (admin.role !== 'superadmin') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: 'Управлять администраторами может только главный администратор' },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, admin };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperadmin(req);
  if (!auth.ok) return auth.response;

  const id = params?.id?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Некорректный ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (typeof body?.name === 'string') {
      const trimmedName = body.name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 80) {
        return NextResponse.json(
          { ok: false, error: 'Имя должно содержать от 2 до 80 символов' },
          { status: 400 }
        );
      }
      updates.name = trimmedName;
    }

    if (body?.role !== undefined) {
      if (!isValidManagedRole(body.role)) {
        return NextResponse.json({ ok: false, error: 'Некорректная роль' }, { status: 400 });
      }
      updates.role = body.role;
    }

    if (typeof body?.note === 'string') {
      updates.note = body.note.trim().slice(0, 120);
    }

    let requestedAssignedClasses: string[] | undefined;
    if (body?.assigned_classes !== undefined) {
      requestedAssignedClasses =
        body?.role === 'admin' ? [] : normalizeAssignedClasses(body.assigned_classes);
      updates.assigned_classes = requestedAssignedClasses;
    } else if (body?.role === 'admin') {
      requestedAssignedClasses = [];
      updates.assigned_classes = [];
    }

    if (typeof body?.is_active === 'boolean') {
      updates.is_active = body.is_active;
    }

    if (typeof body?.password === 'string' && body.password.trim().length > 0) {
      const newPassword = body.password.trim();
      if (newPassword.length < 4 || newPassword.length > 100) {
        return NextResponse.json(
          { ok: false, error: 'Новый пароль должен содержать от 4 до 100 символов' },
          { status: 400 }
        );
      }

      const collisionCheck = await hasPasswordCollision(newPassword, id);
      if (collisionCheck.collision) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Этот пароль уже используется другим администратором (или главным паролем). Придумайте другой пароль.',
          },
          { status: 409 }
        );
      }

      updates.password_hash = hashAdminPassword(newPassword);
      updates.password_updated_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Нет данных для обновления' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();
    let updatedRow: (Partial<LibraryAdminDbRow> & { id: string; name: string; role: string }) | null = null;

    const fullRes = await supabase
      .from('library_admins')
      .update(updates)
      .eq('id', id)
      .select('id, name, role, note, assigned_classes, is_active, last_login_at, password_updated_at, created_at')
      .maybeSingle();

    if (fullRes.error) {
      if (isMissingAssignedClassesColumnError(fullRes.error)) {
        if (requestedAssignedClasses && requestedAssignedClasses.length > 0) {
          return NextResponse.json(
            {
              ok: false,
              classesColumnMissing: true,
              error:
                'Чтобы сохранять закреплённые классы, выполните SQL из файла supabase_admins_assigned_classes.sql в Supabase.',
            },
            { status: 503 }
          );
        }

        const fallbackUpdates = { ...updates };
        delete fallbackUpdates.assigned_classes;

        if (Object.keys(fallbackUpdates).length === 0) {
          const readRes = await supabase
            .from('library_admins')
            .select('id, name, role, note, is_active, last_login_at, password_updated_at, created_at')
            .eq('id', id)
            .maybeSingle();
          if (readRes.error) throw readRes.error;
          updatedRow = readRes.data as LibraryAdminDbRow | null;
        } else {
          const fallbackRes = await supabase
            .from('library_admins')
            .update(fallbackUpdates)
            .eq('id', id)
            .select('id, name, role, note, is_active, last_login_at, password_updated_at, created_at')
            .maybeSingle();
          if (fallbackRes.error) throw fallbackRes.error;
          updatedRow = fallbackRes.data as LibraryAdminDbRow | null;
        }
      } else if (isMissingAdminsTableError(fullRes.error)) {
        return NextResponse.json(
          { ok: false, tableMissing: true, error: 'Таблица library_admins не создана' },
          { status: 503 }
        );
      } else {
        throw fullRes.error;
      }
    } else {
      updatedRow = fullRes.data as LibraryAdminDbRow | null;
    }

    if (!updatedRow) {
      return NextResponse.json(
        { ok: false, error: 'Администратор не найден' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      admin: toPublicAdminRecord(updatedRow),
    });
  } catch (err) {
    console.error('Ошибка обновления администратора:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось обновить данные администратора' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperadmin(req);
  if (!auth.ok) return auth.response;

  const id = params?.id?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Некорректный ID' }, { status: 400 });
  }

  try {
    const supabase = getServerSupabase();
    const { error } = await supabase.from('library_admins').delete().eq('id', id);

    if (error) {
      if (isMissingAdminsTableError(error)) {
        return NextResponse.json(
          { ok: false, tableMissing: true, error: 'Таблица library_admins не создана' },
          { status: 503 }
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Ошибка удаления администратора:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось удалить администратора' },
      { status: 500 }
    );
  }
}
