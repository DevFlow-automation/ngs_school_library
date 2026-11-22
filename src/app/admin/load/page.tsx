'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { compareBookGrades, fetchRawBooksMetadataForAdmin, invalidateBooksCache } from '@/lib/booksService';
import type { GradeFilter } from '@/types/book';
import {
  Upload, CheckCircle2, FileText, Sparkles, Palette,
  Search, Trash2, Edit3, X, Plus, BookOpen, AlertTriangle,
  Quote, GraduationCap, Users, Lock, LogOut, Clock, Zap,
  Shield, ShieldAlert, ShieldCheck, RefreshCw, MessageSquare, Send, ExternalLink, Filter
} from 'lucide-react';
import { AdminsManagerTab } from '@/components/AdminsManagerTab';
import {
  ADMIN_ROLE_LABELS,
  formatAdminSenderName,
  type AdminSessionUser,
} from '@/lib/adminTypes';
import {
  evaluateBookCompletion,
  evaluateReadingPace,
  formatReadingDuration,
  formatTurnSpeed
} from '@/lib/readingMetrics';
import { isAutoWarningMessage } from '@/lib/autoWarnings';
import {
  calculateStudentPoints,
  getAgeGroup,
  getStudentRank,
  parseStudentGrade
} from '@/lib/gamification';

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

interface StudentMessageItem {
  id: string;
  student_id: string;
  book_id: string | null;
  book_title: string | null;
  sender_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const MESSAGE_TEMPLATES = [
  'Пожалуйста, читай внимательнее — замечено слишком быстрое пролистывание страниц.',
  'Обрати внимание: прогресс чтения высокий, но времени на чтение потрачено мало. Постарайся прочитать внимательно.',
  'Замечен перескок по главам. Вернись и прочитай пропущенные главы.',
  'Отличная работа и внимательное чтение! Так держать!',
];

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
    reading_seconds?: number | null;
    pages_turned?: number | null;
    fast_turns_count?: number | null;
    avg_seconds_per_page?: number | null;
    min_seconds_per_page?: number | null;
    last_read_at: string;
  }[];
}

