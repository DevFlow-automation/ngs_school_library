import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest, NextResponse } from 'next/server';
import type { AdminRecordPublic, AdminRole, AdminSessionUser, ManagedAdminRole } from './adminTypes';

export const ADMIN_SESSION_COOKIE = 'ngs_admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 дней
const SCRYPT_N = 4096;
const SCRYPT_KEYLEN = 32;

const DEFAULT_SUPABASE_URL = 'https://jxflqkmnmjqwbadreqfz.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4Zmxxa21ubWpnd2JhZHJlcWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NTc1MzEsImV4cCI6MjEwODIzMzUzMX0.5mRLX9t9QXfN8O7m5ul0ehjEimB3QAhTZGPgkoOJ_so';

export interface LibraryAdminDbRow extends AdminRecordPublic {
  password_hash: string;
}

interface SessionTokenPayload {
  id: string;
  name: string;
  role: AdminRole;
  note: string;
  pwdVer: string;
  exp: number;
}

export function getMasterPassword(): string {
  return process.env.ADMIN_PASSWORD || 'NGS2026';
}

function getSigningKey(): Buffer {
  const baseSecret = process.env.ADMIN_SESSION_SECRET || getMasterPassword();
  return crypto
    .createHash('sha256')
    .update(`${baseSecret}::ngs-library-admin-session-v1`)
    .digest();
}

export function safeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function hashAdminPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: 8, p: 1 })
    .toString('hex');
  return `scrypt:${SCRYPT_N}:${salt}:${derived}`;
}

export function verifyAdminPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
    const costN = Number(parts[1]);
    const salt = parts[2];
    const expectedHex = parts[3];
    if (!Number.isFinite(costN) || costN < 1024 || costN > 65536 || !salt || !expectedHex) {
      return false;
    }
    const derivedBuf = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: costN, r: 8, p: 1 });
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

export function createSessionToken(user: AdminSessionUser, pwdVer: string): string {
  const payload: SessionTokenPayload = {
    id: user.id,
    name: user.name,
    role: user.role,
    note: user.note,
    pwdVer,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningKey())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | undefined): SessionTokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSigningKey())
      .update(encodedPayload)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as SessionTokenPayload;

    if (
      !decoded ||
      typeof decoded.id !== 'string' ||
      typeof decoded.name !== 'string' ||
      typeof decoded.exp !== 'number' ||
      decoded.exp <= Date.now()
    ) {
      return null;
    }

    if (decoded.role !== 'superadmin' && decoded.role !== 'admin' && decoded.role !== 'supervisor') {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function setAdminSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearAdminSessionCookie(res: NextResponse): void {
  res.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function getServerSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_ANON_KEY;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export function isMissingAdminsTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string };
  const msg = `${err.code || ''} ${err.message || ''} ${err.details || ''}`.toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    msg.includes('library_admins') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

export function toPublicAdminRecord(row: LibraryAdminDbRow): AdminRecordPublic {
  return {
    id: row.id,
    name: row.name,
    role: row.role === 'admin' ? 'admin' : 'supervisor',
    note: row.note || '',
    is_active: Boolean(row.is_active),
    last_login_at: row.last_login_at || null,
    password_updated_at: row.password_updated_at,
    created_at: row.created_at,
  };
}

export function isValidManagedRole(value: unknown): value is ManagedAdminRole {
  return value === 'supervisor' || value === 'admin';
}

export async function getAuthenticatedAdmin(req: NextRequest): Promise<AdminSessionUser | null> {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  if (payload.role === 'superadmin') {
    return {
      id: 'superadmin',
      name: 'Главный администратор',
      role: 'superadmin',
      note: 'Полный доступ',
    };
  }

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('library_admins')
      .select('id, name, role, note, is_active, password_updated_at')
      .eq('id', payload.id)
      .maybeSingle();

    if (error || !data) return null;
    if (!data.is_active) return null;
    if (String(data.password_updated_at || '') !== payload.pwdVer) return null;

    return {
      id: data.id,
      name: data.name,
      role: data.role === 'admin' ? 'admin' : 'supervisor',
      note: data.note || '',
    };
  } catch {
    return null;
  }
}

export async function hasPasswordCollision(
  candidatePassword: string,
  excludeAdminId?: string
): Promise<{ collision: boolean; tableMissing: boolean }> {
  if (safeEqualStrings(candidatePassword, getMasterPassword())) {
    return { collision: true, tableMissing: false };
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('library_admins')
    .select('id, password_hash');

  if (error) {
    if (isMissingAdminsTableError(error)) {
      return { collision: false, tableMissing: true };
    }
    throw error;
  }

  const rows = (data || []) as { id: string; password_hash: string }[];
  for (const row of rows) {
    if (excludeAdminId && row.id === excludeAdminId) continue;
    if (verifyAdminPassword(candidatePassword, row.password_hash)) {
      return { collision: true, tableMissing: false };
    }
  }

  return { collision: false, tableMissing: false };
}
