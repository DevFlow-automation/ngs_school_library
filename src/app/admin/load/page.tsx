'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Upload, CheckCircle2, FileText, Sparkles, Palette,
  Search, Trash2, Edit3, X, Plus, BookOpen, AlertTriangle,
  Quote, GraduationCap, Users, Lock, LogOut
} from 'lucide-react';

const COVER_GRADIENTS = [
  { name: 'Индиго', value: 'linear-gradient(135deg, #1E1B4B 0%, #4338CA 50%, #6366F1 100%)' },
  { name: 'Бордовый', value: 'linear-gradient(135deg, #881337 0%, #E11D48 50%, #FB7185 100%)' },
  { name: 'Изумруд', value: 'linear-gradient(135deg, #064E3B 0%, #059669 50%, #10B981 100%)' },
  { name: 'Янтарный', value: 'linear-gradient(135deg, #7C2D12 0%, #EA580C 50%, #FBBF24 100%)' },
  { name: 'Пурпурный', value: 'linear-gradient(135deg, #581C87 0%, #9333EA 50%, #C084FC 100%)' },
  { name: 'Сапфир', value: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0284C7 100%)' },
  { name: 'Малахит', value: 'linear-gradient(135deg, #134E4A 0%, #0D9488 50%, #2DD4BF 100%)' },
  { name: 'Шоколад', value: 'linear-gradient(135deg, #451A03 0%, #78350F 50%, #B45309 100%)' },
];

const CATEGORY_MAP: Record<string, string> = {
  classic: 'Русская классика',
  scifi: 'Фантастика',
  adventure: 'Приключения',
  fairy: 'Сказки и притчи',
  drama: 'Драматургия',
};

interface DbBook {
  id: string;
  title: string;
  author: string;
  grade: string;
  category: string;
  category_name: string;
  synopsis: string;
  cover_gradient: string;
  curriculum?: boolean;
  chapters?: any[];
  created_at?: string;
}

interface DbQuote {
  id: string;
  text: string;
  author: string;
  work: string;
  book_id: string | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  grade_class: string;
  created_at: string;
  reading_progress: {
    id: string;
    book_id: string;
    is_bookmarked: boolean;
    current_chapter: number;
    current_page: number;
    progress_percent: number;
    last_read_at: string;
  }[];
}

