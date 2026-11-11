'use client';

import React from 'react';
import { BookOpen, Search, Flame, Moon, Sun, X } from 'lucide-react';
import { useReadingStore } from '@/store/useReadingStore';

export const Header: React.FC = () => {
  const { searchQuery, setSearchQuery, setActiveTab } = useReadingStore();
  const [isDark, setIsDark] = React.useState(false);

  const toggleDark = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F8F9FE]/85 dark:bg-[#111318]/85 backdrop-blur-md border-b border-[#E0E2EC]/60 dark:border-[#44474F]/40 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div 
          className="flex items-center gap-3 cursor-pointer select-none" 
          onClick={() => setActiveTab('all')}
        >
          <div className="w-12 h-12 rounded-[20px] bg-gradient-to-tr from-[#3F51B5] via-[#5C6BC0] to-[#8C9EFF] flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-xl tracking-tight text-[#191C20] dark:text-[#E2E2E9]">
                Lumen<span className="text-[#3F51B5] dark:text-[#A5B4FC]">Lib</span>
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-[#E0E0FF] text-[#00105C] dark:bg-[#283593] dark:text-[#C5CAE9] rounded-full">
                Лицей №1535
              </span>
            </div>
            <p className="text-xs text-[#74777F] dark:text-[#C4C7D0] font-medium">Школьная медиатека и открытая читальня</p>
          </div>
        </div>

        {/* Search Input */}
        <div className="hidden md:flex flex-1 max-w-md mx-6">
          <div className="w-full flex items-center gap-3 bg-[#EEF0FA] dark:bg-[#22252D] rounded-full px-5 py-2.5 focus-within:ring-2 focus-within:ring-[#3F51B5] focus-within:bg-white dark:focus-within:bg-[#1E2028] transition-all shadow-inner border border-transparent focus-within:border-[#3F51B5]/30">
            <Search className="w-5 h-5 text-[#74777F]" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по автору, книге или эпохе..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder-[#74777F] text-[#191C20] dark:text-[#E2E2E9]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#74777F] hover:text-black dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Actions & Student profile */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFF3E0] dark:bg-[#3E2723] text-[#E65100] dark:text-[#FFB74D] border border-[#FFE082]/40 text-xs font-bold">
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
            <span>14 дней стрик</span>
          </div>

          <button 
            onClick={toggleDark}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC]/50 dark:hover:bg-[#282B33] transition-colors"
            title="Переключить тему"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-[#E0E2EC] dark:border-[#44474F]/40">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-white dark:ring-[#22252D]">
              МС
            </div>
            <div className="hidden lg:block text-left text-xs leading-tight">
              <div className="font-bold text-[#191C20] dark:text-[#E2E2E9]">Михаил С.</div>
              <div className="text-[#74777F] dark:text-[#90939C]">10 «А» класс</div>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
};