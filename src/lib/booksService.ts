import { supabase } from '@/lib/supabase';
import { BOOKS } from '@/data/books';
import { Book, BookGrade, CategoryFilter, Chapter } from '@/types/book';

export interface RawBookMetaRow {
  id: string;
  title: string;
  author: string;
  year?: number | null;
  grade?: string | null;
  category?: string | null;
  category_name?: string | null;
  synopsis?: string | null;
  curriculum?: boolean | null;
  cover_gradient?: string | null;
  is_featured?: boolean | null;
  created_at?: string | null;
  chapters?: Chapter[] | null;
}

const BOOK_META_FULL_COLUMNS =
  'id, title, author, grade, category, category_name, synopsis, curriculum, cover_gradient, created_at, year, is_featured';

const BOOK_META_CORE_COLUMNS =
  'id, title, author, grade, category, category_name, synopsis, curriculum, cover_gradient, created_at';

const BOOK_FULL_SINGLE_COLUMNS =
  'id, title, author, grade, category, category_name, synopsis, curriculum, cover_gradient, created_at, chapters';

const CACHE_TTL_MS = 60_000;

let useCoreMetaOnly = false;
let cachedBooks: Book[] | null = null;
let cachedAt = 0;
let inFlightMetaPromise: Promise<Book[]> | null = null;

const chaptersCache = new Map<string, Chapter[]>();
const inFlightBookPromises = new Map<string, Promise<Book | null>>();

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

const BOOK_GRADE_ORDER: readonly BookGrade[] = ['1-4', '5-7', '8-9', '10-11'];

function normalizeGrade(raw?: string | null): BookGrade {
  if (raw === '1-4' || raw === '5-7' || raw === '8-9' || raw === '10-11') return raw;
  return '10-11';
}

export function compareBookGrades(a?: string | null, b?: string | null): number {
  const idxA = BOOK_GRADE_ORDER.indexOf((a || '') as BookGrade);
  const idxB = BOOK_GRADE_ORDER.indexOf((b || '') as BookGrade);
  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
  if (idxA !== -1) return -1;
  if (idxB !== -1) return 1;
  return String(a || '').localeCompare(String(b || ''), 'ru', { numeric: true });
}

function normalizeCategory(raw?: string | null): CategoryFilter {
  if (
    raw === 'classic' ||
    raw === 'scifi' ||
    raw === 'adventure' ||
    raw === 'fairy' ||
    raw === 'drama'
  ) {
    return raw;
  }
  return 'classic';
}

export function mapRawBookToBook(raw: RawBookMetaRow, overrideChapters?: Chapter[]): Book {
  const existingChapters =
    overrideChapters && overrideChapters.length > 0
      ? overrideChapters
      : raw.chapters && Array.isArray(raw.chapters) && raw.chapters.length > 0
        ? raw.chapters
        : chaptersCache.get(raw.id);

  const hasLoadedChapters = Boolean(existingChapters && existingChapters.length > 0);

  return {
    id: raw.id,
    title: raw.title,
    author: raw.author,
    year: raw.year || 1850,
    grade: normalizeGrade(raw.grade),
    category: normalizeCategory(raw.category),
    categoryName: raw.category_name || 'Русская классика',
    readTime: '2.5 ч',
    readersCount: 1,
    rating: 5.0,
    curriculum: Boolean(raw.curriculum),
    coverGradient: raw.cover_gradient || 'linear-gradient(135deg, #4338CA 0%, #3B82F6 100%)',
    accentColor: '#3B82F6',
    synopsis: raw.synopsis || '',
    teacherNote: raw.curriculum ? 'Входит в школьную программу' : 'Внеклассное чтение',
    audioSample: '',
    isFeatured: Boolean(raw.is_featured),
    createdAt: raw.created_at || undefined,
    chaptersLoaded: hasLoadedChapters,
    chapters: hasLoadedChapters ? existingChapters! : [],
  };
}

function upsertIntoSharedBooks(book: Book) {
  const existingIdx = BOOKS.findIndex((existing) => existing.id === book.id);
  if (existingIdx >= 0) {
    const prev = BOOKS[existingIdx];
    BOOKS[existingIdx] = {
      ...book,
      chapters: book.chaptersLoaded ? book.chapters : prev.chapters,
      chaptersLoaded: book.chaptersLoaded || prev.chaptersLoaded,
    };
  } else {
    BOOKS.push(book);
  }
}