export default function AdminDashboardPage() {
  // Авторизация админа
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  // Вкладки
  const [activeMode, setActiveMode] = useState<'manage' | 'add' | 'quotes' | 'students'>('manage');

  // Книги
  const [booksList, setBooksList] = useState<DbBook[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingBook, setEditingBook] = useState<DbBook | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingBook, setDeletingBook] = useState<DbBook | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Добавление книги
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [grade, setGrade] = useState('10-11');
  const [category, setCategory] = useState('classic');
  const [synopsis, setSynopsis] = useState('');
  const [isCurriculum, setIsCurriculum] = useState(false);
  const [selectedGradient, setSelectedGradient] = useState(COVER_GRADIENTS[0].value);
  const [parsedChapters, setParsedChapters] = useState<{ title: string; paragraphs: string[] }[]>([]);
  const [fileName, setFileName] = useState('');
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Цитаты
  const [quotesList, setQuotesList] = useState<DbQuote[]>([]);
  const [quoteText, setQuoteText] = useState('');
  const [quoteAuthor, setQuoteAuthor] = useState('');
  const [quoteWork, setQuoteWork] = useState('');
  const [isAddingQuote, setIsAddingQuote] = useState(false);

  // Ученики и прогресс
  const [studentsList, setStudentsList] = useState<StudentRow[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  const fetchBooks = async () => {
    setIsLoadingList(true);
    try {
      const { data } = await supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setBooksList(data);
    } finally {
      setIsLoadingList(false);
    }
  };

  const fetchQuotes = async () => {
    const { data } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setQuotesList(data);
  };

  const fetchActivity = async () => {
    const { data } = await supabase
      .from('students')
      .select('*, reading_progress(*)')
      .order('created_at', { ascending: false });
    if (data) setStudentsList(data);
  };

  useEffect(() => {
    try {
      if (sessionStorage.getItem('ngs_admin_auth') === 'true') {
        setIsAuthorized(true);
      }
    } catch {}
    fetchBooks();
    fetchQuotes();
    fetchActivity();
  }, []);

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return booksList;
    const q = searchQuery.toLowerCase();
    return booksList.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.synopsis && b.synopsis.toLowerCase().includes(q))
    );
  }, [booksList, searchQuery]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return studentsList;
    const q = studentSearch.toLowerCase();
    return studentsList.filter(
      (st) =>
        st.full_name.toLowerCase().includes(q) ||
        st.grade_class.toLowerCase().includes(q)
    );
  }, [studentsList, studentSearch]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCheckingAuth(true);
    setAuthError('');

    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });

      if (res.ok) {
        try {
          sessionStorage.setItem('ngs_admin_auth', 'true');
        } catch {}
        setIsAuthorized(true);
        setAdminPassword('');
      } else {
        setAuthError('Неверный пароль администратора');
      }
    } catch {
      setAuthError('Ошибка сети при проверке пароля');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleAdminLogout = () => {
    try {
      sessionStorage.removeItem('ngs_admin_auth');
    } catch {}
    setIsAuthorized(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const randomGrad = COVER_GRADIENTS[Math.floor(Math.random() * COVER_GRADIENTS.length)].value;
    setSelectedGradient(randomGrad);

    const text = await file.text();

    if (file.name.endsWith('.fb2') || text.includes('<?xml') || text.includes('<FictionBook')) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');

        const titleInfo = xmlDoc.querySelector('description > title-info');
        const bookTitle = titleInfo?.querySelector('book-title')?.textContent?.trim() || file.name.replace(/\.[^/.]+$/, '');

        const authorEl = titleInfo?.querySelector('author');
        const firstName = authorEl?.querySelector('first-name')?.textContent?.trim() || '';
        const middleName = authorEl?.querySelector('middle-name')?.textContent?.trim() || '';
        const lastName = authorEl?.querySelector('last-name')?.textContent?.trim() || '';
        const bookAuthor = [firstName, middleName, lastName].filter(Boolean).join(' ') || 'Классик литературы';

        const annotation = titleInfo?.querySelector('annotation')?.textContent?.trim() || '';

        setTitle(bookTitle);
        setAuthor(bookAuthor);
        if (annotation) setSynopsis(annotation.slice(0, 300) + '...');

        const allBodies = Array.from(xmlDoc.querySelectorAll('FictionBook > body'));
        const mainBody = allBodies.find(b => !b.getAttribute('name') || b.getAttribute('name') !== 'notes') || allBodies[0];

        if (!mainBody) return;

        const topSections = Array.from(mainBody.querySelectorAll(':scope > section'));
        const extractedChapters: { title: string; paragraphs: string[] }[] = [];

        topSections.forEach((topSec, topIdx) => {
          const topTitle = topSec.querySelector(':scope > title')?.textContent?.trim() || '';
          const subSections = Array.from(topSec.querySelectorAll(':scope > section'));

          if (subSections.length > 0) {
            subSections.forEach((subSec, subIdx) => {
              const subTitle = subSec.querySelector(':scope > title')?.textContent?.trim() || `Часть ${subIdx + 1}`;
              const pElements = Array.from(subSec.querySelectorAll('p'))
                .map(p => p.textContent?.trim() || '')
                .filter(p => p.length > 0);

              if (pElements.length > 0) {
                extractedChapters.push({
                  title: topTitle ? `${topTitle} • ${subTitle}` : subTitle,
                  paragraphs: pElements
                });
              }
            });
          } else {
            const pElements = Array.from(topSec.querySelectorAll('p'))
              .map(p => p.textContent?.trim() || '')
              .filter(p => p.length > 0);

            if (pElements.length > 0) {
              extractedChapters.push({
                title: topTitle || `Глава ${topIdx + 1}`,
                paragraphs: pElements
              });
            }
          }
        });

        setParsedChapters(extractedChapters);
      } catch (err) {
        console.error('Ошибка парсинга FB2:', err);
      }
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !author || parsedChapters.length === 0) return;

    setLoadingUpload(true);
    setUploadStatus('idle');

    try {
      const { error: dbError } = await supabase.from('books').insert([
        {
          title,
          author,
          grade,
          category,
          category_name: CATEGORY_MAP[category] || 'Русская классика',
          synopsis: synopsis || `Произведение «${title}» автора ${author}`,
          curriculum: isCurriculum,
          chapters: parsedChapters,
          cover_gradient: selectedGradient,
        },
      ]);

      if (dbError) throw dbError;

      setUploadStatus('success');
      setTitle('');
      setAuthor('');
      setSynopsis('');
      setIsCurriculum(false);
      setParsedChapters([]);
      setFileName('');
      await fetchBooks();
    } catch (err) {
      console.error(err);
      setUploadStatus('error');
    } finally {
      setLoadingUpload(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBook) return;

    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from('books')
        .update({
          title: editingBook.title,
          author: editingBook.author,
          synopsis: editingBook.synopsis,
          grade: editingBook.grade,
          category: editingBook.category,
          category_name: CATEGORY_MAP[editingBook.category] || 'Русская классика',
          curriculum: Boolean(editingBook.curriculum),
          cover_gradient: editingBook.cover_gradient,
        })
        .eq('id', editingBook.id);

      if (error) throw error;

      setEditingBook(null);
      await fetchBooks();
    } catch (err) {
      console.error('Ошибка при обновлении:', err);
      alert('Не удалось сохранить изменения.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingBook) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', deletingBook.id);

      if (error) throw error;

      setDeletingBook(null);
      await fetchBooks();
    } catch (err) {
      console.error('Ошибка при удалении:', err);
      alert('Не удалось удалить книгу.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteText.trim() || !quoteAuthor.trim()) return;

    setIsAddingQuote(true);
    try {
      const { error } = await supabase.from('quotes').insert([
        {
          text: quoteText.trim(),
          author: quoteAuthor.trim(),
          work: quoteWork.trim() || 'Литературное наследие',
          book_id: null,
        },
      ]);
      if (error) throw error;

      setQuoteText('');
      setQuoteAuthor('');
      setQuoteWork('');
      await fetchQuotes();
    } catch (err) {
      console.error('Ошибка добавления цитаты:', err);
    } finally {
      setIsAddingQuote(false);
    }
  };

  const handleDeleteQuote = async (id: string) => {
    await supabase.from('quotes').delete().eq('id', id);
    await fetchQuotes();
  };

  // ЭКРАН БЛОКИРОВКИ АДМИНКИ (ПОСЛЕ ВСЕХ ХУКОВ)
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F8F9FE] dark:bg-[#111318] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#1C1F26] w-full max-w-sm rounded-[28px] p-8 shadow-xl border border-gray-200 dark:border-gray-800 space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-[#3F51B5] dark:text-[#A5B4FC] flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Вход в админ-панель</h1>
            <p className="text-xs text-gray-500 mt-1">Введите пароль администратора NGS Библиотеки</p>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-4 text-left">
            <input
              type="password"
              required
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Пароль..."
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:border-indigo-500"
            />
            {authError && (
              <p className="text-xs font-bold text-red-600 text-center">{authError}</p>
            )}
            <button
              type="submit"
              disabled={isCheckingAuth}
              className="w-full py-3 rounded-2xl bg-[#3F51B5] hover:bg-[#303F9F] text-white font-bold text-sm shadow-md transition-all"
            >
              {isCheckingAuth ? 'Проверка...' : 'Войти'}
            </button>
          </form>
          <a href="/" className="inline-block text-xs text-gray-400 hover:text-indigo-600">
            ← Вернуться в библиотеку
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FE] dark:bg-[#111318] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Шапка админки */}
        <header className="bg-white dark:bg-[#1C1F26] p-6 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                ADMIN PANEL
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white">
                Управление NGS Библиотекой
              </h1>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Книг: {booksList.length} • Цитат: {quotesList.length} • Учеников: {studentsList.length}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveMode('manage')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeMode === 'manage'
                  ? 'bg-[#3F51B5] text-white shadow-md'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Фонд ({booksList.length})
            </button>

            <button
              onClick={() => setActiveMode('add')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeMode === 'add'
                  ? 'bg-[#3F51B5] text-white shadow-md'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <Plus className="w-4 h-4" />
              Загрузить
            </button>

            <button
              onClick={() => setActiveMode('quotes')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeMode === 'quotes'
                  ? 'bg-[#3F51B5] text-white shadow-md'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <Quote className="w-4 h-4" />
              Цитаты
            </button>

            <button
              onClick={() => { setActiveMode('students'); fetchActivity(); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeMode === 'students'
                  ? 'bg-[#3F51B5] text-white shadow-md'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              <Users className="w-4 h-4" />
              Ученики ({studentsList.length})
            </button>

            <a
              href="/"
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 transition-colors"
            >
              На сайт →
            </a>

            <button
              onClick={handleAdminLogout}
              className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              title="Выйти из админки"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ВКЛАДКА 1: УПРАВЛЕНИЕ КНИГАМИ */}
        {activeMode === 'manage' && (
          <div className="bg-white dark:bg-[#1C1F26] p-6 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 space-y-5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск книги по названию, автору или описанию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-sm outline-none focus:border-indigo-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {isLoadingList ? (
              <div className="py-12 text-center text-xs text-gray-400">Загрузка книг...</div>
            ) : filteredBooks.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm font-bold text-gray-600 dark:text-gray-400">Книги не найдены</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredBooks.map((book) => (
                  <div
                    key={book.id}
                    className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-[#F8F9FE]/60 dark:bg-[#16181F] flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-200 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        style={{ background: book.cover_gradient || COVER_GRADIENTS[0].value }}
                        className="w-12 h-16 rounded-r-md rounded-l-sm shrink-0 shadow-md flex items-center justify-center text-white text-[9px] font-serif font-bold text-center p-1 leading-tight"
                      >
                        {book.title.slice(0, 14)}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-sm text-gray-900 dark:text-white">{book.title}</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                            {book.grade} кл
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">
                            {book.category_name || CATEGORY_MAP[book.category] || 'Классика'}
                          </span>
                          {book.curriculum && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                              <GraduationCap className="w-3 h-3" /> Программа
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 font-medium">{book.author}</div>
                        <p className="text-[11px] text-gray-400 line-clamp-1 max-w-xl">{book.synopsis}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => setEditingBook(book)}
                        className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#232630] border border-gray-200 dark:border-gray-700 hover:border-indigo-500 text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 shadow-sm"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Изменить</span>
                      </button>

                      <button
                        onClick={() => setDeletingBook(book)}
                        className="px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 hover:bg-red-100 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Удалить</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ВКЛАДКА 2: ДОБАВЛЕНИЕ КНИГИ */}
        {activeMode === 'add' && (
          <div className="bg-white dark:bg-[#1C1F26] p-8 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800">
            <form onSubmit={handleAddSubmit} className="space-y-5">
              <div className="border-2 border-dashed border-indigo-200 dark:border-indigo-900/50 rounded-2xl p-6 text-center bg-indigo-50/30 dark:bg-indigo-950/10">
                <input
                  type="file"
                  id="bookFileInput"
                  accept=".fb2,.txt,text/xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="bookFileInput" className="cursor-pointer flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md">
                    <FileText className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-sm text-indigo-700 dark:text-indigo-400">
                    {fileName ? fileName : 'Нажмите, чтобы выбрать файл .fb2'}
                  </span>
                </label>
              </div>

              {parsedChapters.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center justify-between border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Распознано глав/произведений: <b>{parsedChapters.length}</b></span>
                  </div>
                  <span className="text-[11px] font-mono opacity-80">Готово к публикации</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Название книги</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Автор</label>
                  <input
                    type="text"
                    required
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Класс</label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                  >
                    <option value="5-7">5–7 класс</option>
                    <option value="8-9">8–9 класс</option>
                    <option value="10-11">10–11 класс</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Жанр</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                  >
                    <option value="classic">Русская классика</option>
                    <option value="scifi">Фантастика</option>
                    <option value="adventure">Приключения</option>
                    <option value="fairy">Сказки и притчи</option>
                    <option value="drama">Драматургия</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Описание</label>
                <textarea
                  rows={2}
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                />
              </div>

              <label className="flex items-center gap-2.5 p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCurriculum}
                  onChange={(e) => setIsCurriculum(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
                <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                  Входит в школьную программу (показывается во вкладке «Школьная программа»)
                </span>
              </label>

              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-indigo-600" /> Цвет обложки:
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {COVER_GRADIENTS.map((g) => {
                    const isSelected = selectedGradient === g.value;
                    return (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => setSelectedGradient(g.value)}
                        style={{ background: g.value }}
                        className={`h-9 px-3.5 rounded-xl text-white text-[11px] font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                          isSelected ? 'ring-2 ring-indigo-600 ring-offset-2 scale-105' : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        {isSelected && <span>✓</span>}
                        <span>{g.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingUpload || parsedChapters.length === 0}
                className="w-full py-3.5 rounded-2xl bg-[#3F51B5] text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-40"
              >
                <Upload className="w-4 h-4" />
                {loadingUpload ? 'Публикация...' : 'Опубликовать книгу'}
              </button>

              {uploadStatus === 'success' && (
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Книга успешно добавлена в базу!
                </div>
              )}
            </form>
          </div>
        )}

        {/* ВКЛАДКА 3: ЦИТАТЫ ДНЯ */}
        {activeMode === 'quotes' && (
          <div className="bg-white dark:bg-[#1C1F26] p-6 sm:p-8 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 space-y-6">
            <form onSubmit={handleAddQuote} className="p-5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/10 border border-amber-200/70 dark:border-amber-900/30 space-y-4">
              <h3 className="font-bold text-sm text-amber-900 dark:text-amber-300">Добавить новую цитату</h3>
              <div>
                <textarea
                  rows={2}
                  required
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  placeholder="Текст цитаты (без кавычек)..."
                  className="w-full px-4 py-2.5 rounded-xl border border-amber-200 dark:border-gray-700 bg-white dark:bg-[#16181F] text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={quoteAuthor}
                  onChange={(e) => setQuoteAuthor(e.target.value)}
                  placeholder="Автор (напр. А.С. Пушкин)"
                  className="px-4 py-2 rounded-xl border border-amber-200 dark:border-gray-700 bg-white dark:bg-[#16181F] text-sm"
                />
                <input
                  type="text"
                  value={quoteWork}
                  onChange={(e) => setQuoteWork(e.target.value)}
                  placeholder="Произведение (напр. «Евгений Онегин»)"
                  className="px-4 py-2 rounded-xl border border-amber-200 dark:border-gray-700 bg-white dark:bg-[#16181F] text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isAddingQuote}
                className="px-5 py-2.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold transition-colors"
              >
                {isAddingQuote ? 'Сохранение...' : '+ Добавить цитату'}
              </button>
            </form>

            <div className="space-y-2.5">
              {quotesList.map((q) => (
                <div key={q.id} className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-serif italic text-sm text-gray-800 dark:text-gray-200">«{q.text}»</p>
                    <p className="text-xs text-gray-500 mt-1 font-bold">
                      {q.author} <span className="font-normal">• {q.work}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteQuote(q.id)}
                    className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Удалить цитату"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ВКЛАДКА 4: ВСЕ УЧЕНИКИ И ИХ ПРОГРЕСС */}
        {activeMode === 'students' && (
          <div className="bg-white dark:bg-[#1C1F26] p-6 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 space-y-5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск по имени ученика или классу..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-sm outline-none focus:border-indigo-500"
              />
            </div>

            {filteredStudents.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                Пока нет зарегистрированных учеников.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((st) => (
                  <div
                    key={st.id}
                    className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-[#F8F9FE]/60 dark:bg-[#16181F] space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">
                          {st.full_name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                          {st.grade_class}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400">
                        Книг в процессе: {st.reading_progress?.length || 0}
                      </span>
                    </div>

                    {st.reading_progress && st.reading_progress.length > 0 ? (
                      <div className="space-y-2 pl-3 border-l-2 border-indigo-200 dark:border-indigo-800">
                        {st.reading_progress.map((row) => {
                          const bookObj = booksList.find((b) => b.id === row.book_id);
                          return (
                            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div>
                                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                  {bookObj?.title || row.book_id}
                                </span>
                                <span className="text-gray-400 ml-2 text-[11px]">
                                  (Глава {row.current_chapter + 1}, стр. {row.current_page + 1})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {row.is_bookmarked && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                                    ★ В закладках
                                  </span>
                                )}
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold font-mono">
                                  {row.progress_percent}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 italic">
                        Еще не начал читать книги
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* МОДАЛКА РЕДАКТИРОВАНИЯ КНИГИ */}
      {editingBook && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-lg rounded-[28px] p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-extrabold text-lg">Редактировать книгу</h3>
              <button onClick={() => setEditingBook(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500">Название</label>
                <input
                  type="text"
                  required
                  value={editingBook.title}
                  onChange={(e) => setEditingBook({ ...editingBook, title: e.target.value })}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500">Автор</label>
                  <input
                    type="text"
                    required
                    value={editingBook.author}
                    onChange={(e) => setEditingBook({ ...editingBook, author: e.target.value })}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500">Класс</label>
                  <select
                    value={editingBook.grade}
                    onChange={(e) => setEditingBook({ ...editingBook, grade: e.target.value })}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                  >
                    <option value="5-7">5–7 класс</option>
                    <option value="8-9">8–9 класс</option>
                    <option value="10-11">10–11 класс</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500">Жанр</label>
                  <select
                    value={editingBook.category || 'classic'}
                    onChange={(e) =>
                      setEditingBook({
                        ...editingBook,
                        category: e.target.value,
                        category_name: CATEGORY_MAP[e.target.value] || 'Русская классика',
                      })
                    }
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                  >
                    <option value="classic">Русская классика</option>
                    <option value="scifi">Фантастика</option>
                    <option value="adventure">Приключения</option>
                    <option value="fairy">Сказки и притчи</option>
                    <option value="drama">Драматургия</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500">Описание</label>
                <textarea
                  rows={3}
                  value={editingBook.synopsis}
                  onChange={(e) => setEditingBook({ ...editingBook, synopsis: e.target.value })}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                />
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingBook.curriculum)}
                  onChange={(e) => setEditingBook({ ...editingBook, curriculum: e.target.checked })}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
                <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                  Входит в школьную программу
                </span>
              </label>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500">Цвет обложки:</label>
                <div className="flex flex-wrap gap-2">
                  {COVER_GRADIENTS.map((g) => {
                    const isSelected = editingBook.cover_gradient === g.value;
                    return (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => setEditingBook({ ...editingBook, cover_gradient: g.value })}
                        style={{ background: g.value }}
                        className={`h-8 px-3 rounded-lg text-white text-[11px] font-bold transition-all ${
                          isSelected ? 'ring-2 ring-indigo-600 ring-offset-2 scale-105' : 'opacity-80'
                        }`}
                      >
                        {isSelected && '✓ '} {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBook(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                >
                  {isSavingEdit ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛКА УДАЛЕНИЯ КНИГИ */}
      {deletingBook && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-sm rounded-[28px] p-6 shadow-2xl border border-red-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base">Удалить книгу?</h3>
              <p className="text-xs text-gray-500 mt-1">
                Вы действительно хотите удалить <b>«{deletingBook.title}»</b>?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeletingBook(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700"
              >
                {isDeleting ? 'Удаление...' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
