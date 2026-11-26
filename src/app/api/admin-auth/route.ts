import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  createSessionToken,
  getAuthenticatedAdmin,
  getMasterPassword,
  getServerSupabase,
  isMissingAdminsTableError,
  isMissingAssignedClassesColumnError,
  safeEqualStrings,
  setAdminSessionCookie,
  verifyAdminPassword,
  type LibraryAdminDbRow,
} from '@/lib/adminAuth';
import { normalizeAssignedClasses, type AdminSessionUser } from '@/lib/adminTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    const res = NextResponse.json(
      { authenticated: false, admin: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    if (req.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
      clearAdminSessionCookie(res);
    }
    return res;
  }

  return NextResponse.json(
    { authenticated: true, admin },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawPassword = typeof body?.password === 'string' ? body.password : '';
    const trimmedPassword = rawPassword.trim();

    if (!trimmedPassword) {
      return NextResponse.json(
        { ok: false, error: 'Введите пароль' },
        { status: 400 }
      );
    }

    const masterPassword = getMasterPassword();
    if (
      safeEqualStrings(rawPassword, masterPassword) ||
      safeEqualStrings(trimmedPassword, masterPassword)
    ) {
      const superadmin: AdminSessionUser = {
        id: 'superadmin',
        name: 'Главный администратор',
        role: 'superadmin',
        note: 'Полный доступ',
        assigned_classes: [],
      };
      const token = createSessionToken(superadmin, 'master');
      const res = NextResponse.json(
        { ok: true, admin: superadmin },
        { headers: { 'Cache-Control': 'no-store' } }
      );
      setAdminSessionCookie(res, token);
      return res;
    }

    // Проверяем дополнительных администраторов и кураторов из таблицы library_admins
    const supabase = getServerSupabase();
    let rows: Partial<LibraryAdminDbRow>[] = [];
    const fullRes = await supabase
      .from('library_admins')
      .select('id, name, role, note, assigned_classes, password_hash, is_active, password_updated_at')
      .order('created_at', { ascending: false });

    if (fullRes.error) {
      if (isMissingAssignedClassesColumnError(fullRes.error)) {
        const fallbackRes = await supabase
          .from('library_admins')
          .select('id, name, role, note, password_hash, is_active, password_updated_at')
          .order('created_at', { ascending: false });
        if (fallbackRes.error) {
          if (isMissingAdminsTableError(fallbackRes.error)) {
            return NextResponse.json(
              { ok: false, error: 'Неверный пароль' },
              { status: 401 }
            );
          }
          console.error('Ошибка проверки library_admins:', fallbackRes.error);
          return NextResponse.json(
            { ok: false, error: 'Ошибка проверки пароля' },
            { status: 500 }
          );
        }
        rows = (fallbackRes.data || []) as Partial<LibraryAdminDbRow>[];
      } else if (isMissingAdminsTableError(fullRes.error)) {
        return NextResponse.json(
          { ok: false, error: 'Неверный пароль' },
          { status: 401 }
        );
      } else {
        console.error('Ошибка проверки library_admins:', fullRes.error);
        return NextResponse.json(
          { ok: false, error: 'Ошибка проверки пароля' },
          { status: 500 }
        );
      }
    } else {
      rows = (fullRes.data || []) as Partial<LibraryAdminDbRow>[];
    }

    const candidates =
      rawPassword === trimmedPassword ? [rawPassword] : [rawPassword, trimmedPassword];

    let matchedInactive = false;

    for (const row of rows) {
      if (!row.id || !row.name || !row.password_hash) continue;
      const matches = candidates.some((candidate) =>
        verifyAdminPassword(candidate, row.password_hash!)
      );
      if (!matches) continue;

      if (!row.is_active) {
        matchedInactive = true;
        continue;
      }

      const role = row.role === 'admin' ? 'admin' : 'supervisor';
      const sessionUser: AdminSessionUser = {
        id: row.id,
        name: row.name,
        role,
        note: row.note || '',
        assigned_classes:
          role === 'supervisor' ? normalizeAssignedClasses(row.assigned_classes) : [],
      };

      // Обновляем время последнего входа (best-effort)
      try {
        await supabase
          .from('library_admins')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', row.id);
      } catch {
        // Игнорируем сбой обновления timestamp
      }

      const token = createSessionToken(sessionUser, String(row.password_updated_at || ''));
      const res = NextResponse.json(
        { ok: true, admin: sessionUser },
        { headers: { 'Cache-Control': 'no-store' } }
      );
      setAdminSessionCookie(res, token);
      return res;
    }

    if (matchedInactive) {
      return NextResponse.json(
        { ok: false, error: 'Доступ этого администратора временно отключён главным администратором' },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: false, error: 'Неверный пароль' }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Ошибка запроса' }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  clearAdminSessionCookie(res);
  return res;
}
