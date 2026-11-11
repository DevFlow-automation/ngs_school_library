# LumenLib — Школьная медиатека и открытая читальня (Next.js 14)

Современный фронтенд школьной онлайн-библиотеки, построенный на **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS** и принципах **Material Design 3 (Material You)** с асимметричной Bento-разметкой.

## 🚀 Быстрый старт локально

```bash
# 1. Установка зависимостей
npm install

# 2. Запуск в режиме разработки
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

---

## ⚡ Развертывание на Vercel (1-Click)

### Вариант 1: Через GitHub
1. Создайте новый репозиторий на GitHub и запушьте в него проект:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit for LumenLib"
   git branch -M main
   git remote add origin https://github.com/<ваш-аккаунт>/lumenlib.git
   git push -u origin main
   ```
2. Откройте [Vercel Dashboard](https://vercel.com/new).
3. Выберите ваш репозиторий `lumenlib` и нажмите **Deploy**.
4. Vercel автоматически определит Next.js и соберет проект за 45 секунд.

### Вариант 2: Через Vercel CLI
```bash
npm i -g vercel
vercel
```

---

## 📂 Архитектура проекта

```
src/
├── app/
│   ├── layout.tsx        # Корневой лэйаут с оптимизацией Google Fonts (Newsreader, Plus Jakarta Sans)
│   ├── page.tsx          # Главная страница медиатеки с табами
│   └── globals.css       # Глобальные стили, 3D эффекты корешков книг и темы читалки
├── components/
│   ├── Header.tsx        # Шапка с поиском, стриком чтения и переключателем темной темы
│   ├── HeroBento.tsx     # Асимметричная Bento-сетка (Книга недели, Цели чтения, Цитата дня)
│   ├── BookCatalog.tsx   # Каталог книг с фильтрами по классам, жанрам и сортировкой
│   └── ReaderModal.tsx   # Zen-режим онлайн-чтения (темы, кегль шрифта, TTS синтез речи)
├── data/
│   └── books.ts          # Датасет школьной литературы с главами и текстами
├── store/
│   └── useReadingStore.ts# Реактивное управление состоянием через Zustand
└── types/
    └── book.ts           # Строгая TypeScript типизация сущностей
```

---

## 🛠 Технологический стек
* **Framework:** Next.js 14 (App Router, Server Components + Client Components)
* **Язык:** TypeScript 5
* **Стилизация:** Tailwind CSS + Material Design 3 tokens
* **State Management:** Zustand
* **Icons:** Lucide React
* **Speech Engine:** Web Speech Synthesis API
