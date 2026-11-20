import type { AgeGroup } from './gamification';

export type AvatarRarity = 'common' | 'rare' | 'epic' | 'premium' | 'legendary';
export type AvatarCategory = 'default' | 'games' | 'writers' | 'exclusive';

export interface AvatarDefinition {
  id: string;
  name: string;
  subtitle: string;
  category: AvatarCategory;
  rarity: AvatarRarity;
  pointsByAge: Record<AgeGroup, number>;
}

export interface ResolvedAvatar extends AvatarDefinition {
  requiredPoints: number;
}

export const DEFAULT_AVATAR_ID = 'default_reader';

export const AVATAR_RARITY_META: Record<
  AvatarRarity,
  {
    label: string;
    badgeClass: string;
    cardClass: string;
    ringClass: string;
  }
> = {
  common: {
    label: 'Базовая',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    cardClass: 'border-[#E0E2EC]/80 dark:border-[#2F323D]',
    ringClass: 'ring-2 ring-indigo-400/70',
  },
  rare: {
    label: 'Редкая',
    badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300',
    cardClass: 'border-sky-200 dark:border-sky-900/60',
    ringClass: 'ring-2 ring-sky-400',
  },
  epic: {
    label: 'Эпическая',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300',
    cardClass: 'border-purple-200 dark:border-purple-900/60',
    ringClass: 'ring-2 ring-purple-500',
  },
  premium: {
    label: 'ПРЕМИУМ',
    badgeClass:
      'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-amber-950 shadow-sm',
    cardClass:
      'border-amber-400/90 dark:border-amber-500/70 bg-gradient-to-b from-amber-50/80 to-yellow-50/40 dark:from-amber-950/30 dark:to-yellow-950/15 avatar-card-premium',
    ringClass: 'ring-2 ring-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.55)]',
  },
  legendary: {
    label: 'ЛЕГЕНДА',
    badgeClass:
      'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 text-white shadow-sm',
    cardClass:
      'border-emerald-400/90 dark:border-emerald-500/80 bg-gradient-to-b from-emerald-50/85 to-teal-50/45 dark:from-emerald-950/35 dark:to-teal-950/20 avatar-card-jade',
    ringClass: 'ring-2 ring-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.65)]',
  },
};

export const AVATARS_CATALOG: AvatarDefinition[] = [
  {
    id: DEFAULT_AVATAR_ID,
    name: 'Читатель NGS',
    subtitle: 'Стартовая аватарка каждого ученика библиотеки',
    category: 'default',
    rarity: 'common',
    pointsByAge: { junior: 0, middle: 0, senior: 0 },
  },
  {
    id: 'pixel_knight',
    name: 'Пиксельный рыцарь',
    subtitle: 'Герой в воксельном шлеме из мира приключенческих игр',
    category: 'games',
    rarity: 'common',
    pointsByAge: { junior: 25, middle: 35, senior: 45 },
  },
  {
    id: 'writer_pushkin',
    name: 'А. С. Пушкин',
    subtitle: 'Классик литературы • золотое перо и лавровый венок',
    category: 'writers',
    rarity: 'rare',
    pointsByAge: { junior: 60, middle: 80, senior: 100 },
  },
  {
    id: 'detective_holmes',
    name: 'Шерлок Холмс',
    subtitle: 'Мастер дедукции • шляпа детектива и лупа в ночном Лондоне',
    category: 'writers',
    rarity: 'rare',
    pointsByAge: { junior: 100, middle: 130, senior: 160 },
  },
  {
    id: 'cyber_gamer',
    name: 'Кибер-геймер',
    subtitle: 'Неоновый VR-визор и геймерская гарнитура будущего',
    category: 'games',
    rarity: 'epic',
    pointsByAge: { junior: 150, middle: 190, senior: 230 },
  },
  {
    id: 'writer_shakespeare',
    name: 'Уильям Шекспир',
    subtitle: 'Великий драматург • королевский медальон с пером',
    category: 'writers',
    rarity: 'epic',
    pointsByAge: { junior: 210, middle: 260, senior: 320 },
  },
  {
    id: 'shadow_ninja',
    name: 'Ниндзя Тени',
    subtitle: 'Скрытный мастер клинка из аниме и экшн-игр',
    category: 'games',
    rarity: 'epic',
    pointsByAge: { junior: 280, middle: 340, senior: 420 },
  },
  {
    id: 'astro_ranger',
    name: 'Звёздный рейнджер',
    subtitle: 'Космический исследователь с отражением галактики в шлеме',
    category: 'games',
    rarity: 'epic',
    pointsByAge: { junior: 360, middle: 440, senior: 540 },
  },
  {
    id: 'gold_67',
    name: 'Золотая 67',
    subtitle: 'Премиальный золотой герб с короной и легендарным числом 67',
    category: 'exclusive',
    rarity: 'premium',
    pointsByAge: { junior: 480, middle: 580, senior: 700 },
  },
  {
    id: 'jade_legend',
    name: 'Нефритовая Легенда',
    subtitle: 'Мифический нефритовый кристалл с аурой древнего дракона',
    category: 'exclusive',
    rarity: 'legendary',
    pointsByAge: { junior: 650, middle: 800, senior: 950 },
  },
];

export function getAvatarsForAgeGroup(ageGroup: AgeGroup): ResolvedAvatar[] {
  return AVATARS_CATALOG.map((av) => ({
    ...av,
    requiredPoints: av.pointsByAge[ageGroup],
  }));
}

export function getAvatarById(avatarId: string | null | undefined, ageGroup: AgeGroup): ResolvedAvatar {
  const found = AVATARS_CATALOG.find((a) => a.id === avatarId) || AVATARS_CATALOG[0];
  return {
    ...found,
    requiredPoints: found.pointsByAge[ageGroup],
  };
}

export function resolveEffectiveAvatarId(
  equippedAvatarId: string | null | undefined,
  totalPoints: number,
  ageGroup: AgeGroup
): string {
  const candidate = getAvatarById(equippedAvatarId, ageGroup);
  if (totalPoints >= candidate.requiredPoints) {
    return candidate.id;
  }
  return DEFAULT_AVATAR_ID;
}
