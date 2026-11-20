export interface ReadingMetricsSnapshot {
  progressPercent: number;
  readingSeconds: number;
  pagesTurned: number;
  fastTurnsCount: number;
  avgSecondsPerPage: number;
  minSecondsPerPage?: number | null;
}

export type ReadingPaceStatus = 'suspicious' | 'fast' | 'normal' | 'none';

export interface ReadingPaceEvaluation {
  status: ReadingPaceStatus;
  label: string;
  reason: string;
}

/**
 * Порог "слишком быстрого" перелистывания страницы в секундах.
 * Для стандартной страницы (~1100 символов) составляет 9-10 сек,
 * для короткой последней страницы главы снижается пропорционально (минимум 2 сек).
 */
export function getFastTurnThresholdSeconds(pageCharCount: number): number {
  return Math.min(10, Math.max(2, Math.round(pageCharCount / 120)));
}

/** Формат таймера в шапке читалки: MM:SS или H:MM:SS */
export function formatReadingTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Человекочитаемая длительность чтения для отчёта админа */
export function formatReadingDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  if (safe < 60) return `${safe} сек`;

  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  }
  return seconds > 0 ? `${minutes} мин ${seconds} сек` : `${minutes} мин`;
}

/** Формат средней скорости перелистывания */
export function formatTurnSpeed(secondsPerPage: number): string {
  if (!secondsPerPage || secondsPerPage <= 0) return '—';
  if (secondsPerPage < 10) return `${secondsPerPage.toFixed(1)} сек/стр`;
  if (secondsPerPage < 60) return `${Math.round(secondsPerPage)} сек/стр`;
  const mins = Math.floor(secondsPerPage / 60);
  const secs = Math.round(secondsPerPage % 60);
  return secs > 0 ? `${mins} м ${secs} с/стр` : `${mins} мин/стр`;
}

/** Оценка честности чтения на основе времени и скорости нажатия «Следующая страница» */
export function evaluateReadingPace(m: ReadingMetricsSnapshot): ReadingPaceEvaluation {
  const seconds = Math.max(0, Number(m.readingSeconds || 0));
  const turns = Math.max(0, Number(m.pagesTurned || 0));
  const fastTurns = Math.max(0, Number(m.fastTurnsCount || 0));
  const avg = Math.max(0, Number(m.avgSecondsPerPage || 0));
  const percent = Math.max(0, Number(m.progressPercent || 0));

  if (seconds === 0 && turns === 0) {
    if (percent >= 25) {
      return {
        status: 'none',
        label: 'Нет данных таймера',
        reason: 'Прогресс записан до включения таймера или без перелистывания',
      };
    }
    return { status: 'none', label: '—', reason: '' };
  }

  const fastRatio = turns > 0 ? fastTurns / turns : 0;

  if (turns >= 3 && fastTurns >= 3 && fastRatio >= 0.4) {
    return {
      status: 'suspicious',
      label: 'Подозрение на пролистывание',
      reason: `Быстрых кликов: ${fastTurns} из ${turns} (${Math.round(fastRatio * 100)}%)`,
    };
  }

  if (turns >= 3 && avg > 0 && avg < 10) {
    return {
      status: 'suspicious',
      label: 'Подозрение на пролистывание',
      reason: `Средняя скорость ${formatTurnSpeed(avg)}`,
    };
  }

  if (percent >= 25 && seconds < 60 && turns <= 2) {
    return {
      status: 'suspicious',
      label: 'Возможен перескок глав',
      reason: `Прогресс ${percent}% при времени чтения ${formatReadingDuration(seconds)}`,
    };
  }

  if ((turns >= 3 && avg >= 10 && avg < 18) || fastTurns >= 2) {
    return {
      status: 'fast',
      label: 'Быстрый темп',
      reason: fastTurns >= 2 ? `Быстрых перелистываний: ${fastTurns}` : `Среднее: ${formatTurnSpeed(avg)}`,
    };
  }

  return {
    status: 'normal',
    label: 'Нормальное чтение',
    reason: avg > 0 ? `Среднее: ${formatTurnSpeed(avg)}` : `Время: ${formatReadingDuration(seconds)}`,
  };
}
