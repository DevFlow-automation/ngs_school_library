import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { GradeFilter, CategoryFilter, SortOption, ReaderTheme, ReaderFont } from '@/types/book';
import { evaluateBookCompletion } from '@/lib/readingMetrics';

export interface StudentProfile {
  id: string;
  fullName: string;
  gradeClass: string;
}

export interface BookPositionBaseline {
  chapterIndex: number;
  pageIndex: number;
}

export interface BookProgress {
  chapterIndex: number;
  pageIndex: number;
  percent: number;
  readingSeconds?: number;
  pagesTurned?: number;
  fastTurnsCount?: number;
  avgSecondsPerPage?: number;
  minSecondsPerPage?: number | null;
  totalTurnSeconds?: number;
  completionRejectedReason?: string | null;
  /** Ключи страниц ("глава:страница"), за которые уже начислены честные баллы */
  creditedPages?: string[];
  /** Базовая позиция, синхронизированная с БД (защита от повторного фарма при смене устройства/инкогнито) */
  syncedBaseline?: BookPositionBaseline | null;
}

export interface ReadingMetricDelta {
  deltaSeconds?: number;
  pageTurnElapsedSec?: number;
  isFastTurn?: boolean;
  /** Ключ страницы ("глава:страница") для защиты от повторного зачёта туда-сюда */
  creditedPageKey?: string;
  skipSync?: boolean;
}

const MAX_TURN_DURATION_FOR_AVG_SEC = 180;
let metricsColumnsUnsupported = false;

async function upsertProgressToSupabase(payload: {
  student_id: string;
  book_id: string;
  is_bookmarked: boolean;
  current_chapter: number;
  current_page: number;
  progress_percent: number;
  reading_seconds: number;
  pages_turned: number;
  fast_turns_count: number;
  avg_seconds_per_page: number;
  min_seconds_per_page: number | null;
  last_read_at: string;
}) {
  const basePayload = {
    student_id: payload.student_id,
    book_id: payload.book_id,
    is_bookmarked: payload.is_bookmarked,
    current_chapter: payload.current_chapter,
    current_page: payload.current_page,
    progress_percent: payload.progress_percent,
    last_read_at: payload.last_read_at,
  };

  if (metricsColumnsUnsupported) {
    const { error } = await supabase
      .from('reading_progress')
      .upsert(basePayload, { onConflict: 'student_id,book_id' });
    if (error) console.error('Ошибка сохранения прогресса:', error);
    return;
  }

  const { error } = await supabase
    .from('reading_progress')
    .upsert(payload, { onConflict: 'student_id,book_id' });

  if (error) {
    const msg = String(error.message || '');
    const isMissingColumn =
      error.code === 'PGRST204' ||
      error.code === '42703' ||
      msg.includes('column') ||
      msg.includes('schema cache');

    if (isMissingColumn) {
      metricsColumnsUnsupported = true;
      const { error: fallbackError } = await supabase
        .from('reading_progress')
        .upsert(basePayload, { onConflict: 'student_id,book_id' });
      if (fallbackError) console.error('Ошибка сохранения прогресса:', fallbackError);
    } else {
      console.error('Ошибка сохранения прогресса:', error);
    }
  }
}

const LATIN_TO_CYRILLIC: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х',
};

function normalizeClass(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^0-9А-ЯЁA-Z]/g, '')
    .replace(/[ABCEHKMOPTX]/g, (ch) => LATIN_TO_CYRILLIC[ch] || ch);

  const match = cleaned.match(/^(\d{1,2})([А-ЯЁ]?)$/);
  if (!match) return raw.trim();
  return match[2] ? `${match[1]} «${match[2]}»` : match[1];
}

function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ''))
    .join(' ');
}

interface ReadingState {
  student: StudentProfile | null;
  isLoginModalOpen: boolean;
  unreadMessagesCount: number;

  activeTab: 'all' | 'curriculum' | 'my-shelf';
  gradeFilter: GradeFilter;
  categoryFilter: CategoryFilter;
  searchQuery: string;
  sortBy: SortOption;
  myShelfIds: string[];
  readingProgress: Record<string, BookProgress>;

  activeBookId: string | null;
  activeChapterIndex: number;
  readerFontSize: number;
  readerFontFamily: ReaderFont;
  readerTheme: ReaderTheme;
  equippedFrameId: string | null;
  equippedAvatarId: string;

  setLoginModalOpen: (open: boolean) => void;
  loginStudent: (fullName: string, gradeClass: string) => Promise<void>;
  logoutStudent: () => void;
  syncFromSupabase: () => Promise<void>;
  fetchUnreadMessagesCount: () => Promise<void>;
  setUnreadMessagesCount: (count: number) => void;

