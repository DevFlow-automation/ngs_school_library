import { create } from 'zustand';
import { GradeFilter, CategoryFilter, SortOption, ReaderTheme, ReaderFont, ReadingProgress } from '@/types/book';

interface ReadingState {
  activeTab: 'all' | 'curriculum' | 'my-shelf';
  gradeFilter: GradeFilter;
  categoryFilter: CategoryFilter;
  searchQuery: string;
  sortBy: SortOption;
  myShelfIds: string[];
  readingProgress: Record<string, ReadingProgress>;
  
  // Reader state
  activeBookId: string | null;
  activeChapterIndex: number;
  readerFontSize: number;
  readerFontFamily: ReaderFont;
  readerTheme: ReaderTheme;
  isSpeechPlaying: boolean;

  // Actions
  setActiveTab: (tab: 'all' | 'curriculum' | 'my-shelf') => void;
  setGradeFilter: (grade: GradeFilter) => void;
  setCategoryFilter: (category: CategoryFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  toggleShelf: (bookId: string) => void;
  openReader: (bookId: string, chapterIndex?: number) => void;
  closeReader: () => void;
  setChapterIndex: (index: number) => void;
  setReaderFontSize: (size: number) => void;
  setReaderFontFamily: (font: ReaderFont) => void;
  setReaderTheme: (theme: ReaderTheme) => void;
  setIsSpeechPlaying: (playing: boolean) => void;
}

export const useReadingStore = create<ReadingState>((set) => ({
  activeTab: 'all',
  gradeFilter: 'all',
  categoryFilter: 'all',
  searchQuery: '',
  sortBy: 'popular',
  myShelfIds: ['captains-daughter', 'hero-our-time'],
  readingProgress: {},

  activeBookId: null,
  activeChapterIndex: 0,
  readerFontSize: 19,
  readerFontFamily: 'serif',
  readerTheme: 'paper',
  isSpeechPlaying: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setGradeFilter: (grade) => set({ gradeFilter: grade }),
  setCategoryFilter: (category) => set({ categoryFilter: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortBy: (sort) => set({ sortBy: sort }),
  
  toggleShelf: (bookId) => set((state) => {
    const exists = state.myShelfIds.includes(bookId);
    return {
      myShelfIds: exists 
        ? state.myShelfIds.filter(id => id !== bookId)
        : [...state.myShelfIds, bookId]
    };
  }),

  openReader: (bookId, chapterIndex = 0) => set((state) => ({
    activeBookId: bookId,
    activeChapterIndex: state.readingProgress[bookId]?.chapterIndex ?? chapterIndex,
    isSpeechPlaying: false,
  })),

  closeReader: () => set({ activeBookId: null, isSpeechPlaying: false }),
  setChapterIndex: (index) => set({ activeChapterIndex: index, isSpeechPlaying: false }),
  setReaderFontSize: (size) => set({ readerFontSize: size }),
  setReaderFontFamily: (font) => set({ readerFontFamily: font }),
  setReaderTheme: (theme) => set({ readerTheme: theme }),
  setIsSpeechPlaying: (playing) => set({ isSpeechPlaying: playing }),
}));