'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AdminUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [grade, setGrade] = useState('10-11');
  const [category, setCategory] = useState('classic');
  const [synopsis, setSynopsis] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !author) return;

    setLoading(true);
    setStatus('idle');

    try {
      // 1. Загрузка файла книги в Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `epubs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('books')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Получаем публичный URL загруженного файла
      const { data: urlData } = supabase.storage
        .from('books')
        .getPublicUrl(filePath);

      // 2. Запись метаданных в таблицу books
      const { error: dbError } = await supabase.from('books').insert([
        {
          title,
          author,
          grade,
          category,
          category_name: category === 'classic' ? 'Русская классика' : 'Школьная программа',
          synopsis,
          file_url: urlData.publicUrl,
        },
      ]);

      if (dbError) throw dbError;

      setStatus('success');
      setTitle('');
      setAuthor('');
      setSynopsis('');
      setFile(null);
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FE] dark:bg-[#111318] p-6 max-w-2xl mx-auto">
      <div className="bg-white dark:bg-[#1C1F26] p-8 rounded-[32px] shadow-sm border border-gray-200 dark:border-gray-800 space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold">Загрузка книги в библиотеку</h1>
          <p className="text-xs text-gray-500 mt-1">
            Файл книги сохраняется в S3-хранилище, а запись автоматически появляется в каталоге
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Файл книги (.epub)</label>
            <input
              type="file"
              accept=".epub"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Название</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="«Война и мир»"
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
                placeholder="Л.Н. Толстой"
                className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 dark:text-gray-400">Краткое описание (Аннотация)</label>
            <textarea
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="О чем это произведение..."
              className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {loading ? 'Загрузка в облако...' : 'Опубликовать книгу в медиатеке'}
          </button>

          {status === 'success' && (
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Книга успешно загружена и добавлена в каталог!
            </div>
          )}
          {status === 'error' && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Ошибка при загрузке. Проверьте права и подключение к Supabase.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
