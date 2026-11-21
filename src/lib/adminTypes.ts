export type AdminRole = 'superadmin' | 'admin' | 'supervisor';

export type ManagedAdminRole = 'supervisor' | 'admin';

export interface AdminSessionUser {
  id: string;
  name: string;
  role: AdminRole;
  note: string;
}

export interface AdminRecordPublic {
  id: string;
  name: string;
  role: ManagedAdminRole;
  note: string;
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
