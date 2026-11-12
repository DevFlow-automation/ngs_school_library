import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { GradeFilter, CategoryFilter, SortOption, ReaderTheme, ReaderFont } from '@/types/book';

export interface StudentProfile {
  id: string;
  fullName: string;
  gradeClass: string;
}

export interface BookProgress {
  chapterIndex: number;
  pageIndex: number;
  percent: number;
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

  setLoginModalOpen: (open: boolean) => void;
  loginStudent: (fullName: string, gradeClass: string) => Promise<void>;
  logoutStudent: () => void;
  syncFromSupabase: () => Promise<void>;

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
  setReaderFontSize: (size: number) => void;
  setReaderFontFamily: (font: ReaderFont) => void;
  setReaderTheme: (theme: ReaderTheme) => void;
}

export const useReadingStore = create<ReadingState>()(
  persist(
    (set, get) => ({
      student: null,
      isLoginModalOpen: false,

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

        set({
          student: {
            id: existing.id,
            fullName: existing.full_name,
            gradeClass: existing.grade_class,
          },
          isLoginModalOpen: false,
        });

        await get().syncFromSupabase();
      },

      logoutStudent: () => set({ student: null, myShelfIds: [], readingProgress: {} }),

      syncFromSupabase: async () => {
        const student = get().student;
        if (!student) return;

        const { data } = await supabase
          .from('reading_progress')
          .select('*')
          .eq('student_id', student.id);

        if (data) {
          const shelf: string[] = [];
          const progressMap: Record<string, BookProgress> = {};
          data.forEach((row) => {
            if (row.is_bookmarked) shelf.push(row.book_id);
            if (row.progress_percent > 0 || row.current_chapter > 0 || row.current_page > 0) {
              progressMap[row.book_id] = {
                chapterIndex: row.current_chapter || 0,
                pageIndex: row.current_page || 0,
                percent: row.progress_percent || 0,
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
        supabase
          .from('reading_progress')
          .upsert(
            {
              student_id: student.id,
              book_id: bookId,
              is_bookmarked: !exists,
              current_chapter: curr.chapterIndex,
              current_page: curr.pageIndex,
              progress_percent: curr.percent,
              last_read_at: new Date().toISOString(),
            },
            { onConflict: 'student_id,book_id' }
          )
          .then(({ error }) => {
            if (error) console.error('Ошибка сохранения закладки:', error);
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
        const percent = Math.min(100, Math.max(1, Math.round((chapterIndex * chWeight + pageProgress * chWeight) * 100)));

        set({
          readingProgress: {
            ...readingProgress,
            [bookId]: { chapterIndex, pageIndex, percent },
          },
        });

        if (student) {
          supabase
            .from('reading_progress')
            .upsert(
              {
                student_id: student.id,
                book_id: bookId,
                is_bookmarked: myShelfIds.includes(bookId),
                current_chapter: chapterIndex,
                current_page: pageIndex,
                progress_percent: percent,
                last_read_at: new Date().toISOString(),
              },
              { onConflict: 'student_id,book_id' }
            )
            .then(({ error }) => {
              if (error) console.error('Ошибка сохранения прогресса:', error);
            });
        }
      },

      setReaderFontSize: (size) => set({ readerFontSize: size }),
      setReaderFontFamily: (font) => set({ readerFontFamily: font }),
      setReaderTheme: (theme) => set({ readerTheme: theme }),
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
      }),
    }
  )
);
