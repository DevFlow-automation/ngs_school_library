'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  GraduationCap,
  Key,
  Plus,
  Power,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  ADMIN_ROLE_LABELS,
  normalizeAssignedClasses,
  type AdminRecordPublic,
  type ManagedAdminRole,
} from '@/lib/adminTypes';

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS library_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'supervisor' CHECK (role IN ('supervisor', 'admin')),
  note TEXT NOT NULL DEFAULT '',
  assigned_classes TEXT[] NOT NULL DEFAULT '{}',
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_admins_active
  ON library_admins(is_active, created_at DESC);

ALTER TABLE library_admins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'library_admins' AND policyname = 'Allow all operations on library_admins'
  ) THEN
    CREATE POLICY "Allow all operations on library_admins"
      ON library_admins
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;`;

const ADD_CLASSES_COLUMN_SQL = `ALTER TABLE library_admins
  ADD COLUMN IF NOT EXISTS assigned_classes TEXT[] NOT NULL DEFAULT '{}';`;

function generateReadablePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomChunk = (len: number) => {
    const arr = new Uint32Array(len);
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 1e9);
    }
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars[arr[i] % chars.length];
    }
    return out;
  };
  return `NGS-${randomChunk(4)}-${randomChunk(4)}`;
}

interface IssuedCredentials {
  name: string;
  role: ManagedAdminRole;
  note: string;
  assigned_classes: string[];
  password: string;
  isReset: boolean;
}

interface AdminsManagerTabProps {
  onAdminsCountChange?: (count: number) => void;
  availableClasses?: string[];
}

export function AdminsManagerTab({
  onAdminsCountChange,
  availableClasses = [],
}: AdminsManagerTabProps) {
  const [admins, setAdmins] = useState<AdminRecordPublic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [classesColumnMissing, setClassesColumnMissing] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Форма добавления
  const [name, setName] = useState('');
  const [role, setRole] = useState<ManagedAdminRole>('supervisor');
  const [note, setNote] = useState('');
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [customClassInput, setCustomClassInput] = useState('');
  const [password, setPassword] = useState(() => generateReadablePassword());
  const [showCreatePassword, setShowCreatePassword] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Выданный пароль (после создания или сброса)
  const [issuedCredentials, setIssuedCredentials] = useState<IssuedCredentials | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Редактирование админа
  const [editingAdmin, setEditingAdmin] = useState<AdminRecordPublic | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<ManagedAdminRole>('supervisor');
  const [editNote, setEditNote] = useState('');
  const [editAssignedClasses, setEditAssignedClasses] = useState<string[]>([]);
  const [editCustomClassInput, setEditCustomClassInput] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Смена пароля
  const [resetTarget, setResetTarget] = useState<AdminRecordPublic | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetError, setResetError] = useState('');

  // Удаление
  const [deletingAdmin, setDeletingAdmin] = useState<AdminRecordPublic | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Переключение активности
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2200);
    } catch {
      // Fallback для окружений без Clipboard API
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2200);
    }
  };

  const fetchAdmins = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admins', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data?.error || 'Не удалось загрузить список администраторов');
        return;
      }
      setTableMissing(Boolean(data.tableMissing));
      setClassesColumnMissing(Boolean(data.classesColumnMissing));
      const list = (data.admins || []) as AdminRecordPublic[];
      setAdmins(list);
      onAdminsCountChange?.(list.length);
    } catch {
      setLoadError('Ошибка сети при загрузке списка администраторов');
    } finally {
      setIsLoading(false);
    }
  }, [onAdminsCountChange]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) return;

    setIsCreating(true);
    setCreateError('');
    try {
      const submittedPassword = password.trim();
      const submittedName = name.trim();
      const submittedNote = note.trim();
      const submittedClasses =
        role === 'supervisor'
          ? normalizeAssignedClasses([
              ...assignedClasses,
              ...(customClassInput.trim() ? [customClassInput] : []),
            ])
          : [];

      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: submittedName,
          role,
          note: submittedNote,
          assigned_classes: submittedClasses,
          password: submittedPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data?.tableMissing) setTableMissing(true);
        if (data?.classesColumnMissing) setClassesColumnMissing(true);
        setCreateError(data?.error || 'Не удалось добавить администратора');
        return;
      }

      setIssuedCredentials({
        name: submittedName,
        role,
        note: submittedNote,
        assigned_classes: submittedClasses,
        password: submittedPassword,
        isReset: false,
      });
      setName('');
      setNote('');
      setRole('supervisor');
      setAssignedClasses([]);
      setCustomClassInput('');
      setPassword(generateReadablePassword());
      await fetchAdmins();
    } catch {
      setCreateError('Ошибка сети при создании администратора');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleActive = async (admin: AdminRecordPublic) => {
    setTogglingId(admin.id);
    try {
      const res = await fetch(`/api/admins/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !admin.is_active }),
      });
      if (res.ok) {
        await fetchAdmins();
      }
    } finally {
      setTogglingId(null);
    }
  };

  const openEditModal = (admin: AdminRecordPublic) => {
    setEditingAdmin(admin);
    setEditName(admin.name);
    setEditRole(admin.role);
    setEditNote(admin.note || '');
    setEditAssignedClasses(normalizeAssignedClasses(admin.assigned_classes || []));
    setEditCustomClassInput('');
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin || !editName.trim()) return;

    setIsSavingEdit(true);
    setEditError('');
    try {
      const nextAssignedClasses =
        editRole === 'supervisor'
          ? normalizeAssignedClasses([
              ...editAssignedClasses,
              ...(editCustomClassInput.trim() ? [editCustomClassInput] : []),
            ])
          : [];

      const res = await fetch(`/api/admins/${editingAdmin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          role: editRole,
          note: editNote.trim(),
          assigned_classes: nextAssignedClasses,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.classesColumnMissing) setClassesColumnMissing(true);
        setEditError(data?.error || 'Не удалось сохранить изменения');
        return;
      }
      setEditingAdmin(null);
      await fetchAdmins();
    } catch {
      setEditError('Ошибка сети при сохранении');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openResetModal = (admin: AdminRecordPublic) => {
    setResetTarget(admin);
    setResetPassword(generateReadablePassword());
    setResetError('');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !resetPassword.trim()) return;

    setIsResettingPassword(true);
    setResetError('');
    try {
      const nextPwd = resetPassword.trim();
      const res = await fetch(`/api/admins/${resetTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: nextPwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data?.error || 'Не удалось сменить пароль');
        return;
      }

      setIssuedCredentials({
        name: resetTarget.name,
        role: resetTarget.role,
        note: resetTarget.note || '',
        assigned_classes: resetTarget.assigned_classes || [],
        password: nextPwd,
        isReset: true,
      });
      setResetTarget(null);
      await fetchAdmins();
    } catch {
      setResetError('Ошибка сети при смене пароля');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAdmin) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admins/${deletingAdmin.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeletingAdmin(null);
        await fetchAdmins();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const getAdminLoginUrl = () => {
    if (typeof window === 'undefined') return '/admin/load';
    return `${window.location.origin}/admin/load`;
  };

  const buildInviteText = (cred: IssuedCredentials) => {
    const roleLabel = ADMIN_ROLE_LABELS[cred.role].label;
    const lines = [
      'Доступ в панель контроля NGS Библиотеки',
      `Ссылка для входа: ${getAdminLoginUrl()}`,
      `Имя: ${cred.name}${cred.note ? ` (${cred.note})` : ''}`,
      `Роль: ${roleLabel}`,
    ];
    if (cred.role === 'supervisor' && cred.assigned_classes.length > 0) {
      lines.push(`Закреплённые классы: ${cred.assigned_classes.join(', ')}`);
    }
    lines.push(`Пароль: ${cred.password}`);
    return lines.join('\n');
  };

  const toggleClassInList = (
    cls: string,
    list: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(
      list.includes(cls)
        ? list.filter((item) => item !== cls)
        : normalizeAssignedClasses([...list, cls])
    );
  };

  const addCustomClassToList = (
    raw: string,
    list: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    clearInput: () => void
  ) => {
    const parsed = normalizeAssignedClasses(raw);
    if (parsed.length === 0) return;
    setter(normalizeAssignedClasses([...list, ...parsed]));
    clearInput();
  };

  const renderClassPicker = (
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>,
    customVal: string,
    setCustomVal: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const allOptions = normalizeAssignedClasses([...availableClasses, ...selected]);
    return (
      <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/15 border border-emerald-200/70 dark:border-emerald-900/40 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-extrabold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-emerald-600" />
            <span>Закреплённые классы (доступ только к своим ученикам)</span>
          </label>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
            >
              Очистить (видит всех)
            </button>
          )}
        </div>

        <p className="text-[11px] text-emerald-900/80 dark:text-emerald-300/80">
          {selected.length > 0
            ? `Куратор увидит только учеников выбранных классов (${selected.length}): ${selected.join(', ')}.`
            : 'Если классы не выбраны, куратор будет видеть всех учеников школы.'}
        </p>

        {allOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allOptions.map((cls) => {
              const isSelected = selected.includes(cls);
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => toggleClassInList(cls, selected, setSelected)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white dark:bg-[#16181F] text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-emerald-400'
                  }`}
                >
                  {isSelected ? '✓ ' : ''}
                  {cls}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomClassToList(customVal, selected, setSelected, () => setCustomVal(''));
              }
            }}
            placeholder="Добавить класс вручную (напр. 7а или 5б, 5в)..."
            className="flex-1 px-3 py-2 rounded-xl border border-emerald-200 dark:border-gray-700 bg-white dark:bg-[#16181F] text-xs outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() =>
              addCustomClassToList(customVal, selected, setSelected, () => setCustomVal(''))
            }
            disabled={!customVal.trim()}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить</span>
          </button>
        </div>
      </div>
    );
  };

  const activeCount = admins.filter((a) => a.is_active).length;

  return (
    <div className="space-y-6">
      {/* Баннер первичной настройки таблицы в Supabase */}
      {tableMissing && (
        <div className="bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800 rounded-[28px] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <h3 className="font-extrabold text-sm text-amber-950 dark:text-amber-200">
                Нужно один раз создать таблицу администраторов в Supabase
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                Откройте <b>Supabase Dashboard → SQL Editor</b>, вставьте SQL ниже (также сохранён в файле{' '}
                <code className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 font-mono">
                  supabase_admins.sql
                </code>
                ) и нажмите <b>Run</b>. После этого сразу сможете добавлять кураторов и администраторов.
              </p>
            </div>
          </div>

          <pre className="p-3.5 rounded-2xl bg-white/90 dark:bg-[#14161C] border border-amber-200/80 dark:border-amber-900/50 text-[11px] font-mono text-gray-800 dark:text-gray-200 overflow-x-auto max-h-48">
            {SETUP_SQL}
          </pre>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyText(SETUP_SQL, 'setup-sql')}
              className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              {copiedKey === 'setup-sql' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'setup-sql' ? 'SQL скопирован!' : 'Скопировать SQL'}</span>
            </button>
            <button
              type="button"
              onClick={fetchAdmins}
              className="px-4 py-2 rounded-xl bg-white dark:bg-[#1C1F26] border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Проверить снова</span>
            </button>
          </div>
        </div>
      )}

      {/* Баннер добавления колонки assigned_classes для существующей таблицы */}
      {!tableMissing && classesColumnMissing && (
        <div className="bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800 rounded-[28px] p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <h3 className="font-extrabold text-sm text-amber-950 dark:text-amber-200">
                Добавьте колонку классов в Supabase, чтобы закреплять кураторов за классами
              </h3>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                Выполните этот SQL один раз в <b>Supabase Dashboard → SQL Editor</b> (также сохранён в файле{' '}
                <code className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 font-mono">
                  supabase_admins_assigned_classes.sql
                </code>
                ):
              </p>
            </div>
          </div>

          <pre className="p-3 rounded-2xl bg-white/90 dark:bg-[#14161C] border border-amber-200/80 dark:border-amber-900/50 text-[11px] font-mono text-gray-800 dark:text-gray-200 overflow-x-auto">
            {ADD_CLASSES_COLUMN_SQL}
          </pre>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyText(ADD_CLASSES_COLUMN_SQL, 'classes-sql')}
              className="px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              {copiedKey === 'classes-sql' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'classes-sql' ? 'SQL скопирован!' : 'Скопировать SQL'}</span>
            </button>
            <button
              type="button"
              onClick={fetchAdmins}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#1C1F26] border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Проверить снова</span>
            </button>
          </div>
        </div>
      )}

      {/* Карточка выданного пароля (после создания или сброса) */}
      {issuedCredentials && (
        <div className="bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800 rounded-[28px] p-6 space-y-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-emerald-950 dark:text-emerald-200">
                  {issuedCredentials.isReset
                    ? `Новый пароль выдан для «${issuedCredentials.name}»`
                    : `Администратор «${issuedCredentials.name}» добавлен!`}
                </h3>
                <p className="text-xs text-emerald-800 dark:text-emerald-300/90 mt-0.5">
                  Передайте этот пароль помощнику — он сможет войти на странице{' '}
                  <span className="font-mono font-bold">/admin/load</span>. Пароль хранится в базе в зашифрованном виде и показывается только сейчас.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIssuedCredentials(null)}
              className="p-1.5 rounded-xl text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#16181F] border border-emerald-200/80 dark:border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] text-gray-500 font-semibold">
                {issuedCredentials.name} • {ADMIN_ROLE_LABELS[issuedCredentials.role].label}
                {issuedCredentials.note ? ` • ${issuedCredentials.note}` : ''}
                {issuedCredentials.role === 'supervisor' &&
                issuedCredentials.assigned_classes.length > 0
                  ? ` • Классы: ${issuedCredentials.assigned_classes.join(', ')}`
                  : ''}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Пароль для входа:</span>
                <code className="px-3 py-1 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-950 dark:text-emerald-200 font-mono font-extrabold text-sm tracking-wide">
                  {issuedCredentials.password}
                </code>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => copyText(issuedCredentials.password, 'pwd-only')}
                className="px-3.5 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 text-emerald-900 dark:text-emerald-200 text-xs font-bold inline-flex items-center gap-1.5"
              >
                {copiedKey === 'pwd-only' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'pwd-only' ? 'Скопировано' : 'Копировать пароль'}</span>
              </button>
              <button
                type="button"
                onClick={() => copyText(buildInviteText(issuedCredentials), 'invite-full')}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
              >
                {copiedKey === 'invite-full' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'invite-full' ? 'Приглашение скопировано!' : 'Копировать приглашение'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Форма добавления нового администратора */}
      <div className="bg-white dark:bg-[#1C1F26] p-6 sm:p-8 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#3F51B5]" />
              <span>Добавить помощника / администратора</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Выдайте личный пароль учителю, классному руководителю или библиотекарю — он сможет заходить в админ-панель и следить за чтением учеников.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateAdmin} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
                Имя (будет видно в сообщениях ученикам) *
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Елена Петровна"
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
                Комментарий / классы (необязательно)
              </label>
              <input
                type="text"
                maxLength={120}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Например, Классный руководитель 5–7 кл."
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Выбор уровня доступа */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Уровень доступа</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('supervisor')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  role === 'supervisor'
                    ? 'border-[#3F51B5] bg-indigo-50/70 dark:bg-indigo-950/30 ring-2 ring-[#3F51B5]/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-600" />
                    Куратор / Учитель
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Рекомендуется
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Видит всех учеников, скорость чтения, античит-предупреждения и может писать замечания детям. Книги менять не может.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  role === 'admin'
                    ? 'border-[#3F51B5] bg-indigo-50/70 dark:bg-indigo-950/30 ring-2 ring-[#3F51B5]/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    Полный администратор
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Доступ к ученикам, фонду книг, загрузке новых книг и цитатам. Управлять списком админов может только главный админ.
                </p>
              </button>
            </div>
          </div>

          {/* Закреплённые классы для куратора */}
          {role === 'supervisor' &&
            renderClassPicker(
              assignedClasses,
              setAssignedClasses,
              customClassInput,
              setCustomClassInput
            )}

          {/* Пароль */}
          <div>
            <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
              Пароль для входа (уникальный для этого человека) *
            </label>
            <div className="mt-1 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type={showCreatePassword ? 'text' : 'password'}
                  required
                  minLength={4}
                  maxLength={100}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Придумайте или сгенерируйте пароль..."
                  className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm font-mono outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  title={showCreatePassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPassword(generateReadablePassword())}
                className="px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Сгенерировать</span>
              </button>
            </div>
          </div>

          {createError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-semibold">
              {createError}
            </div>
          )}

          <button
            type="submit"
            disabled={isCreating || !name.trim() || password.trim().length < 4}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#3F51B5] hover:bg-[#303F9F] text-white font-bold text-xs shadow-md transition-all inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isCreating ? 'Сохранение...' : 'Добавить и выдать пароль'}</span>
          </button>
        </form>
      </div>

      {/* Список добавленных администраторов */}
      <div className="bg-white dark:bg-[#1C1F26] p-6 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#3F51B5]" />
              <span>Выданные доступы ({admins.length})</span>
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Активных помощников: <b>{activeCount}</b> из {admins.length} • Ваш главный пароль продолжает работать как раньше
            </p>
          </div>
          <button
            type="button"
            onClick={fetchAdmins}
            className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-indigo-500 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>

        {loadError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-semibold">
            {loadError}
          </div>
        )}

        {isLoading ? (
          <div className="py-10 text-center text-xs text-gray-400">Загрузка списка администраторов...</div>
        ) : admins.length === 0 ? (
          <div className="py-10 text-center space-y-1.5">
            <p className="text-sm font-bold text-gray-600 dark:text-gray-400">
              Дополнительных администраторов пока нет
            </p>
            <p className="text-xs text-gray-400">
              Добавьте учителя или помощника в форме выше, чтобы разделить контроль за учениками.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {admins.map((adm) => {
              const roleMeta = ADMIN_ROLE_LABELS[adm.role];
              return (
                <div
                  key={adm.id}
                  className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                    adm.is_active
                      ? 'border-gray-100 dark:border-gray-800 bg-[#F8F9FE]/70 dark:bg-[#16181F]'
                      : 'border-gray-200/80 dark:border-gray-800 bg-gray-100/60 dark:bg-[#13151B] opacity-75'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-sm text-gray-900 dark:text-white">
                        {adm.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          adm.role === 'admin'
                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                        }`}
                      >
                        {roleMeta.shortLabel}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          adm.is_active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {adm.is_active ? 'Активен' : 'Отключён'}
                      </span>
                    </div>

                    {adm.note && (
                      <p className="text-xs text-gray-600 dark:text-gray-300">{adm.note}</p>
                    )}

                    {adm.role === 'supervisor' && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10.5px] font-bold text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                          <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Классы:</span>
                        </span>
                        {adm.assigned_classes && adm.assigned_classes.length > 0 ? (
                          adm.assigned_classes.map((cls) => (
                            <span
                              key={cls}
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                            >
                              {cls}
                            </span>
                          ))
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">
                            Все классы школы
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {adm.last_login_at
                          ? `Последний вход: ${new Date(adm.last_login_at).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : 'Ещё не заходил'}
                      </span>
                      <span>
                        Добавлен:{' '}
                        {new Date(adm.created_at).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openResetModal(adm)}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 text-amber-800 dark:text-amber-200 text-xs font-bold inline-flex items-center gap-1.5"
                      title="Выдать новый пароль (старый перестанет работать)"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Новый пароль</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(adm)}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#232630] border border-gray-200 dark:border-gray-700 hover:border-indigo-500 text-xs font-bold text-gray-700 dark:text-gray-200 inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Изменить</span>
                    </button>

                    <button
                      type="button"
                      disabled={togglingId === adm.id}
                      onClick={() => handleToggleActive(adm)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                        adm.is_active
                          ? 'bg-gray-100 dark:bg-white/10 hover:bg-gray-200 text-gray-700 dark:text-gray-200'
                          : 'bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 text-emerald-800 dark:text-emerald-200'
                      }`}
                      title={adm.is_active ? 'Временно отключить доступ' : 'Вернуть доступ'}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{adm.is_active ? 'Отключить' : 'Включить'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingAdmin(adm)}
                      className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 hover:bg-red-100 text-red-600 dark:text-red-400"
                      title="Удалить администратора"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Модалка редактирования администратора */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-lg rounded-[28px] p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                Редактировать администратора
              </h3>
              <button
                type="button"
                onClick={() => setEditingAdmin(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500">Имя *</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500">Комментарий / классы</label>
                <input
                  type="text"
                  maxLength={120}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500">Уровень доступа</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as ManagedAdminRole)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                >
                  <option value="supervisor">Куратор / Учитель (только ученики и сообщения)</option>
                  <option value="admin">Полный администратор (книги, цитаты и ученики)</option>
                </select>
              </div>

              {editRole === 'supervisor' &&
                renderClassPicker(
                  editAssignedClasses,
                  setEditAssignedClasses,
                  editCustomClassInput,
                  setEditCustomClassInput
                )}

              {editError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">
                  {editError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-bold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 py-2.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold"
                >
                  {isSavingEdit ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка выдачи нового пароля */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-md rounded-[28px] p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                  Выдать новый пароль
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Для: <b>{resetTarget.name}</b>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              После сохранения старый пароль и текущая сессия этого администратора сразу перестанут действовать.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  minLength={4}
                  maxLength={100}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setResetPassword(generateReadablePassword())}
                  className="px-3.5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Новый</span>
                </button>
              </div>

              {resetError && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">
                  {resetError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-bold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword || resetPassword.trim().length < 4}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                >
                  {isResettingPassword ? 'Сохранение...' : 'Обновить пароль'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка подтверждения удаления */}
      {deletingAdmin && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-sm rounded-[28px] p-6 shadow-2xl border border-red-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base">Удалить администратора?</h3>
              <p className="text-xs text-gray-500 mt-1">
                Доступ для <b>{deletingAdmin.name}</b> будет полностью удалён, а его пароль перестанет работать.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingAdmin(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700"
              >
                {isDeleting ? 'Удаление...' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