  setActiveTab: (tab: 'all' | 'curriculum' | 'my-shelf') => void;
  setGradeFilter: (grade: GradeFilter) => void;
  setCategoryFilter: (category: CategoryFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  toggleShelf: (bookId: string) => void;
  openReader: (bookId: string, chapterIndex?: number) => void;
  closeReader: () => void;
  setChapterIndex: (index: number) => void;
  saveProgress: (bookId: string, chapterIndex: number, pageIndex: number, totalChapters: number, totalPages: number) => void;
  recordReadingMetrics: (bookId: string, delta: ReadingMetricDelta) => void;
  setReaderFontSize: (size: number) => void;
  setReaderFontFamily: (font: ReaderFont) => void;
  setReaderTheme: (theme: ReaderTheme) => void;
  setEquippedFrameId: (frameId: string | null) => void;
  setEquippedAvatarId: (avatarId: string) => void;
}

export const useReadingStore = create<ReadingState>()(
  persist(
    (set, get) => ({
      student: null,
      isLoginModalOpen: false,
      unreadMessagesCount: 0,

      activeTab: 'all',
      gradeFilter: 'all',
      categoryFilter: 'all',
      searchQuery: '',
      sortBy: 'popular',
      myShelfIds: [],
      readingProgress: {},

      activeBookId: null,
      activeChapterIndex: 0,
      readerFontSize: 19,
      readerFontFamily: 'serif',
      readerTheme: 'paper',
      equippedFrameId: null,
      equippedAvatarId: 'default_reader',

      setLoginModalOpen: (open) => set({ isLoginModalOpen: open }),

      loginStudent: async (fullName, gradeClass) => {
        const cleanName = normalizeName(fullName);
        const cleanClass = normalizeClass(gradeClass);
        if (!cleanName || !cleanClass) return;

        let { data: existing } = await supabase
          .from('students')
          .select('*')
          .eq('full_name', cleanName)
          .eq('grade_class', cleanClass)
          .maybeSingle();

        if (!existing) {
          const { data: created, error } = await supabase
            .from('students')
            .insert([{ full_name: cleanName, grade_class: cleanClass }])
            .select()
            .single();
          if (error) throw error;
          existing = created;
        }

        const prevStudentId = get().student?.id;
        set({
          student: {
            id: existing.id,
            fullName: existing.full_name,
            gradeClass: existing.grade_class,
          },
          isLoginModalOpen: false,
          ...(prevStudentId && prevStudentId !== existing.id
            ? { readingProgress: {}, myShelfIds: [] }
            : {}),
        });

        await get().syncFromSupabase();
        await get().fetchUnreadMessagesCount();
      },

      logoutStudent: () =>
        set({
          student: null,
          myShelfIds: [],
          readingProgress: {},
          unreadMessagesCount: 0,
          equippedFrameId: null,
          equippedAvatarId: 'default_reader',
          readerTheme: 'paper',
        }),

      setUnreadMessagesCount: (count) => set({ unreadMessagesCount: Math.max(0, count) }),

      fetchUnreadMessagesCount: async () => {
        const student = get().student;
        if (!student) {
          set({ unreadMessagesCount: 0 });
          return;
        }
        try {
          const { count, error } = await supabase
            .from('student_messages')
            .select('id', { count: 'exact', head: true })
            .eq('student_id', student.id)
            .eq('is_read', false);

          if (!error && typeof count === 'number') {
            set({ unreadMessagesCount: count });
          }
        } catch {
          // Таблица student_messages ещё может быть не создана
        }
      },

      syncFromSupabase: async () => {
        const student = get().student;
        if (!student) return;

        const { data } = await supabase
          .from('reading_progress')
          .select('*')
          .eq('student_id', student.id);

        if (data) {
          const prevProgress = get().readingProgress;
          const shelf: string[] = [];
          const progressMap: Record<string, BookProgress> = {};
          data.forEach((row) => {
            if (row.is_bookmarked) shelf.push(row.book_id);
            const readingSeconds = Number(row.reading_seconds || 0);
            const pagesTurned = Number(row.pages_turned || 0);
            const fastTurnsCount = Number(row.fast_turns_count || 0);
            const avgSecondsPerPage = Number(row.avg_seconds_per_page || 0);
            const minSecondsPerPage =
              row.min_seconds_per_page !== null && row.min_seconds_per_page !== undefined
                ? Number(row.min_seconds_per_page)
                : null;
            const prevLocal = prevProgress[row.book_id];
            const creditedPages = prevLocal?.creditedPages;
            const rowChapter = row.current_chapter || 0;
            const rowPage = row.current_page || 0;

            let syncedBaseline = prevLocal?.syncedBaseline ?? null;
            if (
              !syncedBaseline &&
              (!creditedPages || creditedPages.length === 0) &&
              pagesTurned >= 3 &&
              avgSecondsPerPage >= 10 &&
              (rowChapter > 0 || rowPage > 0)
            ) {
              syncedBaseline = { chapterIndex: rowChapter, pageIndex: rowPage };
            }

            if (
              row.progress_percent > 0 ||
              rowChapter > 0 ||
              rowPage > 0 ||
              readingSeconds > 0 ||
              pagesTurned > 0
            ) {
              progressMap[row.book_id] = {
                chapterIndex: rowChapter,
                pageIndex: rowPage,
                percent: row.progress_percent || 0,
                readingSeconds,
                pagesTurned,
                fastTurnsCount,
                avgSecondsPerPage,
                minSecondsPerPage,
                totalTurnSeconds: avgSecondsPerPage * pagesTurned,
                creditedPages,
                syncedBaseline,
              };
            }
          });
          set({ myShelfIds: shelf, readingProgress: progressMap });
        }
      },

      setActiveTab: (tab) => set({ activeTab: tab }),
      setGradeFilter: (grade) => set({ gradeFilter: grade }),
      setCategoryFilter: (category) => set({ categoryFilter: category }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSortBy: (sort) => set({ sortBy: sort }),

      toggleShelf: (bookId) => {
        const { student, myShelfIds, readingProgress } = get();
        if (!student) {
          set({ isLoginModalOpen: true });
          return;
        }

        const exists = myShelfIds.includes(bookId);
        const nextShelf = exists ? myShelfIds.filter((id) => id !== bookId) : [...myShelfIds, bookId];
        set({ myShelfIds: nextShelf });

        const curr = readingProgress[bookId] || { chapterIndex: 0, pageIndex: 0, percent: 0 };
        void upsertProgressToSupabase({
          student_id: student.id,
          book_id: bookId,
          is_bookmarked: !exists,
          current_chapter: curr.chapterIndex,
          current_page: curr.pageIndex,
          progress_percent: curr.percent,
          reading_seconds: Math.round(curr.readingSeconds || 0),
          pages_turned: curr.pagesTurned || 0,
          fast_turns_count: curr.fastTurnsCount || 0,
          avg_seconds_per_page: Number((curr.avgSecondsPerPage || 0).toFixed(1)),
          min_seconds_per_page: curr.minSecondsPerPage ?? null,
          last_read_at: new Date().toISOString(),
        });
      },

      openReader: (bookId, chapterIndex = 0) =>
        set((state) => ({
          activeBookId: bookId,
          activeChapterIndex: state.readingProgress[bookId]?.chapterIndex ?? chapterIndex,
        })),

      closeReader: () => set({ activeBookId: null }),
      setChapterIndex: (index) => set({ activeChapterIndex: index }),

      saveProgress: (bookId, chapterIndex, pageIndex, totalChapters, totalPages) => {
        const { student, myShelfIds, readingProgress } = get();
        const chWeight = 1 / Math.max(totalChapters, 1);
        const pageProgress = (pageIndex + 1) / Math.max(totalPages, 1);
        const rawPercent = Math.min(100, Math.max(1, Math.round((chapterIndex * chWeight + pageProgress * chWeight) * 100)));
        const prev = readingProgress[bookId];

        const readingSeconds = prev?.readingSeconds || 0;
        const pagesTurned = prev?.pagesTurned || 0;
        const fastTurnsCount = prev?.fastTurnsCount || 0;
        const avgSecondsPerPage = prev?.avgSecondsPerPage || 0;
        const minSecondsPerPage = prev?.minSecondsPerPage ?? null;

        let percent = rawPercent;
        let completionRejectedReason: string | null = null;

        if (rawPercent >= 95) {
          const check = evaluateBookCompletion({
            progressPercent: rawPercent,
            readingSeconds,
            pagesTurned,
            fastTurnsCount,
            avgSecondsPerPage,
            minSecondsPerPage,
          });
          if (!check.counted) {
            percent = 94;
            completionRejectedReason = check.reason;
          }
        }

        const nextEntry: BookProgress = {
          chapterIndex,
          pageIndex,
          percent,
          readingSeconds,
          pagesTurned,
          fastTurnsCount,
          avgSecondsPerPage,
          minSecondsPerPage,
          totalTurnSeconds: prev?.totalTurnSeconds || 0,
          completionRejectedReason,
          creditedPages: prev?.creditedPages,
          syncedBaseline: prev?.syncedBaseline ?? null,
        };

        set({
          readingProgress: {
            ...readingProgress,
            [bookId]: nextEntry,
          },
        });

        if (student) {
          void upsertProgressToSupabase({
            student_id: student.id,
            book_id: bookId,
            is_bookmarked: myShelfIds.includes(bookId),
            current_chapter: chapterIndex,
            current_page: pageIndex,
            progress_percent: percent,
            reading_seconds: Math.round(nextEntry.readingSeconds || 0),
            pages_turned: nextEntry.pagesTurned || 0,
            fast_turns_count: nextEntry.fastTurnsCount || 0,
            avg_seconds_per_page: Number((nextEntry.avgSecondsPerPage || 0).toFixed(1)),
            min_seconds_per_page: nextEntry.minSecondsPerPage ?? null,
            last_read_at: new Date().toISOString(),
          });
        }
      },

      recordReadingMetrics: (bookId, delta) => {
        const { student, myShelfIds, readingProgress } = get();
        const prev = readingProgress[bookId] || {
          chapterIndex: 0,
          pageIndex: 0,
          percent: 1,
          readingSeconds: 0,
          pagesTurned: 0,
          fastTurnsCount: 0,
          avgSecondsPerPage: 0,
          minSecondsPerPage: null,
          totalTurnSeconds: 0,
        };

        const addSeconds = Math.max(0, Math.round(delta.deltaSeconds || 0));
        const nextReadingSeconds = (prev.readingSeconds || 0) + addSeconds;

        let nextPagesTurned = prev.pagesTurned || 0;
        let nextFastTurns = prev.fastTurnsCount || 0;
        let nextTotalTurnSeconds = prev.totalTurnSeconds ?? (prev.avgSecondsPerPage || 0) * nextPagesTurned;
        let nextAvg = prev.avgSecondsPerPage || 0;
        let nextMin = prev.minSecondsPerPage ?? null;
        let nextCreditedPages = prev.creditedPages;
        let recordedTurn = false;

        if (typeof delta.pageTurnElapsedSec === 'number' && Number.isFinite(delta.pageTurnElapsedSec)) {
          const isDuplicateCreditedPage =
            Boolean(delta.creditedPageKey) &&
            Array.isArray(prev.creditedPages) &&
            prev.creditedPages.includes(delta.creditedPageKey!);

          if (!isDuplicateCreditedPage) {
            const rawTurnSec = Math.max(0.1, Math.round(delta.pageTurnElapsedSec * 10) / 10);
            const cappedForAvg = Math.min(rawTurnSec, MAX_TURN_DURATION_FOR_AVG_SEC);
            nextPagesTurned += 1;
            if (delta.isFastTurn) {
              nextFastTurns += 1;
            } else if (delta.creditedPageKey) {
              nextCreditedPages = [...(prev.creditedPages || []), delta.creditedPageKey];
            }
            nextTotalTurnSeconds += cappedForAvg;
            nextAvg = Math.round((nextTotalTurnSeconds / nextPagesTurned) * 10) / 10;
            nextMin = nextMin === null ? rawTurnSec : Math.min(nextMin, rawTurnSec);
            recordedTurn = true;
          }
        }

        if (addSeconds === 0 && !recordedTurn) {
          return;
        }

        const nextEntry: BookProgress = {
          ...prev,
          readingSeconds: nextReadingSeconds,
          pagesTurned: nextPagesTurned,
          fastTurnsCount: nextFastTurns,
          avgSecondsPerPage: nextAvg,
          minSecondsPerPage: nextMin,
          totalTurnSeconds: nextTotalTurnSeconds,
          creditedPages: nextCreditedPages,
        };

        set({
          readingProgress: {
            ...readingProgress,
            [bookId]: nextEntry,
          },
        });

        if (student && !delta.skipSync) {
          void upsertProgressToSupabase({
            student_id: student.id,
            book_id: bookId,
            is_bookmarked: myShelfIds.includes(bookId),
            current_chapter: nextEntry.chapterIndex,
            current_page: nextEntry.pageIndex,
            progress_percent: nextEntry.percent,
            reading_seconds: Math.round(nextEntry.readingSeconds || 0),
            pages_turned: nextEntry.pagesTurned || 0,
            fast_turns_count: nextEntry.fastTurnsCount || 0,
            avg_seconds_per_page: Number((nextEntry.avgSecondsPerPage || 0).toFixed(1)),
            min_seconds_per_page: nextEntry.minSecondsPerPage ?? null,
            last_read_at: new Date().toISOString(),
          });
        }
      },

      setReaderFontSize: (size) => set({ readerFontSize: size }),
      setReaderFontFamily: (font) => set({ readerFontFamily: font }),
      setReaderTheme: (theme) => set({ readerTheme: theme }),
      setEquippedFrameId: (frameId) => set({ equippedFrameId: frameId }),
      setEquippedAvatarId: (avatarId) => set({ equippedAvatarId: avatarId }),
    }),
    {
      name: 'ngs-library-storage',
      partialize: (state) => ({
        student: state.student,
        myShelfIds: state.myShelfIds,
        readingProgress: state.readingProgress,
        readerFontSize: state.readerFontSize,
        readerFontFamily: state.readerFontFamily,
        readerTheme: state.readerTheme,
        equippedFrameId: state.equippedFrameId,
        equippedAvatarId: state.equippedAvatarId,
      }),
    }
  )
);
