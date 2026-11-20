'use client';

import React, { useId } from 'react';
import { DEFAULT_AVATAR_ID } from '@/lib/avatars';

interface StudentAvatarProps {
  avatarId?: string | null;
  size?: number;
  className?: string;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  avatarId = DEFAULT_AVATAR_ID,
  size = 44,
  className = '',
}) => {
  const uid = useId().replace(/:/g, '');
  const id = avatarId || DEFAULT_AVATAR_ID;

  const renderArtwork = () => {
    switch (id) {
      case 'pixel_knight':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1E293B" />
                <stop offset="100%" stopColor="#0F766E" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_bg)`} />
            {/* Пиксельные звёзды на фоне */}
            <rect x="14" y="16" width="5" height="5" fill="#5EEAD4" opacity="0.6" />
            <rect x="80" y="20" width="5" height="5" fill="#FDE047" opacity="0.7" />
            <rect x="76" y="72" width="4" height="4" fill="#5EEAD4" opacity="0.5" />
            {/* Плюмаж шлема */}
            <rect x="44" y="10" width="12" height="8" fill="#EF4444" />
            <rect x="40" y="16" width="20" height="8" fill="#DC2626" />
            {/* Пиксельный шлем */}
            <rect x="26" y="24" width="48" height="10" fill="#CBD5E1" />
            <rect x="22" y="34" width="56" height="34" fill="#94A3B8" />
            <rect x="26" y="34" width="48" height="28" fill="#E2E8F0" />
            {/* Тёмный визор */}
            <rect x="28" y="42" width="44" height="12" fill="#0F172A" />
            {/* Светящиеся пиксельные глаза */}
            <rect x="34" y="45" width="10" height="6" fill="#22D3EE" />
            <rect x="56" y="45" width="10" height="6" fill="#22D3EE" />
            <rect x="37" y="46" width="4" height="3" fill="#ECFEFF" />
            <rect x="59" y="46" width="4" height="3" fill="#ECFEFF" />
            {/* Нижняя пластина и наплечники */}
            <rect x="32" y="58" width="36" height="10" fill="#64748B" />
            <rect x="46" y="58" width="8" height="10" fill="#334155" />
            <rect x="18" y="70" width="64" height="24" fill="#334155" />
            <rect x="26" y="72" width="48" height="20" fill="#475569" />
            <rect x="46" y="74" width="8" height="16" fill="#F59E0B" />
          </svg>
        );

      case 'writer_pushkin':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#311B0E" />
                <stop offset="55%" stopColor="#6B3A19" />
                <stop offset="100%" stopColor="#C28135" />
              </linearGradient>
              <linearGradient id={`${uid}_gold`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_bg)`} />
            <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#${uid}_gold)`} strokeWidth="2.5" opacity="0.85" />
            {/* Кудрявый силуэт Пушкина */}
            <path
              d="M35 30 C28 32 25 40 28 48 C25 53 29 59 34 61 C36 66 37 72 34 78 L66 78 C64 71 65 65 68 60 C72 57 74 51 71 45 C74 37 69 27 60 25 C55 21 44 21 39 26 C37 27 36 28 35 30 Z"
              fill="#1C1008"
            />
            {/* Профиль лица и бакенбарды */}
            <circle cx="52" cy="46" r="14" fill="#FDE68A" opacity="0.92" />
            <path d="M36 44 C36 30 48 24 60 27 C67 29 70 37 67 45 C65 37 59 33 52 33 C46 33 43 37 43 44 C43 50 46 53 49 56 C44 58 37 54 36 44 Z" fill="#1C1008" />
            {/* Воротник и шейный платок */}
            <path d="M34 78 C38 66 44 63 50 63 C56 63 62 66 66 78 Z" fill="#18181B" />
            <path d="M44 64 L50 74 L56 64 Z" fill="#FFFBEB" />
            {/* Золотое перо */}
            <path d="M68 78 C75 63 82 47 86 24 C77 33 70 48 66 66 L64 78 Z" fill={`url(#${uid}_gold)`} />
            <path d="M66 76 L83 30" stroke="#78350F" strokeWidth="1.4" />
          </svg>
        );

      case 'detective_holmes':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0F172A" />
                <stop offset="60%" stopColor="#1E3A5F" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_bg)`} />
            {/* Луна лондонского тумана */}
            <circle cx="74" cy="24" r="12" fill="#FEF3C7" opacity="0.85" />
            {/* Плащ с поднятым воротником */}
            <path d="M22 92 C25 70 36 62 50 62 C64 62 75 70 78 92 Z" fill="#0B1120" />
            <path d="M36 64 L50 76 L64 64 L60 56 L40 56 Z" fill="#1E293B" />
            {/* Силуэт головы */}
            <ellipse cx="48" cy="48" rx="13" ry="15" fill="#0B1120" />
            {/* Шляпа охотника за оленями (deerstalker) */}
            <path d="M26 42 Q48 33 70 42 Q58 45 48 44 Q38 45 26 42 Z" fill="#92400E" />
            <path d="M34 40 C35 26 61 26 62 40 Z" fill="#B45309" />
            <path d="M48 27 L48 40" stroke="#78350F" strokeWidth="1.8" />
            {/* Лупа со светящимся стеклом */}
            <circle cx="67" cy="60" r="13" fill="#38BDF8" fillOpacity="0.28" stroke="#FBBF24" strokeWidth="3.5" />
            <path d="M61 55 Q66 51 71 54" stroke="#E0F2FE" strokeWidth="2" strokeLinecap="round" fill="none" />
            <line x1="76" y1="70" x2="87" y2="83" stroke="#D97706" strokeWidth="5" strokeLinecap="round" />
          </svg>
        );

      case 'cyber_gamer':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#090D1F" />
                <stop offset="50%" stopColor="#31105E" />
                <stop offset="100%" stopColor="#0E4A6B" />
              </linearGradient>
              <linearGradient id={`${uid}_visor`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#22D3EE" />
                <stop offset="50%" stopColor="#A855F7" />
                <stop offset="100%" stopColor="#EC4899" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_bg)`} />
            {/* Неоновая сетка */}
            <path d="M0 78 L100 78 M0 88 L100 88 M20 78 L8 100 M50 78 L50 100 M80 78 L92 100" stroke="#22D3EE" strokeWidth="1" opacity="0.3" />
            {/* Дуга наушников */}
            <path d="M22 50 C22 20 78 20 78 50" fill="none" stroke="#EC4899" strokeWidth="6" strokeLinecap="round" />
            {/* Чашки наушников */}
            <rect x="14" y="42" width="11" height="22" rx="5" fill="#1E1B4B" stroke="#22D3EE" strokeWidth="2" />
            <rect x="75" y="42" width="11" height="22" rx="5" fill="#1E1B4B" stroke="#22D3EE" strokeWidth="2" />
            {/* Шлем / голова */}
            <path d="M26 48 C26 28 74 28 74 48 L72 68 C70 76 61 81 50 81 C39 81 30 76 28 68 Z" fill="#17192D" stroke="#6366F1" strokeWidth="2" />
            {/* Светящийся VR-визор */}
            <rect x="28" y="44" width="44" height="16" rx="8" fill={`url(#${uid}_visor)`} />
            <rect x="33" y="48" width="14" height="4" rx="2" fill="#FFFFFF" opacity="0.85" />
            <rect x="57" y="48" width="10" height="4" rx="2" fill="#FFFFFF" opacity="0.65" />
            {/* Неоновая улыбка-индикатор */}
            <path d="M42 68 L58 68" stroke="#22D3EE" strokeWidth="3" strokeLinecap="round" />
          </svg>
        );

      case 'writer_shakespeare':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3B0719" />
                <stop offset="55%" stopColor="#7F1D1D" />
                <stop offset="100%" stopColor="#B45309" />
              </linearGradient>
              <linearGradient id={`${uid}_gold`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_bg)`} />
            <circle cx="50" cy="50" r="42" fill="none" stroke={`url(#${uid}_gold)`} strokeWidth="2.5" strokeDasharray="4 3" />
            {/* Воротник-раф (елизаветинская эпоха) */}
            <ellipse cx="50" cy="70" rx="24" ry="9" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="1.5" />
            <path d="M28 86 C32 74 40 72 50 72 C60 72 68 74 72 86 Z" fill="#18181B" />
            {/* Голова и волосы по бокам */}
            <circle cx="35" cy="46" r="8" fill="#291A12" />
            <circle cx="65" cy="46" r="8" fill="#291A12" />
            <ellipse cx="50" cy="44" rx="14" ry="17" fill="#FDE68A" />
            {/* Усы и бородка */}
            <path d="M43 53 Q50 50 57 53 Q50 61 43 53 Z" fill="#291A12" />
            <circle cx="45" cy="43" r="1.8" fill="#1C1917" />
            <circle cx="55" cy="43" r="1.8" fill="#1C1917" />
            {/* Маленькая золотая корона театра */}
            <path d="M39 24 L43 16 L50 22 L57 16 L61 24 Z" fill={`url(#${uid}_gold)`} />
          </svg>
        );

      case 'shadow_ninja':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#09090B" />
                <stop offset="60%" stopColor="#2E1065" />
                <stop offset="100%" stopColor="#581C87" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_bg)`} />
            {/* Скрещённые катаны за спиной */}
            <line x1="20" y1="18" x2="80" y2="82" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
            <line x1="80" y1="18" x2="20" y2="82" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
            {/* Красная/фиолетовая повязка с лентами */}
            <path d="M72 38 L92 32 L88 42 L72 44 Z" fill="#F43F5E" />
            <path d="M72 42 L90 48 L84 54 L70 46 Z" fill="#E11D48" />
            {/* Капюшон ниндзя */}
            <circle cx="50" cy="50" r="26" fill="#0F172A" stroke="#7C3AED" strokeWidth="2.5" />
            <rect x="24" y="34" width="52" height="7" rx="3" fill="#F43F5E" />
            <rect x="43" y="35" width="14" height="5" rx="2" fill="#E2E8F0" />
            {/* Прорезь маски */}
            <rect x="30" y="44" width="40" height="13" rx="6" fill="#1E1B4B" />
            {/* Светящиеся глаза */}
            <path d="M35 49 L45 51 L43 54 L34 52 Z" fill="#38BDF8" />
            <path d="M65 49 L55 51 L57 54 L66 52 Z" fill="#38BDF8" />
            {/* Шарф */}
            <path d="M24 72 Q50 62 76 72 L78 90 L22 90 Z" fill="#18181B" />
          </svg>
        );

      case 'astro_ranger':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#020617" />
                <stop offset="55%" stopColor="#1E1B4B" />
                <stop offset="100%" stopColor="#0C4A6E" />
              </linearGradient>
              <linearGradient id={`${uid}_glass`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0EA5E9" />
                <stop offset="50%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_bg)`} />
            {/* Звёзды */}
            <circle cx="16" cy="20" r="2" fill="#FFFFFF" />
            <circle cx="84" cy="18" r="2.2" fill="#FDE047" />
            <circle cx="82" cy="76" r="1.5" fill="#7DD3FC" />
            <circle cx="18" cy="70" r="1.5" fill="#E9D5FF" />
            {/* Скафандр */}
            <path d="M22 92 C24 72 35 66 50 66 C65 66 76 72 78 92 Z" fill="#E2E8F0" />
            <rect x="40" y="74" width="20" height="10" rx="3" fill="#334155" />
            <circle cx="46" cy="79" r="2" fill="#22C55E" />
            <circle cx="54" cy="79" r="2" fill="#38BDF8" />
            {/* Шлем космонавта */}
            <circle cx="50" cy="46" r="25" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="3" />
            {/* Зеркальное стекло с отражением планеты */}
            <ellipse cx="50" cy="47" rx="18" ry="15" fill={`url(#${uid}_glass)`} />
            <circle cx="56" cy="46" r="5" fill="#FEF08A" opacity="0.9" />
            <ellipse cx="56" cy="46" rx="10" ry="3" fill="none" stroke="#FFFFFF" strokeWidth="1.5" transform="rotate(-18 56 46)" />
            <path d="M37 41 Q41 35 48 36" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85" />
          </svg>
        );

      case 'gold_67':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_goldbg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#451A03" />
                <stop offset="35%" stopColor="#B45309" />
                <stop offset="68%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#78350F" />
              </linearGradient>
              <linearGradient id={`${uid}_medal`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FEF9C3" />
                <stop offset="35%" stopColor="#FACC15" />
                <stop offset="70%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#FEF08A" />
              </linearGradient>
              <linearGradient id={`${uid}_shine`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
                <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0" />
                <stop offset="100%" stopColor="#FEF08A" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_goldbg)`} />
            {/* Лучи золотого сияния */}
            <g opacity="0.24" stroke="#FEF08A" strokeWidth="3">
              <line x1="50" y1="50" x2="50" y2="0" />
              <line x1="50" y1="50" x2="100" y2="15" />
              <line x1="50" y1="50" x2="100" y2="85" />
              <line x1="50" y1="50" x2="50" y2="100" />
              <line x1="50" y1="50" x2="0" y2="85" />
              <line x1="50" y1="50" x2="0" y2="15" />
            </g>
            {/* Золотой медальон */}
            <circle cx="50" cy="52" r="39" fill={`url(#${uid}_medal)`} stroke="#FFFBEB" strokeWidth="2.5" />
            <circle cx="50" cy="52" r="33" fill="#451A03" fillOpacity="0.88" stroke="#FDE047" strokeWidth="2" />
            <circle cx="50" cy="52" r="33" fill={`url(#${uid}_shine)`} />
            {/* Корона сверху */}
            <path
              d="M35 23 L40 12 L50 19 L60 12 L65 23 Z"
              fill={`url(#${uid}_medal)`}
              stroke="#78350F"
              strokeWidth="1.2"
            />
            <circle cx="50" cy="11" r="2.2" fill="#FEF08A" />
            {/* Искры по бокам */}
            <path d="M13 24 L15 19 L17 24 L22 26 L17 28 L15 33 L13 28 L8 26 Z" fill="#FEF9C3" />
            <path d="M84 70 L86 66 L88 70 L92 72 L88 74 L86 78 L84 74 L80 72 Z" fill="#FEF9C3" />
            {/* Скульптурная золотая цифра 67 */}
            <text
              x="50"
              y="66"
              textAnchor="middle"
              fontFamily="Georgia, serif"
              fontWeight="900"
              fontSize="40"
              letterSpacing="-1"
              fill={`url(#${uid}_medal)`}
              stroke="#78350F"
              strokeWidth="1.2"
            >
              67
            </text>
            <text
              x="50"
              y="79"
              textAnchor="middle"
              fontFamily="sans-serif"
              fontWeight="800"
              fontSize="7.5"
              letterSpacing="2"
              fill="#FDE047"
            >
              PREMIUM
            </text>
          </svg>
        );

      case 'jade_legend':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <radialGradient id={`${uid}_jadebg`} cx="50%" cy="45%" r="65%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="45%" stopColor="#065F46" />
                <stop offset="100%" stopColor="#022C22" />
              </radialGradient>
              <linearGradient id={`${uid}_crystal`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#A7F3D0" />
                <stop offset="35%" stopColor="#34D399" />
                <stop offset="70%" stopColor="#059669" />
                <stop offset="100%" stopColor="#064E3B" />
              </linearGradient>
              <linearGradient id={`${uid}_trim`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FEF08A" />
                <stop offset="50%" stopColor="#6EE7B7" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_jadebg)`} />
            {/* Мистическое нефритовое кольцо рун */}
            <circle cx="50" cy="50" r="43" fill="none" stroke={`url(#${uid}_trim)`} strokeWidth="2.5" opacity="0.9" />
            <circle cx="50" cy="50" r="37" fill="none" stroke="#6EE7B7" strokeWidth="1.2" strokeDasharray="5 4" opacity="0.7" />
            {/* Крылья нефритового дракона */}
            <path d="M50 56 L16 34 L22 50 L14 60 L34 62 Z" fill="#047857" stroke="#6EE7B7" strokeWidth="1.2" />
            <path d="M50 56 L84 34 L78 50 L86 60 L66 62 Z" fill="#047857" stroke="#6EE7B7" strokeWidth="1.2" />
            {/* Огранённый нефритовый кристалл в центре */}
            <polygon
              points="50,11 72,34 65,75 50,89 35,75 28,34"
              fill={`url(#${uid}_crystal)`}
              stroke="#ECFDF5"
              strokeWidth="2"
            />
            {/* Внутренние грани кристалла */}
            <polygon points="50,11 62,36 50,52 38,36" fill="#D1FAE5" opacity="0.65" />
            <polygon points="50,52 62,36 72,34 65,75" fill="#047857" opacity="0.45" />
            <polygon points="50,52 38,36 28,34 35,75" fill="#10B981" opacity="0.45" />
            <polygon points="50,52 65,75 50,89 35,75" fill="#022C22" opacity="0.55" />
            {/* Сияющий глаз дракона / ядро кристалла */}
            <polygon points="50,35 58,48 50,61 42,48" fill="#FEF08A" stroke="#FFFFFF" strokeWidth="1.3" />
            <ellipse cx="50" cy="48" rx="2.2" ry="6.5" fill="#064E3B" />
            {/* Искры нефритовой ауры */}
            <circle cx="20" cy="20" r="2.2" fill="#A7F3D0" />
            <circle cx="80" cy="20" r="2.2" fill="#FEF08A" />
            <circle cx="20" cy="80" r="2" fill="#6EE7B7" />
            <circle cx="80" cy="80" r="2" fill="#A7F3D0" />
          </svg>
        );

      case DEFAULT_AVATAR_ID:
      default:
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${uid}_bg`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3F51B5" />
                <stop offset="100%" stopColor="#6366F1" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#${uid}_bg)`} />
            <circle cx="50" cy="36" r="16" fill="#FFFFFF" fillOpacity="0.92" />
            <path d="M24 84 C26 65 37 58 50 58 C63 58 74 65 76 84 Z" fill="#FFFFFF" fillOpacity="0.92" />
            {/* Раскрытая книга внизу */}
            <path d="M26 70 Q38 66 50 72 Q62 66 74 70 L74 86 Q62 82 50 88 Q38 82 26 86 Z" fill="#C7D2FE" stroke="#312E81" strokeWidth="2" />
            <line x1="50" y1="72" x2="50" y2="88" stroke="#312E81" strokeWidth="2" />
          </svg>
        );
    }
  };

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full overflow-hidden shrink-0 select-none ${className}`}
    >
      {renderArtwork()}
    </div>
  );
};
