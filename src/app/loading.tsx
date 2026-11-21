import React from 'react';
import { BookOpen, Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#F8F9FE] dark:bg-[#111318]">
      <div className="bg-white dark:bg-[#1C1F26] border border-[#E0E2EC]/80 dark:border-[#2F323D] rounded-[28px] px-7 py-6 shadow-sm max-w-sm w-full text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#3F51B5] via-[#5C6BC0] to-[#8C9EFF] text-white flex items-center justify-center mx-auto shadow-md shadow-indigo-500/20">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="flex items-center justify-center gap-2 text-sm font-extrabold text-[#191C20] dark:text-white">
          <Loader2 className="w-4 h-4 text-[#3F51B5] dark:text-[#A5B4FC] animate-spin" />
          <span>Загружаем NGS Библиотеку…</span>
        </div>
        <p className="text-xs text-[#74777F] dark:text-[#90939C] leading-relaxed">
          Пожалуйста, подождите пару секунд — страница скоро откроется.
        </p>
      </div>
    </div>
  );
}