export default function AdminDashboardPage() {
  // Авторизация админа
  const [currentAdmin, setCurrentAdmin] = useState<AdminSessionUser | null>(null);
  const [isBootingAuth, setIsBootingAuth] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [adminsCount, setAdminsCount] = useState<number | null>(null);

  const isAuthorized = Boolean(currentAdmin);
  const isSuperadmin = currentAdmin?.role === 'superadmin';
  const canManageLibrary =
    currentAdmin?.role === 'superadmin' || currentAdmin?.role === 'admin';

  // Вкладки
  const [activeMode, setActiveMode] = useState<'manage' | 'add' | 'quotes' | 'students' | 'admins'>('manage');

  // Книги
  const [booksList, setBooksList] = useState<DbBook[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [bookGradeFilter, setBookGradeFilter] = useState<GradeFilter>('all');
  const [bookCategoryFilter, setBookCategoryFilter] = useState<'all' | 'classic' | 'scifi' | 'adventure' | 'fairy' | 'drama'>('all');
  const [bookCurriculumFilter, setBookCurriculumFilter] = useState<'all' | 'curriculum' | 'extra'>('all');
  const [bookSortBy, setBookSortBy] = useState<'newest' | 'title' | 'author' | 'grade'>('newest');
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
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [studentAgeFilter, setStudentAgeFilter] = useState<'all' | 'junior' | 'middle' | 'senior'>('all');
  const [studentBookFilter, setStudentBookFilter] = useState<string>('all');
  const [studentStatusFilter, setStudentStatusFilter] = useState<
    'all' | 'active' | 'completed' | 'inactive' | 'suspicious' | 'with-messages'
  >('all');
  const [studentSortBy, setStudentSortBy] = useState<
    'newest' | 'points_desc' | 'time_desc' | 'name_asc' | 'class_asc'
  >('newest');

  // Сообщения ученикам
  const [messagesByStudent, setMessagesByStudent] = useState<Record<string, StudentMessageItem[]>>({});
  const [messageTarget, setMessageTarget] = useState<{
    student: StudentRow;
    bookId: string | null;
    bookTitle: string | null;
  } | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');

  const fetchBooks = async () => {
    setIsLoadingList(true);
    try {
      const data = await fetchRawBooksMetadataForAdmin();
      setBooksList(data as unknown as DbBook[]);
    } catch (err) {
      console.error('Ошибка загрузки списка книг в админке:', err);
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

    try {
      const { data: msgData, error: msgError } = await supabase
        .from('student_messages')
        .select('*')
        .order('created_at', { ascending: false });
      if (!msgError && msgData) {
        const grouped: Record<string, StudentMessageItem[]> = {};
        for (const m of msgData as StudentMessageItem[]) {
          if (!grouped[m.student_id]) grouped[m.student_id] = [];
          grouped[m.student_id].push(m);
        }
        setMessagesByStudent(grouped);
      }
    } catch {
      // Таблица student_messages ещё не создана
    }
  };

  const openMessageModal = (
    student: StudentRow,
    bookId: string | null = null,
    bookTitle: string | null = null,
    initialText = ''
  ) => {
    setMessageTarget({ student, bookId, bookTitle });
    setMessageDraft(initialText);
    setMessageError('');
  };

  const handleSendStudentMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageTarget || !messageDraft.trim()) return;

    setIsSendingMessage(true);
    setMessageError('');
    try {
      const { error } = await supabase.from('student_messages').insert([
        {
          student_id: messageTarget.student.id,
          book_id: messageTarget.bookId,
          book_title: messageTarget.bookTitle,
          sender_name: formatAdminSenderName(currentAdmin),
          message: messageDraft.trim(),
          is_read: false,
        },
      ]);

      if (error) throw error;

      setMessageTarget(null);
      setMessageDraft('');
      await fetchActivity();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || '');
      if (msg.includes('student_messages') || msg.includes('relation') || msg.includes('schema cache')) {
        setMessageError(
          'Таблица student_messages ещё не создана в Supabase. Выполните SQL из файла supabase_student_messages.sql.'
        );
      } else {
        setMessageError('Не удалось отправить сообщение. Проверьте подключение к Supabase.');
      }
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleDeleteStudentMessage = async (msgId: string) => {
    await supabase.from('student_messages').delete().eq('id', msgId);
    await fetchActivity();
  };

  const resolveAllowedTab = (
    role: AdminSessionUser['role'],
    requestedTab: string | null
  ): 'manage' | 'add' | 'quotes' | 'students' | 'admins' => {
    if (role === 'supervisor') return 'students';
    if (requestedTab === 'admins' && role === 'superadmin') return 'admins';
    if (
      requestedTab === 'students' ||
      requestedTab === 'manage' ||
      requestedTab === 'add' ||
      requestedTab === 'quotes'
    ) {
      return requestedTab;
    }
    return 'manage';
  };

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin-auth', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.authenticated && data?.admin) {
          const adminUser = data.admin as AdminSessionUser;
          setCurrentAdmin(adminUser);
          const tab = new URLSearchParams(window.location.search).get('tab');
          setActiveMode(resolveAllowedTab(adminUser.role, tab));
        } else if (!cancelled) {
          try {
            sessionStorage.removeItem('ngs_admin_auth');
          } catch {}
        }
      } catch {
        // Оставляем экран входа
      } finally {
        if (!cancelled) setIsBootingAuth(false);
      }
    };
    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentAdmin) return;
    fetchBooks();
    fetchActivity();
    if (currentAdmin.role === 'superadmin' || currentAdmin.role === 'admin') {
      fetchQuotes();
    }
    if (currentAdmin.role === 'superadmin') {
      fetch('/api/admins', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.admins)) {
            setAdminsCount(data.admins.length);
          }
        })
        .catch(() => {});
    }
  }, [currentAdmin]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = booksList.filter((b) => {
      if (bookGradeFilter !== 'all' && b.grade !== bookGradeFilter) return false;
      if (bookCategoryFilter !== 'all' && (b.category || 'classic') !== bookCategoryFilter) return false;
      if (bookCurriculumFilter === 'curriculum' && !b.curriculum) return false;
      if (bookCurriculumFilter === 'extra' && b.curriculum) return false;
      if (q) {
        const matches =
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          (b.synopsis && b.synopsis.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });

    if (bookSortBy === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    if (bookSortBy === 'author') return [...list].sort((a, b) => a.author.localeCompare(b.author, 'ru'));
    if (bookSortBy === 'grade') return [...list].sort((a, b) => compareBookGrades(a.grade, b.grade));
    return list;
  }, [booksList, searchQuery, bookGradeFilter, bookCategoryFilter, bookCurriculumFilter, bookSortBy]);

  const hasActiveBookFilters =
    Boolean(searchQuery.trim()) ||
    bookGradeFilter !== 'all' ||
    bookCategoryFilter !== 'all' ||
    bookCurriculumFilter !== 'all' ||
    bookSortBy !== 'newest';

  const resetBookFilters = () => {
    setSearchQuery('');
    setBookGradeFilter('all');
    setBookCategoryFilter('all');
    setBookCurriculumFilter('all');
    setBookSortBy('newest');
  };

  const isStudentSuspicious = (st: StudentRow) =>
    (st.reading_progress || []).some((row) => {
      const pace = evaluateReadingPace({
        progressPercent: row.progress_percent || 0,
        readingSeconds: row.reading_seconds || 0,
        pagesTurned: row.pages_turned || 0,
        fastTurnsCount: row.fast_turns_count || 0,
        avgSecondsPerPage: row.avg_seconds_per_page || 0,
        minSecondsPerPage: row.min_seconds_per_page ?? null,
      });
      return pace.status === 'suspicious';
    });

  const getStudentPointsTotal = (st: StudentRow) =>
    calculateStudentPoints(
      (st.reading_progress || []).map((r) => ({
        progressPercent: r.progress_percent || 0,
        readingSeconds: r.reading_seconds || 0,
        pagesTurned: r.pages_turned || 0,
        fastTurnsCount: r.fast_turns_count || 0,
        avgSecondsPerPage: r.avg_seconds_per_page || 0,
        minSecondsPerPage: r.min_seconds_per_page ?? null,
      })),
      st.grade_class
    ).totalPoints;

  const getStudentReadingSeconds = (st: StudentRow) =>
    (st.reading_progress || []).reduce((acc, r) => acc + Number(r.reading_seconds || 0), 0);

  const studentHasCompletedBook = (st: StudentRow) =>
    (st.reading_progress || []).some((r) => {
      if ((r.progress_percent || 0) < 95) return false;
      return evaluateBookCompletion({
        progressPercent: r.progress_percent || 0,
        readingSeconds: r.reading_seconds || 0,
        pagesTurned: r.pages_turned || 0,
        fastTurnsCount: r.fast_turns_count || 0,
        avgSecondsPerPage: r.avg_seconds_per_page || 0,
        minSecondsPerPage: r.min_seconds_per_page ?? null,
      }).counted;
    });

  const availableStudentClasses = useMemo(() => {
    const uniq = Array.from(new Set(studentsList.map((s) => s.grade_class).filter(Boolean)));
    return uniq.sort((a, b) => {
      const diff = parseStudentGrade(a) - parseStudentGrade(b);
      return diff !== 0 ? diff : a.localeCompare(b, 'ru');
    });
  }, [studentsList]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const list = studentsList.filter((st) => {
      if (studentClassFilter !== 'all' && st.grade_class !== studentClassFilter) return false;
      if (studentAgeFilter !== 'all' && getAgeGroup(st.grade_class) !== studentAgeFilter) return false;
      if (
        studentBookFilter !== 'all' &&
        !(st.reading_progress || []).some((r) => r.book_id === studentBookFilter)
      ) {
        return false;
      }

      if (studentStatusFilter === 'suspicious' && !isStudentSuspicious(st)) return false;
      if (studentStatusFilter === 'active' && (st.reading_progress?.length || 0) === 0) return false;
      if (studentStatusFilter === 'inactive' && (st.reading_progress?.length || 0) > 0) return false;
      if (studentStatusFilter === 'completed' && !studentHasCompletedBook(st)) return false;
      if (studentStatusFilter === 'with-messages' && (messagesByStudent[st.id]?.length || 0) === 0) {
        return false;
      }

      if (!q) return true;
      return (
        st.full_name.toLowerCase().includes(q) ||
        st.grade_class.toLowerCase().includes(q)
      );
    });

    if (studentSortBy === 'points_desc') {
      return [...list].sort((a, b) => getStudentPointsTotal(b) - getStudentPointsTotal(a));
    }
    if (studentSortBy === 'time_desc') {
      return [...list].sort((a, b) => getStudentReadingSeconds(b) - getStudentReadingSeconds(a));
    }
    if (studentSortBy === 'name_asc') {
      return [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));
    }
    if (studentSortBy === 'class_asc') {
      return [...list].sort((a, b) => {
        const diff = parseStudentGrade(a.grade_class) - parseStudentGrade(b.grade_class);
        return diff !== 0 ? diff : a.grade_class.localeCompare(b.grade_class, 'ru');
      });
    }
    return list;
  }, [
    studentsList,
    studentSearch,
    studentClassFilter,
    studentAgeFilter,
    studentBookFilter,
    studentStatusFilter,
    studentSortBy,
    messagesByStudent,
  ]);

  const hasActiveStudentFilters =
    Boolean(studentSearch.trim()) ||
    studentClassFilter !== 'all' ||
    studentAgeFilter !== 'all' ||
    studentBookFilter !== 'all' ||
    studentStatusFilter !== 'all' ||
    studentSortBy !== 'newest';

  const resetStudentFilters = () => {
    setStudentSearch('');
    setStudentClassFilter('all');
    setStudentAgeFilter('all');
    setStudentBookFilter('all');
    setStudentStatusFilter('all');
    setStudentSortBy('newest');
  };

  const suspiciousStudentsCount = useMemo(
    () => studentsList.filter((st) => isStudentSuspicious(st)).length,
    [studentsList]
  );

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

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.admin) {
        const adminUser = data.admin as AdminSessionUser;
        setCurrentAdmin(adminUser);
        const tab = new URLSearchParams(window.location.search).get('tab');
        setActiveMode(resolveAllowedTab(adminUser.role, tab));
        setAdminPassword('');
      } else {
        setAuthError(data?.error || 'Неверный пароль администратора');
      }
    } catch {
      setAuthError('Ошибка сети при проверке пароля');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/admin-auth', { method: 'DELETE' });
    } catch {}
    try {
      sessionStorage.removeItem('ngs_admin_auth');
    } catch {}
    setCurrentAdmin(null);
    setAdminsCount(null);
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
      invalidateBooksCache();
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
      invalidateBooksCache();
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
      invalidateBooksCache();
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

  // ЭКРАН ПРОВЕРКИ СЕССИИ И БЛОКИРОВКИ АДМИНКИ (ПОСЛЕ ВСЕХ ХУКОВ)
  if (isBootingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FE] dark:bg-[#111318] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#1C1F26] px-6 py-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 text-xs font-bold text-gray-500 flex items-center gap-2.5">
          <RefreshCw className="w-4 h-4 animate-spin text-[#3F51B5]" />
          <span>Проверка доступа...</span>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F8F9FE] dark:bg-[#111318] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#1C1F26] w-full max-w-sm rounded-[28px] p-8 shadow-xl border border-gray-200 dark:border-gray-800 space-y-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-[#3F51B5] dark:text-[#A5B4FC] flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Вход в админ-панель</h1>
            <p className="text-xs text-gray-500 mt-1">
              Введите пароль администратора или куратора NGS Библиотеки
            </p>
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
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  currentAdmin?.role === 'supervisor'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300'
                }`}
              >
                {currentAdmin ? ADMIN_ROLE_LABELS[currentAdmin.role].shortLabel : 'ADMIN PANEL'}
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white">
                {canManageLibrary ? 'Управление NGS Библиотекой' : 'Контроль чтения учеников'}
              </h1>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Вы вошли как: <b className="text-gray-700 dark:text-gray-200">{currentAdmin?.name}</b>
              {currentAdmin?.note && currentAdmin.role !== 'superadmin' ? ` (${currentAdmin.note})` : ''}
              {' • '}
              {canManageLibrary
                ? `Книг: ${booksList.length} • Цитат: ${quotesList.length} • Учеников: ${studentsList.length}`
                : `Учеников: ${studentsList.length}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageLibrary && (
              <>
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
              </>
            )}

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

            {isSuperadmin && (
              <button
                onClick={() => setActiveMode('admins')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeMode === 'admins'
                    ? 'bg-[#3F51B5] text-white shadow-md'
                    : 'bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <Shield className="w-4 h-4" />
                Админы{adminsCount !== null ? ` (${adminsCount})` : ''}
              </button>
            )}

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
        {canManageLibrary && activeMode === 'manage' && (
          <div className="bg-white dark:bg-[#1C1F26] p-6 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск книги по названию, автору или описанию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 rounded-2xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-sm outline-none focus:border-indigo-500 transition-colors"
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

            {/* Панель фильтров и сортировки фонда */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select
                value={bookGradeFilter}
                onChange={(e) => setBookGradeFilter(e.target.value as GradeFilter)}
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="all">Все классы</option>
                <option value="1-4">1–4 класс</option>
                <option value="5-7">5–7 класс</option>
                <option value="8-9">8–9 класс</option>
                <option value="10-11">10–11 класс</option>
              </select>

              <select
                value={bookCategoryFilter}
                onChange={(e) =>
                  setBookCategoryFilter(
                    e.target.value as 'all' | 'classic' | 'scifi' | 'adventure' | 'fairy' | 'drama'
                  )
                }
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="all">Все жанры</option>
                <option value="classic">Русская классика</option>
                <option value="scifi">Фантастика</option>
                <option value="adventure">Приключения</option>
                <option value="fairy">Сказки и притчи</option>
                <option value="drama">Драматургия</option>
              </select>

              <select
                value={bookCurriculumFilter}
                onChange={(e) => setBookCurriculumFilter(e.target.value as 'all' | 'curriculum' | 'extra')}
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="all">Любая программа</option>
                <option value="curriculum">Школьная программа</option>
                <option value="extra">Внеклассное чтение</option>
              </select>

              <select
                value={bookSortBy}
                onChange={(e) => setBookSortBy(e.target.value as 'newest' | 'title' | 'author' | 'grade')}
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="newest">Сначала новые</option>
                <option value="title">По названию (А–Я)</option>
                <option value="author">По автору (А–Я)</option>
                <option value="grade">По классу</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  Показано: <b className="text-gray-800 dark:text-gray-200">{filteredBooks.length}</b> из {booksList.length}
                </span>
              </span>
              {hasActiveBookFilters && (
                <button
                  type="button"
                  onClick={resetBookFilters}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                >
                  Сбросить фильтры
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
        {canManageLibrary && activeMode === 'add' && (
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
                    <option value="1-4">1–4 класс</option>
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
        {canManageLibrary && activeMode === 'quotes' && (
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
          <div className="bg-white dark:bg-[#1C1F26] p-6 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-4 top-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Поиск по имени ученика или классу..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 rounded-2xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-sm outline-none focus:border-indigo-500"
                />
                {studentSearch && (
                  <button
                    type="button"
                    onClick={() => setStudentSearch('')}
                    className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setStudentStatusFilter((prev) => (prev === 'suspicious' ? 'all' : 'suspicious'))
                  }
                  className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    studentStatusFilter === 'suspicious'
                      ? 'bg-red-600 text-white border-red-600 shadow-sm'
                      : 'bg-red-50/70 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/40 hover:bg-red-100'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Быстрое пролистывание ({suspiciousStudentsCount})</span>
                </button>

                <button
                  type="button"
                  onClick={fetchActivity}
                  className="p-3 rounded-2xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-500 transition-colors"
                  title="Обновить отчёт"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Панель фильтров и сортировки учеников */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <select
                value={studentClassFilter}
                onChange={(e) => setStudentClassFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="all">Все классы</option>
                {availableStudentClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls} класс
                  </option>
                ))}
              </select>

              <select
                value={studentAgeFilter}
                onChange={(e) =>
                  setStudentAgeFilter(e.target.value as 'all' | 'junior' | 'middle' | 'senior')
                }
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="all">Все возрасты</option>
                <option value="junior">1–6 классы</option>
                <option value="middle">7–9 классы</option>
                <option value="senior">10–11 классы</option>
              </select>

              <select
                value={studentStatusFilter}
                onChange={(e) =>
                  setStudentStatusFilter(
                    e.target.value as
                      | 'all'
                      | 'active'
                      | 'completed'
                      | 'inactive'
                      | 'suspicious'
                      | 'with-messages'
                  )
                }
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="all">Любой статус</option>
                <option value="active">Читают книги</option>
                <option value="completed">Есть дочитанные (100%)</option>
                <option value="inactive">Ещё не начали читать</option>
                <option value="suspicious">Подозрение на пролистывание</option>
                <option value="with-messages">С сообщениями админа</option>
              </select>

              <select
                value={studentBookFilter}
                onChange={(e) => setStudentBookFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              >
                <option value="all">Все книги</option>
                {booksList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>

              <select
                value={studentSortBy}
                onChange={(e) =>
                  setStudentSortBy(
                    e.target.value as 'newest' | 'points_desc' | 'time_desc' | 'name_asc' | 'class_asc'
                  )
                }
                className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500 col-span-2 sm:col-span-1"
              >
                <option value="newest">Сначала новые</option>
                <option value="points_desc">По баллам (сначала больше)</option>
                <option value="time_desc">По времени чтения</option>
                <option value="name_asc">По имени (А–Я)</option>
                <option value="class_asc">По классу</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  Показано: <b className="text-gray-800 dark:text-gray-200">{filteredStudents.length}</b> из {studentsList.length}
                </span>
              </span>
              {hasActiveStudentFilters && (
                <button
                  type="button"
                  onClick={resetStudentFilters}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>

            {filteredStudents.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400 space-y-2">
                <p>
                  {hasActiveStudentFilters
                    ? 'По выбранным фильтрам ученики не найдены.'
                    : 'Пока нет зарегистрированных учеников.'}
                </p>
                {hasActiveStudentFilters && (
                  <button
                    type="button"
                    onClick={resetStudentFilters}
                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    Сбросить фильтры
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((st) => {
                  const totalReadingSec = (st.reading_progress || []).reduce(
                    (acc, r) => acc + Number(r.reading_seconds || 0),
                    0
                  );
                  const hasSuspiciousBook = isStudentSuspicious(st);
                  const stPoints = calculateStudentPoints(
                    (st.reading_progress || []).map((r) => ({
                      progressPercent: r.progress_percent || 0,
                      readingSeconds: r.reading_seconds || 0,
                      pagesTurned: r.pages_turned || 0,
                      fastTurnsCount: r.fast_turns_count || 0,
                      avgSecondsPerPage: r.avg_seconds_per_page || 0,
                      minSecondsPerPage: r.min_seconds_per_page ?? null,
                    })),
                    st.grade_class
                  );
                  const stRank = getStudentRank(stPoints.totalPoints, getAgeGroup(st.grade_class));

                  return (
                    <div
                      key={st.id}
                      className={`p-4 rounded-2xl border space-y-3 ${
                        hasSuspiciousBook
                          ? 'border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/10'
                          : 'border-gray-100 dark:border-gray-800 bg-[#F8F9FE]/60 dark:bg-[#16181F]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/students/${st.id}`}
                            className="font-bold text-sm text-gray-900 dark:text-white hover:text-[#3F51B5] dark:hover:text-[#A5B4FC] hover:underline inline-flex items-center gap-1 transition-colors"
                            title="Открыть страницу ученика (баллы, достижения, аватарки)"
                          >
                            <span>{st.full_name}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                          </Link>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                            {st.grade_class}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-mono"
                            title={`Ранг: ${stRank.current.title} (${stPoints.totalPoints} б.)`}
                          >
                            ⭐ {stPoints.totalPoints} б. • {stRank.current.icon} {stRank.current.title}
                          </span>
                          {hasSuspiciousBook && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              Есть быстрое пролистывание
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1 font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                            <Clock className="w-3.5 h-3.5" />
                            Всего: {formatReadingDuration(totalReadingSec)}
                          </span>
                          <span>Книг: {st.reading_progress?.length || 0}</span>
                          <button
                            type="button"
                            onClick={() =>
                              openMessageModal(
                                st,
                                null,
                                null,
                                hasSuspiciousBook ? MESSAGE_TEMPLATES[0] : ''
                              )
                            }
                            className="px-3 py-1.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-[11px] font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Написать ученику</span>
                          </button>
                        </div>
                      </div>

                      {st.reading_progress && st.reading_progress.length > 0 ? (
                        <div className="space-y-2.5 pl-3 border-l-2 border-indigo-200 dark:border-indigo-800">
                          {st.reading_progress.map((row) => {
                            const bookObj = booksList.find((b) => b.id === row.book_id);
                            const readingSec = Number(row.reading_seconds || 0);
                            const pagesTurned = Number(row.pages_turned || 0);
                            const fastTurns = Number(row.fast_turns_count || 0);
                            const avgSec = Number(row.avg_seconds_per_page || 0);
                            const minSec =
                              row.min_seconds_per_page !== null && row.min_seconds_per_page !== undefined
                                ? Number(row.min_seconds_per_page)
                                : null;

                            const pace = evaluateReadingPace({
                              progressPercent: row.progress_percent || 0,
                              readingSeconds: readingSec,
                              pagesTurned,
                              fastTurnsCount: fastTurns,
                              avgSecondsPerPage: avgSec,
                              minSecondsPerPage: minSec,
                            });
                            const completionCheck = evaluateBookCompletion({
                              progressPercent: row.progress_percent || 0,
                              readingSeconds: readingSec,
                              pagesTurned,
                              fastTurnsCount: fastTurns,
                              avgSecondsPerPage: avgSec,
                              minSecondsPerPage: minSec,
                            });
                            const isUnverifiedFinish =
                              (row.progress_percent || 0) >= 94 && !completionCheck.counted;
                            const displayPercent = isUnverifiedFinish
                              ? Math.min(row.progress_percent || 0, 94)
                              : row.progress_percent || 0;

                            return (
                              <div
                                key={row.id}
                                className="p-2.5 rounded-xl bg-white/80 dark:bg-[#1C1F26]/80 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
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
                                    <span
                                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                        isUnverifiedFinish
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'
                                          : 'bg-emerald-100 text-emerald-800'
                                      }`}
                                      title={
                                        isUnverifiedFinish
                                          ? `Не засчитано 100%: ${completionCheck.reason}`
                                          : undefined
                                      }
                                    >
                                      {isUnverifiedFinish ? `Не засчитано (${displayPercent}%)` : `${displayPercent}%`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openMessageModal(
                                          st,
                                          row.book_id,
                                          bookObj?.title || row.book_id,
                                          pace.status === 'suspicious'
                                            ? `По книге «${bookObj?.title || row.book_id}»: ${MESSAGE_TEMPLATES[0]}`
                                            : ''
                                        )
                                      }
                                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-colors ${
                                        pace.status === 'suspicious'
                                          ? 'bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                                      }`}
                                      title="Написать ученику по этой книге"
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                      <span>{pace.status === 'suspicious' ? 'Замечание' : 'Написать'}</span>
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-semibold">
                                    <Clock className="w-3 h-3" />
                                    {formatReadingDuration(readingSec)}
                                  </span>

                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono font-semibold ${
                                      pace.status === 'suspicious'
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                        : pace.status === 'fast'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                        : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300'
                                    }`}
                                    title="Средняя скорость нажатия «Следующая страница»"
                                  >
                                    <Zap className="w-3 h-3" />
                                    {pagesTurned > 0 ? formatTurnSpeed(avgSec) : 'Нет кликов'}
                                  </span>

                                  {pagesTurned > 0 && (
                                    <span className="text-gray-500 dark:text-gray-400">
                                      Кликов: <b>{pagesTurned}</b>
                                      {fastTurns > 0 && (
                                        <>
                                          {' • '}Быстрых:{' '}
                                          <b className="text-red-600 dark:text-red-400">{fastTurns}</b>
                                        </>
                                      )}
                                      {minSec !== null && (
                                        <>
                                          {' • '}Мин: <b className="font-mono">{minSec.toFixed(1)}с</b>
                                        </>
                                      )}
                                    </span>
                                  )}

                                  {pace.status === 'suspicious' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold ml-auto"
                                      title={pace.reason}
                                    >
                                      <ShieldAlert className="w-3 h-3" />
                                      {pace.label}
                                    </span>
                                  )}
                                  {pace.status === 'fast' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 text-[10px] font-bold ml-auto"
                                      title={pace.reason}
                                    >
                                      <Zap className="w-3 h-3" />
                                      {pace.label}
                                    </span>
                                  )}
                                  {pace.status === 'normal' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold ml-auto"
                                      title={pace.reason}
                                    >
                                      <ShieldCheck className="w-3 h-3" />
                                      {pace.label}
                                    </span>
                                  )}
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

                      {(messagesByStudent[st.id]?.length || 0) > 0 && (
                        <div className="pt-2 border-t border-gray-200/70 dark:border-gray-800 space-y-1.5">
                          <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Отправленные сообщения ({messagesByStudent[st.id].length}):</span>
                          </div>
                          <div className="space-y-1.5">
                            {messagesByStudent[st.id].map((m) => {
                              const isAuto = isAutoWarningMessage(m.sender_name);
                              return (
                              <div
                                key={m.id}
                                className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 text-xs ${
                                  isAuto
                                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                                    : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/40'
                                }`}
                              >
                                <div className="space-y-0.5 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {m.sender_name && (
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          isAuto
                                            ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200'
                                            : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200'
                                        }`}
                                      >
                                        {m.sender_name}
                                      </span>
                                    )}
                                    {isAuto && (
                                      <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 text-[9.5px] font-extrabold uppercase">
                                        Авто
                                      </span>
                                    )}
                                    {m.book_title && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-[10px] font-bold">
                                        📖 {m.book_title}
                                      </span>
                                    )}
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        m.is_read
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {m.is_read ? 'Прочитано' : 'Не прочитано'}
                                    </span>
                                    <span className="text-[10px] font-mono text-gray-400">
                                      {new Date(m.created_at).toLocaleString('ru-RU', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-gray-700 dark:text-gray-200 whitespace-pre-line">
                                    {m.message}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStudentMessage(m.id)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                                  title="Удалить сообщение"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ВКЛАДКА 5: УПРАВЛЕНИЕ АДМИНИСТРАТОРАМИ (ТОЛЬКО ГЛАВНЫЙ АДМИН) */}
        {isSuperadmin && activeMode === 'admins' && (
          <AdminsManagerTab onAdminsCountChange={setAdminsCount} />
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
                    <option value="1-4">1–4 класс</option>
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

      {/* МОДАЛКА ОТПРАВКИ СООБЩЕНИЯ УЧЕНИКУ */}
      {messageTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-lg rounded-[28px] p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#3F51B5]" />
                  <span>Сообщение ученику</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Кому: <b>{messageTarget.student.full_name}</b> ({messageTarget.student.grade_class})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMessageTarget(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {messageTarget.bookTitle && (
              <div className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 text-xs font-semibold flex items-center justify-between gap-2">
                <span>📖 Книга: {messageTarget.bookTitle}</span>
                <button
                  type="button"
                  onClick={() =>
                    setMessageTarget({ ...messageTarget, bookId: null, bookTitle: null })
                  }
                  className="text-[11px] opacity-70 hover:opacity-100"
                >
                  Убрать
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-gray-500">Быстрые шаблоны:</div>
              <div className="flex flex-wrap gap-1.5">
                {MESSAGE_TEMPLATES.map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMessageDraft(tpl)}
                    className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-[11px] text-left text-gray-700 dark:text-gray-200 transition-colors"
                  >
                    {tpl.slice(0, 48)}…
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSendStudentMessage} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500">Текст сообщения</label>
                <textarea
                  rows={4}
                  required
                  value={messageDraft}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  placeholder="Напишите замечание или комментарий ученику — оно появится у него в личном профиле..."
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:border-indigo-500"
                />
              </div>

              {messageError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-semibold">
                  {messageError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setMessageTarget(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-bold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSendingMessage || !messageDraft.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingMessage ? 'Отправка...' : 'Отправить ученику'}</span>
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
