export type GradeFilter = 'all' | '5-7' | '8-9' | '10-11';
export type CategoryFilter = 'all' | 'classic' | 'scifi' | 'adventure' | 'fairy' | 'drama';
export type SortOption = 'popular' | 'grade' | 'title' | 'time';
export type ReaderTheme = 'paper' | 'sepia' | 'night' | 'forest';
export type ReaderFont = 'serif' | 'sans';

export interface Chapter {
  title: string;
  paragraphs: string[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  grade: '5-7' | '8-9' | '10-11';
  category: CategoryFilter;
  categoryName: string;
  readTime: string;
  readersCount: number;
  rating: number;
  curriculum: boolean;
  coverGradient: string;
  gradient?: string;
  accentColor: string;
  synopsis: string;
  teacherNote: string;
  audioSample: string;
  chapters: Chapter[];
}

export interface ReadingProgress {
  chapterIndex: number;
  percent: number;
  updatedAt: string;
}
