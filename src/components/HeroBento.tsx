'use client';

import React from 'react';
import { Sparkles, Bookmark, BookOpen, Clock, Users, Trophy } from 'lucide-react';
import { useReadingStore } from '@/store/useReadingStore';

export const HeroBento: React.FC = () => {
  const { openReader, toggleShelf, myShelfIds, setActiveTab } = useReadingStore();
  const isBookmarked = myShelfIds.includes('hero-our-time');

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-5">
      
      {/* 1. Featured Book Bento Card */}
      <div className="lg:col-span-7 bg-gradient-to-br from-[#1C244B] via-[#232E66] to-[#344182] text-white rounded-[32px] p-6 sm:p-8 relative overflow-hidden shadow-xl flex flex-col justify-between group">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/15 backdrop-blur-md text-[#FFE082] border border-white/10">
              <Sparkles className="w-3.5 h-3.5" /> Произведение недели
            </span>
            <span className="text-xs text-white/70 font-mono">10 класс • ФГОС</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
            {/* 3D Book Cover */}
            <div className="sm:col-span-5 flex justify-center">
              <div className="w-36 sm:w-44 aspect-[2/3] rounded-r-xl rounded-l-md bg-gradient-to-tr from-[#8E2800] via-[#C84B12] to-[#F37021] shadow-book group-hover:shadow-book-hover transition-all duration-300 book-spine-effect p-4 flex flex-col justify-between text-white border-y border-r border-white/20 transform -rotate-1 group-hover:rotate-0">
                <span className="text-[10px] tracking-widest font-mono text-white/80 uppercase">Школьная серия</span>
                <div className="my-auto text-center py-2">
                  <div className="text-[11px] font-medium text-amber-100 uppercase tracking-wider mb-1">М.Ю. Лермонтов</div>
                  <div className="font-serif text-lg font-bold leading-tight">Герой нашего времени</div>
                </div>
                <div className="border-t border-white/20 pt-2 flex items-center justify-between text-[9px] text-white/70 font-mono">
                  <span>ФГОС • ЕГЭ</span>
                  <span>1840 г.</span>
                </div>
              </div>
            </div>

            {/* Synopsis & CTA */}
            <div className="sm:col-span-7 space-y-3">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug">
                «Герой нашего времени»
              </h2>
              <p className="text-sm text-indigo-100/85 line-clamp-3 font-normal leading-relaxed">
                Первый в русской прозе социально-психологический роман. Загадка сложной натуры Григория Печорина, Кавказские хроники, дуэли и поиск своего предназначения.
              </p>

              <div className="flex items-center gap-4 text-xs text-white/80 pt-1">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-300" />
                  <span>~3.5 ч. чтения</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-emerald-300" />
                  <span>142 ученика читают</span>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => openReader('hero-our-time')}
                  className="px-5 py-3 rounded-2xl bg-white text-[#1C244B] font-bold text-sm hover:bg-amber-100 transition-all flex items-center gap-2 shadow-lg shadow-black/10 active:scale-95"
                >
                  <BookOpen className="w-4 h-4 text-indigo-700" />
                  Начать читать сейчас
                </button>
                <button 
                  onClick={() => toggleShelf('hero-our-time')}
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
            <span>Изучается прямо сейчас в 10 «А» и 10 «Б»</span>
          </div>
          <span className="font-mono text-[11px] text-white/60">Главы 1–2 доступны</span>
        </div>
      </div>

      {/* 2. Student Progress Widget */}
      <div className="lg:col-span-3 bg-[#EEF0FA] dark:bg-[#1E2028] rounded-[32px] p-6 flex flex-col justify-between border border-[#E0E2EC]/50 dark:border-[#333640]">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Trophy className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              Цель: 82%
            </span>
          </div>

          <h3 className="text-lg font-bold text-[#191C20] dark:text-[#E2E2E9] mb-1">
            Книжный спринт четверти
          </h3>
          <p className="text-xs text-[#74777F] dark:text-[#90939C] mb-4">
            Прочитано 9 из 11 запланированных книг
          </p>

          <div className="space-y-1.5 mb-5">
            <div className="w-full bg-[#E0E2EC] dark:bg-[#323640] h-3 rounded-full overflow-hidden p-0.5">
              <div className="bg-gradient-to-r from-[#3F51B5] to-[#8C9EFF] h-full rounded-full transition-all duration-500" style={{ width: '82%' }} />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-[#74777F] dark:text-[#90939C]">
              <span>9 книг завершено</span>
              <span>Осталось 2</span>
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

      {/* 3. Quote of the Day */}
      <div className="lg:col-span-2 bg-gradient-to-b from-[#FFF8E1] to-[#FFE082]/40 dark:from-[#2A2312] dark:to-[#1E190D] rounded-[32px] p-6 flex flex-col justify-between border border-[#FFE082]/60 dark:border-[#FFD54F]/20">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Цитата дня
          </span>
          <blockquote className="font-serif italic text-sm text-[#3E2723] dark:text-[#FFE082] leading-relaxed my-3">
            «Береги честь смолоду, а платье снову...»
          </blockquote>
          <div className="text-xs font-bold text-[#5D4037] dark:text-[#FFCA28]">А.С. Пушкин</div>
          <div className="text-[11px] text-[#8D6E63] dark:text-[#BCAAA4]">«Капитанская дочка»</div>
        </div>

        <button 
          onClick={() => openReader('captains-daughter')}
          className="w-full mt-4 py-2 px-3 rounded-xl bg-amber-900 text-white dark:bg-amber-400 dark:text-[#3E2723] text-xs font-bold hover:opacity-95 transition-all"
        >
          Читать повесть
        </button>
      </div>

    </section>
  );
};