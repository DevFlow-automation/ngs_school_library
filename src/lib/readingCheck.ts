/**
 * Генератор коротких проверок реального чтения (Вариант 2) — без ИИ.
 * Берёт предложение с последних прочитанных страниц, скрывает значимое слово
 * и предлагает 4 варианта (1 верный + 3 из текста книги) в случайном порядке.
 * Если текст слишком короткий — возвращает резервную проверку внимания с иконками.
 */

export interface ReadingCheckQuestion {
  id: string;
  mode: 'text' | 'icon';
  prompt: string;
  /** Предложение с пропуском "_____" (только для mode === 'text') */
  snippet?: string;
  options: string[];
  correctIndex: number;
  reason: 'periodic' | 'autoclicker';
}

const STOPWORDS = new Set([
  'котор', 'потом', 'после', 'перед', 'между', 'через', 'когда', 'тогда', 'тепер', 'здесь',
  'очень', 'тольк', 'можно', 'нужно', 'будет', 'будут', 'были', 'этого', 'этой', 'этим',
  'своей', 'своих', 'своего', 'чтобы', 'более', 'менее', 'вокру', 'всегд', 'никог', 'сказа',
  'говор', 'спрос', 'ответ', 'думал', 'знает', 'может', 'хотел', 'стало', 'стали', 'вдруг',
  'почти', 'совсе', 'также', 'такой', 'такая', 'такое', 'такие', 'какой', 'какая', 'какое',
  'какие', 'кажды', 'друго', 'одной', 'одног', 'назад', 'впере', 'пока', 'даже', 'снова',
  'опять', 'почему', 'откуда', 'никуда', 'ничего', 'прост', 'прямо', 'могла', 'могли',
  'would', 'could', 'should', 'their', 'there', 'where', 'which', 'about', 'after', 'before',
  'other', 'these', 'those', 'being', 'every', 'still', 'never', 'always', 'under', 'through',
]);

const FALLBACK_WORDS_RU = [
  'корабль', 'дорога', 'письмо', 'ветер', 'берег', 'фонарь', 'облако', 'комната',
  'голос', 'зеркало', 'дерево', 'книга', 'парус', 'лестница', 'подарок', 'тишина',
  'остров', 'капитан', 'библиотека', 'история', 'приключение', 'путешествие',
];

const FALLBACK_ICON_CHECKS: Array<{ label: string; icon: string }> = [
  { label: 'Лиса', icon: '🦊' },
  { label: 'Книга', icon: '📖' },
  { label: 'Компас', icon: '🧭' },
  { label: 'Корабль', icon: '⛵' },
  { label: 'Звезда', icon: '⭐' },
  { label: 'Сова', icon: '🦉' },
  { label: 'Ракета', icon: '🚀' },
  { label: 'Корона', icon: '👑' },
];

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isStopword(word: string): boolean {
  const lower = word.toLowerCase();
  if (lower.length < 5) return true;
  if (STOPWORDS.has(lower)) return true;
  if (lower.length >= 5 && STOPWORDS.has(lower.slice(0, 5))) return true;
  return false;
}

function matchWordCase(word: string, reference: string): string {
  const isCapitalized =
    reference.length > 0 &&
    reference[0] === reference[0].toUpperCase() &&
    reference[0] !== reference[0].toLowerCase();
  if (isCapitalized) {
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  }
  return word.toLowerCase();
}

function extractSentences(paragraphs: string[]): string[] {
  const sentences: string[] = [];
  for (const raw of paragraphs) {
    const clean = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const parts = clean.split(/(?<=[.!?…])\s+/);
    for (const s of parts) {
      const trimmed = s.trim();
      if (trimmed.length >= 45 && trimmed.length <= 230) {
        sentences.push(trimmed);
      }
    }
  }
  return sentences;
}

function extractUniqueWords(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  const wordRe = /[А-Яа-яЁёA-Za-z]{5,16}/g;

  for (const raw of paragraphs) {
    const matches = String(raw || '').match(wordRe);
    if (!matches) continue;
    for (const w of matches) {
      const lower = w.toLowerCase();
      if (isStopword(lower) || seen.has(lower)) continue;
      seen.add(lower);
      words.push(w);
    }
  }
  return words;
}

