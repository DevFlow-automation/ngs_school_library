'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { fetchBookWithChapters } from '@/lib/booksService';
import {
  computeBookPositionStats,
  getChapterPageCount,
} from '@/lib/bookPagination';
import {
  POINTS_PER_HONEST_PAGE,
  getAgeGroup,
  getAgeGroupMeta,
} from '@/lib/gamification';
import {
  evaluateBookCompletion,
  evaluateReadingPace,
  formatReadingDuration,
  formatTurnSpeed,
} from '@/lib/readingMetrics';
import type { AdminProgressRow } from '@/lib/progressBackups';
import type { Chapter } from '@/types/book';
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
  Clock,
  Loader2,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

export interface SimpleBookOption {
  id: string;
  title: string;
  author: string;
}

interface AdminProgressEditorModalProps {
  studentId: string;
  studentName: string;
  studentGradeClass: string;
  books: SimpleBookOption[];
  existingRows: AdminProgressRow[];
  /** Если передано — редактируем конкретную книгу; если null — добавление/восстановление любой книги */
  initialRow: AdminProgressRow | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

function calcBookPoints(
  metrics: {
    progressPercent: number;
    readingSeconds: number;
    pagesTurned: number;
    fastTurnsCount: number;
    avgSecondsPerPage: number;
    minSecondsPerPage: number | null;
  },
  completionBonus: number
) {
  const honestPages = Math.max(0, metrics.pagesTurned - Math.min(metrics.pagesTurned, metrics.fastTurnsCount));
  const pagePoints = honestPages * POINTS_PER_HONEST_PAGE;
  const pace = evaluateReadingPace(metrics);
  const completion = evaluateBookCompletion(metrics);
  const completedCounted =
    pace.status !== 'suspicious' && metrics.progressPercent >= 95 && completion.counted;
  const completionPoints = completedCounted ? completionBonus : 0;
  return {
    honestPages,
    pagePoints,
    completionPoints,
    totalBookPoints: pagePoints + completionPoints,
    pace,
    completion,
    completedCounted,
  };
}

export const AdminProgressEditorModal: React.FC<AdminProgressEditorModalProps> = ({
  studentId,
  studentName,
  studentGradeClass,
  books,
  existingRows,
  initialRow,
  onClose,
  onSaved,
}) => {
  const isEditExisting = Boolean(initialRow);
  const ageGroup = useMemo(() => getAgeGroup(studentGradeClass), [studentGradeClass]);
  const ageMeta = useMemo(() => getAgeGroupMeta(ageGroup), [ageGroup]);

  const existingByBookId = useMemo(() => {
    const map: Record<string, AdminProgressRow> = {};
    for (const row of existingRows) {
      map[row.book_id] = row;
    }
    return map;
  }, [existingRows]);

  const [bookSearch, setBookSearch] = useState('');
  const [selectedBookId, setSelectedBookId] = useState<string>(initialRow?.book_id || '');

  // Главы выбранной книги
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);

  // Редактируемые поля (1-based для главы и страницы в UI)
  const [chapterNum, setChapterNum] = useState<number>((initialRow?.current_chapter ?? 0) + 1);
  const [pageNum, setPageNum] = useState<number>((initialRow?.current_page ?? 0) + 1);
  const [progressPercent, setProgressPercent] = useState<number>(initialRow?.progress_percent ?? 1);
  const [autoSyncPercent, setAutoSyncPercent] = useState<boolean>(!initialRow);