async function queryMetadataRows(): Promise<RawBookMetaRow[]> {
  if (!useCoreMetaOnly) {
    const { data, error } = await supabase
      .from('books')
      .select(BOOK_META_FULL_COLUMNS)
      .order('created_at', { ascending: false });

    if (!error) {
      return (data || []) as RawBookMetaRow[];
    }

    if (!isMissingColumnError(error)) {
      throw error;
    }

    useCoreMetaOnly = true;
  }

  const { data, error } = await supabase
    .from('books')
    .select(BOOK_META_CORE_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as RawBookMetaRow[];
}

export function getCachedBooks(): Book[] | null {
  if (!cachedBooks) return null;
  if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
  return cachedBooks;
}

export function getCachedBookById(bookId: string): Book | null {
  const fromCache = cachedBooks?.find((b) => b.id === bookId);
  if (fromCache) {
    const cachedCh = chaptersCache.get(bookId);
    if (cachedCh && cachedCh.length > 0 && !fromCache.chaptersLoaded) {
      return { ...fromCache, chapters: cachedCh, chaptersLoaded: true };
    }
    return fromCache;
  }
  return BOOKS.find((b) => b.id === bookId) || null;
}

export function invalidateBooksCache(): void {
  cachedBooks = null;
  cachedAt = 0;
  inFlightMetaPromise = null;
}

export async function fetchBooksMetadata(options?: { force?: boolean }): Promise<Book[]> {
  const force = Boolean(options?.force);

  if (!force && cachedBooks && Date.now() - cachedAt <= CACHE_TTL_MS) {
    return cachedBooks;
  }

  if (!force && inFlightMetaPromise) {
    return inFlightMetaPromise;
  }

  const promise = (async () => {
    const rows = await queryMetadataRows();
    const seenIds = new Set<string>();
    const mapped: Book[] = [];

    for (const row of rows) {
      if (!row?.id || seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      const book = mapRawBookToBook(row);
      mapped.push(book);
      upsertIntoSharedBooks(book);
    }

    cachedBooks = mapped;
    cachedAt = Date.now();
    return mapped;
  })();

  inFlightMetaPromise = promise;
  try {
    return await promise;
  } finally {
    if (inFlightMetaPromise === promise) {
      inFlightMetaPromise = null;
    }
  }
}

export async function fetchRawBooksMetadataForAdmin(): Promise<RawBookMetaRow[]> {
  return queryMetadataRows();
}

export async function fetchBookWithChapters(bookId: string): Promise<Book | null> {
  const cachedChapters = chaptersCache.get(bookId);
  const existingBook = getCachedBookById(bookId);
  if (cachedChapters && cachedChapters.length > 0 && existingBook) {
    return {
      ...existingBook,
      chapters: cachedChapters,
      chaptersLoaded: true,
    };
  }

  const inFlight = inFlightBookPromises.get(bookId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const { data, error } = await supabase
      .from('books')
      .select(BOOK_FULL_SINGLE_COLUMNS)
      .eq('id', bookId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const raw = data as RawBookMetaRow;
    const resolvedChapters: Chapter[] =
      raw.chapters && Array.isArray(raw.chapters) && raw.chapters.length > 0
        ? raw.chapters
        : [
            {
              title: 'Часть I',
              paragraphs: [raw.synopsis || 'Текст произведения готовится к публикации.'],
            },
          ];

    chaptersCache.set(bookId, resolvedChapters);

    const mergedRaw: RawBookMetaRow = {
      ...raw,
      year: raw.year ?? existingBook?.year,
      is_featured: raw.is_featured ?? existingBook?.isFeatured,
    };
    const fullBook = mapRawBookToBook(mergedRaw, resolvedChapters);

    upsertIntoSharedBooks(fullBook);
    if (cachedBooks) {
      cachedBooks = cachedBooks.map((b) => (b.id === bookId ? fullBook : b));
    }

    return fullBook;
  })();

  inFlightBookPromises.set(bookId, promise);
  try {
    return await promise;
  } finally {
    if (inFlightBookPromises.get(bookId) === promise) {
      inFlightBookPromises.delete(bookId);
    }
  }
}

export function selectFeaturedBook(books: Book[]): Book | null {
  if (!books || books.length === 0) return null;
  const pinned = books.find((b) => b.isFeatured);
  if (pinned) return pinned;

  const chronological = [...books].sort((a, b) =>
    (a.createdAt || '').localeCompare(b.createdAt || '')
  );
  const weekNumber = Math.floor(Date.now() / (7 * 86400000));
  return chronological[weekNumber % chronological.length] || books[0];
}
