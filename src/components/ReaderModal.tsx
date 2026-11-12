'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useReadingStore } from '@/store/useReadingStore';
import { BOOKS } from '@/data/books';
import { 
  ArrowLeft, Sliders, Bookmark, Search, 
  ChevronLeft, ChevronRight, CheckCircle2, ListFilter, X
} from 'lucide-react';
import { ReaderTheme } from '@/types/book';

const TARGET_CHARS_PER_PAGE = 1100;

export const ReaderModal: React.FC = () => {
  const { 
    activeBookId, 
    activeChapterIndex, 
    closeReader, 
    setChapterIndex,
    readingProgress,
    saveProgress,
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
  const textScrollRef = useRef<HTMLDivElement>(null);

  const book = useMemo(() => {
    return BOOKS.find((b) => b.id === activeBookId);
  }, [activeBookId]);

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
    if (activeBookId) {
      const savedPage = readingProgress[activeBookId]?.pageIndex || 0;
      setCurrentPage(savedPage < totalPages ? savedPage : 0);
      setShowMobileToc(false);
    }
  }, [activeBookId]);

  useEffect(() => {
    if (textScrollRef.current) {
      textScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage, activeChapterIndex]);

  useEffect(() => {
    if (activeBookId && book && totalChapters > 0) {
      saveProgress(activeBookId, activeChapterIndex, currentPage, totalChapters, totalPages);
    }
  }, [activeBookId, activeChapterIndex, currentPage, totalChapters, totalPages]);

  if (!activeBookId || !book) return null;

  const currentParagraphs = pages[currentPage] || [];
  const isLastPageOfChapter = currentPage === totalPages - 1;
  const hasNextChapter = activeChapterIndex < totalChapters - 1;
  const isBookmarked = myShelfIds.includes(book.id);

  const filteredChapters = (book.chapters || [])
    .map((ch, idx) => ({ ...ch, index: idx }))
    .filter(
      (ch) =>
        ch.title.toLowerCase().includes(chapterSearch.toLowerCase()) ||
        String(ch.index + 1).includes(chapterSearch)
    );

  const handleSelectChapter = (idx: number) => {
    setChapterIndex(idx);
    setCurrentPage(0);
    setShowMobileToc(false);
  };

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#16171D] select-none transition-colors reader-theme-${readerTheme}`}>
      
      {/* Верхний тулбар */}
      <header className="h-14 px-3 sm:px-6 flex items-center justify-between border-b border-current/10 shrink-0 bg-white/80 dark:bg-black/30 backdrop-blur-md z-30 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button 
            onClick={closeReader}
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

        <div className="flex items-center gap-1 shrink-0">
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

          <footer className="pt-3 border-t border-current/10 flex items-center justify-between gap-2 select-none">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
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
                  onClick={() => handleSelectChapter(activeChapterIndex + 1)}
                  className="px-4 sm:px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>След. глава →</span>
                </button>
              ) : (
                <span className="text-xs font-bold text-emerald-600">Конец книги 🏆</span>
              )
            ) : (
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
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

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold opacity-60">Тема</span>
            <div className="grid grid-cols-4 gap-2">
              {(['paper', 'sepia', 'night', 'forest'] as ReaderTheme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setReaderTheme(t)}
                  className={`py-2 rounded-xl text-[10px] font-bold border ${
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
          </div>
        </div>
      )}

    </div>
  );
};
