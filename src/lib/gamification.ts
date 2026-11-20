import type { ReaderTheme } from '../types/book';
import { evaluateReadingPace, type ReadingMetricsSnapshot } from './readingMetrics';

export type AgeGroup = 'junior' | 'middle' | 'senior';
export type RewardCategory = 'frame' | 'theme' | 'perk';

export interface RankTier {
  level: number;
  title: string;
  icon: string;
  minPoints: number;
}

export interface FrameVisualStyle {
  ringClass: string;
  avatarBg: string;
  bannerGradient: string;
  badgeIcon: string;
  badgeText: string;
}

export interface UnlockableReward {
  id: string;
  category: RewardCategory;
  title: string;
  description: string;
  icon: string;
  requiredPoints: number;
  themeValue?: ReaderTheme;
  themePreviewBg?: string;
  themePreviewText?: string;
  frameStyle?: FrameVisualStyle;
  perkType?: 'certificate' | 'curator';
}

export interface PointsBreakdown {
  totalPoints: number;
  timePoints: number;
  honestPagePoints: number;
  completionPoints: number;
  totalReadingSeconds: number;
  honestPagesCount: number;
  fastPagesIgnored: number;
  honestCompletedBooks: number;
  suspiciousBooksCount: number;
  completionBonusPerBook: number;
}

export interface RankProgress {
  current: RankTier;
  next: RankTier | null;
  progressPercent: number;
  pointsToNext: number;
}

export function parseStudentGrade(gradeClass?: string | null): number {
  const match = String(gradeClass || '').match(/\d{1,2}/);
  if (!match) return 8;
  const num = parseInt(match[0], 10);
  if (Number.isNaN(num)) return 8;
  return Math.max(1, Math.min(11, num));
}

export function getAgeGroup(gradeClass?: string | null): AgeGroup {
  const grade = parseStudentGrade(gradeClass);
  if (grade <= 6) return 'junior';
  if (grade <= 9) return 'middle';
  return 'senior';
}

export function getAgeGroupMeta(ageGroup: AgeGroup): {
  label: string;
  subtitle: string;
  completionBonus: number;
} {
  if (ageGroup === 'junior') {
    return {
      label: '1–6 классы',
      subtitle: 'Приключенческая лига читателей',
      completionBonus: 50,
    };
  }
  if (ageGroup === 'middle') {
    return {
      label: '7–9 классы',
      subtitle: 'Лига исследователей и библиофилов',
      completionBonus: 60,
    };
  }
  return {
    label: '10–11 классы',
    subtitle: 'Академическая лига старшеклассников',
    completionBonus: 75,
  };
}

const RANKS_BY_AGE: Record<AgeGroup, RankTier[]> = {
  junior: [
    { level: 1, title: 'Новичок-читатель', icon: '🌱', minPoints: 0 },
    { level: 2, title: 'Искатель историй', icon: '🧭', minPoints: 50 },
    { level: 3, title: 'Хранитель сказок', icon: '🦊', minPoints: 150 },
    { level: 4, title: 'Повелитель книг', icon: '🐉', minPoints: 300 },
    { level: 5, title: 'Легенда библиотеки', icon: '👑', minPoints: 500 },
  ],
  middle: [
    { level: 1, title: 'Читатель', icon: '📖', minPoints: 0 },
    { level: 2, title: 'Исследователь', icon: '⚡', minPoints: 60 },
    { level: 3, title: 'Библиофил', icon: '🔥', minPoints: 180 },
    { level: 4, title: 'Мастер слова', icon: '💎', minPoints: 350 },
    { level: 5, title: 'Грандмастер NGS', icon: '🏆', minPoints: 600 },
  ],
  senior: [
    { level: 1, title: 'Абитуриент', icon: '📚', minPoints: 0 },
    { level: 2, title: 'Эссеист', icon: '🖋️', minPoints: 80 },
    { level: 3, title: 'Эрудит', icon: '🏛️', minPoints: 220 },
    { level: 4, title: 'Лауреат NGS', icon: '🎖️', minPoints: 420 },
    { level: 5, title: 'Почётный академик', icon: '🎓', minPoints: 700 },
  ],
};

