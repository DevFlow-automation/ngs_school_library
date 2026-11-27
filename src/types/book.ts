export type BookGrade = '1-4' | '5-7' | '8-9' | '10-11';
export type GradeFilter = 'all' | BookGrade;
export type CategoryFilter = 'all' | 'classic' | 'scifi' | 'adventure' | 'fairy' | 'drama';
export type SortOption = 'popular' | 'grade' | 'title' | 'time';
export type ReaderTheme =
  | 'paper'
  | 'sepia'
  | 'night'
  | 'forest'
  | 'ocean'
  | 'starry'
  | 'coffee'
  | 'obsidian';
export type ReaderFont = 'serif' | 'sans';

export interface Chapter {
  title: string;
  paragraphs: string[];
  /** Необязательная пометка вступительной главы (предисловие, введение, от автора и т.п.) */
  isFrontMatter?: boolean;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  grade: BookGrade;
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
  isFeatured?: boolean;
  createdAt?: string;
  chaptersLoaded?: boolean;
  chapters: Chapter[];
}

export interface ReadingProgress {
  chapterIndex: number;
  percent: number;
  updatedAt: string;
}
