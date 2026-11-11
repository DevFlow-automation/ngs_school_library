'use client';

import React from 'react';
import { Header } from '@/components/Header';
import { HeroBento } from '@/components/HeroBento';
import { BookCatalog } from '@/components/BookCatalog';
import { ReaderModal } from '@/components/ReaderModal';
import { useReadingStore } from '@/store/useReadingStore';
import { BookOpen, School, Bookmark } from 'lucide-react';

export default function Home() {
  const { activeTab, setActiveTab, myShelfIds } = useReadingStore();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button 
            onClick={() => setActiveTab('all')}
            className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'all'
                ? 'bg-[#3F51B5] text-white shadow-md shadow-indigo-500/20'
                : 'bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Все книги
          </button>

          <button 
            onClick={() => setActiveTab('curriculum')}
            className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'curriculum'
                ? 'bg-[#3F51B5] text-white shadow-md shadow-indigo-500/20'
                : 'bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC]'
            }`}
          >
            <School className="w-4 h-4" />
            Школьная программа
          </button>

          <button 
            onClick={() => setActiveTab('my-shelf')}
            className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'my-shelf'
                ? 'bg-[#3F51B5] text-white shadow-md shadow-indigo-500/20'
                : 'bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC]'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            Моя полка ({myShelfIds.length})
          </button>
        </div>

        {/* Hero Bento */}
        {activeTab !== 'my-shelf' && <HeroBento />}

        {/* Main Catalog Section */}
        <BookCatalog />

      </main>

      {/* Online Reader Zen Modal */}
      <ReaderModal />

      {/* Footer */}
      <footer className="bg-[#EEF0FA] dark:bg-[#16181F] border-t border-[#E0E2EC] dark:border-[#2B2E38] mt-12 py-8 text-xs text-[#74777F] dark:text-[#90939C]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#3F51B5] text-white flex items-center justify-center font-bold">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-[#191C20] dark:text-[#E2E2E9]">LumenLib</span> • Цифровая образовательная платформа школы
            </div>
          </div>
          <div className="flex items-center gap-6">
            <span>Next.js 14 App Router</span>
            <span>Tailwind CSS</span>
            <span>TypeScript</span>
            <span>Vercel Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}