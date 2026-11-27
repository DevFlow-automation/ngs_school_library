import type { Chapter } from '@/types/book';
import { getBookFrontMatterInfo } from '@/lib/frontMatter';

export const TARGET_CHARS_PER_PAGE = 1100;

/**
 * Единый алгоритм разбиения абзацев главы на страницы.
 * Используется и в читалке (ReaderModal), и в админ-редакторе прогресса,
 * чтобы номера страниц совпадали 1-в-1.
 */
export function paginateChapterParagraphs(paragraphs?: string[] | null): string[][] {
  const rawParas = paragraphs || [];
  if (rawParas.length === 0) return [['Текст главы пуст.']];

  const resultPages: string[][] = [];
  let currentChunk: string[] = [];
  let currentChars = 0;

  for (const p of rawParas) {
    const pLen = p.length;
    if (currentChars + pLen > TARGET_CHARS_PER_PAGE && currentChunk.length > 0) {
      resultPages.push(currentChunk);
      currentChunk = [p];
      currentChars = pLen;
    } else {
      currentChunk.push(p);
      currentChars += pLen;
    }
  }

  if (currentChunk.length > 0) {
    resultPages.push(currentChunk);
  }

  return resultPages;
}

export function getChapterPageCount(chapter?: Chapter | null): number {
  if (!chapter) return 1;
  return Math.max(1, paginateChapterParagraphs(chapter.paragraphs).length);
}

export function computeProgressPercent(
  chapterIndex: number,
  pageIndex: number,
  totalChapters: number,
  totalPagesInChapter: number,
  startChapterIndex = 0
): number {
  const safeChapters = Math.max(1, Math.trunc(totalChapters || 1));
  const safePages = Math.max(1, Math.trunc(totalPagesInChapter || 1));
  const clampedChapter = Math.max(0, Math.min(safeChapters - 1, Math.trunc(chapterIndex || 0)));
  const clampedPage = Math.max(0, Math.min(safePages - 1, Math.trunc(pageIndex || 0)));
  const safeStart = Math.max(0, Math.min(safeChapters - 1, Math.trunc(startChapterIndex || 0)));

  if (clampedChapter < safeStart) {
    return 1;
  }

  const effectiveChapters = Math.max(1, safeChapters - safeStart);
  const effectiveChapterIndex = clampedChapter - safeStart;
  const chWeight = 1 / effectiveChapters;
  const pageProgress = (clampedPage + 1) / safePages;
  return Math.min(
    100,
    Math.max(1, Math.round((effectiveChapterIndex * chWeight + pageProgress * chWeight) * 100))
  );
}

export interface BookPositionStats {
  totalChapters: number;
  chapterPageCounts: number[];
  totalPagesInBook: number;
  clampedChapterIndex: number;
  clampedPageIndex: number;
  pagesInCurrentChapter: number;
  /** Номер текущей страницы сквозной нумерацией с начала книги (1..totalPagesInBook) */
  cumulativePageNumber: number;
  /** Сколько перелистываний нужно, чтобы дойти с начала книги до этой позиции */
  turnsToReachPosition: number;
  calculatedPercent: number;
}

export function computeBookPositionStats(
  chapters: Chapter[],
  chapterIndex: number,
  pageIndex: number
): BookPositionStats {
  const chapterPageCounts =
    chapters.length > 0 ? chapters.map((ch) => getChapterPageCount(ch)) : [1];
  const totalChapters = chapterPageCounts.length;
  const totalPagesInBook = chapterPageCounts.reduce((acc, n) => acc + n, 0);

  const clampedChapterIndex = Math.max(
    0,
    Math.min(totalChapters - 1, Math.trunc(chapterIndex || 0))
  );
  const pagesInCurrentChapter = chapterPageCounts[clampedChapterIndex] || 1;
  const clampedPageIndex = Math.max(
    0,
    Math.min(pagesInCurrentChapter - 1, Math.trunc(pageIndex || 0))
  );

  let pagesBeforeChapter = 0;
  for (let i = 0; i < clampedChapterIndex; i++) {
    pagesBeforeChapter += chapterPageCounts[i];
  }

  const { mainContentStartIndex } = getBookFrontMatterInfo(chapters);
  const cumulativePageNumber = pagesBeforeChapter + clampedPageIndex + 1;
  const turnsToReachPosition = Math.max(0, cumulativePageNumber - 1);
  const calculatedPercent = computeProgressPercent(
    clampedChapterIndex,
    clampedPageIndex,
    totalChapters,
    pagesInCurrentChapter,
    mainContentStartIndex
  );

  return {
    totalChapters,
    chapterPageCounts,
    totalPagesInBook,
    clampedChapterIndex,
    clampedPageIndex,
    pagesInCurrentChapter,
    cumulativePageNumber,
    turnsToReachPosition,
    calculatedPercent,
  };
}