function buildFallbackIconQuestion(reason: 'periodic' | 'autoclicker'): ReadingCheckQuestion {
  const chosen = shuffle(FALLBACK_ICON_CHECKS).slice(0, 4);
  const targetIdx = Math.floor(Math.random() * chosen.length);
  const target = chosen[targetIdx];

  return {
    id: `icon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    mode: 'icon',
    prompt: `Проверка внимания: нажми на «${target.label}»`,
    options: chosen.map((c) => `${c.icon} ${c.label}`),
    correctIndex: targetIdx,
    reason,
  };
}

/**
 * Создаёт вопрос на основе последних прочитанных абзацев.
 * Если подходящего предложения не нашлось — возвращает резервную проверку с иконками.
 */
export function generateReadingCheckQuestion(params: {
  recentParagraphs: string[];
  poolParagraphs: string[];
  reason: 'periodic' | 'autoclicker';
  excludeWord?: string;
}): ReadingCheckQuestion {
  const { recentParagraphs, poolParagraphs, reason, excludeWord } = params;
  const sentences = shuffle(extractSentences(recentParagraphs));
  const poolWords = shuffle(extractUniqueWords(poolParagraphs));
  const excludedLower = excludeWord?.toLowerCase();

  for (const sentence of sentences) {
    const wordRe = /[А-Яа-яЁёA-Za-z]{5,15}/g;
    const matches: Array<{ word: string; index: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(sentence)) !== null) {
      const word = m[0];
      const lower = word.toLowerCase();
      if (isStopword(lower)) continue;
      if (excludedLower && lower === excludedLower) continue;
      // Предпочитаем слова не в самом начале предложения (чтобы заглавная буква не выдавала ответ)
      if (m.index > 0 || matches.length === 0) {
        matches.push({ word, index: m.index });
      }
    }

    if (matches.length === 0) continue;

    // Выбираем более содержательное (длинное) слово из случайных кандидатов
    const rankedCandidates = shuffle(matches).sort((a, b) => {
      const aScore = (a.index > 0 ? 10 : 0) + Math.min(a.word.length, 10);
      const bScore = (b.index > 0 ? 10 : 0) + Math.min(b.word.length, 10);
      return bScore - aScore;
    });

    const chosen = rankedCandidates[0];
    const targetLower = chosen.word.toLowerCase();
    const targetStem = targetLower.slice(0, 4);
    const sentenceLower = sentence.toLowerCase();
    const isCyrillicTarget = /[А-Яа-яЁё]/.test(chosen.word);

    const distractors: string[] = [];
    const usedStems = new Set<string>([targetStem]);

    const tryAddDistractor = (candidate: string, strictLength: boolean) => {
      if (distractors.length >= 3) return;
      const lower = candidate.toLowerCase();
      if (lower === targetLower) return;
      if (isCyrillicTarget !== /[А-Яа-яЁё]/.test(candidate)) return;
      const stem = lower.slice(0, 4);
      if (usedStems.has(stem)) return;
      if (sentenceLower.includes(lower)) return;
      if (strictLength && Math.abs(candidate.length - chosen.word.length) > 3) return;
      usedStems.add(stem);
      distractors.push(matchWordCase(candidate, chosen.word));
    };

    for (const w of poolWords) {
      tryAddDistractor(w, true);
      if (distractors.length >= 3) break;
    }
    if (distractors.length < 3) {
      for (const w of poolWords) {
        tryAddDistractor(w, false);
        if (distractors.length >= 3) break;
      }
    }
    if (distractors.length < 3 && isCyrillicTarget) {
      for (const w of shuffle(FALLBACK_WORDS_RU)) {
        tryAddDistractor(w, false);
        if (distractors.length >= 3) break;
      }
    }

    if (distractors.length < 3) continue;

    const snippet =
      sentence.slice(0, chosen.index) +
      '_____' +
      sentence.slice(chosen.index + chosen.word.length);

    const mixed = shuffle([
      { text: chosen.word, isCorrect: true },
      ...distractors.map((text) => ({ text, isCorrect: false })),
    ]);
    const correctIndex = mixed.findIndex((item) => item.isCorrect);

    return {
      id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      mode: 'text',
      prompt: 'Какое слово пропущено в недавно прочитанном фрагменте?',
      snippet,
      options: mixed.map((item) => item.text),
      correctIndex,
      reason,
    };
  }

  return buildFallbackIconQuestion(reason);
}
