'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useReadingStore } from '@/store/useReadingStore';
import { fetchBookWithChapters, getCachedBookById } from '@/lib/booksService';
import { 
  ArrowLeft, Sliders, Bookmark, Search, 
  ChevronLeft, ChevronRight, CheckCircle2, ListFilter, X, Clock, Lock, AlertTriangle,
  Loader2, RefreshCw, BookOpen
} from 'lucide-react';
import { Book, ReaderTheme } from '@/types/book';
import {
  evaluateBookCompletion,
  evaluateReadingPace,
  formatReadingTimer,
  getFastChapterThresholdSeconds,
  getFastTurnThresholdSeconds,
} from '@/lib/readingMetrics';
import {
  sendAutoReadingWarning,
  type AutoWarningParams,
} from '@/lib/autoWarnings';
import {
  calculateStudentPoints,
  getAgeGroup,
  getUnlockableThemesForAgeGroup,
} from '@/lib/gamification';

const TARGET_CHARS_PER_PAGE = 1100;
const AUTO_FLUSH_MS = 15000;

interface LivePaceWarning {
  severity: 'warning' | 'danger';
  title: string;
  message: string;
  sentToProfile?: boolean;
}

export const ReaderModal: React.FC = () => {
  const { 
    student,
    activeBookId, 
    activeChapterIndex, 
    closeReader, 
    setChapterIndex,
    readingProgress,
    saveProgress,
    recordReadingMetrics,
    fetchUnreadMessagesCount,
    readerFontSize,
    readerFontFamily,
    readerTheme,
    setReaderFontSize,
    setReaderFontFamily,
    setReaderTheme,
    toggleShelf,
    myShelfIds
  } = useReadingStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showMobileToc, setShowMobileToc] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [chapterSearch, setChapterSearch] = useState('');
  const [liveExtraSec, setLiveExtraSec] = useState(0);
  const [loadedBook, setLoadedBook] = useState<Book | null>(null);
  const [isLoadingBook, setIsLoadingBook] = useState(false);
  const [isSlowBookLoad, setIsSlowBookLoad] = useState(false);
  const [bookLoadError, setBookLoadError] = useState(false);
  const [readyBookId, setReadyBookId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [liveWarning, setLiveWarning] = useState<LivePaceWarning | null>(null);
  const textScrollRef = useRef<HTMLDivElement>(null);

  // Рефы для точного подсчёта активного времени чтения, скорости перелистывания и авто-предупреждений
  const unsavedReadingMsRef = useRef(0);
  const pageActiveMsRef = useRef(0);
  const chapterActiveMsRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);
  const fastPageStreakRef = useRef(0);
  const fastChapterStreakRef = useRef(0);
  const chapterSkipCountRef = useRef(0);
  const maxVisitedChapterRef = useRef(0);
  const warningHideTimerRef = useRef<number | null>(null);

  const dismissLiveWarning = useCallback(() => {
    if (warningHideTimerRef.current !== null) {
      window.clearTimeout(warningHideTimerRef.current);
      warningHideTimerRef.current = null;
    }
    setLiveWarning(null);
  }, []);

  const showLiveWarning = useCallback((warning: LivePaceWarning, autoHideMs = 10000) => {
    if (warningHideTimerRef.current !== null) {
      window.clearTimeout(warningHideTimerRef.current);
      warningHideTimerRef.current = null;
    }
    setLiveWarning(warning);
    warningHideTimerRef.current = window.setTimeout(() => {
      setLiveWarning(null);
      warningHideTimerRef.current = null;
    }, autoHideMs);
  }, []);

  const captureActiveSlice = useCallback((keepRunning: boolean) => {
    const now = performance.now();
    if (activeSinceRef.current !== null) {
      const elapsed = Math.max(0, now - activeSinceRef.current);
      unsavedReadingMsRef.current += elapsed;
      pageActiveMsRef.current += elapsed;
      chapterActiveMsRef.current += elapsed;
    }
    activeSinceRef.current = keepRunning ? now : null;
  }, []);

  const flushReadingMetrics = useCallback(
    (
      bookId: string,
      opts?: { pageTurnElapsedSec?: number; isFastTurn?: boolean; skipSync?: boolean }
    ) => {
      const isRunning = activeSinceRef.current !== null;
      captureActiveSlice(isRunning);

      const wholeSeconds = Math.floor(unsavedReadingMsRef.current / 1000);
      if (wholeSeconds > 0) {
        unsavedReadingMsRef.current -= wholeSeconds * 1000;
        setLiveExtraSec(0);
      }

      if (wholeSeconds > 0 || typeof opts?.pageTurnElapsedSec === 'number') {
        recordReadingMetrics(bookId, {
          deltaSeconds: wholeSeconds,
          pageTurnElapsedSec: opts?.pageTurnElapsedSec,
          isFastTurn: opts?.isFastTurn,
          skipSync: opts?.skipSync,
        });
      }
    },
    [captureActiveSlice, recordReadingMetrics]
  );

  // Ленивая подгрузка текста (chapters) только для открытой книги
  useEffect(() => {
    if (!activeBookId) {
      setLoadedBook(null);
      setIsLoadingBook(false);
      setIsSlowBookLoad(false);
      setBookLoadError(false);
      setReadyBookId(null);
      return;
    }

    let cancelled = false;
    const cached = getCachedBookById(activeBookId);

    if (cached && cached.chaptersLoaded && cached.chapters.length > 0) {
      setLoadedBook(cached);
      setIsLoadingBook(false);
      setIsSlowBookLoad(false);
      setBookLoadError(false);
      return;
    }

    // Сразу показываем метаданные книги в шапке читалки, пока подгружается текст
    setLoadedBook(cached || null);
    setIsLoadingBook(true);
    setIsSlowBookLoad(false);
    setBookLoadError(false);
    setReadyBookId(null);

    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setIsSlowBookLoad(true);
    }, 3500);

    fetchBookWithChapters(activeBookId)
      .then((fullBook) => {
        if (cancelled) return;
        if (fullBook) {
          setLoadedBook(fullBook);
          setBookLoadError(false);
        } else {
          setBookLoadError(true);
        }
      })
      .catch((err) => {
        console.error('Ошибка загрузки текста книги:', err);
        if (!cancelled) setBookLoadError(true);
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
        if (!cancelled) {
          setIsLoadingBook(false);
          setIsSlowBookLoad(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [activeBookId, reloadNonce]);

  const book = loadedBook && loadedBook.id === activeBookId ? loadedBook : null;
  const isBookReady = Boolean(
    activeBookId && book && book.chaptersLoaded && book.chapters.length > 0 && !isLoadingBook
  );

  const currentChapter = useMemo(() => {
    if (!book || !book.chapters || book.chapters.length === 0) {
      return { title: 'Глава I', paragraphs: ['Текст произведения готовится к публикации.'] };
    }
    return book.chapters[activeChapterIndex] || book.chapters[0];
  }, [book, activeChapterIndex]);

  const pages: string[][] = useMemo(() => {
    const rawParas = currentChapter.paragraphs || [];
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
  }, [currentChapter]);

  const totalChapters = book?.chapters?.length || 0;
  const totalPages = pages.length;

  useEffect(() => {
    if (activeBookId && isBookReady && readyBookId !== activeBookId) {
      const savedProgress = readingProgress[activeBookId];
      const savedPage = savedProgress?.pageIndex || 0;
      setCurrentPage(savedPage < totalPages ? savedPage : 0);
      setShowMobileToc(false);
      fastPageStreakRef.current = 0;
      fastChapterStreakRef.current = 0;
      chapterSkipCountRef.current = 0;
      chapterActiveMsRef.current = 0;
      maxVisitedChapterRef.current = Math.max(savedProgress?.chapterIndex || 0, activeChapterIndex);
      dismissLiveWarning();
      setReadyBookId(activeBookId);
    }
  }, [activeBookId, isBookReady, totalPages, readyBookId, activeChapterIndex, dismissLiveWarning]);

  useEffect(() => {
    if (textScrollRef.current) {
      textScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage, activeChapterIndex]);

  useEffect(() => {
    if (activeBookId && readyBookId === activeBookId && book && totalChapters > 0) {
      saveProgress(activeBookId, activeChapterIndex, currentPage, totalChapters, totalPages);
    }
  }, [activeBookId, readyBookId, book, activeChapterIndex, currentPage, totalChapters, totalPages]);

  // Активный таймер чтения: пауза при скрытии вкладки/потере фокуса, автосохранение каждые 15 сек и при закрытии
  useEffect(() => {
    if (!activeBookId || readyBookId !== activeBookId) return;

    unsavedReadingMsRef.current = 0;
    pageActiveMsRef.current = 0;
    chapterActiveMsRef.current = 0;
    setLiveExtraSec(0);

    const isWindowActive = () =>
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      (typeof document.hasFocus !== 'function' || document.hasFocus());

    activeSinceRef.current = isWindowActive() ? performance.now() : null;

    const pauseTimer = () => {
      captureActiveSlice(false);
    };

    const resumeTimer = () => {
      if (activeSinceRef.current === null && isWindowActive()) {
        activeSinceRef.current = performance.now();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resumeTimer();
      } else {
        pauseTimer();
        flushReadingMetrics(activeBookId);
      }
    };

    const handlePageHide = () => {
      pauseTimer();
      flushReadingMetrics(activeBookId);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', pauseTimer);
    window.addEventListener('focus', resumeTimer);
    window.addEventListener('pagehide', handlePageHide);

    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const liveMs = activeSinceRef.current !== null ? Math.max(0, now - activeSinceRef.current) : 0;
      const totalUnsavedMs = unsavedReadingMsRef.current + liveMs;

      if (totalUnsavedMs >= AUTO_FLUSH_MS) {
        flushReadingMetrics(activeBookId);
      } else {
        setLiveExtraSec(Math.floor(totalUnsavedMs / 1000));
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', pauseTimer);
      window.removeEventListener('focus', resumeTimer);
      window.removeEventListener('pagehide', handlePageHide);
      flushReadingMetrics(activeBookId);
      activeSinceRef.current = null;
      dismissLiveWarning();
    };
  }, [activeBookId, readyBookId, captureActiveSlice, flushReadingMetrics, dismissLiveWarning]);

  // Авто-предупреждение в профиль, если ученик дошёл до конца книги, но она не засчитана из-за темпа/перескока
  useEffect(() => {
    if (!student?.id || !book || !isBookReady || readyBookId !== book.id) return;
    const isLastPage = currentPage === totalPages - 1;
    const hasNextCh = activeChapterIndex < totalChapters - 1;
    if (!isLastPage || hasNextCh) return;

    const prog = readingProgress[book.id];
    if (!prog) return;

    const check = evaluateBookCompletion({
      progressPercent: 100,
      readingSeconds: prog.readingSeconds || 0,
      pagesTurned: prog.pagesTurned || 0,
      fastTurnsCount: prog.fastTurnsCount || 0,
      avgSecondsPerPage: prog.avgSecondsPerPage || 0,
      minSecondsPerPage: prog.minSecondsPerPage ?? null,
    });

    if (!check.counted) {
      void sendAutoReadingWarning({
        studentId: student.id,
        bookId: book.id,
        bookTitle: book.title,
        reason: 'unverified_completion',
        readingSeconds: prog.readingSeconds || 0,
        pagesTurned: prog.pagesTurned || 0,
        fastTurnsCount: prog.fastTurnsCount || 0,
        avgSecondsPerPage: prog.avgSecondsPerPage || 0,
        completionReason: check.reason,
      }).then((sent) => {
        if (sent) {
          void fetchUnreadMessagesCount();
        }
      });
    }
  }, [
    student?.id,
    book,
    isBookReady,
    readyBookId,
    currentPage,
    totalPages,
    activeChapterIndex,
    totalChapters,
    readingProgress,
    fetchUnreadMessagesCount,
  ]);

  if (!activeBookId) return null;

  if (isLoadingBook || !isBookReady || !book) {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#16171D] select-none transition-colors reader-theme-${readerTheme}`}>
        <header className="h-14 px-3 sm:px-6 flex items-center justify-between border-b border-current/10 shrink-0 bg-white/80 dark:bg-black/30 backdrop-blur-md z-30 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={closeReader}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
              title="Закрыть книгу"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="text-xs font-bold truncate">
              {book ? (
                <>
                  {book.title}{' '}
                  <span className="hidden sm:inline opacity-70 font-normal">• {book.author}</span>
                </>
              ) : (
                'Открываем книгу…'
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          {bookLoadError ? (
            <div className="max-w-sm w-full rounded-[28px] border border-current/15 bg-black/[0.02] dark:bg-white/[0.04] p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold">Не удалось загрузить текст книги</h3>
                <p className="text-xs opacity-75">
                  Проверьте подключение к интернету и попробуйте открыть книгу ещё раз.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setReloadNonce((n) => n + 1)}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Попробовать снова</span>
                </button>
                <button
                  type="button"
                  onClick={closeReader}
                  className="px-4 py-2.5 rounded-xl border border-current/20 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10"
                >
                  В каталог
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-sm w-full rounded-[28px] border border-current/15 bg-black/[0.02] dark:bg-white/[0.04] p-7 text-center space-y-3.5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <BookOpen className="w-7 h-7" />
              </div>
              <div className="flex items-center justify-center gap-2 text-sm font-extrabold">
                <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                <span>Открываем книгу, пожалуйста, подождите…</span>
              </div>
              <p className="text-xs opacity-75 leading-relaxed">
                {isSlowBookLoad
                  ? 'Книга объёмная или интернет немного медленный — ещё пару секунд, текст уже загружается…'
                  : 'Загружаем главы и подготавливаем страницы для удобного чтения.'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentParagraphs = pages[currentPage] || [];
  const isLastPageOfChapter = currentPage === totalPages - 1;
  const hasNextChapter = activeChapterIndex < totalChapters - 1;
  const isEndOfBook = isLastPageOfChapter && !hasNextChapter;
  const isBookmarked = myShelfIds.includes(book.id);
  const currentBookProgress = readingProgress[book.id];
  const totalDisplaySeconds = (currentBookProgress?.readingSeconds || 0) + liveExtraSec;
  const completionCheck = isEndOfBook
    ? evaluateBookCompletion({
        progressPercent: 100,
        readingSeconds: totalDisplaySeconds,
        pagesTurned: currentBookProgress?.pagesTurned || 0,
        fastTurnsCount: currentBookProgress?.fastTurnsCount || 0,
        avgSecondsPerPage: currentBookProgress?.avgSecondsPerPage || 0,
        minSecondsPerPage: currentBookProgress?.minSecondsPerPage ?? null,
      })
    : null;
  const studentAgeGroup = getAgeGroup(student?.gradeClass);
  const studentPoints = calculateStudentPoints(
    Object.values(readingProgress).map((p) => ({
      progressPercent: p.percent || 0,
      readingSeconds: p.readingSeconds || 0,
      pagesTurned: p.pagesTurned || 0,
      fastTurnsCount: p.fastTurnsCount || 0,
      avgSecondsPerPage: p.avgSecondsPerPage || 0,
      minSecondsPerPage: p.minSecondsPerPage ?? null,
    })),
    student?.gradeClass
  ).totalPoints;
  const unlockableThemes = getUnlockableThemesForAgeGroup(studentAgeGroup);

  const filteredChapters = (book.chapters || [])
    .map((ch, idx) => ({ ...ch, index: idx }))
    .filter(
      (ch) =>
        ch.title.toLowerCase().includes(chapterSearch.toLowerCase()) ||
        String(ch.index + 1).includes(chapterSearch)
    );

  const measureCurrentPageTurn = () => {
    const isRunning = activeSinceRef.current !== null;
    captureActiveSlice(isRunning);
    const elapsedSec = Math.max(0.1, Math.round((pageActiveMsRef.current / 1000) * 10) / 10);
    const pageChars = currentParagraphs.join(' ').length;
    const fastThresholdSec = getFastTurnThresholdSeconds(pageChars);
    pageActiveMsRef.current = 0;
    return { elapsedSec, isFastTurn: elapsedSec < fastThresholdSec };
  };

  const dispatchProfileAutoWarning = (
    params: Omit<AutoWarningParams, 'studentId' | 'bookId' | 'bookTitle'>
  ) => {
    if (!student?.id) return;
    void sendAutoReadingWarning({
      ...params,
      studentId: student.id,
      bookId: book.id,
      bookTitle: book.title,
    }).then((sent) => {
      if (sent) {
        void fetchUnreadMessagesCount();
        setLiveWarning((prev) => (prev ? { ...prev, sentToProfile: true } : prev));
      }
    });
  };

  const evaluateFastPageWarning = (isFastTurn: boolean) => {
    const latest = useReadingStore.getState().readingProgress[book.id];
    const turns = latest?.pagesTurned || 0;
    const fastTurns = latest?.fastTurnsCount || 0;
    const avgSec = latest?.avgSecondsPerPage || 0;
    const readingSec = latest?.readingSeconds || 0;

    if (!isFastTurn) {
      fastPageStreakRef.current = 0;
      if (liveWarning?.severity === 'warning') {
        dismissLiveWarning();
      }
      return;
    }

    fastPageStreakRef.current += 1;
    const pace = evaluateReadingPace({
      progressPercent: latest?.percent || 0,
      readingSeconds: readingSec,
      pagesTurned: turns,
      fastTurnsCount: fastTurns,
      avgSecondsPerPage: avgSec,
      minSecondsPerPage: latest?.minSecondsPerPage ?? null,
    });

    if (fastPageStreakRef.current >= 3 || pace.status === 'suspicious') {
      const detail =
        fastPageStreakRef.current >= 3
          ? `Ты пролистал(а) ${fastPageStreakRef.current} стр. подряд быстрее нормы.`
          : `Зафиксирована слишком высокая скорость перелистывания (${pace.reason}).`;

      showLiveWarning(
        {
          severity: 'danger',
          title: 'Слишком быстрое перелистывание страниц',
          message: `${detail} Читай внимательнее — такие страницы не приносят баллы, и книга может не засчитаться.`,
        },
        12000
      );

      dispatchProfileAutoWarning({
        reason: 'fast_pages',
        fastStreak: fastPageStreakRef.current,
        pagesTurned: turns,
        fastTurnsCount: fastTurns,
        avgSecondsPerPage: avgSec,
        readingSeconds: readingSec,
      });
    } else if (fastPageStreakRef.current === 2) {
      showLiveWarning(
        {
          severity: 'warning',
          title: 'Сбавь темп чтения',
          message:
            'Ты перелистываешь страницы быстрее нормы. Пожалуйста, читай внимательно — быстрые клики не засчитываются в баллы.',
        },
        8000
      );
    }
  };

  const handleCloseReader = () => {
    dismissLiveWarning();
    flushReadingMetrics(book.id);
    closeReader();
  };

  const handleSelectChapter = (idx: number) => {
    if (idx === activeChapterIndex) {
      setShowMobileToc(false);
      return;
    }

    flushReadingMetrics(book.id, { skipSync: true });
    const chapterElapsedSec = Math.max(0.1, Math.round((chapterActiveMsRef.current / 1000) * 10) / 10);
    const chapterChars = (currentChapter.paragraphs || []).join(' ').length;
    const fastChapterThreshold = getFastChapterThresholdSeconds(chapterChars);
    pageActiveMsRef.current = 0;
    chapterActiveMsRef.current = 0;

    if (idx > activeChapterIndex) {
      const baselineChapter = Math.max(activeChapterIndex, maxVisitedChapterRef.current);
      const jumpSize = idx - baselineChapter;

      if (jumpSize >= 2) {
        chapterSkipCountRef.current += 1;
        const latest = useReadingStore.getState().readingProgress[book.id];
        const readingSec = latest?.readingSeconds || 0;
        const approxPercent = Math.round(((idx + 1) / Math.max(totalChapters, 1)) * 100);
        const shouldSendMessage =
          jumpSize >= 3 ||
          chapterSkipCountRef.current >= 2 ||
          (approxPercent >= 25 && readingSec < 60);

        showLiveWarning(
          {
            severity: shouldSendMessage ? 'danger' : 'warning',
            title: 'Замечен перескок по главам',
            message: `Ты перешёл(ла) с главы ${activeChapterIndex + 1} сразу на главу ${idx + 1}. Пропущенные главы не засчитываются — читай книгу по порядку.`,
          },
          shouldSendMessage ? 12000 : 9000
        );

        if (shouldSendMessage) {
          dispatchProfileAutoWarning({
            reason: 'chapter_skip',
            fromChapter: activeChapterIndex + 1,
            toChapter: idx + 1,
            readingSeconds: readingSec,
          });
        }
      } else if (idx === activeChapterIndex + 1) {
        maxVisitedChapterRef.current = Math.max(maxVisitedChapterRef.current, idx);
        if (chapterElapsedSec < fastChapterThreshold) {
          fastChapterStreakRef.current += 1;
          if (fastChapterStreakRef.current >= 3) {
            showLiveWarning(
              {
                severity: 'danger',
                title: 'Слишком быстрое перелистывание глав',
                message: `Ты переключил(а) ${fastChapterStreakRef.current} главы подряд за слишком короткое время. Читай главы целиком, чтобы чтение засчиталось.`,
              },
              12000
            );
            dispatchProfileAutoWarning({
              reason: 'fast_chapters',
              fastStreak: fastChapterStreakRef.current,
              readingSeconds: useReadingStore.getState().readingProgress[book.id]?.readingSeconds || 0,
            });
          } else if (fastChapterStreakRef.current === 2) {
            showLiveWarning(
              {
                severity: 'warning',
                title: 'Слишком быстрый переход между главами',
                message:
                  'Ты переключаешь главы слишком быстро. Прочитай текущую главу внимательно перед переходом дальше.',
              },
              8000
            );
          }
        } else {
          fastChapterStreakRef.current = 0;
        }
      }
    } else {
      fastChapterStreakRef.current = 0;
    }

    setChapterIndex(idx);
    setCurrentPage(0);
    setShowMobileToc(false);
  };

  const handlePrevPage = () => {
    flushReadingMetrics(book.id, { skipSync: true });
    pageActiveMsRef.current = 0;
    setCurrentPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    const { elapsedSec, isFastTurn } = measureCurrentPageTurn();
    flushReadingMetrics(book.id, {
      pageTurnElapsedSec: elapsedSec,
      isFastTurn,
      skipSync: true,
    });
    evaluateFastPageWarning(isFastTurn);
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  };

  const handleNextChapter = () => {
    const { elapsedSec, isFastTurn } = measureCurrentPageTurn();
    const chapterElapsedSec = Math.max(0.1, Math.round((chapterActiveMsRef.current / 1000) * 10) / 10);
    const chapterChars = (currentChapter.paragraphs || []).join(' ').length;
    const fastChapterThreshold = getFastChapterThresholdSeconds(chapterChars);
    const isFastChapter = chapterElapsedSec < fastChapterThreshold;
    chapterActiveMsRef.current = 0;

    flushReadingMetrics(book.id, {
      pageTurnElapsedSec: elapsedSec,
      isFastTurn,
      skipSync: true,
    });

    maxVisitedChapterRef.current = Math.max(maxVisitedChapterRef.current, activeChapterIndex + 1);

    if (isFastChapter) {
      fastChapterStreakRef.current += 1;
    } else {
      fastChapterStreakRef.current = 0;
    }

    if (fastChapterStreakRef.current >= 3) {
      if (isFastTurn) {
        fastPageStreakRef.current += 1;
      } else {
        fastPageStreakRef.current = 0;
      }
      showLiveWarning(
        {
          severity: 'danger',
          title: 'Слишком быстрое перелистывание глав',
          message: `Ты пролистал(а) ${fastChapterStreakRef.current} главы подряд слишком быстро. Пожалуйста, читай главы целиком и в спокойном темпе.`,
        },
        12000
      );
      dispatchProfileAutoWarning({
        reason: 'fast_chapters',
        fastStreak: fastChapterStreakRef.current,
        readingSeconds: useReadingStore.getState().readingProgress[book.id]?.readingSeconds || 0,
      });
    } else if (fastChapterStreakRef.current === 2) {
      if (isFastTurn) {
        fastPageStreakRef.current += 1;
      } else {
        fastPageStreakRef.current = 0;
      }
      showLiveWarning(
        {
          severity: 'warning',
          title: 'Слишком быстрый переход между главами',
          message:
            'Ты переходишь к следующим главам слишком быстро. Постарайся внимательно дочитывать каждую главу.',
        },
        8000
      );
    } else {
      evaluateFastPageWarning(isFastTurn);
    }

    setChapterIndex(activeChapterIndex + 1);
    setCurrentPage(0);
    setShowMobileToc(false);
  };

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#16171D] select-none transition-colors reader-theme-${readerTheme}`}>
      
      {/* Верхний тулбар */}
      <header className="h-14 px-3 sm:px-6 flex items-center justify-between border-b border-current/10 shrink-0 bg-white/80 dark:bg-black/30 backdrop-blur-md z-30 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button 
            onClick={handleCloseReader}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
            title="Закрыть книгу"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Кнопка вызова оглавления на мобильном */}
          <button
            onClick={() => setShowMobileToc(true)}
            className="md:hidden px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-bold flex items-center gap-1 shrink-0"
          >
            <ListFilter className="w-4 h-4" />
            <span>Главы</span>
          </button>
          
          <div className="text-xs font-bold truncate">
            {book.title} <span className="hidden sm:inline opacity-70 font-normal">• {book.author}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono font-bold flex items-center gap-1.5"
            title="Время чтения этой книги (считается только при открытой вкладке)"
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{formatReadingTimer(totalDisplaySeconds)}</span>
          </div>

          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Шрифт и темы"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button 
            onClick={() => toggleShelf(book.id)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title={isBookmarked ? 'Удалить из закладок' : 'Добавить в закладки'}
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-indigo-600 text-indigo-600' : ''}`} />
          </button>
        </div>
      </header>

      {/* Сайдбар + Страница */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Затемнение под шторкой на мобильном */}
        {showMobileToc && (
          <div 
            onClick={() => setShowMobileToc(false)}
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
          />
        )}

        {/* Сайдбар со списком глав (шторка на телефоне, колонка на ПК) */}
        <aside className={`
          fixed md:static inset-y-0 left-0 z-40 w-72 md:w-72 lg:w-80 
          border-r border-current/10 bg-white dark:bg-[#1A1C23] md:bg-black/[0.02] md:dark:bg-white/[0.02] 
          flex flex-col shrink-0 transition-transform duration-200
          ${showMobileToc ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="p-3 border-b border-current/10 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold px-1">
              <span className="opacity-75">Содержание ({totalChapters})</span>
              <button 
                onClick={() => setShowMobileToc(false)} 
                className="md:hidden p-1 rounded-lg hover:bg-black/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 opacity-40" />
              <input
                type="text"
                placeholder="Найти главу..."
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-current/15 bg-transparent text-xs outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredChapters.map((ch) => {
              const isSelected = ch.index === activeChapterIndex;
              return (
                <button
                  key={ch.index}
                  onClick={() => handleSelectChapter(ch.index)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-bold shadow-sm'
                      : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-80'
                  }`}
                >
                  <span className="truncate pr-2">{ch.title}</span>
                  <span className={`text-[10px] font-mono shrink-0 ${isSelected ? 'text-indigo-200' : 'opacity-40'}`}>
                    #{ch.index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Правая область чтения (на телефоне занимает 100% ширины) */}
        <main className="flex-1 flex flex-col justify-between p-4 sm:p-8 max-w-3xl mx-auto w-full overflow-hidden select-text">
          
          <div className="flex items-center justify-between gap-2 text-xs font-mono opacity-75 border-b border-current/10 pb-2 mb-3 select-none">
            <span className="font-bold text-indigo-700 dark:text-indigo-400 truncate">
              {currentChapter.title}
            </span>
            <span className="shrink-0 font-bold bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded-full text-[11px]">
              Стр. {currentPage + 1}/{totalPages}
            </span>
          </div>

          {liveWarning && (
            <div
              role="alert"
              className={`mb-3 p-3 rounded-2xl border text-xs flex items-start justify-between gap-2.5 select-none transition-all ${
                liveWarning.severity === 'danger'
                  ? 'bg-red-50 dark:bg-red-950/55 border-red-300 dark:border-red-800/70 text-red-900 dark:text-red-100'
                  : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800/70 text-amber-950 dark:text-amber-100'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    liveWarning.severity === 'danger'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="font-extrabold leading-snug">{liveWarning.title}</div>
                  <div className="text-[11.5px] opacity-90 leading-snug">{liveWarning.message}</div>
                  {liveWarning.sentToProfile && (
                    <div className="text-[10.5px] font-semibold opacity-75 pt-0.5">
                      Предупреждение также сохранено в разделе «Сообщения» вашего профиля.
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={dismissLiveWarning}
                className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                title="Скрыть предупреждение"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div ref={textScrollRef} className="flex-1 overflow-y-auto pr-1 sm:pr-2 py-1">
            <article 
              className={`space-y-4 sm:space-y-5 leading-relaxed ${
                readerFontFamily === 'serif' ? 'font-serif' : 'font-sans'
              }`}
              style={{ 
                fontSize: `${readerFontSize}px`, 
                lineHeight: `${Math.round(readerFontSize * 1.65)}px` 
              }}
            >
              {currentParagraphs.map((para, idx) => (
                <p key={idx} className="indent-5 sm:indent-8">
                  {para}
                </p>
              ))}
            </article>
          </div>

          {isEndOfBook && completionCheck && !completionCheck.counted && (
            <div className="mb-2.5 p-3 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800/70 text-red-900 dark:text-red-100 text-xs flex items-start gap-2.5 select-none">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-extrabold">
                  Книга не засчитана как прочитанная на 100%
                </div>
                <div className="text-[11.5px] opacity-90">
                  <b>Причина:</b> {completionCheck.reason}
                </div>
                <div className="text-[11px] opacity-75">
                  Прочитайте книгу внимательно в спокойном темпе, чтобы она засчиталась прочитанной.
                </div>
              </div>
            </div>
          )}

          <footer className="pt-3 border-t border-current/10 flex items-center justify-between gap-2 select-none">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className="px-3 sm:px-4 py-2.5 rounded-xl border border-current/20 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-20 text-xs font-bold flex items-center gap-1 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Предыдущая страница</span>
              <span className="sm:hidden">Назад</span>
            </button>

            {isLastPageOfChapter ? (
              hasNextChapter ? (
                <button
                  onClick={handleNextChapter}
                  className="px-4 sm:px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>След. глава →</span>
                </button>
              ) : completionCheck && !completionCheck.counted ? (
                <span className="px-3 py-1.5 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-bold inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Не засчитано</span>
                </span>
              ) : (
                <span className="text-xs font-bold text-emerald-600">Конец книги 🏆</span>
              )
            ) : (
              <button
                onClick={handleNextPage}
                className="px-4 sm:px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 shadow-md transition-all"
              >
                <span className="hidden sm:inline">Следующая страница</span>
                <span className="sm:hidden">Вперед</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </footer>

        </main>

      </div>

      {/* Меню настроек темы */}
      {showSettings && (
        <div className="absolute right-4 sm:right-6 top-16 w-72 bg-white dark:bg-[#22252F] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 p-5 z-50 text-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">Параметры текста</span>
            <button onClick={() => setShowSettings(false)} className="p-1 rounded-full hover:bg-black/5">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold opacity-60">Шрифт</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setReaderFontFamily('serif')}
                className={`py-2 px-3 rounded-xl border text-center font-serif text-sm font-bold ${
                  readerFontFamily === 'serif' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200'
                }`}
              >
                Антиква
              </button>
              <button
                onClick={() => setReaderFontFamily('sans')}
                className={`py-2 px-3 rounded-xl border text-center font-sans text-sm font-bold ${
                  readerFontFamily === 'sans' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200'
                }`}
              >
                Гротеск
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between font-bold text-[10px] uppercase opacity-60">
              <span>Размер шрифта</span>
              <span>{readerFontSize} px</span>
            </div>
            <input
              type="range"
              min={14}
              max={26}
              value={readerFontSize}
              onChange={(e) => setReaderFontSize(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold opacity-60">Тема</span>
            <div className="grid grid-cols-4 gap-2">
              {(['paper', 'sepia', 'night', 'forest'] as ReaderTheme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setReaderTheme(t)}
                  className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${
                    readerTheme === t ? 'ring-2 ring-indigo-500' : ''
                  } ${
                    t === 'paper' ? 'bg-[#FAF8F5] text-black' :
                    t === 'sepia' ? 'bg-[#F4ECD8] text-amber-950' :
                    t === 'night' ? 'bg-[#16171D] text-white' : 'bg-[#121E1A] text-emerald-100'
                  }`}
                >
                  {t === 'paper' && 'Белая'}
                  {t === 'sepia' && 'Сепия'}
                  {t === 'night' && 'Ночь'}
                  {t === 'forest' && 'Хвоя'}
                </button>
              ))}
            </div>

            {unlockableThemes.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[10px] font-bold opacity-60">
                  <span className="uppercase">Наградные темы</span>
                  <span className="font-mono">⭐ {studentPoints} б.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {unlockableThemes.map((reward) => {
                    const isUnlocked = studentPoints >= reward.requiredPoints;
                    const isActive = readerTheme === reward.themeValue;
                    return (
                      <button
                        key={reward.id}
                        type="button"
                        disabled={!isUnlocked}
                        onClick={() => reward.themeValue && setReaderTheme(reward.themeValue)}
                        style={{
                          backgroundColor: reward.themePreviewBg,
                          color: reward.themePreviewText,
                        }}
                        title={
                          isUnlocked
                            ? reward.description
                            : `Откроется при ${reward.requiredPoints} баллах (сейчас ${studentPoints})`
                        }
                        className={`py-2 px-2 rounded-xl text-[10px] font-bold border border-black/15 flex items-center justify-center gap-1 transition-all ${
                          isActive ? 'ring-2 ring-indigo-500' : ''
                        } ${!isUnlocked ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'}`}
                      >
                        {!isUnlocked && <Lock className="w-3 h-3 shrink-0" />}
                        <span className="truncate">
                          {reward.icon} {isUnlocked ? reward.title.replace(/^Тема «|»$/g, '') : `${reward.requiredPoints} б.`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