const REWARDS_BY_AGE: Record<AgeGroup, UnlockableReward[]> = {
  junior: [
    {
      id: 'jr_frame_star',
      category: 'frame',
      title: 'Звёздный искатель',
      description: 'Золотая звёздная рамка аватара и яркая обложка профиля',
      icon: '✨',
      requiredPoints: 50,
      frameStyle: {
        ringClass: 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
        bannerGradient: 'linear-gradient(135deg, #78350F 0%, #B45309 50%, #F59E0B 100%)',
        badgeIcon: '✨',
        badgeText: 'Звёздный искатель',
      },
    },
    {
      id: 'jr_theme_ocean',
      category: 'theme',
      title: 'Тема «Морская лагуна»',
      description: 'Свежая морская тема для комфортного чтения книг',
      icon: '🌊',
      requiredPoints: 100,
      themeValue: 'ocean',
      themePreviewBg: '#EEF7FB',
      themePreviewText: '#133142',
    },
    {
      id: 'jr_frame_dragon',
      category: 'frame',
      title: 'Дракон знаний',
      description: 'Изумрудная рамка аватара со значком дракона и обложка',
      icon: '🐉',
      requiredPoints: 150,
      frameStyle: {
        ringClass: 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #059669 0%, #0D9488 100%)',
        bannerGradient: 'linear-gradient(135deg, #064E3B 0%, #047857 50%, #10B981 100%)',
        badgeIcon: '🐉',
        badgeText: 'Дракон знаний',
      },
    },
    {
      id: 'jr_perk_curator',
      category: 'perk',
      title: 'Выбор «Книги недели»',
      description: 'Право предложить любимую книгу библиотекарю в раздел «Книга недели»',
      icon: '🎟️',
      requiredPoints: 200,
      perkType: 'curator',
    },
    {
      id: 'jr_theme_starry',
      category: 'theme',
      title: 'Тема «Звёздная ночь»',
      description: 'Тёмная космическая тема читалки для вечернего чтения',
      icon: '🌌',
      requiredPoints: 250,
      themeValue: 'starry',
      themePreviewBg: '#13162B',
      themePreviewText: '#E3E7FF',
    },
    {
      id: 'jr_frame_space',
      category: 'frame',
      title: 'Космонавт чтения',
      description: 'Неоновая галактическая рамка аватара и звёздная шапка профиля',
      icon: '🚀',
      requiredPoints: 300,
      frameStyle: {
        ringClass: 'ring-2 ring-violet-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #6366F1 0%, #9333EA 50%, #06B6D4 100%)',
        bannerGradient: 'linear-gradient(135deg, #1E1B4B 0%, #4C1D95 55%, #0E7490 100%)',
        badgeIcon: '🚀',
        badgeText: 'Космонавт чтения',
      },
    },
    {
      id: 'jr_perk_cert',
      category: 'perk',
      title: 'Грамота «Лучший читатель»',
      description: 'Именная электронная грамота с твоими достижениями (можно распечатать)',
      icon: '🏅',
      requiredPoints: 400,
      perkType: 'certificate',
    },
    {
      id: 'jr_frame_crown',
      category: 'frame',
      title: 'Корона сказок',
      description: 'Королевский золотой стиль профиля для настоящей легенды чтения',
      icon: '👑',
      requiredPoints: 500,
      frameStyle: {
        ringClass: 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #EAB308 0%, #EA580C 100%)',
        bannerGradient: 'linear-gradient(135deg, #451A03 0%, #9A3412 50%, #D97706 100%)',
        badgeIcon: '👑',
        badgeText: 'Корона сказок',
      },
    },
  ],
  middle: [
    {
      id: 'md_frame_neon',
      category: 'frame',
      title: 'Неон Индиго',
      description: 'Неоновая рамка аватара и градиентная шапка профиля',
      icon: '⚡',
      requiredPoints: 60,
      frameStyle: {
        ringClass: 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
        bannerGradient: 'linear-gradient(135deg, #0F172A 0%, #1D4ED8 55%, #0891B2 100%)',
        badgeIcon: '⚡',
        badgeText: 'Неон Индиго',
      },
    },
    {
      id: 'md_theme_coffee',
      category: 'theme',
      title: 'Тема «Кофейный винтаж»',
      description: 'Тёплая атмосферная палитра читалки в стиле книжной кофейни',
      icon: '☕',
      requiredPoints: 120,
      themeValue: 'coffee',
      themePreviewBg: '#EFE5D5',
      themePreviewText: '#3B2818',
    },
    {
      id: 'md_frame_cyber',
      category: 'frame',
      title: 'Кибер-огонь',
      description: 'Контрастный рубиново-янтарный стиль профиля и значок огня',
      icon: '🔥',
      requiredPoints: 180,
      frameStyle: {
        ringClass: 'ring-2 ring-rose-500 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #E11D48 0%, #F97316 100%)',
        bannerGradient: 'linear-gradient(135deg, #4C0519 0%, #BE123C 55%, #EA580C 100%)',
        badgeIcon: '🔥',
        badgeText: 'Кибер-огонь',
      },
    },
    {
      id: 'md_perk_curator',
      category: 'perk',
      title: 'Рекомендация недели',
      description: 'Право предложить новую книгу в каталог или в блок «Книга недели»',
      icon: '🎯',
      requiredPoints: 250,
      perkType: 'curator',
    },
    {
      id: 'md_theme_starry',
      category: 'theme',
      title: 'Тема «Кибер-ночь»',
      description: 'Глубокая ночная индиго-тема для чтения без усталости глаз',
      icon: '🌌',
      requiredPoints: 280,
      themeValue: 'starry',
      themePreviewBg: '#13162B',
      themePreviewText: '#E3E7FF',
    },
    {
      id: 'md_frame_galaxy',
      category: 'frame',
      title: 'Галактика',
      description: 'Премиальный космический градиент профиля и рамка аватара',
      icon: '🌌',
      requiredPoints: 350,
      frameStyle: {
        ringClass: 'ring-2 ring-purple-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #4F46E5 0%, #9333EA 50%, #EC4899 100%)',
        bannerGradient: 'linear-gradient(135deg, #0F172A 0%, #4C1D95 50%, #831843 100%)',
        badgeIcon: '🌌',
        badgeText: 'Галактика',
      },
    },
    {
      id: 'md_perk_cert',
      category: 'perk',
      title: 'Сертификат «Топ-читатель»',
      description: 'Именной сертификат достижений с часами чтения и списком книг',
      icon: '📜',
      requiredPoints: 500,
      perkType: 'certificate',
    },
    {
      id: 'md_frame_platinum',
      category: 'frame',
      title: 'Платина NGS',
      description: 'Эксклюзивный изумрудно-платиновый стиль грандмастера',
      icon: '💎',
      requiredPoints: 600,
      frameStyle: {
        ringClass: 'ring-2 ring-teal-300 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #0F766E 0%, #10B981 50%, #38BDF8 100%)',
        bannerGradient: 'linear-gradient(135deg, #042F2E 0%, #0F766E 50%, #0369A1 100%)',
        badgeIcon: '💎',
        badgeText: 'Платина NGS',
      },
    },
  ],
  senior: [
    {
      id: 'sr_frame_classic',
      category: 'frame',
      title: 'Классик',
      description: 'Сдержанный тёмно-синий стиль профиля с золотым акцентом',
      icon: '🖋️',
      requiredPoints: 80,
      frameStyle: {
        ringClass: 'ring-2 ring-amber-300 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #1E3A8A 0%, #312E81 100%)',
        bannerGradient: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 60%, #3730A3 100%)',
        badgeIcon: '🖋️',
        badgeText: 'Классик',
      },
    },
    {
      id: 'sr_theme_coffee',
      category: 'theme',
      title: 'Тема «Пергамент Оксфорда»',
      description: 'Тёплая академическая бумажная тема для долгого чтения',
      icon: '📜',
      requiredPoints: 150,
      themeValue: 'coffee',
      themePreviewBg: '#EFE5D5',
      themePreviewText: '#3B2818',
    },
    {
      id: 'sr_frame_oxford',
      category: 'frame',
      title: 'Оксфорд',
      description: 'Строгий университетский изумрудно-золотой стиль профиля',
      icon: '🏛️',
      requiredPoints: 220,
      frameStyle: {
        ringClass: 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #12372A 0%, #065F46 100%)',
        bannerGradient: 'linear-gradient(135deg, #0B241B 0%, #12372A 55%, #1E5641 100%)',
        badgeIcon: '🏛️',
        badgeText: 'Оксфорд',
      },
    },
    {
      id: 'sr_perk_curator',
      category: 'perk',
      title: 'Статус «Куратор полки»',
      description: 'Право предложить книгу или цитату дня библиотекарю NGS',
      icon: '⭐',
      requiredPoints: 300,
      perkType: 'curator',
    },
    {
      id: 'sr_theme_obsidian',
      category: 'theme',
      title: 'Тема «Обсидиан OLED»',
      description: 'Минималистичная глубокая чёрная тема для чтения ночью',
      icon: '🖤',
      requiredPoints: 320,
      themeValue: 'obsidian',
      themePreviewBg: '#0B0C10',
      themePreviewText: '#E8EAF0',
    },
    {
      id: 'sr_frame_midnight',
      category: 'frame',
      title: 'Полуночный эрудит',
      description: 'Элегантный обсидианово-индиговый стиль профиля',
      icon: '🌌',
      requiredPoints: 420,
      frameStyle: {
        ringClass: 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #18181B 0%, #4338CA 100%)',
        bannerGradient: 'linear-gradient(135deg, #09090B 0%, #1E1B4B 55%, #312E81 100%)',
        badgeIcon: '🌌',
        badgeText: 'Полуночный эрудит',
      },
    },
    {
      id: 'sr_perk_cert',
      category: 'perk',
      title: 'Именной сертификат NGS',
      description: 'Официальный электронный сертификат читателя для портфолио (с печатью/PDF)',
      icon: '🎓',
      requiredPoints: 600,
      perkType: 'certificate',
    },
    {
      id: 'sr_frame_laureate',
      category: 'frame',
      title: 'Лауреат NGS',
      description: 'Высший золотой статус почётного читателя старшей школы',
      icon: '🎖️',
      requiredPoints: 700,
      frameStyle: {
        ringClass: 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111318]',
        avatarBg: 'linear-gradient(135deg, #92400E 0%, #D97706 50%, #F59E0B 100%)',
        bannerGradient: 'linear-gradient(135deg, #1C1917 0%, #78350F 55%, #B45309 100%)',
        badgeIcon: '🎖️',
        badgeText: 'Лауреат NGS',
      },
    },
  ],
};

