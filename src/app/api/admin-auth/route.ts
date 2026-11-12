import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const correctPassword = process.env.ADMIN_PASSWORD || 'NGS2026';

    if (password === correctPassword) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Неверный пароль' }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Ошибка запроса' }, { status: 400 });
  }
}
