import { normalizeStudentClass } from './studentNormalize';

export type AdminRole = 'superadmin' | 'admin' | 'supervisor';

export type ManagedAdminRole = 'supervisor' | 'admin';

export interface AdminSessionUser {
  id: string;
  name: string;
  role: AdminRole;
  note: string;
  assigned_classes: string[];
}

export interface AdminRecordPublic {
  id: string;
  name: string;
  role: ManagedAdminRole;
  note: string;
  assigned_classes: string[];
  is_active: boolean;
  last_login_at: string | null;
  password_updated_at: string;
  created_at: string;
}

export const ADMIN_ROLE_LABELS: Record<
  AdminRole,
  { label: string; shortLabel: string; description: string }
> = {
  superadmin: {
    label: 'Главный администратор',
    shortLabel: 'Главный админ',
    description: 'Полный доступ ко всем разделам и управлению другими администраторами',
  },
  admin: {
    label: 'Полный администратор',
    shortLabel: 'Администратор',
    description: 'Управление книгами, загрузкой, цитатами и контроль учеников',
  },
  supervisor: {
    label: 'Куратор / Учитель',
    shortLabel: 'Куратор',
    description: 'Контроль чтения учеников, просмотр профилей и отправка замечаний',
  },
};

export function formatAdminSenderName(admin: AdminSessionUser | null): string {
  if (!admin || admin.role === 'superadmin') {
    return 'Администратор библиотеки';
  }
  const roleTag = admin.role === 'admin' ? 'Администратор' : 'Куратор';
  return `${admin.name} (${roleTag})`;
}

function parseGradeNumber(value: string): number {
  const m = String(value || '').match(/\d{1,2}/);
  return m ? parseInt(m[0], 10) : 99;
}

export function normalizeAssignedClasses(input: unknown): string[] {
  const rawList: string[] = Array.isArray(input)
    ? input.filter((v): v is string => typeof v === 'string')
    : typeof input === 'string'
    ? input.split(/[,;\n]+/)
    : [];

  const unique = new Set<string>();
  for (const item of rawList) {
    const normalized = normalizeStudentClass(item);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique).sort((a, b) => {
    const diff = parseGradeNumber(a) - parseGradeNumber(b);
    return diff !== 0 ? diff : a.localeCompare(b, 'ru');
  });
}

export function hasClassRestrictions(admin: AdminSessionUser | null | undefined): boolean {
  return Boolean(
    admin &&
      admin.role === 'supervisor' &&
      Array.isArray(admin.assigned_classes) &&
      admin.assigned_classes.length > 0
  );
}

export function canAdminAccessClass(
  admin: AdminSessionUser | null | undefined,
  gradeClass: string | null | undefined
): boolean {
  if (!admin) return false;
  if (!hasClassRestrictions(admin)) return true;

  const target = normalizeStudentClass(String(gradeClass || ''));
  if (!target) return false;

  return admin.assigned_classes.some(
    (cls) => normalizeStudentClass(cls) === target
  );
}
