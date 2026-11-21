'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useReadingStore } from '@/store/useReadingStore';
import { Book, GradeFilter, CategoryFilter, SortOption } from '@/types/book';
import { fetchBooksMetadata, getCachedBooks } from '@/lib/booksService';
import {
  Star,
  BookOpen,
  Bookmark,
  Info,
  GraduationCap,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

function shuffleBooks(items: Book[]): Book[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

  const [dbBooks, setDbBooks] = useState<Book[]>(() => {
    const cached = getCachedBooks();
    return cached ? shuffleBooks(cached) : [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => !getCachedBooks());
  const [isSlowLoading, setIsSlowLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadBooks = useCallback(async (force = false) => {
    setIsLoading(true);
    setLoadError(false);
    setIsSlowLoading(false);

    const slowTimer = window.setTimeout(() => {
      setIsSlowLoading(true);
    }, 3500);

    try {
      const books = await fetchBooksMetadata({ force });
      setDbBooks(shuffleBooks(books));
    } catch (err) {
      console.error('Ошибка загрузки книг:', err);
      setLoadError(true);
    } finally {
      window.clearTimeout(slowTimer);
      setIsLoading(false);
      setIsSlowLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedBooks();
    if (cached) {
      setDbBooks(shuffleBooks(cached));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(false);
    setIsSlowLoading(false);

    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setIsSlowLoading(true);
    }, 3500);

    fetchBooksMetadata()
      .then((books) => {
        if (!cancelled) {
          setDbBooks(shuffleBooks(books));
        }
      })
      .catch((err) => {
        console.error('Ошибка загрузки книг:', err);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
        if (!cancelled) {
          setIsLoading(false);
          setIsSlowLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, []);

  const allBooks = useMemo(() => {
    const byId = new Map<string, Book>();
    for (const b of dbBooks) {
      if (!byId.has(b.id)) {
        byId.set(b.id, b);
      }
    }
    return Array.from(byId.values());
  }, [dbBooks]);

  const filteredBooks = useMemo(() => {
    const result = allBooks.filter((book) => {
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
    });

    // Если выбрана явная сортировка (по классам или алфавиту) — сортируем, иначе сохраняем случайный порядок
    if (sortBy === 'grade') return [...result].sort((a, b) => a.grade.localeCompare(b.grade));
    if (sortBy === 'title') return [...result].sort((a, b) => a.title.localeCompare(b.title));
    return result;
  }, [allBooks, activeTab, gradeFilter, categoryFilter, searchQuery, sortBy, myShelfIds]);

  return (
    <div className="space-y-6">
      
      {/* Фильтры и жанры */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(['all', 'classic', 'scifi', 'adventure', 'fairy', 'drama'] as CategoryFilter[]).map((cat) => (
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
              {cat === 'adventure' && 'Приключения'}
              {cat === 'fairy' && 'Сказки и притчи'}
              {cat === 'drama' && 'Драматургия'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-[#EEF0FA] dark:bg-[#22252D] p-1 rounded-full font-medium">
            {(['all', '5-7', '8-9', '10-11'] as GradeFilter[]).map((g) => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`px-3 py-1 rounded-full transition-all ${
                  gradeFilter === g
                    ? 'bg-white dark:bg-[#343844] text-[#191C20] dark:text-white font-bold shadow-sm'
                    : 'text-[#74777F] dark:text-[#90939C]'
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
            <option value="popular">Случайный порядок</option>
            <option value="grade">По классам</option>
            <option value="title">По алфавиту</option>
          </select>
        </div>
      </div>

      {/* Сетка книг */}
      {isLoading ? (
        <div className="space-y-5">
          {/* Понятное уведомление пользователю во время загрузки */}
          <div className="bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-[24px] px-5 py-4 flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-[#3F51B5] text-white flex items-center justify-center shrink-0 shadow-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-[#191C20] dark:text-white">
                Загружаем каталог библиотеки, пожалуйста, подождите…
              </div>
              <p className="text-xs text-[#44474F] dark:text-[#C4C7D0] mt-0.5">
                {isSlowLoading
                  ? 'Интернет немного медленный, не закрывайте страницу — книги уже почти готовы.'
                  : 'Подготавливаем список книг — это займёт всего пару секунд.'}
              </p>
            </div>
          </div>

          {/* Карточки-скелетоны */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-[#1C1F26] rounded-[28px] p-5 border border-[#E0E2EC]/60 dark:border-[#2F323D] shadow-sm space-y-4 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="h-5 w-20 rounded-full bg-[#EEF0FA] dark:bg-[#262934]" />
                  <div className="h-4 w-10 rounded-full bg-[#EEF0FA] dark:bg-[#262934]" />
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-24 sm:w-28 aspect-[2/3] shrink-0 rounded-r-lg rounded-l-sm bg-[#EEF0FA] dark:bg-[#262934]" />
                  <div className="flex-1 space-y-2.5 pt-1">
                    <div className="h-3 w-24 rounded-full bg-[#EEF0FA] dark:bg-[#262934]" />
                    <div className="h-5 w-full rounded-lg bg-[#EEF0FA] dark:bg-[#262934]" />
                    <div className="h-3.5 w-2/3 rounded-lg bg-[#EEF0FA] dark:bg-[#262934]" />
                    <div className="h-3 w-full rounded-lg bg-[#EEF0FA] dark:bg-[#262934]" />
                    <div className="h-3 w-4/5 rounded-lg bg-[#EEF0FA] dark:bg-[#262934]" />
                  </div>
                </div>
                <div className="h-9 w-full rounded-2xl bg-[#F4F6FD] dark:bg-[#232630]" />
                <div className="flex gap-2 pt-2 border-t border-[#E0E2EC]/40 dark:border-[#2F323D]">
                  <div className="h-10 flex-1 rounded-xl bg-[#EEF0FA] dark:bg-[#262934]" />
                  <div className="h-10 w-10 rounded-xl bg-[#EEF0FA] dark:bg-[#262934]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : loadError && allBooks.length === 0 ? (
        <div className="py-12 px-6 bg-white dark:bg-[#1C1F26] rounded-[28px] border border-[#E0E2EC]/70 dark:border-[#2F323D] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-extrabold text-[#191C20] dark:text-white">
              Не удалось загрузить каталог книг
            </div>
            <p className="text-xs text-[#74777F] dark:text-[#90939C]">
              Проверьте подключение к интернету и попробуйте обновить список.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadBooks(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold shadow-sm transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Попробовать снова</span>
          </button>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500">
          В этом разделе пока нет книг.
        </div>
      ) : (
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
                    {book.curriculum && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 flex items-center gap-1">
                        <GraduationCap className="w-3 h-3" /> Программа
                      </span>
                    )}
                    <span className="text-xs text-[#74777F] dark:text-[#90939C] flex items-center gap-1 font-mono ml-auto">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      {book.rating}
                    </span>
                  </div>

                  <div className="flex gap-4 items-start mb-4">
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
                    <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-indigo-600 text-indigo-600' : ''}`} />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
