'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, Bookmark, BookOpen, Trophy, RefreshCw } from 'lucide-react';
import { useReadingStore } from '@/store/useReadingStore';
import { supabase } from '@/lib/supabase';
import { BOOKS } from '@/data/books';
import { Book } from '@/types/book';

interface QuoteItem {
  text: string;
  author: string;
  work: string;
  book_id: string | null;
}

export const HeroBento: React.FC = () => {
  const { openReader, toggleShelf, myShelfIds, setActiveTab, readingProgress } = useReadingStore();

  const [featuredBook, setFeaturedBook] = useState<Book | null>(null);

  const [quotes, setQuotes] = useState<QuoteItem[]>([
    {
      text: 'Береги честь смолоду, а платье снову...',
      author: 'А.С. Пушкин',
      work: '«Капитанская дочка»',
      book_id: null,
    },
  ]);
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    // 1. Загрузка книги недели из Supabase
    async function fetchFeaturedBook() {
      try {
        const { data } = await supabase
          .from('books')
          .select('*')
          .order('created_at', { ascending: true });

        if (data && data.length > 0) {
          // Ищем закрепленную книгу (is_featured) или выбираем по номеру недели
          const weekNumber = Math.floor(Date.now() / (7 * 86400000));
          const raw = data.find((b) => b.is_featured) || data[weekNumber % data.length];

          const mapped: Book = {
            id: raw.id,
            title: raw.title,
            author: raw.author,
            year: raw.year || 1850,
            grade: raw.grade || '10-11',
            category: raw.category || 'classic',
            categoryName: raw.category_name || 'Русская классика',
            readTime: '2.5 ч',
            readersCount: 1,
            rating: 5.0,
            curriculum: Boolean(raw.curriculum),
            coverGradient: raw.cover_gradient || 'linear-gradient(135deg, #8E2800 0%, #C84B12 50%, #F37021 100%)',
            accentColor: '#3B82F6',
            synopsis: raw.synopsis || `Произведение «${raw.title}» автора ${raw.author}.`,
            teacherNote: raw.curriculum ? 'Входит в школьную программу' : 'Внеклассное чтение',
            audioSample: '',
            chapters: (raw.chapters && raw.chapters.length > 0)
              ? raw.chapters
              : [{ title: 'Часть I', paragraphs: [raw.synopsis || 'Текст произведения.'] }],
          };

          if (!BOOKS.find((existing) => existing.id === mapped.id)) {
            BOOKS.push(mapped);
          }

          setFeaturedBook(mapped);
        }
      } catch (err) {
        console.error('Ошибка загрузки книги недели:', err);
      }
    }

    // 2. Загрузка цитаты дня из Supabase
    async function fetchQuotes() {
      try {
        const { data } = await supabase
          .from('quotes')
          .select('text, author, work, book_id')
          .order('created_at', { ascending: true });

        if (data && data.length > 0) {
          setQuotes(data);
          const dayNumber = Math.floor(Date.now() / 86400000);
          setQuoteIdx(dayNumber % data.length);
        }
      } catch (err) {
        console.error('Ошибка загрузки цитат:', err);
      }
    }

    fetchFeaturedBook();
    fetchQuotes();
  }, []);

  const currentQuote = quotes[quoteIdx] || quotes[0];
  const isBookmarked = featuredBook ? myShelfIds.includes(featuredBook.id) : false;
  const startedCount = Object.keys(readingProgress).length;

  const handleNextQuote = () => {
    if (quotes.length > 1) {
      setQuoteIdx((prev) => (prev + 1) % quotes.length);
    }
  };

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-5">
      
      {/* 1. Произведение недели (из Supabase) */}
      <div className="lg:col-span-7 bg-gradient-to-br from-[#1C244B] via-[#232E66] to-[#344182] text-white rounded-[32px] p-6 sm:p-8 relative overflow-hidden shadow-xl flex flex-col justify-between group">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        
        {featuredBook ? (
          <>
            <div className="relative z-10">
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/15 backdrop-blur-md text-[#FFE082] border border-white/10">
                  <Sparkles className="w-3.5 h-3.5" /> Произведение недели
                </span>
                <span className="text-xs text-white/70 font-mono">
                  {featuredBook.grade} класс • {featuredBook.categoryName}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                <div className="sm:col-span-5 flex justify-center">
                  <div
                    onClick={() => openReader(featuredBook.id)}
                    style={{ background: featuredBook.coverGradient }}
                    className="w-36 sm:w-44 aspect-[2/3] rounded-r-xl rounded-l-md shadow-book group-hover:shadow-book-hover transition-all duration-300 book-spine-effect p-4 flex flex-col justify-between text-white border-y border-r border-white/20 transform -rotate-1 group-hover:rotate-0 cursor-pointer"
                  >
                    <span className="text-[10px] tracking-widest font-mono text-white/80 uppercase">NGS • ФГОС</span>
                    <div className="my-auto text-center py-2">
                      <div className="text-[11px] font-medium text-amber-100 uppercase tracking-wider mb-1 line-clamp-2">
                        {featuredBook.author}
                      </div>
                      <div className="font-serif text-lg font-bold leading-tight line-clamp-3">
                        {featuredBook.title}
                      </div>
                    </div>
                    <div className="border-t border-white/20 pt-2 flex items-center justify-between text-[9px] text-white/70 font-mono">
                      <span>{featuredBook.grade} кл</span>
                      <span>{featuredBook.chapters.length} гл.</span>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-7 space-y-3">
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug">
                    «{featuredBook.title}»
                  </h2>
                  <p className="text-sm text-indigo-100/85 line-clamp-3 font-normal leading-relaxed">
                    {featuredBook.synopsis}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button 
                      onClick={() => openReader(featuredBook.id)}
                      className="px-5 py-3 rounded-2xl bg-white text-[#1C244B] font-bold text-sm hover:bg-amber-100 transition-all flex items-center gap-2 shadow-lg shadow-black/10 active:scale-95"
                    >
                      <BookOpen className="w-4 h-4 text-indigo-700" />
                      Начать читать сейчас
                    </button>
                    <button 
                      onClick={() => toggleShelf(featuredBook.id)}
                      className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white transition-all active:scale-95"
                      title="Сохранить в Мою полку"
                    >
                      <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-white' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/15 flex items-center justify-between text-xs text-indigo-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{featuredBook.teacherNote}</span>
              </div>
              <span className="font-mono text-[11px] text-white/60">
                Доступно глав: {featuredBook.chapters.length}
              </span>
            </div>
          </>
        ) : (
          <div className="my-auto py-12 text-center text-sm text-indigo-200">
            Загрузка произведения недели...
          </div>
        )}
      </div>

      {/* 2. Книжный спринт ученика */}
      <div className="lg:col-span-3 bg-[#EEF0FA] dark:bg-[#1E2028] rounded-[32px] p-6 flex flex-col justify-between border border-[#E0E2EC]/50 dark:border-[#333640]">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Trophy className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              В процессе: {startedCount}
            </span>
          </div>

          <h3 className="text-lg font-bold text-[#191C20] dark:text-[#E2E2E9] mb-1">
            Читательский дневник
          </h3>
          <p className="text-xs text-[#74777F] dark:text-[#90939C] mb-4">
            В закладках: {myShelfIds.length} • Начато книг: {startedCount}
          </p>

          <div className="space-y-1.5 mb-5">
            <div className="w-full bg-[#E0E2EC] dark:bg-[#323640] h-3 rounded-full overflow-hidden p-0.5">
              <div
                className="bg-gradient-to-r from-[#3F51B5] to-[#8C9EFF] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(10, startedCount * 20))}%` }}
              />
            </div>
          </div>
        </div>

        <button 
          onClick={() => setActiveTab('curriculum')}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#3F51B5] dark:text-[#A5B4FC] bg-[#3F51B5]/10 hover:bg-[#3F51B5]/20 transition-all flex items-center justify-center gap-1"
        >
          <span>Список программы</span>
        </button>
      </div>

      {/* 3. Цитата дня (из Supabase) */}
      <div className="lg:col-span-2 bg-gradient-to-b from-[#FFF8E1] to-[#FFE082]/40 dark:from-[#2A2312] dark:to-[#1E190D] rounded-[32px] p-6 flex flex-col justify-between border border-[#FFE082]/60 dark:border-[#FFD54F]/20">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Цитата дня
            </span>
            {quotes.length > 1 && (
              <button
                onClick={handleNextQuote}
                className="w-6 h-6 rounded-full flex items-center justify-center text-amber-800/70 dark:text-amber-300/70 hover:bg-amber-900/10 transition-colors"
                title="Другая цитата"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <blockquote className="font-serif italic text-sm text-[#3E2723] dark:text-[#FFE082] leading-relaxed my-3">
            «{currentQuote.text}»
          </blockquote>
          <div className="text-xs font-bold text-[#5D4037] dark:text-[#FFCA28]">{currentQuote.author}</div>
          <div className="text-[11px] text-[#8D6E63] dark:text-[#BCAAA4]">{currentQuote.work}</div>
        </div>
      </div>

    </section>
  );
};
