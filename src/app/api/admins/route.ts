import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedAdmin,
  getServerSupabase,
  hashAdminPassword,
  hasPasswordCollision,
  isMissingAdminsTableError,
  isValidManagedRole,
  toPublicAdminRecord,
  type LibraryAdminDbRow,
} from '@/lib/adminAuth';

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

export async function GET(req: NextRequest) {
  const auth = await requireSuperadmin(req);
  if (!auth.ok) return auth.response;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('library_admins')
      .select('id, name, role, note, is_active, last_login_at, password_updated_at, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingAdminsTableError(error)) {
        return NextResponse.json(
          { ok: true, tableMissing: true, admins: [] },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        tableMissing: false,
        admins: (data || []).map((row) => toPublicAdminRecord(row as LibraryAdminDbRow)),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Ошибка загрузки списка администраторов:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось загрузить список администраторов' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperadmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const role = isValidManagedRole(body?.role) ? body.role : 'supervisor';
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 120) : '';
    const password = typeof body?.password === 'string' ? body.password.trim() : '';

    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { ok: false, error: 'Укажите имя администратора (от 2 до 80 символов)' },
        { status: 400 }
      );
    }

    if (password.length < 4 || password.length > 100) {
      return NextResponse.json(
        { ok: false, error: 'Пароль должен содержать от 4 до 100 символов' },
        { status: 400 }
      );
    }

    const collisionCheck = await hasPasswordCollision(password);
    if (collisionCheck.tableMissing) {
      return NextResponse.json(
        {
          ok: false,
          tableMissing: true,
          error: 'Таблица library_admins ещё не создана в Supabase. Выполните SQL из supabase_admins.sql.',
        },
        { status: 503 }
      );
    }
    if (collisionCheck.collision) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Этот пароль уже используется другим администратором (или главным паролем). Придумайте уникальный пароль.',
        },
        { status: 409 }
      );
    }

    const passwordHash = hashAdminPassword(password);
    const nowIso = new Date().toISOString();

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('library_admins')
      .insert([
        {
          name,
          role,
          note,
          password_hash: passwordHash,
          is_active: true,
          password_updated_at: nowIso,
        },
      ])
      .select('id, name, role, note, is_active, last_login_at, password_updated_at, created_at')
      .single();

    if (error) {
      if (isMissingAdminsTableError(error)) {
        return NextResponse.json(
          {
            ok: false,
            tableMissing: true,
            error: 'Таблица library_admins ещё не создана в Supabase. Выполните SQL из supabase_admins.sql.',
          },
          { status: 503 }
        );
      }
      throw error;
    }

    return NextResponse.json(
      { ok: true, admin: toPublicAdminRecord(data as LibraryAdminDbRow) },
      { status: 201 }
    );
  } catch (err) {
    console.error('Ошибка создания администратора:', err);
    return NextResponse.json(
      { ok: false, error: 'Не удалось создать администратора' },
      { status: 500 }
    );
  }
}
