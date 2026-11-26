'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Clock,
  Edit3,
  ExternalLink,
  Filter,
  GraduationCap,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { AdminProgressRow } from '@/lib/progressBackups';
import {
  evaluateBookCompletion,
  evaluateReadingPace,
  formatReadingDuration,
  formatTurnSpeed,
  type ReadingPaceStatus,
} from '@/lib/readingMetrics';
import { isAutoWarningMessage } from '@/lib/autoWarnings';
import {
  formatPointsDelta,
  sumPointAdjustments,
  type StudentPointAdjustment,
} from '@/lib/pointAdjustments';
import {
  calculateStudentPoints,
  getAgeGroup,
  getStudentRank,
  parseStudentGrade,
} from '@/lib/gamification';
import { normalizeStudentClass, normalizeStudentName } from '@/lib/studentNormalize';

export interface AdminStudentProgressItem {
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
}

export interface AdminStudentRow {
  id: string;
  full_name: string;
  grade_class: string;
  created_at: string;
  reading_progress: AdminStudentProgressItem[];
}

export interface AdminStudentMessageItem {
  id: string;
  student_id: string;
  book_id: string | null;
  book_title: string | null;
  sender_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface AdminBookOption {
  id: string;
  title: string;
  author: string;
}

type StatusFilter =
  | 'all'
  | 'active'
  | 'completed'
  | 'inactive'
  | 'suspicious'
  | 'with-messages';

type AgeFilter = 'all' | 'junior' | 'middle' | 'senior';

type SortOption =
  | 'newest'
  | 'points_desc'
  | 'points_asc'
  | 'time_desc'
  | 'time_asc'
  | 'books_desc'
  | 'name_asc'
  | 'name_desc'
  | 'class_asc'
  | 'class_desc';

interface EnrichedStudent {
  student: AdminStudentRow;
  points: ReturnType<typeof calculateStudentPoints>;
  rank: ReturnType<typeof getStudentRank>;
  totalReadingSec: number;
  totalPagesTurned: number;
  booksCount: number;
  completedBooksCount: number;
  suspiciousBooksCount: number;
  fastBooksCount: number;
  hasSuspicious: boolean;
  paceStatus: ReadingPaceStatus;
  avgProgressPercent: number;
  latestBookRow: AdminStudentProgressItem | null;
  latestBookTitle: string | null;
  messages: AdminStudentMessageItem[];
  unreadMessagesCount: number;
  adjustmentsCount: number;
  bookTitlesLower: string[];
}

interface AdminStudentsTabProps {
  students: AdminStudentRow[];
  books: AdminBookOption[];
  messagesByStudent: Record<string, AdminStudentMessageItem[]>;
  adjustmentsByStudent: Record<string, StudentPointAdjustment[]>;
  messageTemplates: string[];
  restrictedClasses?: string[];
  onRefresh: () => Promise<void> | void;
  onOpenMessageModal: (
    student: AdminStudentRow,
    bookId?: string | null,
    bookTitle?: string | null,
    initialText?: string
  ) => void;
  onDeleteStudentMessage: (msgId: string) => Promise<void> | void;
  onOpenProgressEditor: (student: AdminStudentRow, row: AdminProgressRow | null) => void;
  onResetBookProgress: (
    student: AdminStudentRow,
    row: AdminStudentProgressItem,
    bookTitle: string
  ) => Promise<void> | void;
}

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50] as const;

function buildPaginationRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) pages.push('ellipsis');
  for (let p = left; p <= right; p++) {
    pages.push(p);
  }
  if (right < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function AdminStudentsTab({
  students,
  books,
  messagesByStudent,
  adjustmentsByStudent,
  messageTemplates,
  restrictedClasses,
  onRefresh,
  onOpenMessageModal,
  onDeleteStudentMessage,
  onOpenProgressEditor,
  onResetBookProgress,
}: AdminStudentsTabProps) {
  const hasRestrictedClasses = Boolean(restrictedClasses && restrictedClasses.length > 0);
  // Поиск, фильтры и сортировка
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [bookFilter, setBookFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Пагинация (убирает бесконечный скролл вниз)
  const [pageSize, setPageSize] = useState<number>(15);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Раскрытая строка прогресса ученика (свернута по умолчанию)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  // Модалка редактирования ученика
  const [editingStudent, setEditingStudent] = useState<AdminStudentRow | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editGradeClass, setEditGradeClass] = useState('');
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [editStudentError, setEditStudentError] = useState('');

  // Модалка удаления ученика
  const [deletingStudent, setDeletingStudent] = useState<EnrichedStudent | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [deleteStudentError, setDeleteStudentError] = useState('');

  const booksById = useMemo(() => {
    const map: Record<string, AdminBookOption> = {};
    for (const b of books) map[b.id] = b;
    return map;
  }, [books]);

  const enrichedStudents = useMemo<EnrichedStudent[]>(() => {
    return students.map((st) => {
      const progressRows = st.reading_progress || [];
      const adjustments = adjustmentsByStudent[st.id] || [];
      const bonusPoints = sumPointAdjustments(adjustments);

      const metricsList = progressRows.map((r) => ({
        progressPercent: r.progress_percent || 0,
        readingSeconds: Number(r.reading_seconds || 0),
        pagesTurned: Number(r.pages_turned || 0),
        fastTurnsCount: Number(r.fast_turns_count || 0),
        avgSecondsPerPage: Number(r.avg_seconds_per_page || 0),
        minSecondsPerPage:
          r.min_seconds_per_page !== null && r.min_seconds_per_page !== undefined
            ? Number(r.min_seconds_per_page)
            : null,
      }));

      const points = calculateStudentPoints(metricsList, st.grade_class, bonusPoints);
      const rank = getStudentRank(points.totalPoints, getAgeGroup(st.grade_class));

      let totalReadingSec = 0;
      let totalPagesTurned = 0;
      let completedBooksCount = 0;
      let suspiciousBooksCount = 0;
      let fastBooksCount = 0;
      let percentSum = 0;

      for (let i = 0; i < progressRows.length; i++) {
        const row = progressRows[i];
        const m = metricsList[i];
        totalReadingSec += m.readingSeconds;
        totalPagesTurned += m.pagesTurned;

        const pace = evaluateReadingPace(m);
        const completion = evaluateBookCompletion(m);
        if (pace.status === 'suspicious') suspiciousBooksCount += 1;
        else if (pace.status === 'fast') fastBooksCount += 1;

        const isUnverifiedFinish = m.progressPercent >= 94 && !completion.counted;
        const effectivePercent = isUnverifiedFinish
          ? Math.min(m.progressPercent, 94)
          : m.progressPercent;
        percentSum += effectivePercent;

        if (m.progressPercent >= 95 && completion.counted) {
          completedBooksCount += 1;
        }
      }

      const booksCount = progressRows.length;
      const avgProgressPercent =
        booksCount > 0 ? Math.round(percentSum / booksCount) : 0;

      let latestBookRow: AdminStudentProgressItem | null = null;
      if (booksCount > 0) {
        latestBookRow = [...progressRows].sort((a, b) => {
          const ta = a.last_read_at ? Date.parse(a.last_read_at) : 0;
          const tb = b.last_read_at ? Date.parse(b.last_read_at) : 0;
          if (tb !== ta) return tb - ta;
          return (b.progress_percent || 0) - (a.progress_percent || 0);
        })[0];
      }

      const hasSuspicious = suspiciousBooksCount > 0;
      const paceStatus: ReadingPaceStatus = hasSuspicious
        ? 'suspicious'
        : fastBooksCount > 0
        ? 'fast'
        : booksCount > 0
        ? 'normal'
        : 'none';

      const messages = messagesByStudent[st.id] || [];
      const unreadMessagesCount = messages.filter((m) => !m.is_read).length;

      const bookTitlesLower = progressRows.map((r) =>
        (booksById[r.book_id]?.title || r.book_id || '').toLowerCase()
      );

      return {
        student: st,
        points,
        rank,
        totalReadingSec,
        totalPagesTurned,
        booksCount,
        completedBooksCount,
        suspiciousBooksCount,
        fastBooksCount,
        hasSuspicious,
        paceStatus,
        avgProgressPercent,
        latestBookRow,
        latestBookTitle: latestBookRow
          ? booksById[latestBookRow.book_id]?.title || latestBookRow.book_id
          : null,
        messages,
        unreadMessagesCount,
        adjustmentsCount: adjustments.length,
        bookTitlesLower,
      };
    });
  }, [students, booksById, messagesByStudent, adjustmentsByStudent]);

  // Сводные KPI по всем ученикам
  const summaryStats = useMemo(() => {
    let active = 0;
    let completed = 0;
    let suspicious = 0;
    let inactive = 0;
    let withMessages = 0;

    for (const item of enrichedStudents) {
      if (item.booksCount > 0) active += 1;
      else inactive += 1;
      if (item.completedBooksCount > 0) completed += 1;
      if (item.hasSuspicious) suspicious += 1;
      if (item.messages.length > 0) withMessages += 1;
    }

    return {
      total: enrichedStudents.length,
      active,
      completed,
      suspicious,
      inactive,
      withMessages,
    };
  }, [enrichedStudents]);

  const availableClasses = useMemo(() => {
    const uniq = Array.from(new Set(students.map((s) => s.grade_class).filter(Boolean)));
    return uniq.sort((a, b) => {
      const diff = parseStudentGrade(a) - parseStudentGrade(b);
      return diff !== 0 ? diff : a.localeCompare(b, 'ru');
    });
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = enrichedStudents.filter((item) => {
      const st = item.student;
      if (classFilter !== 'all' && st.grade_class !== classFilter) return false;
      if (ageFilter !== 'all' && getAgeGroup(st.grade_class) !== ageFilter) return false;
      if (
        bookFilter !== 'all' &&
        !(st.reading_progress || []).some((r) => r.book_id === bookFilter)
      ) {
        return false;
      }

      if (statusFilter === 'suspicious' && !item.hasSuspicious) return false;
      if (statusFilter === 'active' && item.booksCount === 0) return false;
      if (statusFilter === 'inactive' && item.booksCount > 0) return false;
      if (statusFilter === 'completed' && item.completedBooksCount === 0) return false;
      if (statusFilter === 'with-messages' && item.messages.length === 0) return false;

      if (!q) return true;
      return (
        st.full_name.toLowerCase().includes(q) ||
        st.grade_class.toLowerCase().includes(q) ||
        item.bookTitlesLower.some((t) => t.includes(q))
      );
    });

    if (sortBy === 'points_desc') {
      return [...list].sort((a, b) => b.points.totalPoints - a.points.totalPoints);
    }
    if (sortBy === 'points_asc') {
      return [...list].sort((a, b) => a.points.totalPoints - b.points.totalPoints);
    }
    if (sortBy === 'time_desc') {
      return [...list].sort((a, b) => b.totalReadingSec - a.totalReadingSec);
    }
    if (sortBy === 'time_asc') {
      return [...list].sort((a, b) => a.totalReadingSec - b.totalReadingSec);
    }
    if (sortBy === 'books_desc') {
      return [...list].sort(
        (a, b) =>
          b.booksCount - a.booksCount ||
          b.avgProgressPercent - a.avgProgressPercent
      );
    }
    if (sortBy === 'name_asc') {
      return [...list].sort((a, b) =>
        a.student.full_name.localeCompare(b.student.full_name, 'ru')
      );
    }
    if (sortBy === 'name_desc') {
      return [...list].sort((a, b) =>
        b.student.full_name.localeCompare(a.student.full_name, 'ru')
      );
    }
    if (sortBy === 'class_asc') {
      return [...list].sort((a, b) => {
        const diff =
          parseStudentGrade(a.student.grade_class) -
          parseStudentGrade(b.student.grade_class);
        return diff !== 0
          ? diff
          : a.student.grade_class.localeCompare(b.student.grade_class, 'ru');
      });
    }
    if (sortBy === 'class_desc') {
      return [...list].sort((a, b) => {
        const diff =
          parseStudentGrade(b.student.grade_class) -
          parseStudentGrade(a.student.grade_class);
        return diff !== 0
          ? diff
          : b.student.grade_class.localeCompare(a.student.grade_class, 'ru');
      });
    }
    return list;
  }, [
    enrichedStudents,
    searchQuery,
    classFilter,
    ageFilter,
    bookFilter,
    statusFilter,
    sortBy,
  ]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    classFilter !== 'all' ||
    ageFilter !== 'all' ||
    bookFilter !== 'all' ||
    statusFilter !== 'all' ||
    sortBy !== 'newest';

  const resetFilters = () => {
    setSearchQuery('');
    setClassFilter('all');
    setAgeFilter('all');
    setBookFilter('all');
    setStatusFilter('all');
    setSortBy('newest');
    setCurrentPage(1);
  };

  // Сброс страницы при смене фильтров/поиска/размера страницы
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, classFilter, ageFilter, bookFilter, statusFilter, sortBy, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedStudents = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, safePage, pageSize]);

  const rangeStart = filteredStudents.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(filteredStudents.length, safePage * pageSize);

  const toggleColumnSort = (col: 'name' | 'class' | 'points' | 'books' | 'time') => {
    if (col === 'name') {
      setSortBy((prev) => (prev === 'name_asc' ? 'name_desc' : 'name_asc'));
    } else if (col === 'class') {
      setSortBy((prev) => (prev === 'class_asc' ? 'class_desc' : 'class_asc'));
    } else if (col === 'points') {
      setSortBy((prev) => (prev === 'points_desc' ? 'points_asc' : 'points_desc'));
    } else if (col === 'books') {
      setSortBy('books_desc');
    } else if (col === 'time') {
      setSortBy((prev) => (prev === 'time_desc' ? 'time_asc' : 'time_desc'));
    }
  };

  const renderSortIcon = (col: 'name' | 'class' | 'points' | 'books' | 'time') => {
    if (col === 'name') {
      if (sortBy === 'name_asc') return <ArrowUp className="w-3 h-3 text-indigo-600" />;
      if (sortBy === 'name_desc') return <ArrowDown className="w-3 h-3 text-indigo-600" />;
    } else if (col === 'class') {
      if (sortBy === 'class_asc') return <ArrowUp className="w-3 h-3 text-indigo-600" />;
      if (sortBy === 'class_desc') return <ArrowDown className="w-3 h-3 text-indigo-600" />;
    } else if (col === 'points') {
      if (sortBy === 'points_desc') return <ArrowDown className="w-3 h-3 text-indigo-600" />;
      if (sortBy === 'points_asc') return <ArrowUp className="w-3 h-3 text-indigo-600" />;
    } else if (col === 'books') {
      if (sortBy === 'books_desc') return <ArrowDown className="w-3 h-3 text-indigo-600" />;
    } else if (col === 'time') {
      if (sortBy === 'time_desc') return <ArrowDown className="w-3 h-3 text-indigo-600" />;
      if (sortBy === 'time_asc') return <ArrowUp className="w-3 h-3 text-indigo-600" />;
    }
    return <ArrowUpDown className="w-3 h-3 opacity-35" />;
  };

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const openEditStudentModal = (st: AdminStudentRow) => {
    setEditingStudent(st);
    setEditFullName(st.full_name);
    setEditGradeClass(normalizeStudentClass(st.grade_class));
    setEditStudentError('');
  };

  const normalizedEditPreviewName = normalizeStudentName(editFullName);
  const normalizedEditPreviewClass = normalizeStudentClass(editGradeClass);

  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    setIsSavingStudent(true);
    setEditStudentError('');
    try {
      const res = await fetch(`/api/students/${editingStudent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: editFullName,
          grade_class: editGradeClass,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setEditStudentError(data?.error || 'Не удалось сохранить изменения ученика.');
        return;
      }

      setEditingStudent(null);
      await onRefresh();
    } catch {
      setEditStudentError('Ошибка сети при сохранении данных ученика.');
    } finally {
      setIsSavingStudent(false);
    }
  };

  const handleConfirmDeleteStudent = async () => {
    if (!deletingStudent) return;

    setIsDeletingStudent(true);
    setDeleteStudentError('');
    try {
      const targetId = deletingStudent.student.id;
      const res = await fetch(`/api/students/${targetId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setDeleteStudentError(data?.error || 'Не удалось удалить ученика.');
        return;
      }

      if (expandedStudentId === targetId) {
        setExpandedStudentId(null);
      }
      setDeletingStudent(null);
      await onRefresh();
    } catch {
      setDeleteStudentError('Ошибка сети при удалении ученика.');
    } finally {
      setIsDeletingStudent(false);
    }
  };

  const paginationItems = buildPaginationRange(safePage, totalPages);

  return (
    <div className="bg-white dark:bg-[#1C1F26] p-4 sm:p-5 rounded-[28px] shadow-sm border border-gray-200/80 dark:border-gray-800 space-y-3.5">
      {/* Баннер закреплённых классов куратора */}
      {hasRestrictedClasses && restrictedClasses && (
        <div className="px-3.5 py-2 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-900/40 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-900 dark:text-emerald-200">
            <GraduationCap className="w-4 h-4 text-emerald-600" />
            <span>
              {restrictedClasses.length === 1 ? 'Ваш класс:' : 'Ваши закреплённые классы:'}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {restrictedClasses.map((cls) => (
              <span
                key={cls}
                className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10.5px] font-bold"
              >
                {cls}
              </span>
            ))}
          </div>
          <span className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 sm:ml-auto">
            Отображаются только ученики ваших классов
          </span>
        </div>
      )}

      {/* Компактная строка KPI-метрик (быстрые фильтры) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-2 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 ${
            statusFilter === 'all'
              ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
              : 'bg-[#F8F9FE] dark:bg-[#14161C] border-gray-200/80 dark:border-gray-800 hover:border-indigo-200'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Всего
            </div>
            <div className="text-base font-extrabold font-mono text-gray-900 dark:text-white leading-tight">
              {summaryStats.total}
            </div>
          </div>
          <Users className="w-4 h-4 text-indigo-500 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) => (prev === 'active' ? 'all' : 'active'))
          }
          className={`px-3 py-2 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 ${
            statusFilter === 'active'
              ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700'
              : 'bg-[#F8F9FE] dark:bg-[#14161C] border-gray-200/80 dark:border-gray-800 hover:border-sky-200'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Читают
            </div>
            <div className="text-base font-extrabold font-mono text-sky-700 dark:text-sky-300 leading-tight">
              {summaryStats.active}
            </div>
          </div>
          <BookOpen className="w-4 h-4 text-sky-500 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) => (prev === 'completed' ? 'all' : 'completed'))
          }
          className={`px-3 py-2 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 ${
            statusFilter === 'completed'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
              : 'bg-[#F8F9FE] dark:bg-[#14161C] border-gray-200/80 dark:border-gray-800 hover:border-emerald-200'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Дочитали
            </div>
            <div className="text-base font-extrabold font-mono text-emerald-700 dark:text-emerald-300 leading-tight">
              {summaryStats.completed}
            </div>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) => (prev === 'suspicious' ? 'all' : 'suspicious'))
          }
          className={`px-3 py-2 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 ${
            statusFilter === 'suspicious'
              ? 'bg-red-600 text-white border-red-600 shadow-sm'
              : summaryStats.suspicious > 0
              ? 'bg-red-50/70 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 hover:bg-red-100/70'
              : 'bg-[#F8F9FE] dark:bg-[#14161C] border-gray-200/80 dark:border-gray-800'
          }`}
        >
          <div>
            <div
              className={`text-[10px] font-bold uppercase tracking-wide ${
                statusFilter === 'suspicious'
                  ? 'text-red-100'
                  : 'text-red-600/80 dark:text-red-400'
              }`}
            >
              Подозрения
            </div>
            <div
              className={`text-base font-extrabold font-mono leading-tight ${
                statusFilter === 'suspicious'
                  ? 'text-white'
                  : 'text-red-700 dark:text-red-300'
              }`}
            >
              {summaryStats.suspicious}
            </div>
          </div>
          <ShieldAlert
            className={`w-4 h-4 shrink-0 ${
              statusFilter === 'suspicious' ? 'text-white' : 'text-red-500'
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) => (prev === 'inactive' ? 'all' : 'inactive'))
          }
          className={`px-3 py-2 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 col-span-2 sm:col-span-1 ${
            statusFilter === 'inactive'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
              : 'bg-[#F8F9FE] dark:bg-[#14161C] border-gray-200/80 dark:border-gray-800 hover:border-amber-200'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Не начали
            </div>
            <div className="text-base font-extrabold font-mono text-gray-700 dark:text-gray-300 leading-tight">
              {summaryStats.inactive}
            </div>
          </div>
          <Clock className="w-4 h-4 text-gray-400 shrink-0" />
        </button>
      </div>

      {/* Поиск и фильтры */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по ФИО ученика, классу или названию книги..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs sm:text-sm outline-none focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                title="Очистить поиск"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Количество строк на странице"
              className="px-2.5 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
              title="Строк на странице"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  По {size} на стр.
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className="px-3 py-2 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-500 transition-colors text-xs font-bold inline-flex items-center gap-1.5"
              title="Обновить список учеников"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Обновить</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
          >
            <option value="all">Все классы</option>
            {availableClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls} класс
              </option>
            ))}
          </select>

          <select
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value as AgeFilter)}
            className="px-2.5 py-1.5 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
          >
            <option value="all">Все возрасты</option>
            <option value="junior">1–6 классы</option>
            <option value="middle">7–9 классы</option>
            <option value="senior">10–11 классы</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-2.5 py-1.5 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
          >
            <option value="all">Любой статус</option>
            <option value="active">Читают книги</option>
            <option value="completed">Есть дочитанные (100%)</option>
            <option value="inactive">Ещё не начали читать</option>
            <option value="suspicious">Подозрение на пролистывание</option>
            <option value="with-messages">С сообщениями ({summaryStats.withMessages})</option>
          </select>

          <select
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500"
          >
            <option value="all">Все книги</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-2.5 py-1.5 rounded-xl bg-[#F8F9FE] dark:bg-[#14161C] border border-gray-200 dark:border-gray-700 text-xs font-semibold outline-none focus:border-indigo-500 col-span-2 sm:col-span-1"
          >
            <option value="newest">Сначала новые</option>
            <option value="points_desc">Баллы: сначала больше</option>
            <option value="points_asc">Баллы: сначала меньше</option>
            <option value="time_desc">Время чтения ↓</option>
            <option value="books_desc">Больше книг ↓</option>
            <option value="name_asc">Имя (А–Я)</option>
            <option value="name_desc">Имя (Я–А)</option>
            <option value="class_asc">Класс (по возрастанию)</option>
            <option value="class_desc">Класс (по убыванию)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-500" />
            <span>
              Показаны{' '}
              <b className="text-gray-800 dark:text-gray-200">
                {rangeStart}–{rangeEnd}
              </b>{' '}
              из{' '}
              <b className="text-gray-800 dark:text-gray-200">{filteredStudents.length}</b>
              {filteredStudents.length !== students.length && (
                <span> (всего в базе: {students.length})</span>
              )}
            </span>
          </span>

          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-[11px] text-gray-400">
              Нажмите на строку ученика, чтобы раскрыть прогресс по книгам
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        </div>
      </div>

      {/* КОМПАКТНАЯ ТАБЛИЦА УЧЕНИКОВ */}
      {filteredStudents.length === 0 ? (
        <div className="py-10 text-center text-xs text-gray-400 space-y-2 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
          <p>
            {hasActiveFilters
              ? 'По выбранным фильтрам ученики не найдены.'
              : 'Пока нет зарегистрированных учеников.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FE] dark:bg-[#14161C] border-b border-gray-200/80 dark:border-gray-800 text-[11px] font-bold text-gray-500 dark:text-gray-400 select-none">
                  <th className="w-8 py-2.5 pl-3 pr-1" aria-label="Раскрыть" />
                  <th className="py-2.5 px-2.5">
                    <button
                      type="button"
                      onClick={() => toggleColumnSort('name')}
                      className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <span>Ученик</span>
                      {renderSortIcon('name')}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleColumnSort('class')}
                      className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <span>Класс</span>
                      {renderSortIcon('class')}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleColumnSort('points')}
                      className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <span>Баллы / Ранг</span>
                      {renderSortIcon('points')}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5">
                    <button
                      type="button"
                      onClick={() => toggleColumnSort('books')}
                      className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <span>Прогресс чтения</span>
                      {renderSortIcon('books')}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleColumnSort('time')}
                      className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <span>Время</span>
                      {renderSortIcon('time')}
                    </button>
                  </th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap">Статус</th>
                  <th className="py-2.5 pl-2 pr-3 text-right whitespace-nowrap">Действия</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/80 text-xs">
                {paginatedStudents.map((item) => {
                  const st = item.student;
                  const isExpanded = expandedStudentId === st.id;
                  const sortedProgress = [...(st.reading_progress || [])].sort(
                    (a, b) =>
                      (b.progress_percent || 0) - (a.progress_percent || 0) ||
                      Number(b.reading_seconds || 0) - Number(a.reading_seconds || 0)
                  );
                  const focusBookRow =
                    bookFilter !== 'all'
                      ? (st.reading_progress || []).find((r) => r.book_id === bookFilter) ||
                        item.latestBookRow
                      : item.latestBookRow;
                  const focusBookTitle = focusBookRow
                    ? booksById[focusBookRow.book_id]?.title || focusBookRow.book_id
                    : null;

                  return (
                    <React.Fragment key={st.id}>
                      <tr
                        onClick={() =>
                          setExpandedStudentId((prev) => (prev === st.id ? null : st.id))
                        }
                        className={`cursor-pointer transition-colors ${
                          isExpanded
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/25'
                            : item.hasSuspicious
                            ? 'bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50/60 dark:hover:bg-red-950/20'
                            : 'hover:bg-gray-50/80 dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        {/* Кнопка раскрытия */}
                        <td className="py-2.5 pl-3 pr-1 align-middle">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedStudentId((prev) => (prev === st.id ? null : st.id));
                            }}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                              isExpanded
                                ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-700'
                            }`}
                            title={isExpanded ? 'Свернуть прогресс' : 'Раскрыть прогресс по книгам'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>

                        {/* Ученик */}
                        <td className="py-2.5 px-2.5 align-middle min-w-[165px]">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/admin/students/${st.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-bold text-gray-900 dark:text-white hover:text-[#3F51B5] dark:hover:text-[#A5B4FC] hover:underline inline-flex items-center gap-1 truncate max-w-[200px]"
                              title={`Открыть профиль: ${st.full_name}`}
                            >
                              <span className="truncate">{st.full_name}</span>
                              <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
                            </Link>
                          </div>
                          <div className="text-[10.5px] text-gray-400 font-mono">
                            {st.created_at
                              ? new Date(st.created_at).toLocaleDateString('ru-RU', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: '2-digit',
                                })
                              : '—'}
                          </div>
                        </td>

                        {/* Класс */}
                        <td className="py-2.5 px-2.5 align-middle whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200">
                            {st.grade_class}
                          </span>
                        </td>

                        {/* Баллы и ранг */}
                        <td className="py-2.5 px-2.5 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold font-mono text-amber-700 dark:text-amber-300">
                              ⭐ {item.points.totalPoints}
                            </span>
                            {item.points.bonusPoints !== 0 && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold font-mono ${
                                  item.points.bonusPoints > 0
                                    ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                                    : 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                }`}
                                title="Ручная корректировка баллов"
                              >
                                {formatPointsDelta(item.points.bonusPoints)}
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-gray-500 dark:text-gray-400 truncate max-w-[140px]">
                            {item.rank.current.icon} {item.rank.current.title}
                          </div>
                        </td>

                        {/* Прогресс чтения */}
                        <td className="py-2.5 px-2.5 align-middle min-w-[240px] max-w-[320px]">
                          {item.booksCount > 0 ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden shrink-0">
                                  <div
                                    className={`h-full rounded-full ${
                                      item.hasSuspicious
                                        ? 'bg-red-500'
                                        : item.completedBooksCount > 0
                                        ? 'bg-emerald-500'
                                        : 'bg-indigo-500'
                                    }`}
                                    style={{
                                      width: `${Math.max(4, Math.min(100, item.avgProgressPercent))}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-mono text-[11px] font-bold text-gray-700 dark:text-gray-200">
                                  {item.avgProgressPercent}%
                                </span>
                                <span className="text-[10.5px] text-gray-500 dark:text-gray-400">
                                  Книг: <b>{item.booksCount}</b>
                                  {item.completedBooksCount > 0 && (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">
                                      ✓{item.completedBooksCount}
                                    </span>
                                  )}
                                </span>
                              </div>
                              {focusBookRow && (
                                <div
                                  className="flex items-center gap-1.5 text-[10.5px] text-gray-500 dark:text-gray-400 min-w-0"
                                  title={`${focusBookTitle} — Глава ${focusBookRow.current_chapter + 1}, стр. ${focusBookRow.current_page + 1} (${focusBookRow.progress_percent}%)`}
                                >
                                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                                    {focusBookTitle}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-[10px] shrink-0">
                                    Гл. {focusBookRow.current_chapter + 1}, стр.{' '}
                                    {focusBookRow.current_page + 1}
                                  </span>
                                  <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
                                    {focusBookRow.progress_percent}%
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">
                              Ещё не начал читать
                            </span>
                          )}
                        </td>

                        {/* Время */}
                        <td className="py-2.5 px-2.5 align-middle whitespace-nowrap">
                          <div className="font-mono font-semibold text-gray-800 dark:text-gray-200">
                            {formatReadingDuration(item.totalReadingSec)}
                          </div>
                          <div className="text-[10.5px] text-gray-400 font-mono">
                            {item.totalPagesTurned > 0
                              ? `${item.totalPagesTurned} стр.`
                              : '0 стр.'}
                          </div>
                        </td>

                        {/* Статус темпа + сообщения */}
                        <td className="py-2.5 px-2.5 align-middle whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            {item.paceStatus === 'suspicious' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 text-[10px] font-bold">
                                <ShieldAlert className="w-3 h-3" />
                                Подозрение ({item.suspiciousBooksCount})
                              </span>
                            )}
                            {item.paceStatus === 'fast' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[10px] font-bold">
                                <Zap className="w-3 h-3" />
                                Быстрый темп
                              </span>
                            )}
                            {item.paceStatus === 'normal' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                                <ShieldCheck className="w-3 h-3" />
                                Норма
                              </span>
                            )}
                            {item.paceStatus === 'none' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 text-[10px] font-semibold">
                                Не активен
                              </span>
                            )}

                            {item.messages.length > 0 && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  item.unreadMessagesCount > 0
                                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                                    : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                                }`}
                                title={
                                  item.unreadMessagesCount > 0
                                    ? `Сообщений: ${item.messages.length} (непрочитанных: ${item.unreadMessagesCount})`
                                    : `Сообщений: ${item.messages.length}`
                                }
                              >
                                <MessageSquare className="w-2.5 h-2.5" />
                                {item.messages.length}
                                {item.unreadMessagesCount > 0 && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                )}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Действия */}
                        <td
                          className="py-2.5 pl-2 pr-3 align-middle text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenProgressEditor(st, null)}
                              className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                              title="Добавить или восстановить прогресс по книге"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            <Link
                              href={`/admin/students/${st.id}?tab=rewards`}
                              className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                              title="Управление баллами ученика"
                            >
                              <Star className="w-3.5 h-3.5" />
                            </Link>

                            <button
                              type="button"
                              onClick={() =>
                                onOpenMessageModal(
                                  st,
                                  null,
                                  null,
                                  item.hasSuspicious ? messageTemplates[0] || '' : ''
                                )
                              }
                              className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                              title="Написать сообщение ученику"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditStudentModal(st)}
                              className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                              title="Редактировать ФИО и класс ученика"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setDeletingStudent(item);
                                setDeleteStudentError('');
                              }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                              title="Удалить ученика"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* РАСКРЫВАЕМАЯ КОМПАКТНАЯ ПАНЕЛЬ ПРОГРЕССА И СООБЩЕНИЙ */}
                      {isExpanded && (
                        <tr className="bg-[#F8F9FE]/90 dark:bg-[#13161E]">
                          <td colSpan={8} className="p-3 sm:p-4">
                            <div className="space-y-3">
                              {/* Верхняя панель быстрых действий внутри раскрытой строки */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200/80 dark:border-gray-800">
                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                  <span className="font-extrabold text-gray-800 dark:text-gray-100">
                                    Прогресс чтения: {st.full_name} ({st.grade_class})
                                  </span>
                                  <span className="text-gray-400">•</span>
                                  <span className="font-mono text-gray-600 dark:text-gray-300">
                                    Честных стр.: <b>{item.points.honestPagesCount}</b>
                                    {item.points.fastPagesIgnored > 0 && (
                                      <span className="text-red-500 ml-1">
                                        (быстрых: {item.points.fastPagesIgnored})
                                      </span>
                                    )}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Link
                                    href={`/admin/students/${st.id}`}
                                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-700 hover:border-indigo-400 text-[11px] font-bold text-gray-700 dark:text-gray-200 inline-flex items-center gap-1"
                                  >
                                    <span>Полный профиль</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => onOpenProgressEditor(st, null)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Книга / прогресс</span>
                                  </button>
                                  <Link
                                    href={`/admin/students/${st.id}?tab=rewards`}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold inline-flex items-center gap-1"
                                  >
                                    <span>⭐ Баллы</span>
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenMessageModal(
                                        st,
                                        null,
                                        null,
                                        item.hasSuspicious ? messageTemplates[0] || '' : ''
                                      )
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-[#3F51B5] hover:bg-[#303F9F] text-white text-[11px] font-bold inline-flex items-center gap-1"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    <span>Написать</span>
                                  </button>
                                </div>
                              </div>

                              {/* Компактная 2-колоночная сетка книг (с ограничением высоты) */}
                              {sortedProgress.length > 0 ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
                                  {sortedProgress.map((row) => {
                                    const bookObj = booksById[row.book_id];
                                    const bookTitle = bookObj?.title || row.book_id;
                                    const readingSec = Number(row.reading_seconds || 0);
                                    const pagesTurned = Number(row.pages_turned || 0);
                                    const fastTurns = Number(row.fast_turns_count || 0);
                                    const avgSec = Number(row.avg_seconds_per_page || 0);
                                    const minSec =
                                      row.min_seconds_per_page !== null &&
                                      row.min_seconds_per_page !== undefined
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
                                      (row.progress_percent || 0) >= 94 &&
                                      !completionCheck.counted;
                                    const displayPercent = isUnverifiedFinish
                                      ? Math.min(row.progress_percent || 0, 94)
                                      : row.progress_percent || 0;

                                    return (
                                      <div
                                        key={row.id}
                                        className={`p-2.5 rounded-xl bg-white dark:bg-[#1C1F26] border space-y-1.5 ${
                                          pace.status === 'suspicious'
                                            ? 'border-red-200 dark:border-red-900/50'
                                            : 'border-gray-200/80 dark:border-gray-800'
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <span
                                                className="font-bold text-xs text-indigo-700 dark:text-indigo-300 truncate"
                                                title={bookTitle}
                                              >
                                                {bookTitle}
                                              </span>
                                              {row.is_bookmarked && (
                                                <span
                                                  className="text-amber-500 text-[11px] shrink-0"
                                                  title="В закладках"
                                                >
                                                  ★
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-[10.5px] text-gray-400">
                                              Гл. {row.current_chapter + 1}, стр.{' '}
                                              {row.current_page + 1}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1 shrink-0">
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold font-mono ${
                                                isUnverifiedFinish
                                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'
                                                  : displayPercent >= 95
                                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                                  : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                                              }`}
                                              title={
                                                isUnverifiedFinish
                                                  ? `Не засчитано 100%: ${completionCheck.reason}`
                                                  : undefined
                                              }
                                            >
                                              {isUnverifiedFinish
                                                ? `Не засч. ${displayPercent}%`
                                                : `${displayPercent}%`}
                                            </span>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                onOpenMessageModal(
                                                  st,
                                                  row.book_id,
                                                  bookTitle,
                                                  pace.status === 'suspicious'
                                                    ? `По книге «${bookTitle}»: ${messageTemplates[0] || ''}`
                                                    : ''
                                                )
                                              }
                                              className={`p-1 rounded-lg transition-colors ${
                                                pace.status === 'suspicious'
                                                  ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
                                                  : 'text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                                              }`}
                                              title="Написать по этой книге"
                                            >
                                              <MessageSquare className="w-3.5 h-3.5" />
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => onOpenProgressEditor(st, row)}
                                              className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                                              title="Изменить главу, страницу, %, время или засчитать 100%"
                                            >
                                              <Edit3 className="w-3.5 h-3.5" />
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                onResetBookProgress(st, row, bookTitle)
                                              }
                                              className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                              title="Сбросить прогресс (с сохранением снимка для отката)"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-semibold">
                                            <Clock className="w-2.5 h-2.5" />
                                            {formatReadingDuration(readingSec)}
                                          </span>

                                          <span
                                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-semibold ${
                                              pace.status === 'suspicious'
                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                                : pace.status === 'fast'
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                                : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                                            }`}
                                            title="Средняя скорость перелистывания"
                                          >
                                            <Zap className="w-2.5 h-2.5" />
                                            {pagesTurned > 0
                                              ? formatTurnSpeed(avgSec)
                                              : 'Нет кликов'}
                                          </span>

                                          {pagesTurned > 0 && (
                                            <span className="text-gray-500 dark:text-gray-400 font-mono">
                                              {pagesTurned} кл.
                                              {fastTurns > 0 && (
                                                <span className="text-red-600 dark:text-red-400 font-bold">
                                                  {' '}
                                                  / {fastTurns} быстр.
                                                </span>
                                              )}
                                              {minSec !== null && ` · мин ${minSec.toFixed(1)}с`}
                                            </span>
                                          )}

                                          {pace.status === 'suspicious' && (
                                            <span
                                              className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[9.5px] font-bold"
                                              title={pace.reason}
                                            >
                                              <ShieldAlert className="w-2.5 h-2.5" />
                                              {pace.label}
                                            </span>
                                          )}
                                          {pace.status === 'fast' && (
                                            <span
                                              className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 text-[9.5px] font-bold"
                                              title={pace.reason}
                                            >
                                              <Zap className="w-2.5 h-2.5" />
                                              {pace.label}
                                            </span>
                                          )}
                                          {pace.status === 'normal' && (
                                            <span
                                              className="ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[9.5px] font-bold"
                                              title={pace.reason}
                                            >
                                              <ShieldCheck className="w-2.5 h-2.5" />
                                              Норма
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-[11px] text-gray-400 italic py-2">
                                  У ученика пока нет сохранённого прогресса по книгам.
                                </div>
                              )}

                              {/* Компактный блок сообщений (если есть) */}
                              {item.messages.length > 0 && (
                                <div className="pt-2 border-t border-gray-200/80 dark:border-gray-800 space-y-1.5">
                                  <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                                    <span>Сообщения ученику ({item.messages.length})</span>
                                  </div>
                                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                                    {item.messages.map((m) => {
                                      const isAuto = isAutoWarningMessage(m.sender_name);
                                      return (
                                        <div
                                          key={m.id}
                                          className={`p-2 rounded-xl border flex items-start justify-between gap-2 text-[11px] ${
                                            isAuto
                                              ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                                              : 'bg-white dark:bg-[#1C1F26] border-indigo-100 dark:border-indigo-900/40'
                                          }`}
                                        >
                                          <div className="space-y-0.5 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1">
                                              {m.sender_name && (
                                                <span className="font-bold text-gray-700 dark:text-gray-200">
                                                  {m.sender_name}
                                                </span>
                                              )}
                                              {isAuto && (
                                                <span className="px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 text-[9px] font-extrabold uppercase">
                                                  Авто
                                                </span>
                                              )}
                                              {m.book_title && (
                                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200 text-[10px] font-semibold">
                                                  📖 {m.book_title}
                                                </span>
                                              )}
                                              <span
                                                className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                                  m.is_read
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-amber-100 text-amber-800'
                                                }`}
                                              >
                                                {m.is_read ? 'Прочитано' : 'Новое'}
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
                                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                                              {m.message}
                                            </p>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => onDeleteStudentMessage(m.id)}
                                            className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
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
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ПАНЕЛЬ ПАГИНАЦИИ */}
          <div className="px-3.5 py-2.5 bg-[#F8F9FE] dark:bg-[#14161C] border-t border-gray-200/80 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              Страница <b className="text-gray-800 dark:text-gray-200">{safePage}</b> из{' '}
              <b className="text-gray-800 dark:text-gray-200">{totalPages}</b>
              {' • '}
              строки {rangeStart}–{rangeEnd} из {filteredStudents.length}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-gray-600 dark:text-gray-300 hover:border-indigo-400 disabled:opacity-35 disabled:pointer-events-none"
                  title="Первая страница"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-gray-600 dark:text-gray-300 hover:border-indigo-400 disabled:opacity-35 disabled:pointer-events-none"
                  title="Предыдущая страница"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {paginationItems.map((entry, idx) =>
                  entry === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="px-1.5 text-gray-400 text-[11px]">
                      …
                    </span>
                  ) : (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => setCurrentPage(entry)}
                      className={`min-w-[28px] h-7 px-2 rounded-lg text-[11px] font-bold transition-colors ${
                        entry === safePage
                          ? 'bg-[#3F51B5] text-white shadow-sm'
                          : 'bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      {entry}
                    </button>
                  )
                )}

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-gray-600 dark:text-gray-300 hover:border-indigo-400 disabled:opacity-35 disabled:pointer-events-none"
                  title="Следующая страница"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1C1F26] text-gray-600 dark:text-gray-300 hover:border-indigo-400 disabled:opacity-35 disabled:pointer-events-none"
                  title="Последняя страница"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* МОДАЛКА РЕДАКТИРОВАНИЯ УЧЕНИКА */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-md rounded-[28px] p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-[#3F51B5]" />
                  <span>Редактировать ученика</span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Весь прогресс чтения, баллы и сообщения сохранятся
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudentEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
                  ФИО ученика *
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Например, Иванов Иван"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
                  Класс *
                </label>
                {hasRestrictedClasses && restrictedClasses ? (
                  <select
                    required
                    value={editGradeClass}
                    onChange={(e) => setEditGradeClass(e.target.value)}
                    className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#16181F] text-sm outline-none focus:border-indigo-500"
                  >
                    {restrictedClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    minLength={1}
                    maxLength={20}
                    value={editGradeClass}
                    onChange={(e) => setEditGradeClass(e.target.value)}
                    placeholder="Например, 7А или 7 «А»"
                    className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              {(normalizedEditPreviewName || normalizedEditPreviewClass) && (
                <div className="px-3 py-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-[11px] text-indigo-800 dark:text-indigo-200">
                  Сохранится в формате входа:{' '}
                  <b>{normalizedEditPreviewName || '—'}</b> •{' '}
                  <b>{normalizedEditPreviewClass || '—'}</b>
                </div>
              )}

              {editStudentError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-semibold">
                  {editStudentError}
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-bold"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={
                    isSavingStudent ||
                    normalizedEditPreviewName.length < 2 ||
                    normalizedEditPreviewClass.length < 1
                  }
                  className="flex-1 py-2.5 rounded-xl bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold disabled:opacity-50"
                >
                  {isSavingStudent ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛКА УДАЛЕНИЯ УЧЕНИКА */}
      {deletingStudent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-sm rounded-[28px] p-6 shadow-2xl border border-red-200 dark:border-red-900/60 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                Удалить ученика?
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Вы действительно хотите удалить{' '}
                <b>{deletingStudent.student.full_name}</b> (
                {deletingStudent.student.grade_class})?
              </p>
              <p className="text-[11px] text-red-600/90 dark:text-red-400">
                Будут безвозвратно удалены: прогресс по книгам ({deletingStudent.booksCount}),
                сообщения ({deletingStudent.messages.length}) и корректировки баллов (
                {deletingStudent.adjustmentsCount}).
              </p>
            </div>

            {deleteStudentError && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-semibold text-left">
                {deleteStudentError}
              </div>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeletingStudent(null)}
                disabled={isDeletingStudent}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-bold"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStudent}
                disabled={isDeletingStudent}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {isDeletingStudent ? 'Удаление...' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
