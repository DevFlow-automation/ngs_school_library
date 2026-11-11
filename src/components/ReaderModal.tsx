'use client';

import React from 'react';
import { useReadingStore } from '@/store/useReadingStore';
import { BOOKS } from '@/data/books';
import { ArrowLeft, ArrowRight, Volume2, Pause, Sliders, Bookmark } from 'lucide-react';
import { ReaderTheme, ReaderFont } from '@/types/book';

export const ReaderModal: React.FC = () => {
  const { 
    activeBookId, 
    activeChapterIndex, 
    closeReader, 
    setChapterIndex,
    readerFontSize,
    readerFontFamily,
    readerTheme,
    isSpeechPlaying,
    setReaderFontSize,
    setReaderFontFamily,
    setReaderTheme,
    setIsSpeechPlaying,
    toggleShelf,
    myShelfIds
  } = useReadingStore();

  const [showSettings, setShowSettings] = React.useState(false);

  const book = React.useMemo(() => {
    return BOOKS.find((b) => b.id === activeBookId);
  }, [activeBookId]);

  if (!activeBookId || !book) return null;

  const currentChapter = book.chapters[activeChapterIndex] || book.chapters[0];
  const isBookmarked = myShelfIds.includes(book.id);

  const toggleTTS = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeechPlaying) {
      window.speechSynthesis.cancel();
      setIsSpeechPlaying(false);
    } else {
      window.speechSynthesis.cancel();
      const text = currentChapter.paragraphs.join(' ');
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.rate = 0.95;
      utterance.onend = () => setIsSpeechPlaying(false);
      utterance.onerror = () => setIsSpeechPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeechPlaying(true);
    }
  };

  const percent = Math.round(((activeChapterIndex + 1) / book.chapters.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#16171D] transition-colors">
      
      {/* Top Header */}
      <header className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-black/10 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={closeReader}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold truncate max-w-[200px] sm:max-w-md">{book.title}</h2>
            <p className="text-xs opacity-70 truncate">{book.author}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* TTS Button */}
          <button 
            onClick={toggleTTS}
            className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-all"
          >
            {isSpeechPlaying ? <Pause className="w-4 h-4 text-indigo-600" /> : <Volume2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isSpeechPlaying ? 'Пауза' : 'Слушать'}</span>
          </button>

          {/* Settings Button */}
          <div className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Sliders className="w-5 h-5" />
            </button>

            {showSettings && (
              <div className="absolute right-0 top-12 w-72 bg-white dark:bg-[#22252F] rounded-3xl shadow-xl border border-black/10 dark:border-white/10 p-5 z-50 text-xs space-y-4">
                <div className="font-bold text-sm">Параметры чтения</div>

                {/* Font Selector */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-500">Шрифт</span>
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

                {/* Font Size */}
                <div className="space-y-1">
                  <div className="flex justify-between font-bold text-[10px] uppercase text-gray-500">
                    <span>Размер</span>
                    <span>{readerFontSize} px</span>
                  </div>
                  <input
                    type="range"
                    min="14"
                    max="28"
                    value={readerFontSize}
                    onChange={(e) => setReaderFontSize(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>

                {/* Themes */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-gray-500">Тема</span>
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
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bookmark Header */}
          <button 
            onClick={() => toggleShelf(book.id)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-indigo-600 text-indigo-600' : ''}`} />
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full bg-black/5 dark:bg-white/5 h-1">
        <div className="bg-indigo-600 h-full transition-all" style={{ width: `${percent}%` }} />
      </div>

      {/* Reader Text Area */}
      <div className={`flex-1 overflow-y-auto px-4 sm:px-8 py-8 sm:py-12 reader-theme-${readerTheme}`}>
        <div className="max-w-2xl sm:max-w-3xl mx-auto space-y-8">
          
          <div className="text-center space-y-2 pb-6 border-b border-current/10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-700">
              {book.grade} КЛАСС
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight font-serif">{book.title}</h1>
            <p className="text-base opacity-75 font-serif italic">{book.author}</p>
            <div className="text-xs font-mono uppercase tracking-widest pt-2 font-bold text-indigo-600">
              {currentChapter.title}
            </div>
          </div>

          <article 
            className={`space-y-6 leading-relaxed select-text ${readerFontFamily === 'serif' ? 'font-serif' : 'font-sans'}`}
            style={{ fontSize: `${readerFontSize}px`, lineHeight: `${Math.round(readerFontSize * 1.65)}px` }}
          >
            {currentChapter.paragraphs.map((para, idx) => (
              <p key={idx} className="indent-6 sm:indent-8">{para}</p>
            ))}
          </article>

          {/* Next/Prev Navigation */}
          <div className="pt-8 pb-16 flex items-center justify-between border-t border-current/10">
            <button
              disabled={activeChapterIndex === 0}
              onClick={() => setChapterIndex(activeChapterIndex - 1)}
              className="px-4 py-2.5 rounded-xl border border-current/20 disabled:opacity-40 flex items-center gap-1.5 text-xs font-bold"
            >
              <ArrowLeft className="w-4 h-4" /> Назад
            </button>

            <span className="text-xs font-mono opacity-70">
              Глава {activeChapterIndex + 1} из {book.chapters.length}
            </span>

            <button
              onClick={() => {
                if (activeChapterIndex < book.chapters.length - 1) {
                  setChapterIndex(activeChapterIndex + 1);
                } else {
                  closeReader();
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white flex items-center gap-1.5 text-xs font-bold shadow-md"
            >
              {activeChapterIndex < book.chapters.length - 1 ? 'Дальше' : 'Завершить'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

    </div>
  );
};