export function getRewardsForAgeGroup(ageGroup: AgeGroup): UnlockableReward[] {
  return REWARDS_BY_AGE[ageGroup];
}

export function getUnlockableThemesForAgeGroup(ageGroup: AgeGroup): UnlockableReward[] {
  return REWARDS_BY_AGE[ageGroup].filter((r) => r.category === 'theme' && r.themeValue);
}

export function getFrameRewardById(frameId?: string | null): UnlockableReward | null {
  if (!frameId) return null;
  for (const group of Object.values(REWARDS_BY_AGE)) {
    const found = group.find((r) => r.id === frameId && r.category === 'frame');
    if (found) return found;
  }
  return null;
}

/**
 * Честный расчёт баллов на основе реального времени чтения и скорости перелистывания.
 * Быстрые клики (< порога) и книги с подозрением на пролистывание НЕ дают бонусных баллов.
 */
export function calculateStudentPoints(
  entries: ReadingMetricsSnapshot[],
  gradeClass?: string | null
): PointsBreakdown {
  const ageGroup = getAgeGroup(gradeClass);
  const { completionBonus } = getAgeGroupMeta(ageGroup);

  let totalReadingSeconds = 0;
  let honestPagesCount = 0;
  let fastPagesIgnored = 0;
  let honestCompletedBooks = 0;
  let suspiciousBooksCount = 0;

  for (const item of entries) {
    const sec = Math.max(0, Number(item.readingSeconds || 0));
    const turns = Math.max(0, Number(item.pagesTurned || 0));
    const fast = Math.min(turns, Math.max(0, Number(item.fastTurnsCount || 0)));
    const percent = Math.max(0, Number(item.progressPercent || 0));

    totalReadingSeconds += sec;
    honestPagesCount += Math.max(0, turns - fast);
    fastPagesIgnored += fast;

    const pace = evaluateReadingPace(item);
    if (pace.status === 'suspicious') {
      suspiciousBooksCount += 1;
    } else if (percent >= 95 && sec >= 120) {
      honestCompletedBooks += 1;
    }
  }

  // +2 балла за каждую полную минуту активного чтения
  const timePoints = Math.floor(totalReadingSeconds / 60) * 2;
  // +1 балл за каждое честное (не быстрое) перелистывание страницы
  const honestPagePoints = honestPagesCount;
  // Бонус за честно дочитанную книгу (зависит от возраста)
  const completionPoints = honestCompletedBooks * completionBonus;

  return {
    totalPoints: timePoints + honestPagePoints + completionPoints,
    timePoints,
    honestPagePoints,
    completionPoints,
    totalReadingSeconds,
    honestPagesCount,
    fastPagesIgnored,
    honestCompletedBooks,
    suspiciousBooksCount,
    completionBonusPerBook: completionBonus,
  };
}

export function getStudentRank(points: number, ageGroup: AgeGroup): RankProgress {
  const tiers = RANKS_BY_AGE[ageGroup];
  let current = tiers[0];
  let next: RankTier | null = tiers[1] || null;

  for (let i = 0; i < tiers.length; i++) {
    if (points >= tiers[i].minPoints) {
      current = tiers[i];
      next = tiers[i + 1] || null;
    }
  }

  if (!next) {
    return {
      current,
      next: null,
      progressPercent: 100,
      pointsToNext: 0,
    };
  }

  const span = Math.max(1, next.minPoints - current.minPoints);
  const gained = Math.max(0, points - current.minPoints);
  const progressPercent = Math.min(100, Math.round((gained / span) * 100));

  return {
    current,
    next,
    progressPercent,
    pointsToNext: Math.max(0, next.minPoints - points),
  };
}