  const [pagesTurned, setPagesTurned] = useState<number>(Number(initialRow?.pages_turned || 0));
  const [fastTurnsCount, setFastTurnsCount] = useState<number>(Number(initialRow?.fast_turns_count || 0));
  const [readingMinutes, setReadingMinutes] = useState<number>(
    Math.floor(Number(initialRow?.reading_seconds || 0) / 60)
  );
  const [readingRemSeconds, setReadingRemSeconds] = useState<number>(
    Math.floor(Number(initialRow?.reading_seconds || 0) % 60)
  );
  const [avgSecondsPerPage, setAvgSecondsPerPage] = useState<string>(
    initialRow?.avg_seconds_per_page ? String(Number(initialRow.avg_seconds_per_page)) : '0'
  );
  const [minSecondsPerPage, setMinSecondsPerPage] = useState<string>(
    initialRow?.min_seconds_per_page !== null && initialRow?.min_seconds_per_page !== undefined
      ? String(Number(initialRow.min_seconds_per_page))
      : ''
  );
  const [isBookmarked, setIsBookmarked] = useState<boolean>(Boolean(initialRow?.is_bookmarked));
  const [notifyStudent, setNotifyStudent] = useState<boolean>(false);
  const [notifyReason, setNotifyReason] = useState<string>('');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Подгружаем текущие значения при смене книги в режиме добавления/выбора
  const applyRowToForm = (row: AdminProgressRow | null) => {
    if (row) {
      setChapterNum((row.current_chapter ?? 0) + 1);
      setPageNum((row.current_page ?? 0) + 1);
      setProgressPercent(row.progress_percent ?? 0);
      setPagesTurned(Number(row.pages_turned || 0));
      setFastTurnsCount(Number(row.fast_turns_count || 0));
      const sec = Math.max(0, Math.round(Number(row.reading_seconds || 0)));
      setReadingMinutes(Math.floor(sec / 60));
      setReadingRemSeconds(sec % 60);
      setAvgSecondsPerPage(
        row.avg_seconds_per_page ? String(Number(row.avg_seconds_per_page)) : '0'
      );
      setMinSecondsPerPage(
        row.min_seconds_per_page !== null && row.min_seconds_per_page !== undefined
          ? String(Number(row.min_seconds_per_page))
          : ''
      );
      setIsBookmarked(Boolean(row.is_bookmarked));
      setAutoSyncPercent(false);
    } else {
      setChapterNum(1);
      setPageNum(1);
      setProgressPercent(1);
      setPagesTurned(0);
      setFastTurnsCount(0);
      setReadingMinutes(0);
      setReadingRemSeconds(0);
      setAvgSecondsPerPage('25');
      setMinSecondsPerPage('15');
      setIsBookmarked(false);
      setAutoSyncPercent(true);
    }
  };

