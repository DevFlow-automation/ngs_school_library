'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useReadingStore } from '@/store/useReadingStore';
import { StudentAvatar } from '@/components/StudentAvatar';
import {
  calculateStudentPoints,
  getAgeGroup,
  getStudentRank,
} from '@/lib/gamification';
import { AVATAR_RARITY_META, getAvatarsForAgeGroup } from '@/lib/avatars';
import { formatReadingDuration } from '@/lib/readingMetrics';
import { Trophy, Sparkles, Clock, BookOpen, Loader2 } from 'lucide-react';

interface RawStudentRow {
  id: string;
  full_name: string;
  grade_class: string;
  reading_progress?: {
    progress_percent?: number | null;
    reading_seconds?: number | null;
    pages_turned?: number | null;
    fast_turns_count?: number | null;
    avg_seconds_per_page?: number | null;
    min_seconds_per_page?: number | null;
  }[];
}

interface RankedStudent {
  id: string;
  fullName: string;
  gradeClass: string;
  totalPoints: number;
  totalReadingSeconds: number;
  honestCompletedBooks: number;
  rankTitle: string;
  rankIcon: string;
  avatarId: string;
  avatarRarity: keyof typeof AVATAR_RARITY_META;
}

const PODIUM_STYLES = [
  {
    medal: '🥇',
    placeLabel: '1 место',
    praise: 'Главный книголюб школы • Гордость NGS!',
    cardClass:
      'bg-gradient-to-br from-amber-50 via-yellow-50/80 to-white dark:from-amber-950/35 dark:via-yellow-950/20 dark:to-[#1C1F26] border-amber-300/90 dark:border-amber-600/60 shadow-md shadow-amber-500/10',
    badgeClass: 'bg-gradient-to-r from-amber-400 to-yellow-400 text-amber-950',
    pointsClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  {
    medal: '🥈',
    placeLabel: '2 место',
    praise: 'Блестящий читатель • Так держать!',
    cardClass:
      'bg-gradient-to-br from-indigo-50/70 via-slate-50 to-white dark:from-indigo-950/30 dark:via-slate-900/30 dark:to-[#1C1F26] border-indigo-200/90 dark:border-indigo-800/60 shadow-sm',
    badgeClass: 'bg-gradient-to-r from-slate-200 to-indigo-200 text-slate-900',
    pointsClass: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300',
  },
  {
    medal: '🥉',
    placeLabel: '3 место',
    praise: 'Звезда чтения • Отличный пример!',
    cardClass:
      'bg-gradient-to-br from-orange-50/70 via-amber-50/40 to-white dark:from-orange-950/25 dark:via-amber-950/15 dark:to-[#1C1F26] border-orange-200/90 dark:border-orange-800/50 shadow-sm',
    badgeClass: 'bg-gradient-to-r from-orange-300 to-amber-300 text-orange-950',
    pointsClass: 'bg-orange-500/15 text-orange-800 dark:text-orange-300',
  },
];

export const TopReadersLeaderboard: React.FC = () => {
  const { student: currentStudent } = useReadingStore();
  const [ranked, setRanked] = useState<RankedStudent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard() {
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, full_name, grade_class, reading_progress(*)');

        if (cancelled) return;
        if (error || !data) {
          setIsLoaded(true);
          return;
        }

        const computed: RankedStudent[] = (data as RawStudentRow[]).map((st) => {
          const ageGroup = getAgeGroup(st.grade_class);
          const metrics = (st.reading_progress || []).map((r) => ({
            progressPercent: Number(r.progress_percent || 0),
            readingSeconds: Number(r.reading_seconds || 0),
            pagesTurned: Number(r.pages_turned || 0),
            fastTurnsCount: Number(r.fast_turns_count || 0),
            avgSecondsPerPage: Number(r.avg_seconds_per_page || 0),
            minSecondsPerPage:
              r.min_seconds_per_page !== null && r.min_seconds_per_page !== undefined
                ? Number(r.min_seconds_per_page)
                : null,
          }));

          const pts = calculateStudentPoints(metrics, st.grade_class);
          const rank = getStudentRank(pts.totalPoints, ageGroup);
          const avatars = getAvatarsForAgeGroup(ageGroup);
          const unlocked = avatars.filter((av) => pts.totalPoints >= av.requiredPoints);
          const bestAvatar = unlocked[unlocked.length - 1] || avatars[0];

          return {
            id: st.id,
            fullName: st.full_name,
            gradeClass: st.grade_class,
            totalPoints: pts.totalPoints,
            totalReadingSeconds: pts.totalReadingSeconds,
            honestCompletedBooks: pts.honestCompletedBooks,
            rankTitle: rank.current.title,
            rankIcon: rank.current.icon,
            avatarId: bestAvatar.id,
            avatarRarity: bestAvatar.rarity,
          };
        });

        computed.sort(
          (a, b) =>
            b.totalPoints - a.totalPoints ||
            b.totalReadingSeconds - a.totalReadingSeconds ||
            b.honestCompletedBooks - a.honestCompletedBooks ||
            a.fullName.localeCompare(b.fullName, 'ru')
        );

        setRanked(computed);
      } catch (err) {
        console.error('Ошибка загрузки рейтинга учеников:', err);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }

    fetchLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [currentStudent?.id]);

  const topThree = useMemo(
    () => ranked.filter((r) => r.totalPoints > 0).slice(0, 3),
    [ranked]
  );

  const currentStudentPlace = useMemo(() => {
    if (!currentStudent) return null;
    const idx = ranked.findIndex((r) => r.id === currentStudent.id);
    if (idx < 0) return null;
    const entry = ranked[idx];
    const thirdPoints = topThree[2]?.totalPoints ?? 1;
    return {
      place: idx + 1,
      entry,
      pointsToTop3: Math.max(1, thirdPoints - entry.totalPoints + 1),
      isInTop3: idx < 3 && entry.totalPoints > 0,
    };
  }, [currentStudent, ranked, topThree]);

  if (!isLoaded) {
    return (
      <section className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-5 sm:p-6 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-[#191C20] dark:text-white tracking-tight">
                Рейтинг читателей — Топ-3 школы
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-[#3F51B5] dark:text-[#A5B4FC] text-[11px] font-bold">
                <Loader2 className="w-3 h-3 animate-spin" />
                Загружаем…
              </span>
            </div>
            <p className="text-xs text-[#74777F] dark:text-[#90939C] mt-0.5">
              Подождите секунду — подсчитываем баллы лучших читателей школы
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 animate-pulse">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl border border-[#E0E2EC]/70 dark:border-[#2F323D] bg-[#F8F9FE] dark:bg-[#16181F] space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-20 rounded-full bg-[#E0E2EC] dark:bg-[#2A2E39]" />
                <div className="h-5 w-12 rounded-full bg-[#E0E2EC] dark:bg-[#2A2E39]" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#E0E2EC] dark:bg-[#2A2E39] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded-lg bg-[#E0E2EC] dark:bg-[#2A2E39]" />
                  <div className="h-3 w-1/2 rounded-lg bg-[#E0E2EC] dark:bg-[#2A2E39]" />
                </div>
              </div>
              <div className="h-3 w-2/3 rounded-lg bg-[#E0E2EC] dark:bg-[#2A2E39]" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-5 sm:p-6 border border-[#E0E2EC]/70 dark:border-[#2F323D] shadow-sm space-y-4">
      {/* Заголовок рейтинга с тёплой подписью */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-[#191C20] dark:text-white tracking-tight">
                Рейтинг читателей — Топ-3 школы
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3 h-3" /> Доска почёта
              </span>
            </div>
            <p className="text-xs text-[#74777F] dark:text-[#90939C] mt-0.5">
              Ребята, вы вдохновляете всю школу! Гордимся вашим внимательным чтением и любовью к книгам ✨
            </p>
          </div>
        </div>

        {currentStudent && (
          <Link
            href="/profile"
            className="self-start sm:self-center px-3 py-1.5 rounded-full bg-[#EEF0FA] dark:bg-[#22252D] hover:bg-[#E0E2EC] text-[#3F51B5] dark:text-[#A5B4FC] text-xs font-bold shrink-0 transition-colors"
          >
            Мои баллы →
          </Link>
        )}
      </div>

      {topThree.length === 0 ? (
        <div className="p-5 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-dashed border-[#E0E2EC] dark:border-[#2F323D] text-center space-y-1">
          <p className="text-xs sm:text-sm font-bold text-[#191C20] dark:text-white">
            Пьедестал ждёт своих первых героев! 🏆
          </p>
          <p className="text-xs text-[#74777F] dark:text-[#90939C]">
            Войди в аккаунт, открой любую книгу и читай с удовольствием — твоё имя появится здесь в Топ-3 школы.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {topThree.map((winner, index) => {
            const style = PODIUM_STYLES[index] || PODIUM_STYLES[2];
            const isMe = currentStudent?.id === winner.id;

            return (
              <div
                key={winner.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 relative overflow-hidden ${style.cardClass}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1 ${style.badgeClass}`}
                    >
                      <span>{style.medal}</span>
                      <span>{style.placeLabel}</span>
                    </span>

                    {isMe ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold">
                        ✨ Это ты! Молодец!
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[#44474F] dark:text-[#C4C7D0] text-[10.5px] font-bold">
                        {winner.gradeClass} кл
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <StudentAvatar
                      avatarId={winner.avatarId}
                      size={50}
                      className={AVATAR_RARITY_META[winner.avatarRarity].ringClass}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-sm text-[#191C20] dark:text-white truncate">
                        {winner.fullName}
                      </div>
                      <div className="text-[11px] text-[#74777F] dark:text-[#90939C] truncate">
                        {winner.rankIcon} {winner.rankTitle}
                        {isMe && ` • ${winner.gradeClass} кл`}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-extrabold ${style.pointsClass}`}
                        >
                          ⭐ {winner.totalPoints} б.
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[10.5px] font-mono text-[#74777F] dark:text-[#90939C]">
                          <Clock className="w-3 h-3" />
                          {formatReadingDuration(winner.totalReadingSeconds)}
                        </span>
                        {winner.honestCompletedBooks > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10.5px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                            <BookOpen className="w-3 h-3" />
                            {winner.honestCompletedBooks}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-black/5 dark:border-white/10 text-[11px] font-semibold text-[#44474F] dark:text-[#C4C7D0]">
                  💛 {style.praise}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {currentStudentPlace && !currentStudentPlace.isInTop3 && topThree.length > 0 && (
        <div className="px-3.5 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#151820] border border-[#E0E2EC]/70 dark:border-[#2F323D] flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[#44474F] dark:text-[#C4C7D0]">
            Твоё место в рейтинге: <b>#{currentStudentPlace.place}</b> (⭐{' '}
            <b>{currentStudentPlace.entry.totalPoints} б.</b>)
            {topThree.length >= 3 && (
              <>
                {' — '}до Топ-3 осталось всего <b>{currentStudentPlace.pointsToTop3} б.</b>! У тебя всё получится 🚀
              </>
            )}
          </span>
          <Link
            href="/profile"
            className="font-bold text-[#3F51B5] dark:text-[#A5B4FC] hover:underline"
          >
            Открыть профиль →
          </Link>
        </div>
      )}
    </section>
  );
};
