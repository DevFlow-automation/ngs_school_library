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
import { formatReadingDuration } from '@/lib/readingMetrics';
import {
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

  const [booksMap, setBooksMap] = useState<Record<string, Book>>({});
  const [messages, setMessages] = useState<StudentMessageRow[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rewardFilter, setRewardFilter] = useState<'all' | RewardCategory>('all');
  const [avatarFilter, setAvatarFilter] = useState<'all' | AvatarCategory>('all');
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  const loadBooks = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        const nextMap: Record<string, Book> = {};
        for (const b of data) {
          if (!b?.id) continue;
          const mapped: Book = {
            id: b.id,
            title: b.title,
            author: b.author,
            year: b.year || 1850,
            grade: b.grade || '10-11',
            category: b.category || 'classic',
            categoryName: b.category_name || 'Русская классика',
            readTime: '2.5 ч',
            readersCount: 1,
            rating: 5.0,
            curriculum: Boolean(b.curriculum),
            coverGradient: b.cover_gradient || 'linear-gradient(135deg, #4338CA 0%, #3B82F6 100%)',
            accentColor: '#3B82F6',
            synopsis: b.synopsis || '',
            teacherNote: b.curriculum ? 'Входит в школьную программу' : 'Внеклассное чтение',
            audioSample: '',
            chapters:
              b.chapters && b.chapters.length > 0
                ? b.chapters
                : [{ title: 'Часть I', paragraphs: [b.synopsis || 'Текст произведения готовится к публикации.'] }],
          };
          nextMap[mapped.id] = mapped;

          const existingIdx = BOOKS.findIndex((existing) => existing.id === mapped.id);
          if (existingIdx >= 0) {
            BOOKS[existingIdx] = mapped;
          } else {
            BOOKS.push(mapped);
          }
        }
        setBooksMap(nextMap);
      }
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
        // Если таблица student_messages ещё не создана в Supabase, показываем пустой список
      }
    },
    [setUnreadMessagesCount]
  );

  const loadAll = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setIsRefreshing(true);
      try {
        await loadBooks();
        if (student?.id) {
          await Promise.all([syncFromSupabase(), loadMessages(student.id)]);
        } else {
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

  const handleMarkAsRead = async (msgId: string) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === msgId ? { ...m, is_read: true } : m));
      setUnreadMessagesCount(next.filter((m) => !m.is_read).length);
      return next;
    });

    await supabase
      .from('student_messages')
      .update({ is_read: true })
      .eq('id', msgId);
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
      .sort((a, b) => (b.progress.readingSeconds || 0) - (a.progress.readingSeconds || 0) || b.progress.percent - a.progress.percent);
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
    () => readingEntries.filter((item) => (item.progress.percent || 0) >= 95).length,
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
        student?.gradeClass
      ),
    [readingEntries, student?.gradeClass]
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

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#EEF0FA] dark:bg-[#22252D] text-xs font-bold text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC] dark:hover:bg-[#2E323D] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Вернуться в библиотеку</span>
          </Link>

          {student && (
            <button
              type="button"
              onClick={() => loadAll(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-[#1C1F26] border border-[#E0E2EC] dark:border-[#2F323D] text-xs font-bold text-[#44474F] dark:text-[#C4C7D0] hover:border-[#3F51B5] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          )}
        </div>

        {!student ? (
          <section className="bg-white dark:bg-[#1C1F26] rounded-[32px] p-8 sm:p-12 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 text-[#3F51B5] dark:text-[#A5B4FC] flex items-center justify-center mx-auto">
              <User className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#191C20] dark:text-white">
                Личный кабинет ученика
              </h1>
              <p className="text-sm text-[#74777F] dark:text-[#90939C] max-w-md mx-auto">
                Войдите в свой аккаунт, чтобы видеть прогресс чтения, время чтения, закладки и сообщения от администратора библиотеки.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                className="px-6 py-3 rounded-2xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-sm font-bold shadow-md transition-all"
              >
                Войти в аккаунт ученика
              </button>
              <Link
                href="/"
                className="px-6 py-3 rounded-2xl bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0] text-sm font-bold hover:bg-[#E0E2EC] transition-all"
              >
                В каталог книг
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* Шапка профиля ученика */}
            <section
              style={
                activeFrameReward?.frameStyle
                  ? { background: activeFrameReward.frameStyle.bannerGradient }
                  : undefined
              }
              className={`text-white rounded-[32px] p-6 sm:p-8 shadow-xl relative overflow-hidden ${
                activeFrameReward?.frameStyle
                  ? ''
                  : 'bg-gradient-to-br from-[#1C244B] via-[#232E66] to-[#344182]'
              }`}
            >
              <div className="absolute -right-14 -top-14 w-72 h-72 bg-indigo-400/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <StudentAvatar
                      avatarId={effectiveAvatarId}
                      size={80}
                      className={`shadow-xl ${
                        activeFrameReward?.frameStyle
                          ? activeFrameReward.frameStyle.ringClass
                          : AVATAR_RARITY_META[activeAvatar.rarity].ringClass
                      }`}
                    />
                    <span
                      className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-white text-base shadow-md flex items-center justify-center"
                      title={activeFrameReward?.title || rankProgress.current.title}
                    >
                      {activeFrameReward?.frameStyle?.badgeIcon || rankProgress.current.icon}
                    </span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 text-[#FFE082] text-[11px] font-bold uppercase tracking-wider">
                        {rankProgress.current.icon} {rankProgress.current.title}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/25 text-amber-100 text-[11px] font-mono font-extrabold">
                        ⭐ {pointsBreakdown.totalPoints} баллов
                      </span>
                      {activeFrameReward?.frameStyle && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-white text-[10px] font-bold">
                          {activeFrameReward.frameStyle.badgeIcon} {activeFrameReward.frameStyle.badgeText}
                        </span>
                      )}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                      {student.fullName}
                    </h1>
                    <p className="text-sm text-indigo-100/85 mt-0.5 font-medium">
                      {student.gradeClass} класс • {ageGroupMeta.subtitle} ({ageGroupMeta.label})
                    </p>
                  </div>
                </div>

                {unreadCount > 0 && (
                  <a
                    href="#messages"
                    className="self-start sm:self-center inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold shadow-lg transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Новых сообщений: {unreadCount}</span>
                  </a>
                )}
              </div>

              {/* Прогресс до следующего ранга */}
              <div className="relative z-10 mt-5 p-3.5 rounded-2xl bg-black/20 backdrop-blur-md border border-white/10 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-white/90">
                    Уровень {rankProgress.current.level}: {rankProgress.current.icon} {rankProgress.current.title}
                  </span>
                  <span className="font-mono text-amber-200 font-bold">
                    {rankProgress.next
                      ? `До «${rankProgress.next.icon} ${rankProgress.next.title}»: ещё ${rankProgress.pointsToNext} б.`
                      : 'Максимальный ранг достигнут! 🏆'}
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.max(4, rankProgress.progressPercent)}%` }}
                  />
                </div>
              </div>

              {/* 4 KPI карточки */}
              <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
                  <div className="flex items-center gap-2 text-indigo-200 text-xs font-semibold">
                    <BookOpen className="w-4 h-4" />
                    <span>Книг начато</span>
                  </div>
                  <div className="text-2xl font-extrabold mt-1.5 font-mono">{readingEntries.length}</div>
                </div>

                <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
                  <div className="flex items-center gap-2 text-emerald-200 text-xs font-semibold">
                    <Award className="w-4 h-4" />
                    <span>Прочитано</span>
                  </div>
                  <div className="text-2xl font-extrabold mt-1.5 font-mono">{completedBooksCount}</div>
                </div>

                <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
                  <div className="flex items-center gap-2 text-amber-200 text-xs font-semibold">
                    <Clock className="w-4 h-4" />
                    <span>Время чтения</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold mt-1.5 font-mono">
                    {formatReadingDuration(totalReadingSeconds)}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
                  <div className="flex items-center gap-2 text-indigo-200 text-xs font-semibold">
                    <Trophy className="w-4 h-4" />
                    <span>Наград открыто</span>
                  </div>
                  <div className="text-2xl font-extrabold mt-1.5 font-mono">
                    {unlockedRewardsCount}/{ageRewards.length}
                  </div>
                </div>
              </div>
            </section>

            {/* Коллекция аватарок (разблокируются за баллы, без ручной загрузки) */}
            <section
              id="avatars"
              className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-6 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <StudentAvatar
                    avatarId={effectiveAvatarId}
                    size={42}
                    className={AVATAR_RARITY_META[activeAvatar.rarity].ringClass}
                  />
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-[#191C20] dark:text-white flex flex-wrap items-center gap-2">
                      <span>Коллекция аватарок</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono font-bold">
                        {unlockedAvatarsCount}/{allAvatars.length}
                      </span>
                    </h2>
                    <p className="text-xs text-[#74777F] dark:text-[#90939C]">
                      Своё фото загружать нельзя — новые аватарки открываются автоматически за баллы чтения
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
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
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        avatarFilter === key
                          ? 'bg-[#3F51B5] text-white shadow-sm'
                          : 'bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
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
                      className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 text-center transition-all ${
                        isSelected
                          ? 'border-[#3F51B5] ring-2 ring-[#3F51B5]/40 bg-indigo-50/50 dark:bg-indigo-950/25'
                          : rarityMeta.cardClass
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${rarityMeta.badgeClass}`}
                          >
                            {rarityMeta.label}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-[#74777F] dark:text-[#90939C]">
                            {av.requiredPoints === 0 ? 'Старт' : `${av.requiredPoints} б.`}
                          </span>
                        </div>

                        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
                          <StudentAvatar
                            avatarId={av.id}
                            size={76}
                            className={`${rarityMeta.ringClass} transition-transform ${
                              !isUnlocked ? 'opacity-75 grayscale-[25%]' : 'hover:scale-105'
                            }`}
                          />
                          {!isUnlocked && (
                            <span
                              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gray-900/90 text-white flex items-center justify-center shadow-md border border-white/20"
                              title={`Нужно ${av.requiredPoints} баллов`}
                            >
                              <Lock className="w-3 h-3" />
                            </span>
                          )}
                          {isSelected && (
                            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-[#1C1F26]">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="font-extrabold text-xs text-[#191C20] dark:text-white leading-tight">
                            {av.name}
                          </div>
                          <p className="text-[10.5px] text-[#74777F] dark:text-[#90939C] mt-1 leading-snug line-clamp-2">
                            {av.subtitle}
                          </p>
                        </div>
                      </div>

                      {isUnlocked ? (
                        <button
                          type="button"
                          onClick={() => setEquippedAvatarId(av.id)}
                          disabled={isSelected}
                          className={`w-full py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition-all ${
                            isSelected
                              ? 'bg-emerald-600 text-white cursor-default'
                              : av.rarity === 'premium'
                              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-105 text-amber-950 shadow-sm'
                              : av.rarity === 'legendary'
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:brightness-105 text-white shadow-sm'
                              : 'bg-[#3F51B5] hover:bg-[#303F9F] text-white'
                          }`}
                        >
                          {isSelected ? '✓ Установлена' : 'Выбрать'}
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-[#74777F]">
                            <span>Ещё {av.requiredPoints - pointsBreakdown.totalPoints} б.</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#E0E2EC] dark:bg-[#2E323D] overflow-hidden">
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

            {/* Бальная система и разблокировка наград (с учётом возраста) */}
            <section
              id="rewards"
              className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-6 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-[#191C20] dark:text-white flex flex-wrap items-center gap-2">
                      <span>Баллы и награды</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
                        {ageGroupMeta.label}
                      </span>
                    </h2>
                    <p className="text-xs text-[#74777F] dark:text-[#90939C]">
                      Читай внимательно, копи баллы и открывай стили профиля, темы читалки и школьные привилегии
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
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
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        rewardFilter === key
                          ? 'bg-[#3F51B5] text-white shadow-sm'
                          : 'bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Как начисляются баллы */}
              <div className="p-4 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-[#E0E2EC]/70 dark:border-[#2F323D] space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-white dark:bg-[#1C1F26] border border-[#E0E2EC]/60 dark:border-[#2F323D] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#191C20] dark:text-white">⏱ Активное чтение</div>
                      <div className="text-[11px] text-[#74777F]">+2 б. за каждую минуту</div>
                    </div>
                    <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                      +{pointsBreakdown.timePoints}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-[#1C1F26] border border-[#E0E2EC]/60 dark:border-[#2F323D] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#191C20] dark:text-white">📖 Честные страницы</div>
                      <div className="text-[11px] text-[#74777F]">+1 б. за прочитанную стр.</div>
                    </div>
                    <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                      +{pointsBreakdown.honestPagePoints}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-[#1C1F26] border border-[#E0E2EC]/60 dark:border-[#2F323D] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#191C20] dark:text-white">🏆 Прочитанные книги</div>
                      <div className="text-[11px] text-[#74777F]">
                        +{pointsBreakdown.completionBonusPerBook} б. за книгу ({pointsBreakdown.honestCompletedBooks})
                      </div>
                    </div>
                    <span className="font-mono font-extrabold text-amber-600 dark:text-amber-400">
                      +{pointsBreakdown.completionPoints}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-[11px] text-[#74777F] dark:text-[#90939C]">
                  <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                  <span>
                    Баллы засчитываются только за внимательное чтение — быстрое пролистывание страниц и перескок глав не приносят баллов.
                    {pointsBreakdown.fastPagesIgnored > 0 && (
                      <> (Не засчитано быстрых кликов: {pointsBreakdown.fastPagesIgnored})</>
                    )}
                  </span>
                </div>
              </div>

              {/* Сетка наград */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
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
                      className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all ${
                        isFrameActive || isThemeActive
                          ? 'border-[#3F51B5] bg-indigo-50/50 dark:bg-indigo-950/25 ring-1 ring-[#3F51B5]'
                          : isUnlocked
                          ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/25 dark:bg-emerald-950/10'
                          : 'border-[#E0E2EC]/70 dark:border-[#2F323D] bg-[#F8F9FE]/60 dark:bg-[#151820] opacity-85'
                      }`}
                    >
                      <div className="space-y-2">
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
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm border border-black/10 ${
                              !reward.frameStyle && !reward.themePreviewBg
                                ? 'bg-amber-100 dark:bg-amber-950/50'
                                : ''
                            }`}
                          >
                            {reward.icon}
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold inline-flex items-center gap-1 ${
                              isUnlocked
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                                : 'bg-gray-200/80 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {isUnlocked ? '✓ Открыто' : `🔒 ${reward.requiredPoints} б.`}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-extrabold text-xs sm:text-sm text-[#191C20] dark:text-white leading-snug">
                            {reward.title}
                          </h3>
                          <p className="text-[11px] text-[#74777F] dark:text-[#90939C] mt-1 leading-relaxed">
                            {reward.description}
                          </p>
                        </div>
                      </div>

                      {!isUnlocked ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-[#74777F]">
                            <span className="inline-flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Ещё {reward.requiredPoints - pointsBreakdown.totalPoints} б.
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#E0E2EC] dark:bg-[#2E323D] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#3F51B5]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ) : reward.category === 'frame' ? (
                        <button
                          type="button"
                          onClick={() => setEquippedFrameId(isFrameActive ? null : reward.id)}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                            isFrameActive
                              ? 'bg-[#3F51B5] text-white'
                              : 'bg-white dark:bg-[#22252D] border border-[#3F51B5]/40 text-[#3F51B5] dark:text-[#A5B4FC] hover:bg-indigo-50'
                          }`}
                        >
                          {isFrameActive ? '✓ Надет (снять)' : 'Надеть стиль'}
                        </button>
                      ) : reward.category === 'theme' && reward.themeValue ? (
                        <button
                          type="button"
                          onClick={() => setReaderTheme(reward.themeValue!)}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                            isThemeActive
                              ? 'bg-[#3F51B5] text-white'
                              : 'bg-white dark:bg-[#22252D] border border-[#3F51B5]/40 text-[#3F51B5] dark:text-[#A5B4FC] hover:bg-indigo-50'
                          }`}
                        >
                          <Palette className="w-3.5 h-3.5" />
                          <span>{isThemeActive ? '✓ Тема активна' : 'Включить тему'}</span>
                        </button>
                      ) : reward.perkType === 'certificate' ? (
                        <button
                          type="button"
                          onClick={() => setShowCertificateModal(true)}
                          className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-all"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Открыть сертификат</span>
                        </button>
                      ) : (
                        <div className="p-2 rounded-xl bg-amber-100/80 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 text-[11px] font-bold text-center">
                          ✓ Доступно — покажи библиотекарю!
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Сообщения от администратора */}
            <section
              id="messages"
              className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-6 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-[#3F51B5] dark:text-[#A5B4FC] flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-[#191C20] dark:text-white flex items-center gap-2">
                      <span>Сообщения от администратора</span>
                      {unreadCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold">
                          {unreadCount} нов.
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-[#74777F] dark:text-[#90939C]">
                      Замечания, рекомендации и уведомления от библиотекаря
                    </p>
                  </div>
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-[#3F51B5] dark:text-[#A5B4FC] hover:bg-indigo-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Отметить все прочитанными</span>
                  </button>
                )}
              </div>

              {isLoadingData ? (
                <div className="py-8 text-center text-xs text-gray-400">Загрузка сообщений...</div>
              ) : messages.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-dashed border-[#E0E2EC] dark:border-[#2F323D] text-center text-xs text-[#74777F] dark:text-[#90939C]">
                  Сообщений от администратора пока нет. Приятного чтения!
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-2xl border transition-all space-y-2 ${
                        !msg.is_read
                          ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/70 shadow-sm'
                          : 'bg-[#F8F9FE]/70 dark:bg-[#16181F] border-[#E0E2EC]/70 dark:border-[#2F323D]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold text-[#191C20] dark:text-white">
                            {msg.sender_name || 'Администратор библиотеки'}
                          </span>
                          {!msg.is_read && (
                            <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                              Новое
                            </span>
                          )}
                          {msg.book_title && (
                            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold">
                              📖 {msg.book_title}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-[#74777F] dark:text-[#90939C]">
                          {formatMessageDate(msg.created_at)}
                        </span>
                      </div>

                      <p className="text-sm text-[#191C20] dark:text-[#E2E2E9] whitespace-pre-line leading-relaxed">
                        {msg.message}
                      </p>

                      {!msg.is_read && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleMarkAsRead(msg.id)}
                            className="px-3 py-1.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Понятно, прочитано</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Прогресс чтения по книгам */}
            <section className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-6 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-[#191C20] dark:text-white">
                    Мои книги и прогресс чтения
                  </h2>
                  <p className="text-xs text-[#74777F] dark:text-[#90939C]">
                    Нажмите «Продолжить», чтобы вернуться ровно на ту страницу, где остановились
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#EEF0FA] dark:bg-[#22252D] text-xs font-mono font-bold text-[#3F51B5] dark:text-[#A5B4FC]">
                  {readingEntries.length}
                </span>
              </div>

              {readingEntries.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] text-center space-y-3">
                  <p className="text-sm font-semibold text-[#44474F] dark:text-[#C4C7D0]">
                    Вы ещё не начали читать ни одной книги
                  </p>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3F51B5] text-white text-xs font-bold hover:bg-[#303F9F]"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Выбрать книгу в каталоге</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {readingEntries.map(({ bookId, progress, book }) => {
                    const percent = Math.min(100, Math.max(0, progress.percent || 0));
                    const isDone = percent >= 95;
                    return (
                      <div
                        key={bookId}
                        className="p-4 rounded-2xl border border-[#E0E2EC]/70 dark:border-[#2F323D] bg-[#F8F9FE]/60 dark:bg-[#16181F] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div
                            style={{
                              background:
                                book?.coverGradient ||
                                'linear-gradient(135deg, #1E1B4B 0%, #4338CA 50%, #6366F1 100%)',
                            }}
                            className="w-12 h-16 rounded-r-md rounded-l-sm shrink-0 shadow-md flex items-center justify-center text-white text-[9px] font-serif font-bold text-center p-1 leading-tight"
                          >
                            {(book?.title || 'Книга').slice(0, 14)}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-sm text-[#191C20] dark:text-white truncate">
                                {book?.title || bookId}
                              </h3>
                              {isDone && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                  <CheckCircle2 className="w-3 h-3" /> Прочитано
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#74777F] dark:text-[#90939C]">
                              {book?.author && <span>{book.author}</span>}
                              <span>
                                Глава {progress.chapterIndex + 1}, стр. {progress.pageIndex + 1}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                                <Clock className="w-3.5 h-3.5" />
                                {formatReadingDuration(progress.readingSeconds || 0)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5 max-w-md">
                              <div className="flex-1 h-2 rounded-full bg-[#E0E2EC] dark:bg-[#2E323D] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#3F51B5] to-emerald-500 transition-all"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono font-bold text-[#3F51B5] dark:text-[#A5B4FC] shrink-0">
                                {percent}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {book && (
                          <button
                            type="button"
                            onClick={() => openReader(book.id)}
                            className="px-4 py-2.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm shrink-0 transition-all active:scale-95"
                          >
                            <BookOpen className="w-4 h-4" />
                            <span>Продолжить</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Моя полка (Закладки) */}
            {shelfBooks.length > 0 && (
              <section className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-6 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base sm:text-lg font-extrabold text-[#191C20] dark:text-white flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-[#3F51B5] fill-[#3F51B5]" />
                    <span>Моя полка ({shelfBooks.length})</span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {shelfBooks.map((book) => (
                    <div
                      key={book.id}
                      className="p-3.5 rounded-2xl border border-[#E0E2EC]/70 dark:border-[#2F323D] bg-[#F8F9FE]/60 dark:bg-[#16181F] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-[#191C20] dark:text-white truncate">
                          {book.title}
                        </div>
                        <div className="text-[11px] text-[#74777F] dark:text-[#90939C] truncate">
                          {book.author}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openReader(book.id)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-[#3F51B5] dark:text-[#A5B4FC] hover:bg-indigo-100 text-xs font-bold shrink-0"
                      >
                        Читать
                      </button>
                    </div>
                  ))}
                </div>
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
                <div className="text-4xl">{ageGroup === 'junior' ? '🏅' : ageGroup === 'middle' ? '📜' : '🎓'}</div>
                <h3 className="text-2xl font-serif font-extrabold text-[#12372A]">
                  {ageGroup === 'junior'
                    ? 'Грамота лучшего читателя'
                    : 'Именной сертификат читателя NGS'}
                </h3>
                <p className="text-xs text-gray-600">Награждается ученик(ца) {student.gradeClass} класса</p>
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
