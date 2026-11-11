'use client';

import React from 'react';
import { BOOKS } from '@/data/books';
import { useReadingStore } from '@/store/useReadingStore';
import { GradeFilter, CategoryFilter, SortOption } from '@/types/book';
import { Star, BookOpen, Bookmark, Info } from 'lucide-react';

export const BookCatalog: React.FC = () => {
  const { 
    activeTab, 
    gradeFilter, 
    categoryFilter, 
    searchQuery, 
    sortBy, 
    myShelfIds,
    openReader,
    toggleShelf,
    setGradeFilter,
    setCategoryFilter,
    setSortBy
  } = useReadingStore();

  const filteredBooks = React.useMemo(() => {
    return BOOKS.filter((book) => {
      if (activeTab === 'curriculum' && !book.curriculum) return false;
      if (activeTab === 'my-shelf' && !myShelfIds.includes(book.id)) return false;
      if (gradeFilter !== 'all' && book.grade !== gradeFilter) return false;
      if (categoryFilter !== 'all' && book.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mTitle = book.title.toLowerCase().includes(q);
        const mAuthor = book.author.toLowerCase().includes(q);
        const mCategory = book.categoryName.toLowerCase().includes(q);
        if (!mTitle && !mAuthor && !mCategory) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'grade') return a.grade.localeCompare(b.grade);
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return b.readersCount - a.readersCount;
    });
  }, [activeTab, gradeFilter, categoryFilter, searchQuery, sortBy, myShelfIds]);

  return (
    <div className="space-y-6">
      
      {/* Панель фильтров и сортировки */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        {/* Жанровые чипы */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(['all', 'classic', 'scifi', 'fairy', 'drama'] as CategoryFilter[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                categoryFilter === cat
                  ? 'bg-[#3F51B5] text-white shadow-sm'
                  : 'bg-[#EEF0FA] dark:bg-[#22252D] text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC]'
              }`}
            >
              {cat === 'all' && 'Все жанры'}
              {cat === 'classic' && 'Классика'}
              {cat === 'scifi' && 'Фантастика'}
              {cat === 'fairy' && 'Сказки и притчи'}
              {cat === 'drama' && 'Драматургия'}
            </button>
          ))}
        </div>

        {/* Выбор классов и сортировка */}
        <div className="flex items-center gap-3 text-xs self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-[#EEF0FA] dark:bg-[#22252D] p-1 rounded-full font-medium">
            {(['all', '5-7', '8-9', '10-11'] as GradeFilter[]).map((g) => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`px-3 py-1 rounded-full transition-all ${
                  gradeFilter === g
                    ? 'bg-white dark:bg-[#343844] text-[#191C20] dark:text-white font-bold shadow-sm'
                    : 'text-[#74777F] dark:text-[#90939C] hover:text-black dark:hover:text-white'
                }`}
              >
                {g === 'all' ? 'Все' : `${g} кл`}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-[#EEF0FA] dark:bg-[#22252D] text-[#191C20] dark:text-[#E2E2E9] rounded-xl px-3 py-1.5 border-none outline-none font-medium cursor-pointer"
          >
            <option value="popular">По популярности</option>
            <option value="grade">По классам</option>
            <option value="title">По алфавиту</option>
          </select>
        </div>

      </div>

      {/* Сетка книг */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBooks.map((book) => {
          const isBookmarked = myShelfIds.includes(book.id);

          return (
            <div 
              key={book.id}
              className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-5 border border-[#E0E2EC]/60 dark:border-[#2F323D] shadow-sm hover:shadow-m3-2 transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#E0E0FF] text-[#00105C] dark:bg-[#2A3048] dark:text-[#C5CAE9]">
                    {book.grade} класс
                  </span>
                  <span className="text-xs text-[#74777F] dark:text-[#90939C] flex items-center gap-1 font-mono">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    {book.rating}
                  </span>
                </div>

                <div className="flex gap-4 items-start mb-4">
                  {/* 3D-обложка с инлайн-градиентом */}
                  <div 
                    onClick={() => openReader(book.id)}
                    style={{ background: book.coverGradient }}
                    className="w-24 sm:w-28 aspect-[2/3] shrink-0 rounded-r-lg rounded-l-sm shadow-book group-hover:shadow-book-hover transition-all book-spine-effect p-2.5 flex flex-col justify-between text-white cursor-pointer select-none border-y border-r border-white/20"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-mono opacity-80 uppercase tracking-wider">ФГОС</span>
                      <span className="text-[8px] font-bold opacity-75">★</span>
                    </div>

                    <div className="my-auto text-center py-1">
                      <div className="text-[9px] font-medium text-white/90 line-clamp-1 drop-shadow-sm">
                        {book.author}
                      </div>
                      <div className="font-serif text-xs font-bold leading-tight mt-0.5 drop-shadow-sm line-clamp-2">
                        {book.title}
                      </div>
                    </div>

                    <div className="border-t border-white/20 pt-1 flex justify-between items-center text-[8px] font-mono opacity-80">
                      <span>Лицей</span>
                      <span>{book.year}</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#3F51B5] dark:text-[#A5B4FC]">
                      {book.categoryName}
                    </span>
                    <h3 
                      onClick={() => openReader(book.id)}
                      className="font-extrabold text-base text-[#191C20] dark:text-[#E2E2E9] group-hover:text-[#3F51B5] transition-colors cursor-pointer"
                    >
                      {book.title}
                    </h3>
                    <div className="text-xs text-[#74777F] dark:text-[#90939C]">{book.author}</div>
                    <p className="text-xs text-[#44474F] dark:text-[#A6A9B4] line-clamp-2 leading-relaxed pt-1">
                      {book.synopsis}
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-[#F8F9FE] dark:bg-[#232630] text-[11px] text-[#44474F] dark:text-[#90939C] flex items-center gap-2 mb-4">
                  <Info className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="line-clamp-1">{book.teacherNote}</span>
                </div>
              </div>

              {/* Кнопки действий */}
              <div className="flex items-center gap-2 pt-2 border-t border-[#E0E2EC]/40 dark:border-[#2F323D]">
                <button
                  onClick={() => openReader(book.id)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Читать онлайн</span>
                </button>

                <button
                  onClick={() => toggleShelf(book.id)}
                  className="w-10 h-10 rounded-xl bg-[#EEF0FA] dark:bg-[#262934] hover:bg-[#E0E2EC] dark:hover:bg-[#313543] text-[#44474F] dark:text-[#C4C7D0] flex items-center justify-center transition-all"
                  title={isBookmarked ? 'Удалить из полки' : 'Сохранить на полку'}
                >
                  <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-indigo-600 text-indigo-600 dark:fill-indigo-400 dark:text-indigo-400' : ''}`} />
                </button>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
