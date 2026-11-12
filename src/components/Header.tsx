'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, Search, Moon, Sun, X, User, LogOut } from 'lucide-react';
import { useReadingStore } from '@/store/useReadingStore';

export const Header: React.FC = () => {
  const { 
    searchQuery, setSearchQuery, setActiveTab, 
    student, isLoginModalOpen, setLoginModalOpen, 
    loginStudent, logoutStudent, syncFromSupabase 
  } = useReadingStore();
  
  const [isDark, setIsDark] = useState(false);
  const [fullName, setFullName] = useState('');
  const [gradeClass, setGradeClass] = useState('10 «А»');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (student?.id) {
      syncFromSupabase();
    }
  }, [student?.id]);

  const toggleDark = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !gradeClass.trim()) return;
    setIsSubmitting(true);
    try {
      await loginStudent(fullName, gradeClass);
      setFullName('');
    } catch {
      alert('Ошибка входа. Проверьте подключение к базе.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const initials = student
    ? student.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '';

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#F8F9FE]/85 dark:bg-[#111318]/85 backdrop-blur-md border-b border-[#E0E2EC]/60 dark:border-[#44474F]/40 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
          
          <div className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none min-w-0" onClick={() => setActiveTab('all')}>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl sm:rounded-[20px] bg-gradient-to-tr from-[#3F51B5] via-[#5C6BC0] to-[#8C9EFF] flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-[#191C20] dark:text-[#E2E2E9] truncate">
                  <span className="text-[#3F51B5] dark:text-[#A5B4FC]">NGS</span> Библиотека
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-[#E0E0FF] text-[#00105C] dark:bg-[#283593] dark:text-[#C5CAE9] rounded-full">
                  Медиатека
                </span>
              </div>
              <p className="hidden sm:block text-xs text-[#74777F] dark:text-[#C4C7D0] font-medium">Школьная электронная читальня</p>
            </div>
          </div>

          {/* Поиск на ПК */}
          <div className="hidden md:flex flex-1 max-w-md mx-6">
            <div className="w-full flex items-center gap-3 bg-[#EEF0FA] dark:bg-[#22252D] rounded-full px-5 py-2.5 focus-within:ring-2 focus-within:ring-[#3F51B5] focus-within:bg-white dark:focus-within:bg-[#1E2028] transition-all shadow-inner">
              <Search className="w-5 h-5 text-[#74777F]" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по автору, книге..." 
                className="bg-transparent border-none outline-none text-sm w-full placeholder-[#74777F] text-[#191C20] dark:text-[#E2E2E9]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[#74777F] hover:text-black dark:hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button 
              onClick={toggleDark}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[#44474F] dark:text-[#C4C7D0] hover:bg-[#E0E2EC]/50 dark:hover:bg-[#282B33] transition-colors"
              title="Переключить тему"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {student ? (
              <div className="flex items-center gap-2 pl-2 border-l border-[#E0E2EC] dark:border-[#44474F]/40">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-sm">
                  {initials}
                </div>
                <div className="hidden sm:block text-left text-xs leading-tight">
                  <div className="font-bold text-[#191C20] dark:text-[#E2E2E9]">{student.fullName}</div>
                  <div className="text-[#74777F] dark:text-[#90939C]">{student.gradeClass} класс</div>
                </div>
                <button
                  onClick={logoutStudent}
                  className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="Сменить ученика"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setLoginModalOpen(true)}
                className="px-3.5 sm:px-4 py-2 rounded-full bg-[#3F51B5] hover:bg-[#303F9F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Войти ученику</span>
                <span className="sm:hidden">Войти</span>
              </button>
            )}
          </div>

        </div>

        {/* Поиск на мобильных устройствах */}
        <div className="md:hidden px-4 pb-3">
          <div className="w-full flex items-center gap-2.5 bg-[#EEF0FA] dark:bg-[#22252D] rounded-full px-4 py-2">
            <Search className="w-4 h-4 text-[#74777F]" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по автору или книге..." 
              className="bg-transparent border-none outline-none text-xs w-full placeholder-[#74777F] text-[#191C20] dark:text-[#E2E2E9]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#74777F]">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Модальное окно входа ученика */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1F26] w-full max-w-sm rounded-[28px] p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-lg">Вход в читальный зал</h3>
              <button onClick={() => setLoginModalOpen(false)} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Представьтесь, чтобы сохранять закладки на «Мою полку» и запоминать страницу, на которой вы остановились.
            </p>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500">Имя и Фамилия</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Например: Алишер Каримов"
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500">Класс</label>
                <input
                  type="text"
                  required
                  value={gradeClass}
                  onChange={(e) => setGradeClass(e.target.value)}
                  placeholder="Например: 10 «А»"
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-[#3F51B5] hover:bg-[#303F9F] text-white font-bold text-sm shadow-md"
              >
                {isSubmitting ? 'Вход...' : 'Продолжить чтение'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
