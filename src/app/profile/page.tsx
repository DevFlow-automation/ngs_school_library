'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { ReaderModal } from '@/components/ReaderModal';
import { StudentAvatar } from '@/components/StudentAvatar';
import { useReadingStore } from '@/store/useReadingStore';
import { supabase } from '@/lib/supabase';
import { BOOKS } from '@/data/books';
import { Book } from '@/types/book';
import { fetchBooksMetadata, getCachedBooks } from '@/lib/booksService';
import { evaluateBookCompletion, formatReadingDuration } from '@/lib/readingMetrics';
import { isAutoWarningMessage } from '@/lib/autoWarnings';
import { formatPointsDelta } from '@/lib/pointAdjustments';
import {
  POINTS_PER_HONEST_PAGE,
  calculateStudentPoints,
  getAgeGroup,
  getAgeGroupMeta,
  getFrameRewardById,
  getRewardsForAgeGroup,
  getStudentRank,
  RewardCategory,
} from '@/lib/gamification';
import {
  AVATAR_RARITY_META,
  AvatarCategory,
  getAvatarById,
  getAvatarsForAgeGroup,
  resolveEffectiveAvatarId,
} from '@/lib/avatars';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Clock,
  CheckCircle2,
  Mail,
  MessageSquare,
  RefreshCw,
  User,
  Award,
  Check,
  CheckCheck,
  Sparkles,
  Lock,
  Printer,
  X,
  Palette,
  Trophy,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface StudentMessageRow {
  id: string;
  student_id: string;
  book_id: string | null;
  book_title: string | null;
  sender_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

type ProfileTab = 'books' | 'avatars' | 'rewards' | 'messages';

function formatMessageDate(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StudentProfilePage() {
  const {
    student,
    myShelfIds,
    readingProgress,
    bonusPoints,
    pointAdjustments,
    setLoginModalOpen,
    openReader,
    syncFromSupabase,
    setUnreadMessagesCount,
    readerTheme,
    setReaderTheme,
    equippedFrameId,
    setEquippedFrameId,
    equippedAvatarId,
    setEquippedAvatarId,
  } = useReadingStore();

  const [booksMap, setBooksMap] = useState<Record<string, Book>>(() => {
    const cached = getCachedBooks();
    if (!cached) return {};
    const initial: Record<string, Book> = {};
    for (const b of cached) {
      initial[b.id] = b;
    }
    return initial;
  });
  const [messages, setMessages] = useState<StudentMessageRow[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>('books');
  const [rewardFilter, setRewardFilter] = useState<'all' | RewardCategory>('all');
  const [avatarFilter, setAvatarFilter] = useState<'all' | AvatarCategory>('all');
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  const loadBooks = useCallback(async (force = false) => {
    try {
      const books = await fetchBooksMetadata({ force });
      const nextMap: Record<string, Book> = {};
      for (const b of books) {
        nextMap[b.id] = b;
      }
      setBooksMap(nextMap);
    } catch (err) {
      console.error('Ошибка загрузки книг для профиля:', err);
    }
  }, []);

  const loadMessages = useCallback(
    async (studentId: string) => {
      try {
        const { data, error } = await supabase
          .from('student_messages')
          .select('*')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          const rows = data as StudentMessageRow[];
          setMessages(rows);
          setUnreadMessagesCount(rows.filter((m) => !m.is_read).length);
        }
      } catch {
        // Таблица student_messages ещё не создана
      }
    },
    [setUnreadMessagesCount]
  );

  const loadAll = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setIsRefreshing(true);
      try {
        if (student?.id) {
          await Promise.all([loadBooks(showSpinner), syncFromSupabase(), loadMessages(student.id)]);
        } else {
          await loadBooks(showSpinner);
          setMessages([]);
        }
      } finally {
        setIsLoadingData(false);
        setIsRefreshing(false);
      }
    },
    [loadBooks, loadMessages, student?.id, syncFromSupabase]
  );

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#messages') {
      setActiveProfileTab('messages');
    }
  }, []);

  const handleMarkAsRead = async (msgId: string) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === msgId ? { ...m, is_read: true } : m));
      setUnreadMessagesCount(next.filter((m) => !m.is_read).length);
      return next;
    });

    await supabase.from('student_messages').update({ is_read: true }).eq('id', msgId);
  };

  const handleMarkAllAsRead = async () => {
    if (!student?.id) return;
    setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })));
    setUnreadMessagesCount(0);

    await supabase
      .from('student_messages')
      .update({ is_read: true })
      .eq('student_id', student.id)
      .eq('is_read', false);
  };

  const readingEntries = useMemo(() => {
    return Object.entries(readingProgress)
      .map(([bookId, progress]) => ({
        bookId,
        progress,
        book: booksMap[bookId] || BOOKS.find((b) => b.id === bookId) || null,
      }))
      .sort(
        (a, b) =>
          (b.progress.readingSeconds || 0) - (a.progress.readingSeconds || 0) ||
          b.progress.percent - a.progress.percent
      );
  }, [readingProgress, booksMap]);

  const shelfBooks = useMemo(() => {
    return myShelfIds
      .map((id) => booksMap[id] || BOOKS.find((b) => b.id === id))
      .filter((b): b is Book => Boolean(b));
  }, [myShelfIds, booksMap]);

  const totalReadingSeconds = useMemo(
    () => readingEntries.reduce((acc, item) => acc + Number(item.progress.readingSeconds || 0), 0),
    [readingEntries]
  );

  const completedBooksCount = useMemo(
    () =>
      readingEntries.filter((item) => {
        if ((item.progress.percent || 0) < 95) return false;
        return evaluateBookCompletion({
          progressPercent: item.progress.percent || 0,
          readingSeconds: item.progress.readingSeconds || 0,
          pagesTurned: item.progress.pagesTurned || 0,
          fastTurnsCount: item.progress.fastTurnsCount || 0,
          avgSecondsPerPage: item.progress.avgSecondsPerPage || 0,
          minSecondsPerPage: item.progress.minSecondsPerPage ?? null,
        }).counted;
      }).length,
    [readingEntries]
  );

  const unreadCount = useMemo(() => messages.filter((m) => !m.is_read).length, [messages]);

  const ageGroup = useMemo(() => getAgeGroup(student?.gradeClass), [student?.gradeClass]);
  const ageGroupMeta = useMemo(() => getAgeGroupMeta(ageGroup), [ageGroup]);

  const pointsBreakdown = useMemo(
    () =>
      calculateStudentPoints(
        readingEntries.map(({ progress }) => ({
          progressPercent: progress.percent || 0,
          readingSeconds: progress.readingSeconds || 0,
          pagesTurned: progress.pagesTurned || 0,
          fastTurnsCount: progress.fastTurnsCount || 0,
          avgSecondsPerPage: progress.avgSecondsPerPage || 0,
          minSecondsPerPage: progress.minSecondsPerPage ?? null,
        })),
        student?.gradeClass,
        bonusPoints
      ),
    [readingEntries, student?.gradeClass, bonusPoints]
  );

  const rankProgress = useMemo(
    () => getStudentRank(pointsBreakdown.totalPoints, ageGroup),
    [pointsBreakdown.totalPoints, ageGroup]
  );

  const ageRewards = useMemo(() => getRewardsForAgeGroup(ageGroup), [ageGroup]);
  const filteredRewards = useMemo(
    () =>
      rewardFilter === 'all'
        ? ageRewards
        : ageRewards.filter((r) => r.category === rewardFilter),
    [ageRewards, rewardFilter]
  );
  const unlockedRewardsCount = useMemo(
    () => ageRewards.filter((r) => pointsBreakdown.totalPoints >= r.requiredPoints).length,
    [ageRewards, pointsBreakdown.totalPoints]
  );

  const activeFrameReward = useMemo(() => {
    const reward = getFrameRewardById(equippedFrameId);
    if (!reward || pointsBreakdown.totalPoints < reward.requiredPoints) return null;
    return reward;
  }, [equippedFrameId, pointsBreakdown.totalPoints]);

  const allAvatars = useMemo(() => getAvatarsForAgeGroup(ageGroup), [ageGroup]);
  const filteredAvatars = useMemo(
    () =>
      avatarFilter === 'all'
        ? allAvatars
        : allAvatars.filter((av) => av.category === avatarFilter),
    [allAvatars, avatarFilter]
  );
  const unlockedAvatarsCount = useMemo(
    () => allAvatars.filter((av) => pointsBreakdown.totalPoints >= av.requiredPoints).length,
    [allAvatars, pointsBreakdown.totalPoints]
  );
  const effectiveAvatarId = useMemo(
    () => resolveEffectiveAvatarId(equippedAvatarId, pointsBreakdown.totalPoints, ageGroup),
    [equippedAvatarId, pointsBreakdown.totalPoints, ageGroup]
  );
  const activeAvatar = useMemo(
    () => getAvatarById(effectiveAvatarId, ageGroup),
    [effectiveAvatarId, ageGroup]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Верхняя навигация */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#EEF0FA] dark:bg-[#22252D] text-xs font-bold text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC] dark:hover:bg-[#2E323D] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>В каталог</span>
          </Link>

          {student && (
            <button
              type="button"
              onClick={() => loadAll(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#1C1F26] border border-[#E0E2EC] dark:border-[#2F323D] text-xs font-bold text-[#44474F] dark:text-[#C4C7D0] hover:border-[#3F51B5] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          )}
        </div>

        {!student ? (
          <section className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-8 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-[#3F51B5] dark:text-[#A5B4FC] flex items-center justify-center mx-auto">
              <User className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-extrabold text-[#191C20] dark:text-white">
                Личный кабинет ученика
              </h1>
              <p className="text-xs sm:text-sm text-[#74777F] dark:text-[#90939C] max-w-md mx-auto">
                Войдите в аккаунт, чтобы видеть прогресс чтения, баллы, коллекцию аватарок, награды и сообщения от администратора.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
              >
                Войти в аккаунт
              </button>
              <Link
                href="/"
                className="px-5 py-2.5 rounded-xl bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0] text-xs sm:text-sm font-bold"
              >
                В каталог
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* Компактная карточка-шапка профиля */}
            <section
              style={
                activeFrameReward?.frameStyle
                  ? { background: activeFrameReward.frameStyle.bannerGradient }
                  : undefined
              }
              className={`text-white rounded-[24px] p-4 sm:p-5 shadow-lg relative overflow-hidden ${
                activeFrameReward?.frameStyle
                  ? ''
                  : 'bg-gradient-to-br from-[#1C244B] via-[#232E66] to-[#344182]'
              }`}
            >
              <div className="absolute -right-12 -top-12 w-56 h-56 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Аватар + Имя + Ранг + Полоса уровня */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveProfileTab('avatars')}
                    className="relative shrink-0 group"
                    title="Сменить аватарку"
                  >
                    <StudentAvatar
                      avatarId={effectiveAvatarId}
                      size={62}
                      className={`shadow-lg transition-transform group-hover:scale-105 ${
                        activeFrameReward?.frameStyle
                          ? activeFrameReward.frameStyle.ringClass
                          : AVATAR_RARITY_META[activeAvatar.rarity].ringClass
                      }`}
                    />
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-white text-xs shadow flex items-center justify-center">
                      {activeFrameReward?.frameStyle?.badgeIcon || rankProgress.current.icon}
                    </span>
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h1 className="text-lg sm:text-xl font-extrabold tracking-tight truncate">
                        {student.fullName}
                      </h1>
                      <span className="px-2 py-0.5 rounded-full bg-white/15 text-white text-[10.5px] font-bold">
                        {student.gradeClass} кл
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-400/25 text-amber-100 text-[10.5px] font-mono font-extrabold">
                        ⭐ {pointsBreakdown.totalPoints} б.
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-indigo-100/85">
                      <span className="font-bold text-[#FFE082]">
                        {rankProgress.current.icon} {rankProgress.current.title}
                      </span>
                      <span className="opacity-70">•</span>
                      <span>
                        {rankProgress.next
                          ? `До «${rankProgress.next.title}»: ${rankProgress.pointsToNext} б.`
                          : 'Максимальный ранг 🏆'}
                      </span>
                    </div>

                    <div className="w-full max-w-sm h-1.5 rounded-full bg-white/15 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-emerald-400 transition-all duration-500"
                        style={{ width: `${Math.max(5, rankProgress.progressPercent)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Компактные 4 показателя справа */}
                <div className="grid grid-cols-4 gap-2 shrink-0">
                  <div className="px-3 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
                    <div className="text-[10px] text-indigo-200 font-semibold">Книг</div>
                    <div className="text-sm sm:text-base font-extrabold font-mono">
                      {readingEntries.length}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
                    <div className="text-[10px] text-emerald-200 font-semibold">Дочитано</div>
                    <div className="text-sm sm:text-base font-extrabold font-mono">
                      {completedBooksCount}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
                    <div className="text-[10px] text-amber-200 font-semibold">Время</div>
                    <div className="text-xs sm:text-sm font-extrabold font-mono leading-5">
                      {formatReadingDuration(totalReadingSeconds)}
                    </div>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
                    <div className="text-[10px] text-indigo-200 font-semibold">Награды</div>
                    <div className="text-sm sm:text-base font-extrabold font-mono">
                      {unlockedRewardsCount}/{ageRewards.length}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Полоска ожидания при первичной загрузке данных профиля */}
            {isLoadingData && Object.keys(booksMap).length === 0 && (
              <div className="px-4 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 flex items-center gap-2.5 text-xs font-semibold text-[#191C20] dark:text-indigo-100">
                <Loader2 className="w-4 h-4 text-[#3F51B5] dark:text-[#A5B4FC] animate-spin shrink-0" />
                <span>Загружаем список ваших книг и прогресс чтения, пожалуйста, подождите…</span>
              </div>
            )}

            {/* Полоска-уведомление о новых сообщениях (если не на вкладке Сообщения) */}
            {unreadCount > 0 && activeProfileTab !== 'messages' && (
              <button
                type="button"
                onClick={() => setActiveProfileTab('messages')}
                className="w-full px-4 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/70 flex items-center justify-between gap-3 text-left hover:bg-amber-100/70 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-200">
                  <Mail className="w-4 h-4 text-red-600 shrink-0" />
                  <span>У вас есть новые сообщения и предупреждения ({unreadCount})</span>
                </div>
                <span className="text-xs font-extrabold text-[#3F51B5] dark:text-[#A5B4FC] shrink-0">
                  Открыть →
                </span>
              </button>
            )}

            {/* Навигация по вкладкам профиля (убирает длинный скролл) */}
            <nav className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveProfileTab('books')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${
                  activeProfileTab === 'books'
                    ? 'bg-[#3F51B5] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1F26] border border-[#E0E2EC] dark:border-[#2F323D] text-[#44474F] dark:text-[#C4C7D0] hover:border-[#3F51B5]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Мои книги</span>
                <span className="opacity-75 font-mono">({readingEntries.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveProfileTab('avatars')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${
                  activeProfileTab === 'avatars'
                    ? 'bg-[#3F51B5] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1F26] border border-[#E0E2EC] dark:border-[#2F323D] text-[#44474F] dark:text-[#C4C7D0] hover:border-[#3F51B5]'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Аватарки</span>
                <span className="opacity-75 font-mono">
                  ({unlockedAvatarsCount}/{allAvatars.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveProfileTab('rewards')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${
                  activeProfileTab === 'rewards'
                    ? 'bg-[#3F51B5] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1F26] border border-[#E0E2EC] dark:border-[#2F323D] text-[#44474F] dark:text-[#C4C7D0] hover:border-[#3F51B5]'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Награды</span>
                <span className="opacity-75 font-mono">
                  ({unlockedRewardsCount}/{ageRewards.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveProfileTab('messages')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${
                  activeProfileTab === 'messages'
                    ? 'bg-[#3F51B5] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1F26] border border-[#E0E2EC] dark:border-[#2F323D] text-[#44474F] dark:text-[#C4C7D0] hover:border-[#3F51B5]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Сообщения</span>
                {unreadCount > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px] font-extrabold">
                    {unreadCount}
                  </span>
                ) : (
                  <span className="opacity-75 font-mono">({messages.length})</span>
                )}
              </button>
            </nav>

            {/* ВКЛАДКА 1: МОИ КНИГИ И ПОЛКА */}
            {activeProfileTab === 'books' && (
              <section className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-4 sm:p-5 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-4">
                {readingEntries.length === 0 ? (
                  <div className="py-8 text-center space-y-2.5">
                    <p className="text-xs sm:text-sm font-semibold text-[#44474F] dark:text-[#C4C7D0]">
                      Вы ещё не начали читать ни одной книги
                    </p>
                    <Link
                      href="/"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3F51B5] text-white text-xs font-bold hover:bg-[#303F9F]"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Выбрать книгу в каталоге</span>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {readingEntries.map(({ bookId, progress, book }) => {
                      const rawPercent = Math.min(100, Math.max(0, progress.percent || 0));
                      const completion = evaluateBookCompletion({
                        progressPercent: rawPercent,
                        readingSeconds: progress.readingSeconds || 0,
                        pagesTurned: progress.pagesTurned || 0,
                        fastTurnsCount: progress.fastTurnsCount || 0,
                        avgSecondsPerPage: progress.avgSecondsPerPage || 0,
                        minSecondsPerPage: progress.minSecondsPerPage ?? null,
                      });
                      const isRejectedCompletion =
                        (rawPercent >= 94 || Boolean(progress.completionRejectedReason)) &&
                        !completion.counted;
                      const rejectedReason =
                        progress.completionRejectedReason || (isRejectedCompletion ? completion.reason : '');
                      const displayPercent = isRejectedCompletion ? Math.min(rawPercent, 94) : rawPercent;
                      const isDone = displayPercent >= 95 && completion.counted;

                      return (
                        <div
                          key={bookId}
                          className={`p-3 rounded-2xl border space-y-2 ${
                            isRejectedCompletion
                              ? 'border-red-300 dark:border-red-800/70 bg-red-50/40 dark:bg-red-950/15'
                              : 'border-[#E0E2EC]/70 dark:border-[#2F323D] bg-[#F8F9FE]/60 dark:bg-[#16181F]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              style={{
                                background:
                                  book?.coverGradient ||
                                  'linear-gradient(135deg, #1E1B4B 0%, #4338CA 50%, #6366F1 100%)',
                              }}
                              className="w-10 h-14 rounded-r-md rounded-l-sm shrink-0 shadow flex items-center justify-center text-white text-[8px] font-serif font-bold text-center p-1 leading-tight"
                            >
                              {(book?.title || 'Книга').slice(0, 12)}
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-1.5">
                                <h3 className="font-bold text-xs sm:text-sm text-[#191C20] dark:text-white truncate">
                                  {book?.title || bookId}
                                </h3>
                                {isDone && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                )}
                                {isRejectedCompletion && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200 text-[9.5px] font-bold shrink-0">
                                    Не засчитано
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#74777F] dark:text-[#90939C]">
                                <span>
                                  Гл. {progress.chapterIndex + 1}, стр. {progress.pageIndex + 1}
                                </span>
                                <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                                  <Clock className="w-3 h-3" />
                                  {formatReadingDuration(progress.readingSeconds || 0)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-[#E0E2EC] dark:bg-[#2E323D] overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      isRejectedCompletion
                                        ? 'bg-red-500'
                                        : 'bg-gradient-to-r from-[#3F51B5] to-emerald-500'
                                    }`}
                                    style={{ width: `${displayPercent}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-[10.5px] font-mono font-bold ${
                                    isRejectedCompletion
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-[#3F51B5] dark:text-[#A5B4FC]'
                                  }`}
                                >
                                  {displayPercent}%
                                </span>
                              </div>
                            </div>

                            {book && (
                              <button
                                type="button"
                                onClick={() => openReader(book.id)}
                                className="px-3 py-2 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-[11px] font-bold shrink-0 transition-all active:scale-95"
                              >
                                Читать
                              </button>
                            )}
                          </div>

                          {isRejectedCompletion && rejectedReason && (
                            <div className="px-2.5 py-2 rounded-xl bg-red-100/70 dark:bg-red-950/50 text-red-800 dark:text-red-200 text-[11px] flex items-start gap-1.5 leading-snug">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                              <span>
                                <b>Книга не засчитана прочитанной:</b> {rejectedReason}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {shelfBooks.length > 0 && (
                  <div className="pt-3 border-t border-[#E0E2EC]/70 dark:border-[#2F323D] space-y-2.5">
                    <div className="text-xs font-extrabold text-[#191C20] dark:text-white flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-[#3F51B5] fill-[#3F51B5]" />
                      <span>Моя полка ({shelfBooks.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {shelfBooks.map((book) => (
                        <div
                          key={book.id}
                          className="px-3 py-2 rounded-xl border border-[#E0E2EC]/70 dark:border-[#2F323D] bg-[#F8F9FE]/60 dark:bg-[#16181F] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-[#191C20] dark:text-white truncate">
                              {book.title}
                            </div>
                            <div className="text-[10.5px] text-[#74777F] dark:text-[#90939C] truncate">
                              {book.author}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openReader(book.id)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-[#3F51B5] dark:text-[#A5B4FC] text-[11px] font-bold shrink-0"
                          >
                            Открыть
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ВКЛАДКА 2: КОЛЛЕКЦИЯ АВАТАРОК */}
            {activeProfileTab === 'avatars' && (
              <section className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-4 sm:p-5 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs text-[#74777F] dark:text-[#90939C]">
                    Своё фото загружать нельзя — новые аватарки открываются за баллы чтения ({ageGroupMeta.label})
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        ['all', 'Все'],
                        ['games', 'Игры'],
                        ['writers', 'Писатели'],
                        ['exclusive', 'Премиум и Легенда'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAvatarFilter(key)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                          avatarFilter === key
                            ? 'bg-[#3F51B5] text-white'
                            : 'bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {filteredAvatars.map((av) => {
                    const isUnlocked = pointsBreakdown.totalPoints >= av.requiredPoints;
                    const isSelected = effectiveAvatarId === av.id;
                    const rarityMeta = AVATAR_RARITY_META[av.rarity];
                    const pct =
                      av.requiredPoints === 0
                        ? 100
                        : Math.min(
                            100,
                            Math.round((pointsBreakdown.totalPoints / av.requiredPoints) * 100)
                          );

                    return (
                      <div
                        key={av.id}
                        title={av.subtitle}
                        className={`p-2.5 rounded-2xl border flex flex-col justify-between gap-2 text-center transition-all ${
                          isSelected
                            ? 'border-[#3F51B5] ring-2 ring-[#3F51B5]/40 bg-indigo-50/50 dark:bg-indigo-950/25'
                            : rarityMeta.cardClass
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase tracking-wider ${rarityMeta.badgeClass}`}
                            >
                              {rarityMeta.label}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-[#74777F] dark:text-[#90939C]">
                              {av.requiredPoints === 0 ? 'Старт' : `${av.requiredPoints} б.`}
                            </span>
                          </div>

                          <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
                            <StudentAvatar
                              avatarId={av.id}
                              size={56}
                              className={`${rarityMeta.ringClass} transition-transform ${
                                !isUnlocked ? 'opacity-75 grayscale-[25%]' : 'hover:scale-105'
                              }`}
                            />
                            {!isUnlocked && (
                              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gray-900/90 text-white flex items-center justify-center border border-white/20">
                                <Lock className="w-2.5 h-2.5" />
                              </span>
                            )}
                            {isSelected && (
                              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center border-2 border-white dark:border-[#1C1F26]">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                          </div>

                          <div className="font-extrabold text-[11.5px] text-[#191C20] dark:text-white leading-tight truncate">
                            {av.name}
                          </div>
                        </div>

                        {isUnlocked ? (
                          <button
                            type="button"
                            onClick={() => setEquippedAvatarId(av.id)}
                            disabled={isSelected}
                            className={`w-full py-1 px-2 rounded-lg text-[10.5px] font-bold transition-all ${
                              isSelected
                                ? 'bg-emerald-600 text-white cursor-default'
                                : av.rarity === 'premium'
                                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-950'
                                : av.rarity === 'legendary'
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white'
                                : 'bg-[#3F51B5] hover:bg-[#303F9F] text-white'
                            }`}
                          >
                            {isSelected ? '✓ Активна' : 'Выбрать'}
                          </button>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9.5px] font-mono text-[#74777F]">
                              <span>+{av.requiredPoints - pointsBreakdown.totalPoints} б.</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-[#E0E2EC] dark:bg-[#2E323D] overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  av.rarity === 'premium'
                                    ? 'bg-amber-500'
                                    : av.rarity === 'legendary'
                                    ? 'bg-emerald-500'
                                    : 'bg-[#3F51B5]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ВКЛАДКА 3: БАЛЛЫ И НАГРАДЫ */}
            {activeProfileTab === 'rewards' && (
              <section className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-4 sm:p-5 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold">
                      📖 Страницы: +{pointsBreakdown.honestPagePoints} б. ({pointsBreakdown.honestPagesCount})
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-bold">
                      🏆 Книги: +{pointsBreakdown.completionPoints} б. ({pointsBreakdown.honestCompletedBooks})
                    </span>
                    {pointsBreakdown.bonusPoints !== 0 && (
                      <span
                        className={`px-2.5 py-1 rounded-lg font-bold ${
                          pointsBreakdown.bonusPoints > 0
                            ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                            : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        🎁 От библиотеки: {formatPointsDelta(pointsBreakdown.bonusPoints)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        ['all', 'Все'],
                        ['frame', 'Стили'],
                        ['theme', 'Темы'],
                        ['perk', 'Привилегии'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRewardFilter(key)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                          rewardFilter === key
                            ? 'bg-[#3F51B5] text-white'
                            : 'bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-[#74777F] dark:text-[#90939C]">
                  <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>
                    +{POINTS_PER_HONEST_PAGE} б./честная стр., +{pointsBreakdown.completionBonusPerBook} б./книга ({ageGroupMeta.label}). Быстрое пролистывание, повторное листание туда-сюда и простой вкладки не приносят баллов.
                  </span>
                </div>

                {pointAdjustments.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-[#E0E2EC]/70 dark:border-[#2F323D] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#191C20] dark:text-white">
                        🎁 Начисления и корректировки от библиотеки ({pointAdjustments.length})
                      </span>
                      <span
                        className={`text-[11px] font-mono font-extrabold ${
                          pointsBreakdown.bonusPoints >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        Итого: {formatPointsDelta(pointsBreakdown.bonusPoints)}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {pointAdjustments.map((adj) => (
                        <div
                          key={adj.id}
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#1C1F26] border border-[#E0E2EC]/60 dark:border-[#2F323D] flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span
                              className={`px-2 py-0.5 rounded-lg font-mono font-extrabold text-[11px] shrink-0 ${
                                adj.points > 0
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                              }`}
                            >
                              {formatPointsDelta(adj.points)}
                            </span>
                            <span className="text-[#191C20] dark:text-[#E2E2E9] font-medium">
                              {adj.reason || 'Корректировка баллов'}
                            </span>
                          </div>
                          <div className="text-[10.5px] text-[#74777F] dark:text-[#90939C] flex items-center gap-1.5 shrink-0">
                            <span>{adj.sender_name}</span>
                            <span>•</span>
                            <span className="font-mono">{formatMessageDate(adj.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {filteredRewards.map((reward) => {
                    const isUnlocked = pointsBreakdown.totalPoints >= reward.requiredPoints;
                    const pct = Math.min(
                      100,
                      Math.round((pointsBreakdown.totalPoints / Math.max(1, reward.requiredPoints)) * 100)
                    );
                    const isFrameActive =
                      reward.category === 'frame' && equippedFrameId === reward.id && isUnlocked;
                    const isThemeActive =
                      reward.category === 'theme' && readerTheme === reward.themeValue && isUnlocked;

                    return (
                      <div
                        key={reward.id}
                        className={`p-3 rounded-2xl border flex flex-col justify-between gap-2.5 transition-all ${
                          isFrameActive || isThemeActive
                            ? 'border-[#3F51B5] bg-indigo-50/50 dark:bg-indigo-950/25 ring-1 ring-[#3F51B5]'
                            : isUnlocked
                            ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/25 dark:bg-emerald-950/10'
                            : 'border-[#E0E2EC]/70 dark:border-[#2F323D] bg-[#F8F9FE]/60 dark:bg-[#151820] opacity-85'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div
                              style={
                                reward.frameStyle
                                  ? { background: reward.frameStyle.avatarBg }
                                  : reward.themePreviewBg
                                  ? {
                                      backgroundColor: reward.themePreviewBg,
                                      color: reward.themePreviewText,
                                    }
                                  : undefined
                              }
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border border-black/10 ${
                                !reward.frameStyle && !reward.themePreviewBg
                                  ? 'bg-amber-100 dark:bg-amber-950/50'
                                  : ''
                              }`}
                            >
                              {reward.icon}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9.5px] font-mono font-extrabold ${
                                isUnlocked
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                                  : 'bg-gray-200/80 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                              }`}
                            >
                              {isUnlocked ? '✓ Открыто' : `🔒 ${reward.requiredPoints} б.`}
                            </span>
                          </div>

                          <div>
                            <h3 className="font-extrabold text-xs text-[#191C20] dark:text-white leading-snug">
                              {reward.title}
                            </h3>
                            <p className="text-[10.5px] text-[#74777F] dark:text-[#90939C] mt-0.5 line-clamp-2 leading-snug">
                              {reward.description}
                            </p>
                          </div>
                        </div>

                        {!isUnlocked ? (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9.5px] font-mono text-[#74777F]">
                              <span>Ещё {reward.requiredPoints - pointsBreakdown.totalPoints} б.</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-[#E0E2EC] dark:bg-[#2E323D] overflow-hidden">
                              <div className="h-full rounded-full bg-[#3F51B5]" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        ) : reward.category === 'frame' ? (
                          <button
                            type="button"
                            onClick={() => setEquippedFrameId(isFrameActive ? null : reward.id)}
                            className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition-all ${
                              isFrameActive
                                ? 'bg-[#3F51B5] text-white'
                                : 'bg-white dark:bg-[#22252D] border border-[#3F51B5]/40 text-[#3F51B5] dark:text-[#A5B4FC]'
                            }`}
                          >
                            {isFrameActive ? '✓ Надет (снять)' : 'Надеть стиль'}
                          </button>
                        ) : reward.category === 'theme' && reward.themeValue ? (
                          <button
                            type="button"
                            onClick={() => setReaderTheme(reward.themeValue!)}
                            className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-bold inline-flex items-center justify-center gap-1 transition-all ${
                              isThemeActive
                                ? 'bg-[#3F51B5] text-white'
                                : 'bg-white dark:bg-[#22252D] border border-[#3F51B5]/40 text-[#3F51B5] dark:text-[#A5B4FC]'
                            }`}
                          >
                            <Palette className="w-3 h-3" />
                            <span>{isThemeActive ? '✓ Активна' : 'Включить'}</span>
                          </button>
                        ) : reward.perkType === 'certificate' ? (
                          <button
                            type="button"
                            onClick={() => setShowCertificateModal(true)}
                            className="w-full py-1.5 px-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>Сертификат</span>
                          </button>
                        ) : (
                          <div className="py-1.5 px-2 rounded-xl bg-amber-100/80 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 text-[10.5px] font-bold text-center">
                            ✓ Покажи библиотекарю
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ВКЛАДКА 4: СООБЩЕНИЯ ОТ АДМИНИСТРАТОРА */}
            {activeProfileTab === 'messages' && (
              <section
                id="messages"
                className="bg-white dark:bg-[#1C1F26] rounded-[24px] p-4 sm:p-5 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[#191C20] dark:text-white">
                    <Sparkles className="w-4 h-4 text-[#3F51B5]" />
                    <span>Сообщения и предупреждения</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-[#3F51B5] dark:text-[#A5B4FC] hover:bg-indigo-100 text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Прочитать все</span>
                    </button>
                  )}
                </div>

                {isLoadingData ? (
                  <div className="py-6 text-center text-xs text-gray-400">Загрузка...</div>
                ) : messages.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-dashed border-[#E0E2EC] dark:border-[#2F323D] text-center text-xs text-[#74777F] dark:text-[#90939C]">
                    Сообщений и предупреждений пока нет. Приятного чтения!
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {messages.map((msg) => {
                      const isAuto = isAutoWarningMessage(msg.sender_name);
                      return (
                      <div
                        key={msg.id}
                        className={`p-3.5 rounded-2xl border space-y-1.5 ${
                          !msg.is_read
                            ? isAuto
                              ? 'bg-red-50/60 dark:bg-red-950/20 border-red-300 dark:border-red-800/70'
                              : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/70'
                            : 'bg-[#F8F9FE]/70 dark:bg-[#16181F] border-[#E0E2EC]/70 dark:border-[#2F323D]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-extrabold text-[#191C20] dark:text-white inline-flex items-center gap-1">
                              {isAuto && (
                                <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                              )}
                              <span>{msg.sender_name || 'Администратор библиотеки'}</span>
                            </span>
                            {isAuto && (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-[9.5px] font-extrabold">
                                Авто-предупреждение
                              </span>
                            )}
                            {!msg.is_read && (
                              <span className="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[9.5px] font-bold">
                                Новое
                              </span>
                            )}
                            {msg.book_title && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold">
                                📖 {msg.book_title}
                              </span>
                            )}
                          </div>
                          <span className="text-[10.5px] font-mono text-[#74777F] dark:text-[#90939C]">
                            {formatMessageDate(msg.created_at)}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-[#191C20] dark:text-[#E2E2E9] whitespace-pre-line leading-relaxed">
                          {msg.message}
                        </p>

                        {!msg.is_read && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleMarkAsRead(msg.id)}
                              className="px-2.5 py-1 rounded-lg bg-[#3F51B5] hover:bg-[#303F9F] text-white text-[10.5px] font-bold inline-flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Понятно, прочитано</span>
                            </button>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Модалка именного сертификата / грамоты читателя */}
      {showCertificateModal && student && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl space-y-3">
            <div
              id="ngs-certificate-printable"
              className="bg-[#FFFDF8] text-[#181A18] rounded-[28px] p-8 border-4 border-[#12372A] shadow-2xl relative overflow-hidden text-center space-y-5"
            >
              <div className="border border-[#D97706]/50 rounded-2xl p-6 space-y-4">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#D97706]">
                  New Generation School • Библиотека
                </div>
                <div className="text-4xl">
                  {ageGroup === 'junior' ? '🏅' : ageGroup === 'middle' ? '📜' : '🎓'}
                </div>
                <h3 className="text-2xl font-serif font-extrabold text-[#12372A]">
                  {ageGroup === 'junior'
                    ? 'Грамота лучшего читателя'
                    : 'Именной сертификат читателя NGS'}
                </h3>
                <p className="text-xs text-gray-600">
                  Награждается ученик(ца) {student.gradeClass} класса
                </p>
                <div className="text-2xl sm:text-3xl font-extrabold text-[#1C244B] py-1">
                  {student.fullName}
                </div>
                <p className="text-xs text-gray-700 max-w-md mx-auto leading-relaxed">
                  За внимательное и увлечённое чтение в цифровой библиотеке школы и достижение ранга{' '}
                  <b>
                    {rankProgress.current.icon} «{rankProgress.current.title}»
                  </b>
                  .
                </p>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#DFD8C8]">
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold">Баллы</div>
                    <div className="text-lg font-mono font-extrabold text-[#D97706]">
                      {pointsBreakdown.totalPoints}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold">Время чтения</div>
                    <div className="text-lg font-mono font-extrabold text-[#12372A]">
                      {formatReadingDuration(totalReadingSeconds)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold">Прочитано книг</div>
                    <div className="text-lg font-mono font-extrabold text-[#3F51B5]">
                      {pointsBreakdown.honestCompletedBooks}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-gray-400 pt-2">
                  Выдано {new Date().toLocaleDateString('ru-RU')} • NGS Library
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-lg"
              >
                <Printer className="w-4 h-4" />
                <span>Распечатать / Сохранить PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCertificateModal(false)}
                className="px-5 py-2.5 rounded-2xl bg-white text-gray-800 text-xs font-bold inline-flex items-center gap-1.5 shadow-lg"
              >
                <X className="w-4 h-4" />
                <span>Закрыть</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ReaderModal />
    </div>
  );
}
