'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { StudentAvatar } from '@/components/StudentAvatar';
import {
  evaluateBookCompletion,
  evaluateReadingPace,
  formatReadingDuration,
  formatTurnSpeed,
} from '@/lib/readingMetrics';
import { isAutoWarningMessage } from '@/lib/autoWarnings';
import {
  formatPointsDelta,
  isMissingPointAdjustmentsTableError,
  sumPointAdjustments,
  type StudentPointAdjustment,
} from '@/lib/pointAdjustments';
import {
  POINTS_PER_HONEST_PAGE,
  calculateStudentPoints,
  getAgeGroup,
  getAgeGroupMeta,
  getRewardsForAgeGroup,
  getStudentRank,
} from '@/lib/gamification';
import { AVATAR_RARITY_META, getAvatarsForAgeGroup } from '@/lib/avatars';
import {
  ADMIN_ROLE_LABELS,
  formatAdminSenderName,
  type AdminSessionUser,
} from '@/lib/adminTypes';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Zap,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  User,
  MessageSquare,
  Send,
  Trash2,
  RefreshCw,
  Lock,
  Check,
  AlertTriangle,
  Info,
  CheckCircle2,
  PlusCircle,
  MinusCircle,
  Gift,
} from 'lucide-react';

interface ProgressRow {
  id: string;
  book_id: string;
  is_bookmarked: boolean;
  current_chapter: number;
  current_page: number;
  progress_percent: number;
  reading_seconds?: number | null;
  pages_turned?: number | null;
  fast_turns_count?: number | null;
  avg_seconds_per_page?: number | null;
  min_seconds_per_page?: number | null;
  last_read_at?: string | null;
}

interface StudentDetail {
  id: string;
  full_name: string;
  grade_class: string;
  created_at: string;
  reading_progress: ProgressRow[];
}

interface BookInfo {
  id: string;
  title: string;
  author: string;
  cover_gradient?: string | null;
}

