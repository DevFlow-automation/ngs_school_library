const LATIN_TO_CYRILLIC: Record<string, string> = {
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
};

export function normalizeStudentClass(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^0-9А-ЯЁA-Z]/g, '')
    .replace(/[ABCEHKMOPTX]/g, (ch) => LATIN_TO_CYRILLIC[ch] || ch);

  const match = cleaned.match(/^(\d{1,2})([А-ЯЁ]?)$/);
  if (!match) return raw.trim();
  return match[2] ? `${match[1]} «${match[2]}»` : match[1];
}

export function normalizeStudentName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ''))
    .join(' ');
}