  useEffect(() => {
    if (!selectedBookId) {
      setChapters([]);
      return;
    }

    let cancelled = false;
    setIsLoadingChapters(true);
    fetchBookWithChapters(selectedBookId)
      .then((book) => {
        if (cancelled) return;
        setChapters(book?.chapters || []);
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChapters(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBookId]);

  const filteredBooks = useMemo(() => {
    const q = bookSearch.trim().toLowerCase();
    const sorted = [...books].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    if (!q) return sorted;
    return sorted.filter(
      (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }, [books, bookSearch]);

  const selectedBookMeta = useMemo(
    () => books.find((b) => b.id === selectedBookId) || null,
    [books, selectedBookId]
  );

  const bookStats = useMemo(() => {
    if (chapters.length === 0) return null;
    return computeBookPositionStats(chapters, Math.max(0, chapterNum - 1), Math.max(0, pageNum - 1));
  }, [chapters, chapterNum, pageNum]);

  const maxChapterNum = chapters.length > 0 ? chapters.length : 999;
  const maxPageInChapter = bookStats ? bookStats.pagesInCurrentChapter : 9999;

  // Автопересчёт % при смене главы/страницы (если включён чекбокс)
  useEffect(() => {
    if (autoSyncPercent && bookStats) {
      setProgressPercent(bookStats.calculatedPercent);
    }
  }, [autoSyncPercent, bookStats]);

  const handleSelectBook = (bookId: string) => {
    setSelectedBookId(bookId);
    setErrorMsg('');
    const existing = existingByBookId[bookId] || null;
    applyRowToForm(existing);
  };

  const handleChapterChange = (nextChapter1Based: number) => {
    const safeCh = Math.max(1, Math.min(maxChapterNum, Math.trunc(nextChapter1Based || 1)));
    setChapterNum(safeCh);
    if (chapters.length > 0) {
      const chPages = getChapterPageCount(chapters[safeCh - 1]);
      setPageNum((prev) => Math.max(1, Math.min(chPages, prev)));
    }
  };

  const handlePageChange = (nextPage1Based: number) => {
    const safePg = Math.max(1, Math.min(maxPageInChapter, Math.trunc(nextPage1Based || 1)));
    setPageNum(safePg);
  };

  // Пресет 1: Засчитать 100% (честно дочитана)
  const applyFullCompletionPreset = () => {
    const totalCh = chapters.length > 0 ? chapters.length : Math.max(1, chapterNum);
    const lastChPages =
      chapters.length > 0 ? getChapterPageCount(chapters[totalCh - 1]) : Math.max(1, pageNum);
    const totalPagesInBook =
      chapters.length > 0
        ? chapters.reduce((acc, ch) => acc + getChapterPageCount(ch), 0)
        : Math.max(pagesTurned, 10);

    const targetTurns = Math.max(pagesTurned, totalPagesInBook, 1);
    const targetAvg = 28;
    const currentSec = Math.max(0, readingMinutes * 60 + readingRemSeconds);
    const targetSec = Math.max(currentSec, targetTurns * targetAvg, 120);

    setAutoSyncPercent(false);
    setChapterNum(totalCh);
    setPageNum(lastChPages);
    setProgressPercent(100);
    setPagesTurned(targetTurns);
    setFastTurnsCount(0);
    setReadingMinutes(Math.floor(targetSec / 60));
    setReadingRemSeconds(targetSec % 60);
    setAvgSecondsPerPage(String(targetAvg));
    setMinSecondsPerPage('15');
  };

  // Пресет 2: Подогнать % / страницы / время под выбранную главу и страницу
  const applyPositionMetricsPreset = () => {
    const targetTurns = bookStats
      ? Math.max(1, bookStats.cumulativePageNumber)
      : Math.max(1, pagesTurned || pageNum);
    const targetPercent = bookStats ? bookStats.calculatedPercent : progressPercent;
    const targetAvg = 25;
    const targetSec = Math.max(targetTurns * targetAvg, targetPercent >= 95 ? 120 : 30);

    setProgressPercent(targetPercent);
    setPagesTurned(targetTurns);
    setFastTurnsCount(0);
    setReadingMinutes(Math.floor(targetSec / 60));
    setReadingRemSeconds(targetSec % 60);
    setAvgSecondsPerPage(String(targetAvg));
    setMinSecondsPerPage('14');
  };

  // Пресет 3: Снять подозрение античита (сохраняя текущие главу, страницу, %)
  const applyClearSuspiciousPreset = () => {
    const safeTurns = Math.max(
      pagesTurned,
      bookStats ? Math.max(1, bookStats.cumulativePageNumber) : 5
    );
    const currentAvg = Number(avgSecondsPerPage) || 0;
    const targetAvg = Math.max(24, Math.round(currentAvg * 10) / 10);
    const currentSec = Math.max(0, readingMinutes * 60 + readingRemSeconds);
    const minNeededSec = Math.max(
      safeTurns * targetAvg,
      progressPercent >= 95 ? 120 : progressPercent >= 25 ? 75 : 30
    );
    const targetSec = Math.max(currentSec, Math.round(minNeededSec));
    const currentMin = minSecondsPerPage !== '' ? Number(minSecondsPerPage) : 0;

    setPagesTurned(safeTurns);
    setFastTurnsCount(0);
    setAvgSecondsPerPage(String(targetAvg));
    setMinSecondsPerPage(String(Math.max(14, Number.isFinite(currentMin) ? currentMin : 14)));
    setReadingMinutes(Math.floor(targetSec / 60));
    setReadingRemSeconds(targetSec % 60);
  };

  const totalReadingSeconds = Math.max(0, Math.trunc(readingMinutes || 0) * 60 + Math.trunc(readingRemSeconds || 0));
  const safePagesTurned = Math.max(0, Math.trunc(pagesTurned || 0));
  const safeFastTurns = Math.max(0, Math.min(safePagesTurned, Math.trunc(fastTurnsCount || 0)));
  const parsedAvg = Math.max(0, Number(avgSecondsPerPage) || 0);
  const parsedMin =
    minSecondsPerPage.trim() === ''
      ? null
      : Math.max(0.1, Number(minSecondsPerPage) || 0.1);

  const previewPoints = useMemo(
    () =>
      calcBookPoints(
        {
          progressPercent: Math.max(0, Math.min(100, Math.trunc(progressPercent || 0))),
          readingSeconds: totalReadingSeconds,
          pagesTurned: safePagesTurned,
          fastTurnsCount: safeFastTurns,
          avgSecondsPerPage: parsedAvg,
          minSecondsPerPage: parsedMin,
        },
        ageMeta.completionBonus
      ),
    [progressPercent, totalReadingSeconds, safePagesTurned, safeFastTurns, parsedAvg, parsedMin, ageMeta.completionBonus]
  );

  const previousBookPoints = useMemo(() => {
    const prevRow = selectedBookId ? existingByBookId[selectedBookId] : null;
    if (!prevRow) return 0;
    return calcBookPoints(
      {
        progressPercent: Number(prevRow.progress_percent || 0),
        readingSeconds: Number(prevRow.reading_seconds || 0),
        pagesTurned: Number(prevRow.pages_turned || 0),
        fastTurnsCount: Number(prevRow.fast_turns_count || 0),
        avgSecondsPerPage: Number(prevRow.avg_seconds_per_page || 0),
        minSecondsPerPage:
          prevRow.min_seconds_per_page !== null && prevRow.min_seconds_per_page !== undefined
            ? Number(prevRow.min_seconds_per_page)
            : null,
      },
      ageMeta.completionBonus
    ).totalBookPoints;
  }, [selectedBookId, existingByBookId, ageMeta.completionBonus]);

  const pointsDiff = previewPoints.totalBookPoints - previousBookPoints;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookId) {
      setErrorMsg('Выберите книгу из каталога.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/student-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          bookId: selectedBookId,
          currentChapter: Math.max(0, Math.trunc(chapterNum) - 1),
          currentPage: Math.max(0, Math.trunc(pageNum) - 1),
          progressPercent: Math.max(0, Math.min(100, Math.trunc(progressPercent || 0))),
          readingSeconds: totalReadingSeconds,
          pagesTurned: safePagesTurned,
          fastTurnsCount: safeFastTurns,
          avgSecondsPerPage: parsedAvg,
          minSecondsPerPage: parsedMin,
          isBookmarked,
          notifyStudent,
          notifyReason: notifyReason.trim(),
          bookTitle: selectedBookMeta?.title || selectedBookId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || 'Не удалось сохранить прогресс.');
        return;
      }

      await onSaved();
      onClose();
    } catch {
      setErrorMsg('Ошибка сети при сохранении прогресса.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#1C1F26] w-full max-w-2xl rounded-[26px] border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Шапка модалки */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#1C244B] to-[#344182] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-indigo-200">
              Полное управление прогрессом • {studentName} ({studentGradeClass})
            </div>
            <h2 className="text-base sm:text-lg font-extrabold truncate mt-0.5">
              {isEditExisting
                ? `Редактирование: ${selectedBookMeta?.title || initialRow?.book_id}`
                : 'Добавить или восстановить прогресс по книге'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          {/* Выбор книги (если добавляем/восстанавливаем) */}
          {!isEditExisting && (
            <div className="space-y-2 p-3.5 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-gray-200/80 dark:border-gray-800">
              <label className="text-xs font-extrabold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#3F51B5]" />
                <span>Выберите книгу для добавления / восстановления</span>
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bookSearch}
                  onChange={(e) => setBookSearch(e.target.value)}
                  placeholder="Поиск книги по названию или автору..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-xs outline-none focus:border-indigo-500"
                />
              </div>
              <select
                required
                value={selectedBookId}
                onChange={(e) => handleSelectBook(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="">— Выберите книгу ({filteredBooks.length}) —</option>
                {filteredBooks.map((b) => {
                  const hasRow = Boolean(existingByBookId[b.id]);
                  return (
                    <option key={b.id} value={b.id}>
                      {b.title} — {b.author}
                      {hasRow ? ` (уже в профиле: ${existingByBookId[b.id].progress_percent}%)` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {selectedBookId && (
            <>
              {/* Быстрые действия (1 клик) */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Быстрое восстановление (1 клик)</span>
                  {isLoadingChapters && (
                    <span className="inline-flex items-center gap-1 text-indigo-500 normal-case font-semibold ml-auto">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Загрузка глав книги...
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={applyFullCompletionPreset}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Засчитать 100% (дочитана честно)</span>
                  </button>

                  <button
                    type="button"
                    onClick={applyPositionMetricsPreset}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Подогнать страницы и время под позицию</span>
                  </button>

                  <button
                    type="button"
                    onClick={applyClearSuspiciousPreset}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Снять подозрение античита</span>
                  </button>
                </div>
              </div>

              {/* Блок 1: Глава, Страница, Прогресс % */}
              <div className="p-4 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-gray-200/80 dark:border-gray-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-gray-900 dark:text-white">
                    Позиция в книге (главы и страницы)
                  </span>
                  {bookStats && (
                    <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-lg font-bold">
                      Стр. {bookStats.cumulativePageNumber} из {bookStats.totalPagesInBook} • Глав: {bookStats.totalChapters}
                    </span>
                  )}
                </div>

                {/* Выпадающий список реальных глав (если загружены) */}
                {chapters.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Выбор главы из оглавления
                    </label>
                    <select
                      value={Math.min(chapters.length, Math.max(1, chapterNum))}
                      onChange={(e) => handleChapterChange(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-xs font-semibold outline-none focus:border-indigo-500"
                    >
                      {chapters.map((ch, idx) => {
                        const pgCount = getChapterPageCount(ch);
                        return (
                          <option key={idx} value={idx + 1}>
                            Глава {idx + 1}: {ch.title || `Без названия`} ({pgCount} стр.)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Глава {chapters.length > 0 ? `(1–${chapters.length})` : '(номер)'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={maxChapterNum}
                      value={chapterNum}
                      onChange={(e) => handleChapterChange(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Страница {bookStats ? `(1–${bookStats.pagesInCurrentChapter})` : '(номер)'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={maxPageInChapter}
                      value={pageNum}
                      onChange={(e) => handlePageChange(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Прогресс (0–100%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={progressPercent}
                      onChange={(e) => {
                        setAutoSyncPercent(false);
                        setProgressPercent(Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {bookStats && bookStats.pagesInCurrentChapter > 1 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10.5px] text-gray-500 font-mono">
                      <span>Стр. 1</span>
                      <span>
                        Глава {chapterNum}, стр. {pageNum} из {bookStats.pagesInCurrentChapter}
                      </span>
                      <span>Стр. {bookStats.pagesInCurrentChapter}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={bookStats.pagesInCurrentChapter}
                      value={Math.min(bookStats.pagesInCurrentChapter, Math.max(1, pageNum))}
                      onChange={(e) => handlePageChange(Number(e.target.value))}
                      className="w-full accent-[#3F51B5]"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <label className="inline-flex items-center gap-2 text-[11.5px] text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoSyncPercent}
                      onChange={(e) => setAutoSyncPercent(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-[#3F51B5]"
                    />
                    <span>Автоматически считать % от выбранной главы и страницы</span>
                  </label>

                  <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-800 dark:text-amber-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isBookmarked}
                      onChange={(e) => setIsBookmarked(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-amber-500"
                    />
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>В закладках (на полке)</span>
                  </label>
                </div>
              </div>

              {/* Блок 2: Метрики чтения, баллы и античит */}
              <div className="p-4 rounded-2xl bg-[#F8F9FE] dark:bg-[#151820] border border-gray-200/80 dark:border-gray-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-gray-900 dark:text-white">
                    Засчитанные страницы, время и скорость (влияют на баллы и рейтинг)
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    Честных страниц: {previewPoints.honestPages} × {POINTS_PER_HONEST_PAGE} б. = +{previewPoints.pagePoints} б.
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Страниц пролистано
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={pagesTurned}
                      onChange={(e) => {
                        const val = Math.max(0, Math.trunc(Number(e.target.value) || 0));
                        setPagesTurned(val);
                        if (fastTurnsCount > val) setFastTurnsCount(val);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Быстрых (штраф)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={safePagesTurned}
                      value={fastTurnsCount}
                      onChange={(e) =>
                        setFastTurnsCount(
                          Math.max(0, Math.min(safePagesTurned, Math.trunc(Number(e.target.value) || 0)))
                        )
                      }
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Время: минуты
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={readingMinutes}
                      onChange={(e) => setReadingMinutes(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Время: секунды
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={readingRemSeconds}
                      onChange={(e) =>
                        setReadingRemSeconds(Math.max(0, Math.min(59, Math.trunc(Number(e.target.value) || 0))))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Средняя скорость (сек/стр, норма ≥ 18)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      step="0.5"
                      value={avgSecondsPerPage}
                      onChange={(e) => setAvgSecondsPerPage(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block">
                      Мин. скорость (сек/стр, опционально)
                    </label>
                    <input
                      type="number"
                      min={0.1}
                      max={3600}
                      step="0.5"
                      value={minSecondsPerPage}
                      onChange={(e) => setMinSecondsPerPage(e.target.value)}
                      placeholder="Например: 15"
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-sm font-mono font-bold outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Живой предпросмотр результата */}
              <div
                className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                  previewPoints.pace.status === 'suspicious'
                    ? 'bg-red-50/70 dark:bg-red-950/25 border-red-200 dark:border-red-900/60'
                    : 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-gray-900 dark:text-white inline-flex items-center gap-1.5">
                    {previewPoints.pace.status === 'suspicious' ? (
                      <ShieldAlert className="w-4 h-4 text-red-600" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    )}
                    <span>Итог по этой книге после сохранения</span>
                  </span>

                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-mono font-extrabold">
                    ⭐ +{previewPoints.totalBookPoints} б.
                    {pointsDiff !== 0 && (
                      <span className="ml-1 opacity-80">
                        ({pointsDiff > 0 ? `+${pointsDiff}` : pointsDiff} б.)
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/80 dark:bg-white/10 font-mono font-semibold text-gray-700 dark:text-gray-200">
                    <Clock className="w-3 h-3 text-indigo-500" />
                    {formatReadingDuration(totalReadingSeconds)}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/80 dark:bg-white/10 font-mono font-semibold text-gray-700 dark:text-gray-200">
                    <Zap className="w-3 h-3 text-amber-500" />
                    {safePagesTurned > 0 ? formatTurnSpeed(parsedAvg) : 'Нет кликов'}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-white/80 dark:bg-white/10 font-semibold text-gray-700 dark:text-gray-200">
                    Темп: <b>{previewPoints.pace.label}</b>
                  </span>
                  {progressPercent >= 95 && (
                    <span
                      className={`px-2 py-0.5 rounded-lg font-bold ${
                        previewPoints.completedCounted
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200'
                      }`}
                    >
                      {previewPoints.completedCounted
                        ? `✓ 100% засчитано (+${ageMeta.completionBonus} б.)`
                        : `✕ 100% не засчитано`}
                    </span>
                  )}
                </div>

                {progressPercent >= 95 && !previewPoints.completedCounted && (
                  <p className="text-[11px] text-red-700 dark:text-red-300">
                    Причина: {previewPoints.completion.reason || previewPoints.pace.reason}. Нажмите{' '}
                    <b>«Снять подозрение античита»</b> или <b>«Засчитать 100%»</b>, чтобы книга засчиталась.
                  </p>
                )}
              </div>

              {/* Опциональное уведомление ученику */}
              <div className="space-y-2 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notifyStudent}
                    onChange={(e) => setNotifyStudent(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#3F51B5]"
                  />
                  <span>Отправить ученику уведомление об обновлении/восстановлении прогресса</span>
                </label>

                {notifyStudent && (
                  <input
                    type="text"
                    maxLength={250}
                    value={notifyReason}
                    onChange={(e) => setNotifyReason(e.target.value)}
                    placeholder="Комментарий (например: Прогресс и достижения восстановлены)"
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-xs outline-none focus:border-indigo-500"
                  />
                )}
              </div>
            </>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs font-semibold text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-gray-700 dark:text-gray-200 text-xs font-bold transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSaving || !selectedBookId}
              className="px-5 py-2.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-md disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSaving ? 'Сохранение...' : 'Сохранить прогресс'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