interface StudentMessageItem {
  id: string;
  student_id: string;
  book_id: string | null;
  book_title: string | null;
  sender_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

type AdminStudentTab = 'reading' | 'rewards' | 'avatars' | 'messages';

const QUICK_TEMPLATES = [
  'Пожалуйста, читай внимательнее — замечено слишком быстрое пролистывание страниц.',
  'Обрати внимание: прогресс чтения высокий, но времени на чтение потрачено мало.',
  'Замечен перескок по главам. Вернись и прочитай пропущенные главы.',
  'Отличная работа и внимательное чтение! Так держать!',
];

const QUICK_POINTS_REASONS = [
  'Активное участие в библиотечном мероприятии',
  'Победа в читательском конкурсе',
  'Отличный отзыв о прочитанной книге',
  'Помощь школьной библиотеке',
  'Корректировка баллов за чтение',
];

const QUICK_POINTS_AMOUNTS = [10, 25, 50, 100];

export default function AdminStudentProfilePage() {
  const params = useParams();
  const studentId = Array.isArray(params?.id) ? params.id[0] : String(params?.id || '');

  // Авторизация админа (общая с /admin/load)
  const [currentAdmin, setCurrentAdmin] = useState<AdminSessionUser | null>(null);
  const [isBootingAuth, setIsBootingAuth] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  const isAuthorized = Boolean(currentAdmin);

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [booksMap, setBooksMap] = useState<Record<string, BookInfo>>({});
  const [messages, setMessages] = useState<StudentMessageItem[]>([]);
  const [pointAdjustments, setPointAdjustments] = useState<StudentPointAdjustment[]>([]);
  const [adjustmentsTableMissing, setAdjustmentsTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminStudentTab>('reading');
  const [messageDraft, setMessageDraft] = useState('');
  const [selectedBookForMsg, setSelectedBookForMsg] = useState<{
    id: string | null;
    title: string | null;
  }>({ id: null, title: null });
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // Форма ручного начисления / списания баллов
  const [adjustMode, setAdjustMode] = useState<'add' | 'subtract'>('add');
  const [adjustAmount, setAdjustAmount] = useState('25');
  const [adjustReason, setAdjustReason] = useState('');
  const [notifyOnAdjust, setNotifyOnAdjust] = useState(true);
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const [adjustSuccess, setAdjustSuccess] = useState('');
  const [deletingAdjId, setDeletingAdjId] = useState<string | null>(null);

  const loadStudentData = useCallback(async () => {
    if (!studentId) return;
    setIsLoading(true);
    setNotFound(false);
    try {
      const [studentRes, booksRes] = await Promise.all([
        supabase
          .from('students')
          .select('*, reading_progress(*)')
          .eq('id', studentId)
          .maybeSingle(),
        supabase.from('books').select('id, title, author, cover_gradient'),
      ]);

      if (!studentRes.data) {
        setNotFound(true);
        setStudent(null);
      } else {
        setStudent(studentRes.data as StudentDetail);
      }

      if (booksRes.data) {
        const map: Record<string, BookInfo> = {};
        for (const b of booksRes.data as BookInfo[]) {
          map[b.id] = b;
        }
        setBooksMap(map);
      }

      try {
        const { data: msgData, error: msgError } = await supabase
          .from('student_messages')
          .select('*')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false });
        if (!msgError && msgData) {
          setMessages(msgData as StudentMessageItem[]);
        }
      } catch {
        // Таблица student_messages ещё не создана
      }

      try {
        const { data: adjData, error: adjError } = await supabase
          .from('student_point_adjustments')
          .select('id, student_id, points, reason, sender_name, created_at')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false });
        if (adjError) {
          if (isMissingPointAdjustmentsTableError(adjError)) {
            setAdjustmentsTableMissing(true);
          }
          setPointAdjustments([]);
        } else {
          setAdjustmentsTableMissing(false);
          setPointAdjustments((adjData || []) as StudentPointAdjustment[]);
        }
      } catch {
        setPointAdjustments([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (
      tabParam === 'reading' ||
      tabParam === 'rewards' ||
      tabParam === 'avatars' ||
      tabParam === 'messages'
    ) {
      setActiveTab(tabParam);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin-auth', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.authenticated && data?.admin) {
          setCurrentAdmin(data.admin as AdminSessionUser);
        } else if (!cancelled) {
          try {
            sessionStorage.removeItem('ngs_admin_auth');
          } catch {}
        }
      } catch {
        // Оставляем форму входа
      } finally {
        if (!cancelled) setIsBootingAuth(false);
      }
    };
    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      loadStudentData();
    }
  }, [isAuthorized, loadStudentData]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCheckingAuth(true);
    setAuthError('');
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.admin) {
        setCurrentAdmin(data.admin as AdminSessionUser);
        setAdminPassword('');
      } else {
        setAuthError(data?.error || 'Неверный пароль администратора');
      }
    } catch {
      setAuthError('Ошибка сети при проверке пароля');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !messageDraft.trim()) return;
    setIsSending(true);
    setSendError('');
    try {
      const { error } = await supabase.from('student_messages').insert([
        {
          student_id: student.id,
          book_id: selectedBookForMsg.id,
          book_title: selectedBookForMsg.title,
          sender_name: formatAdminSenderName(currentAdmin),
          message: messageDraft.trim(),
          is_read: false,
        },
      ]);
      if (error) throw error;
      setMessageDraft('');
      setSelectedBookForMsg({ id: null, title: null });
      await loadStudentData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || '');
      if (msg.includes('student_messages') || msg.includes('relation') || msg.includes('schema cache')) {
        setSendError('Выполните SQL из supabase_student_messages.sql в Supabase для создания таблицы сообщений.');
      } else {
        setSendError('Не удалось отправить сообщение.');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    await supabase.from('student_messages').delete().eq('id', msgId);
    await loadStudentData();
  };

  const handleCreatePointAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;

    const absPoints = Math.trunc(Number(adjustAmount));
    if (!Number.isFinite(absPoints) || absPoints <= 0) {
      setAdjustError('Введите положительное целое количество баллов.');
      return;
    }

    const signedPoints = adjustMode === 'add' ? absPoints : -absPoints;
    const cleanReason = adjustReason.trim();
    if (cleanReason.length < 2) {
      setAdjustError('Укажите причину начисления или списания баллов.');
      return;
    }

    setIsSubmittingAdjust(true);
    setAdjustError('');
    setAdjustSuccess('');
    try {
      const res = await fetch('/api/point-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          points: signedPoints,
          reason: cleanReason,
          notifyStudent: notifyOnAdjust,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.tableMissing) setAdjustmentsTableMissing(true);
        setAdjustError(data?.error || 'Не удалось сохранить изменение баллов.');
        return;
      }

      setAdjustReason('');
      setAdjustSuccess(
        signedPoints > 0
          ? `Начислено +${absPoints} б. ученику ${student.full_name}`
          : `Списано ${absPoints} б. у ученика ${student.full_name}`
      );
      await loadStudentData();
    } catch {
      setAdjustError('Ошибка сети при сохранении баллов.');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  const handleDeletePointAdjustment = async (adj: StudentPointAdjustment) => {
    const ok = window.confirm(
      `Отменить запись (${formatPointsDelta(adj.points)} — «${adj.reason || 'Корректировка'}»)?\nИтоговые баллы ученика сразу пересчитаются.`
    );
    if (!ok) return;

    setDeletingAdjId(adj.id);
    setAdjustError('');
    setAdjustSuccess('');
    try {
      const res = await fetch(`/api/point-adjustments/${adj.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setAdjustError(data?.error || 'Не удалось отменить запись.');
        return;
      }
      await loadStudentData();
    } catch {
      setAdjustError('Ошибка сети при удалении записи.');
    } finally {
      setDeletingAdjId(null);
    }
  };

  const handleResetBookProgress = async (row: ProgressRow, bookTitle: string) => {
    if (!student) return;
    const ok = window.confirm(
      `Сбросить прогресс и обнулить время/клики ученика «${student.full_name}» по книге «${bookTitle}»?\nБаллы и рейтинг пересчитаются сразу.`
    );
    if (!ok) return;

    const { error: updateErr } = await supabase
      .from('reading_progress')
      .update({
        current_chapter: 0,
        current_page: 0,
        progress_percent: 0,
        reading_seconds: 0,
        pages_turned: 0,
        fast_turns_count: 0,
        avg_seconds_per_page: 0,
        min_seconds_per_page: null,
      })
      .eq('id', row.id);

    if (updateErr) {
      alert('Не удалось сбросить прогресс: ' + updateErr.message);
      return;
    }

    if (!row.is_bookmarked) {
      await supabase.from('reading_progress').delete().eq('id', row.id);
    }

    await loadStudentData();
  };

  const progressRows = useMemo(() => {
    const rows = student?.reading_progress || [];
    return [...rows].sort(
      (a, b) =>
        Number(b.reading_seconds || 0) - Number(a.reading_seconds || 0) ||
        (b.progress_percent || 0) - (a.progress_percent || 0)
    );
  }, [student]);

  const ageGroup = useMemo(() => getAgeGroup(student?.grade_class), [student?.grade_class]);
  const ageGroupMeta = useMemo(() => getAgeGroupMeta(ageGroup), [ageGroup]);

  const bonusPointsTotal = useMemo(
    () => sumPointAdjustments(pointAdjustments),
    [pointAdjustments]
  );

  const pointsBreakdown = useMemo(
    () =>
      calculateStudentPoints(
        progressRows.map((r) => ({
          progressPercent: r.progress_percent || 0,
          readingSeconds: r.reading_seconds || 0,
          pagesTurned: r.pages_turned || 0,
          fastTurnsCount: r.fast_turns_count || 0,
          avgSecondsPerPage: r.avg_seconds_per_page || 0,
          minSecondsPerPage: r.min_seconds_per_page ?? null,
        })),
        student?.grade_class,
        bonusPointsTotal
      ),
    [progressRows, student?.grade_class, bonusPointsTotal]
  );

  const rankProgress = useMemo(
    () => getStudentRank(pointsBreakdown.totalPoints, ageGroup),
    [pointsBreakdown.totalPoints, ageGroup]
  );

  const rewards = useMemo(() => getRewardsForAgeGroup(ageGroup), [ageGroup]);
  const unlockedRewardsCount = useMemo(
    () => rewards.filter((r) => pointsBreakdown.totalPoints >= r.requiredPoints).length,
    [rewards, pointsBreakdown.totalPoints]
  );

  const avatars = useMemo(() => getAvatarsForAgeGroup(ageGroup), [ageGroup]);
  const unlockedAvatars = useMemo(
    () => avatars.filter((av) => pointsBreakdown.totalPoints >= av.requiredPoints),
    [avatars, pointsBreakdown.totalPoints]
  );
  const highestUnlockedAvatar = unlockedAvatars[unlockedAvatars.length - 1] || avatars[0];

  const suspiciousCount = useMemo(
    () =>
      progressRows.filter(
        (r) =>
          evaluateReadingPace({
            progressPercent: r.progress_percent || 0,
            readingSeconds: r.reading_seconds || 0,
            pagesTurned: r.pages_turned || 0,
            fastTurnsCount: r.fast_turns_count || 0,
            avgSecondsPerPage: r.avg_seconds_per_page || 0,
            minSecondsPerPage: r.min_seconds_per_page ?? null,
          }).status === 'suspicious'
      ).length,
    [progressRows]
  );

  if (isBootingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FE] dark:bg-[#111318] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#1C1F26] px-6 py-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-500 flex items-center gap-2.5">
          <RefreshCw className="w-4 h-4 animate-spin text-[#3F51B5]" />
          <span>Проверка доступа...</span>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F8F9FE] dark:bg-[#111318] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#1C1F26] w-full max-w-sm rounded-[28px] p-8 shadow-xl border border-gray-200 dark:border-gray-800 space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-[#3F51B5] dark:text-[#A5B4FC] flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">
              Вход в админ-панель
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Введите пароль администратора или куратора для просмотра профиля ученика
            </p>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-4 text-left">
            <input
              type="password"
              required
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Пароль..."
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:border-indigo-500"
            />
            {authError && <p className="text-xs font-bold text-red-600 text-center">{authError}</p>}
            <button
              type="submit"
              disabled={isCheckingAuth}
              className="w-full py-3 rounded-2xl bg-[#3F51B5] hover:bg-[#303F9F] text-white font-bold text-sm shadow-md"
            >
              {isCheckingAuth ? 'Проверка...' : 'Войти'}
            </button>
          </form>
          <Link href="/admin/load?tab=students" className="inline-block text-xs text-gray-400 hover:text-indigo-600">
            ← В админ-панель
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FE] dark:bg-[#111318] p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Навигация */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/admin/load?tab=students"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200 hover:border-indigo-500 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>К списку учеников</span>
          </Link>

          <button
            type="button"
            onClick={loadStudentData}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200 hover:border-indigo-500 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>

        {isLoading ? (
          <div className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-12 text-center text-xs text-gray-400 border border-gray-200/80 dark:border-gray-800">
            Загрузка профиля ученика...
          </div>
        ) : notFound || !student ? (
          <div className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-12 text-center space-y-3 border border-gray-200/80 dark:border-gray-800">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">Ученик не найден</p>
            <Link
              href="/admin/load?tab=students"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3F51B5] text-white text-xs font-bold"
            >
              Вернуться к списку
            </Link>
          </div>
        ) : (
          <>
            {/* Компактная шапка профиля ученика (вид админа) */}
            <section className="bg-gradient-to-br from-[#1C244B] via-[#232E66] to-[#344182] text-white rounded-[24px] p-4 sm:p-5 shadow-lg relative overflow-hidden">
              <div className="absolute -right-12 -top-12 w-56 h-56 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <StudentAvatar
                      avatarId={highestUnlockedAvatar.id}
                      size={62}
                      className={AVATAR_RARITY_META[highestUnlockedAvatar.rarity].ringClass}
                    />
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-white text-xs shadow flex items-center justify-center">
                      {rankProgress.current.icon}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-white/15 text-indigo-100 text-[10px] font-bold uppercase">
                        {currentAdmin
                          ? `${ADMIN_ROLE_LABELS[currentAdmin.role].shortLabel}: ${currentAdmin.name}`
                          : 'Просмотр админа'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-white/15 text-white text-[10.5px] font-bold">
                        {student.grade_class} кл
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-400/25 text-amber-100 text-[10.5px] font-mono font-extrabold">
                        ⭐ {pointsBreakdown.totalPoints} б.
                      </span>
                      {suspiciousCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold inline-flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" />
                          Подозрений: {suspiciousCount}
                        </span>
                      )}
                    </div>

                    <h1 className="text-lg sm:text-xl font-extrabold tracking-tight truncate">
                      {student.full_name}
                    </h1>

                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-indigo-100/85">
                      <span className="font-bold text-[#FFE082]">
                        {rankProgress.current.icon} {rankProgress.current.title}
                      </span>
                      <span className="opacity-70">•</span>
                      <span>{ageGroupMeta.subtitle} ({ageGroupMeta.label})</span>
                    </div>

                    <div className="w-full max-w-sm h-1.5 rounded-full bg-white/15 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-emerald-400"
                        style={{ width: `${Math.max(5, rankProgress.progressPercent)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 4 KPI + кнопка написать */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2 shrink-0">
                  <div className="grid grid-cols-4 gap-2">
                    <div className="px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/10 text-center">
                      <div className="text-[9.5px] text-indigo-200 font-semibold">Книг</div>
                      <div className="text-sm font-extrabold font-mono">{progressRows.length}</div>
                    </div>
                    <div className="px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/10 text-center">
                      <div className="text-[9.5px] text-emerald-200 font-semibold">Дочитано</div>
                      <div className="text-sm font-extrabold font-mono">
                        {pointsBreakdown.honestCompletedBooks}
                      </div>
                    </div>
                    <div className="px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/10 text-center">
                      <div className="text-[9.5px] text-amber-200 font-semibold">Время</div>
                      <div className="text-xs font-extrabold font-mono leading-5">
                        {formatReadingDuration(pointsBreakdown.totalReadingSeconds)}
                      </div>
                    </div>
                    <div className="px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/10 text-center">
                      <div className="text-[9.5px] text-indigo-200 font-semibold">Награды</div>
                      <div className="text-sm font-extrabold font-mono">
                        {unlockedRewardsCount}/{rewards.length}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('rewards')}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-400 text-[#1C244B] hover:bg-amber-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow transition-colors"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      <span>Начислить баллы</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('messages')}
                      className="px-3.5 py-1.5 rounded-xl bg-white text-[#1C244B] hover:bg-amber-100 text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#3F51B5]" />
                      <span>Написать ученику ({messages.length})</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 4 вкладки */}
            <nav className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab('reading')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${
                  activeTab === 'reading'
                    ? 'bg-[#3F51B5] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Чтение и скорость ({progressRows.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('rewards')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${
                  activeTab === 'rewards'
                    ? 'bg-[#3F51B5] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Баллы и достижения ({unlockedRewardsCount}/{rewards.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('avatars')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${
                  activeTab === 'avatars'
                    ? 'bg-[#3F51B5] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Аватарки ({unlockedAvatars.length}/{avatars.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('messages')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${
                  activeTab === 'messages'
                    ? 'bg-[#3F51B5] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Сообщения ({messages.length})</span>
              </button>
            </nav>

            {/* ВКЛАДКА 1: ЧТЕНИЕ И АНТИЧИТ */}
            {activeTab === 'reading' && (
              <section className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-4 sm:p-5 border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
                {progressRows.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400">
                    Ученик ещё не начал читать книги.
                  </div>
                ) : (
                  progressRows.map((row) => {
                    const book = booksMap[row.book_id];
                    const readingSec = Number(row.reading_seconds || 0);
                    const pagesTurned = Number(row.pages_turned || 0);
                    const fastTurns = Number(row.fast_turns_count || 0);
                    const avgSec = Number(row.avg_seconds_per_page || 0);
                    const minSec =
                      row.min_seconds_per_page !== null && row.min_seconds_per_page !== undefined
                        ? Number(row.min_seconds_per_page)
                        : null;

                    const metrics = {
                      progressPercent: row.progress_percent || 0,
                      readingSeconds: readingSec,
                      pagesTurned,
                      fastTurnsCount: fastTurns,
                      avgSecondsPerPage: avgSec,
                      minSecondsPerPage: minSec,
                    };
                    const pace = evaluateReadingPace(metrics);
                    const completion = evaluateBookCompletion(metrics);
                    const isUnverifiedFinish = (row.progress_percent || 0) >= 94 && !completion.counted;
                    const displayPercent = isUnverifiedFinish
                      ? Math.min(row.progress_percent || 0, 94)
                      : row.progress_percent || 0;

                    return (
                      <div
                        key={row.id}
                        className={`p-3.5 rounded-2xl border space-y-2 ${
                          pace.status === 'suspicious' || isUnverifiedFinish
                            ? 'border-red-200 dark:border-red-900/60 bg-red-50/35 dark:bg-red-950/15'
                            : 'border-gray-100 dark:border-gray-800 bg-[#F8F9FE]/60 dark:bg-[#16181F]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-bold text-sm text-indigo-700 dark:text-indigo-400">
                              {book?.title || row.book_id}
                            </span>
                            {book?.author && (
                              <span className="text-xs text-gray-500 ml-1.5">• {book.author}</span>
                            )}
                            <span className="text-[11px] text-gray-400 ml-2">
                              (Глава {row.current_chapter + 1}, стр. {row.current_page + 1})
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.is_bookmarked && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                                ★ В закладках
                              </span>
                            )}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                isUnverifiedFinish
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'
                                  : displayPercent >= 95
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {isUnverifiedFinish ? `Не засчитано (${displayPercent}%)` : `${displayPercent}%`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBookForMsg({
                                  id: row.book_id,
                                  title: book?.title || row.book_id,
                                });
                                setMessageDraft(
                                  pace.status === 'suspicious' || isUnverifiedFinish
                                    ? `По книге «${book?.title || row.book_id}»: ${QUICK_TEMPLATES[0]}`
                                    : ''
                                );
                                setActiveTab('messages');
                              }}
                              className="px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-[10.5px] font-bold inline-flex items-center gap-1"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>Написать</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetBookProgress(row, book?.title || row.book_id)}
                              className="px-2.5 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-[10.5px] font-bold inline-flex items-center gap-1"
                              title="Сбросить прогресс, время и клики по этой книге (снять накрутку)"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Сбросить</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-semibold">
                            <Clock className="w-3 h-3" />
                            {formatReadingDuration(readingSec)}
                          </span>

                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono font-semibold ${
                              pace.status === 'suspicious'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : pace.status === 'fast'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <Zap className="w-3 h-3" />
                            {pagesTurned > 0 ? formatTurnSpeed(avgSec) : 'Нет кликов'}
                          </span>

                          {pagesTurned > 0 && (
                            <span className="text-gray-500 dark:text-gray-400">
                              Кликов: <b>{pagesTurned}</b>
                              {fastTurns > 0 && (
                                <>
                                  {' • '}Быстрых: <b className="text-red-600">{fastTurns}</b>
                                </>
                              )}
                              {minSec !== null && (
                                <>
                                  {' • '}Мин: <b className="font-mono">{minSec.toFixed(1)}с</b>
                                </>
                              )}
                            </span>
                          )}

                          {pace.status === 'suspicious' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold ml-auto">
                              <ShieldAlert className="w-3 h-3" />
                              {pace.label}
                            </span>
                          )}
                          {pace.status === 'normal' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold ml-auto">
                              <ShieldCheck className="w-3 h-3" />
                              {pace.label}
                            </span>
                          )}
                        </div>

                        {isUnverifiedFinish && (
                          <div className="px-2.5 py-1.5 rounded-xl bg-red-100/70 dark:bg-red-950/50 text-red-800 dark:text-red-200 text-[11px] flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                            <span>
                              <b>100% не засчитано:</b> {completion.reason}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </section>
            )}

            {/* ВКЛАДКА 2: БАЛЛЫ И ОТКРЫТЫЕ ДОСТИЖЕНИЯ */}
            {activeTab === 'rewards' && (
              <section className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-4 sm:p-5 border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 font-mono font-extrabold">
                    ⭐ Итого: {pointsBreakdown.totalPoints} б.
                  </span>
                  <span className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold">
                    📖 Честные страницы: +{pointsBreakdown.honestPagePoints} б. ({pointsBreakdown.honestPagesCount} × {POINTS_PER_HONEST_PAGE} б.)
                  </span>
                  <span className="px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold">
                    🏆 Прочитанные книги: +{pointsBreakdown.completionPoints} б. ({pointsBreakdown.honestCompletedBooks})
                  </span>
                  {pointsBreakdown.bonusPoints !== 0 && (
                    <span
                      className={`px-2.5 py-1.5 rounded-xl font-bold ${
                        pointsBreakdown.bonusPoints > 0
                          ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                          : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      🎁 Ручные корректировки: {formatPointsDelta(pointsBreakdown.bonusPoints)}
                    </span>
                  )}
                  <span
                    className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold"
                    title="Время используется только как античит-проверка темпа и не даёт отдельных баллов за простой вкладки"
                  >
                    ⏱ Время (античит): {formatReadingDuration(pointsBreakdown.totalReadingSeconds)}
                  </span>
                  {pointsBreakdown.fastPagesIgnored > 0 && (
                    <span className="px-2.5 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold">
                      ⛔ Отброшено быстрых кликов: {pointsBreakdown.fastPagesIgnored}
                    </span>
                  )}
                </div>

                {/* Форма ручного начисления / списания баллов + история */}
                <div className="p-4 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-gray-200/80 dark:border-gray-800 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-amber-500" />
                      <h2 className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-white">
                        Начислить или списать баллы вручную
                      </h2>
                    </div>
                    <div className="inline-flex rounded-xl bg-white dark:bg-[#1C1F26] p-0.5 border border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setAdjustMode('add')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors ${
                          adjustMode === 'add'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-300 hover:text-emerald-700'
                        }`}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Начислить</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustMode('subtract')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors ${
                          adjustMode === 'subtract'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-300 hover:text-rose-700'
                        }`}
                      >
                        <MinusCircle className="w-3.5 h-3.5" />
                        <span>Списать</span>
                      </button>
                    </div>
                  </div>

                  {adjustmentsTableMissing && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Таблица <b>student_point_adjustments</b> ещё не создана в Supabase. Выполните один раз SQL из файла{' '}
                        <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 font-mono text-[11px]">
                          supabase_point_adjustments.sql
                        </code>{' '}
                        в Supabase Dashboard → SQL Editor.
                      </span>
                    </div>
                  )}

                  <form onSubmit={handleCreatePointAdjustment} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-4 space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                          Количество баллов
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          step={1}
                          required
                          value={adjustAmount}
                          onChange={(e) => setAdjustAmount(e.target.value)}
                          placeholder="Например: 25"
                          className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                        />
                        <div className="flex flex-wrap gap-1">
                          {QUICK_POINTS_AMOUNTS.map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setAdjustAmount(String(val))}
                              className={`px-2 py-0.5 rounded-lg text-[10.5px] font-mono font-bold border transition-colors ${
                                adjustAmount === String(val)
                                  ? adjustMode === 'add'
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-400 text-emerald-800 dark:text-emerald-200'
                                    : 'bg-rose-100 dark:bg-rose-950/60 border-rose-400 text-rose-800 dark:text-rose-200'
                                  : 'bg-white dark:bg-[#1C1F26] border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400'
                              }`}
                            >
                              {adjustMode === 'add' ? `+${val}` : `−${val}`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="sm:col-span-8 space-y-1.5">
                        <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                          Причина (ученик увидит её в своём профиле)
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={300}
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          placeholder="Например: За победу в читательском конкурсе"
                          className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm outline-none focus:border-indigo-500"
                        />
                        <div className="flex flex-wrap gap-1">
                          {QUICK_POINTS_REASONS.map((tpl) => (
                            <button
                              key={tpl}
                              type="button"
                              onClick={() => setAdjustReason(tpl)}
                              className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-700 hover:border-indigo-500 text-[10.5px] text-gray-600 dark:text-gray-300"
                            >
                              {tpl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={notifyOnAdjust}
                          onChange={(e) => setNotifyOnAdjust(e.target.checked)}
                          className="w-4 h-4 rounded accent-[#3F51B5]"
                        />
                        <span>Отправить ученику уведомление в личный кабинет</span>
                      </label>

                      <button
                        type="submit"
                        disabled={isSubmittingAdjust || !adjustReason.trim()}
                        className={`px-4 py-2 rounded-xl text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 ${
                          adjustMode === 'add'
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        {adjustMode === 'add' ? (
                          <PlusCircle className="w-3.5 h-3.5" />
                        ) : (
                          <MinusCircle className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isSubmittingAdjust
                            ? 'Сохранение...'
                            : adjustMode === 'add'
                            ? `Начислить +${Math.max(0, Math.trunc(Number(adjustAmount) || 0))} б.`
                            : `Списать −${Math.max(0, Math.trunc(Number(adjustAmount) || 0))} б.`}
                        </span>
                      </button>
                    </div>

                    {adjustError && (
                      <div className="text-xs font-semibold text-red-600 dark:text-red-400">
                        {adjustError}
                      </div>
                    )}
                    {adjustSuccess && (
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        ✓ {adjustSuccess}
                      </div>
                    )}
                  </form>

                  {/* История ручных начислений и списаний */}
                  {pointAdjustments.length > 0 && (
                    <div className="pt-3 border-t border-gray-200/80 dark:border-gray-800 space-y-2">
                      <div className="text-[11px] font-extrabold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        История ручных начислений ({pointAdjustments.length})
                      </div>
                      <div className="space-y-1.5">
                        {pointAdjustments.map((adj) => (
                          <div
                            key={adj.id}
                            className="p-2.5 rounded-xl bg-white dark:bg-[#1C1F26] border border-gray-200/70 dark:border-gray-800 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded-lg font-mono font-extrabold text-[11px] ${
                                    adj.points > 0
                                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                      : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                  }`}
                                >
                                  {formatPointsDelta(adj.points)}
                                </span>
                                <span className="font-semibold text-gray-800 dark:text-gray-100">
                                  {adj.reason || 'Корректировка баллов'}
                                </span>
                              </div>
                              <div className="text-[10.5px] text-gray-400 flex flex-wrap items-center gap-1.5">
                                <span>{adj.sender_name}</span>
                                <span>•</span>
                                <span className="font-mono">
                                  {new Date(adj.created_at).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={deletingAdjId === adj.id}
                              onClick={() => handleDeletePointAdjustment(adj)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 disabled:opacity-40"
                              title="Отменить это начисление / списание"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>
                    Возрастная лига: <b>{ageGroupMeta.subtitle} ({ageGroupMeta.label})</b> • открыто наград: <b>{unlockedRewardsCount} из {rewards.length}</b>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {rewards.map((reward) => {
                    const isUnlocked = pointsBreakdown.totalPoints >= reward.requiredPoints;
                    const pct = Math.min(
                      100,
                      Math.round((pointsBreakdown.totalPoints / Math.max(1, reward.requiredPoints)) * 100)
                    );
                    return (
                      <div
                        key={reward.id}
                        className={`p-3 rounded-2xl border space-y-2 ${
                          isUnlocked
                            ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/15'
                            : 'border-gray-200/70 dark:border-gray-800 bg-[#F8F9FE]/60 dark:bg-[#151820] opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xl">{reward.icon}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9.5px] font-mono font-extrabold inline-flex items-center gap-1 ${
                              isUnlocked
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                                : 'bg-gray-200/80 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {isUnlocked ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> Открыто
                              </>
                            ) : (
                              <>🔒 {reward.requiredPoints} б.</>
                            )}
                          </span>
                        </div>
                        <div>
                          <div className="font-extrabold text-xs text-gray-900 dark:text-white">
                            {reward.title}
                          </div>
                          <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                            {reward.description}
                          </p>
                        </div>
                        {!isUnlocked && (
                          <div className="space-y-0.5">
                            <div className="flex justify-between text-[9.5px] font-mono text-gray-400">
                              <span>Ещё {reward.requiredPoints - pointsBreakdown.totalPoints} б.</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                              <div className="h-full rounded-full bg-[#3F51B5]" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ВКЛАДКА 3: ОТКРЫТЫЕ АВАТАРКИ */}
            {activeTab === 'avatars' && (
              <section className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-4 sm:p-5 border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-3">
                <div className="text-xs text-gray-500">
                  Открыто аватарок: <b>{unlockedAvatars.length} из {avatars.length}</b> (пороги для {ageGroupMeta.label})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {avatars.map((av) => {
                    const isUnlocked = pointsBreakdown.totalPoints >= av.requiredPoints;
                    const rarityMeta = AVATAR_RARITY_META[av.rarity];
                    const pct =
                      av.requiredPoints === 0
                        ? 100
                        : Math.min(100, Math.round((pointsBreakdown.totalPoints / av.requiredPoints) * 100));
                    return (
                      <div
                        key={av.id}
                        className={`p-2.5 rounded-2xl border text-center space-y-2 ${rarityMeta.cardClass}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={`px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase ${rarityMeta.badgeClass}`}>
                            {rarityMeta.label}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-gray-500">
                            {av.requiredPoints === 0 ? 'Старт' : `${av.requiredPoints} б.`}
                          </span>
                        </div>
                        <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
                          <StudentAvatar
                            avatarId={av.id}
                            size={56}
                            className={`${rarityMeta.ringClass} ${!isUnlocked ? 'opacity-65 grayscale-[30%]' : ''}`}
                          />
                          <span
                            className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full text-white flex items-center justify-center border border-white/30 ${
                              isUnlocked ? 'bg-emerald-500' : 'bg-gray-900/90'
                            }`}
                          >
                            {isUnlocked ? <Check className="w-3 h-3" /> : <Lock className="w-2.5 h-2.5" />}
                          </span>
                        </div>
                        <div className="font-extrabold text-[11.5px] text-gray-900 dark:text-white truncate">
                          {av.name}
                        </div>
                        <div className="text-[10px] font-mono text-gray-500">
                          {isUnlocked ? '✓ Открыта' : `${pct}% (ещё ${av.requiredPoints - pointsBreakdown.totalPoints} б.)`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ВКЛАДКА 4: СООБЩЕНИЯ УЧЕНИКУ */}
            {activeTab === 'messages' && (
              <section className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-4 sm:p-5 border border-gray-200/80 dark:border-gray-800 shadow-sm space-y-4">
                <form onSubmit={handleSendMessage} className="p-4 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-gray-200/70 dark:border-gray-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-gray-800 dark:text-white">
                      Новое сообщение для {student.full_name}
                    </span>
                    {selectedBookForMsg.title && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10.5px] font-bold inline-flex items-center gap-1.5">
                        📖 {selectedBookForMsg.title}
                        <button
                          type="button"
                          onClick={() => setSelectedBookForMsg({ id: null, title: null })}
                          className="hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_TEMPLATES.map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setMessageDraft(tpl)}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-700 hover:border-indigo-500 text-[11px] text-gray-700 dark:text-gray-200"
                      >
                        {tpl.slice(0, 44)}…
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    required
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    placeholder="Напишите сообщение или замечание ученику..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm outline-none focus:border-indigo-500"
                  />

                  {sendError && <div className="text-xs font-semibold text-red-600">{sendError}</div>}

                  <button
                    type="submit"
                    disabled={isSending || !messageDraft.trim()}
                    className="px-4 py-2 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSending ? 'Отправка...' : 'Отправить сообщение'}</span>
                  </button>
                </form>

                {messages.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">
                    Сообщений этому ученику ещё не отправлялось.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m) => {
                      const isAuto = isAutoWarningMessage(m.sender_name);
                      return (
                      <div
                        key={m.id}
                        className={`p-3 rounded-2xl border flex items-start justify-between gap-2 text-xs ${
                          isAuto
                            ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/15'
                            : 'border-gray-100 dark:border-gray-800 bg-[#F8F9FE]/60 dark:bg-[#16181F]'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {m.sender_name && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isAuto
                                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200'
                                    : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200'
                                }`}
                              >
                                {m.sender_name}
                              </span>
                            )}
                            {isAuto && (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 text-[9.5px] font-extrabold uppercase">
                                Авто
                              </span>
                            )}
                            {m.book_title && (
                              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                📖 {m.book_title}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                m.is_read ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {m.is_read ? 'Прочитано' : 'Не прочитано'}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400">
                              {new Date(m.created_at).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-gray-800 dark:text-gray-200 whitespace-pre-line">
                            {m.message}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(m.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                          title="Удалить сообщение"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
