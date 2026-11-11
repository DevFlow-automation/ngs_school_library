'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Bookmark } from 'lucide-react';

// Изолируем ePub-ридер от серверного рендеринга Vercel
const ReactReader = dynamic(
  () => import('react-reader').then((mod) => mod.ReactReader),
  { ssr: false }
);

interface EpubReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  author: string;
  epubUrl: string; // Ссылка на файл из Supabase Storage
}

export const EpubReaderModal: React.FC<EpubReaderModalProps> = ({
  isOpen,
  onClose,
  title,
  author,
  epubUrl,
}) => {
  const [location, setLocation] = useState<string | number>(0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#121318]">
      {/* Шапка ридера */}
      <header className="h-14 px-4 sm:px-6 flex items-center justify-between border-b border-black/10 dark:border-white/10 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm font-extrabold truncate max-w-xs sm:max-w-md">{title}</h2>
            <p className="text-xs text-gray-500 truncate">{author}</p>
          </div>
        </div>
      </header>

      {/* Окно чтения ePub */}
      <div className="flex-1 relative w-full h-full bg-[#FAF8F5] dark:bg-[#181920]">
        <ReactReader
          url={epubUrl}
          location={location}
          locationChanged={(epubCfi: string) => {
            setLocation(epubCfi);
            // Сохраняем прогресс локально
            try {
              localStorage.setItem(`lumenlib_cfi_${title}`, epubCfi);
            } catch (e) {}
          }}
          epubOptions={{
            flow: 'paginated',
            width: '100%',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
};
