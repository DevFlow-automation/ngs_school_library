import type { Chapter } from '@/types/book';

export interface BookFrontMatterInfo {
  /** Индексы вступительных глав (предисловие, введение, от автора, оглавление и т.п.) */
  frontMatterIndices: Set<number>;
  /** Индекс первой основной главы книги (0, если вступительных глав нет) */
  mainContentStartIndex: number;
}

/**
 * Юникод-безопасная граница конца слова (в JS \b не работает с кириллицей).
 */
const WORD_END = '(?=$|[\\s.:,;!?()\\[\\]\\-–—•«»"\'/])';

const FRONT_MATTER_PREFIX_PATTERNS: readonly RegExp[] = [
  // Русский
  'предисловие',
  'вместо\\s+предисловия',
  'к\\s+предисловию',
  'введение',
  'вместо\\s+введения',
  'вводн(?:ая|ое|ый)',
  'вступление',
  'вступительн(?:ая|ое|ый|ые)',
  'от\\s+автора',
  'от\\s+авторов',
  'слово\\s+(?:от\\s+)?автора',
  'обращение\\s+автора',
  'от\\s+редакции',
  'от\\s+редактора',
  'от\\s+издател(?:я|ьства)',
  'от\\s+переводчика',
  'от\\s+составител(?:я|ей)',
  'к\\s+читател(?:ю|ям)',
  'обращение\\s+к\\s+читател(?:ю|ям)',
  'дорог(?:ой|ие)\\s+читател(?:ь|и)',
  'юн(?:ому|ым)\\s+читател(?:ю|ям)',
  'об\\s+авторе',
  'о\\s+писателе',
  'о\\s+(?:книге|произведении|романе|повести|рассказе|сказке|сборнике|поэме|пьесе|этой\\s+книге)',
  'аннотация',
  'синопсис',
  'краткое\\s+содержание',
  'посвящение',
  'посвящается',
  'эпиграф(?:ы)?',
  'оглавление',
  'содержание',
  'пролог',
  'предуведомление',
  'несколько\\s+слов',
  'слово\\s+о',
  '(?:краткая\\s+)?биография',
  'биографическая\\s+справка',
  'жизнь\\s+и\\s+творчество',
  'основные\\s+даты\\s+жизни',
  'действующие\\s+лица',
  '(?:список\\s+)?персонаж(?:и|ей)',
  '(?:главные\\s+)?герои\\s+книги',
  'титул(?:ьный\\s+лист)?',
  'обложка',
  'выходные\\s+данные',
  'сведения\\s+об\\s+издании',
  'благодарност(?:ь|и)',
  'признательность',
  'примечани(?:е|я)\\s+(?:от|автора|переводчика|редактора|издателя|составителя)',

  // Английский
  'preface',
  'foreword',
  'introduction',
  'intro',
  'prologue',
  'dedication',
  'epigraph',
  'about\\s+the\\s+author',
  'about\\s+this\\s+book',
  '(?:table\\s+of\\s+)?contents',
  '(?:author|editor|translator)[\'’]?s?\\s+note',
  'note\\s+to\\s+the\\s+reader',
  'acknowledg(?:e)?ments?',
  'synopsis',
  'annotation',
  'cast\\s+of\\s+characters',
  'dramatis\\s+personae',
  'title\\s+page',
  'copyright',
  'front\\s*matter',

  // Казахский
  'алғы\\s*сөз',
  'кіріспе',
  'автордан',
  'редакциядан',
  'аудармашыдан',
  'баспадан',
  'оқырманға',
  'автор\\s+туралы',
  'мазмұны',
  'арнау',
  'кейіпкерлер',
].map((src) => new RegExp(`^${src}${WORD_END}`, 'i'));

const MAIN_START_HEADING_PATTERN = new RegExp(
  `^(?:глава|часть|книга|том|раздел|действие|акт|песнь|картина|сцена|явление|chapter|part|book|act|section|тарау|бөлім)\\s*(?:№\\s*)?(?:1|i|первая|первый|первое|one|first|бірінші)${WORD_END}`,
  'i'
);

const MAIN_START_KAZAKH_PREFIX_PATTERN = new RegExp(
  `^(?:1|i)\\s*[-–—]?\\s*(?:тарау|бөлім|бөлімі)${WORD_END}`,
  'i'
);

const STANDALONE_FIRST_NUMERAL_PATTERN = /^(?:1|i)(?:[.)](?:\s|$)|$|\s+[-–—])/i;
const STANDALONE_SECOND_NUMERAL_PATTERN = /^(?:2|ii)(?:[.)](?:\s|$)|$|\s+[-–—])/i;

function cleanHeadingSegment(raw: string): string {
  return (raw || '')
    .replace(/^[\s*•—–\-«»"'„“()\[\]]+/, '')
    .replace(/[\s*•—–\-«»"'„“]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Определяет по названию, является ли секция вступительной (предисловие, введение, от автора и т.п.).
 */
export function isFrontMatterTitle(title?: string | null): boolean {
  if (!title) return false;
  const full = cleanHeadingSegment(title);
  if (!full) return false;

  if (FRONT_MATTER_PREFIX_PATTERNS.some((re) => re.test(full))) {
    return true;
  }

  // Для составных заголовков FB2 вида «Предисловие • Часть 1» проверяем также верхний уровень
  if (full.includes('•')) {
    const firstPart = cleanHeadingSegment(full.split('•')[0] || '');
    if (firstPart && FRONT_MATTER_PREFIX_PATTERNS.some((re) => re.test(firstPart))) {
      return true;
    }
  }

  return false;
}

/**
 * Определяет, похоже ли название главы на явное начало основного текста («Глава 1», «Часть первая» и т.п.).
 */
export function isMainTextStartTitle(title?: string | null, nextTitle?: string | null): boolean {
  if (!title) return false;
  if (isFrontMatterTitle(title)) return false;

  const full = cleanHeadingSegment(title);
  if (!full) return false;

  // Проверяем верхний уровень составного заголовка (чтобы «Сборник • Глава 1» не срабатывал ложно,
  // а «Часть 1 • Глава 1» и «Глава I» — срабатывали)
  const topPart = full.includes('•') ? cleanHeadingSegment(full.split('•')[0] || '') : full;

  if (
    MAIN_START_HEADING_PATTERN.test(topPart) ||
    MAIN_START_KAZAKH_PREFIX_PATTERN.test(topPart)
  ) {
    return true;
  }

  // Одиночная римская/арабская «I» или «1», если следующая глава — «II» или «2»
  if (STANDALONE_FIRST_NUMERAL_PATTERN.test(topPart) && nextTitle) {
    const nextFull = cleanHeadingSegment(nextTitle);
    const nextTop = nextFull.includes('•') ? cleanHeadingSegment(nextFull.split('•')[0] || '') : nextFull;
    if (STANDALONE_SECOND_NUMERAL_PATTERN.test(nextTop)) {
      return true;
    }
  }

  return false;
}

/**
 * Анализирует главы книги и определяет вступительные разделы (предисловия)
 * и индекс первой основной главы, с которой начинается чтение произведения.
 */
export function getBookFrontMatterInfo(chapters?: Chapter[] | null): BookFrontMatterInfo {
  const list = chapters || [];
  if (list.length <= 1) {
    return { frontMatterIndices: new Set<number>(), mainContentStartIndex: 0 };
  }

  // 1. Если администратор явно разметил главы флагом isFrontMatter — доверяем его разметке
  const hasExplicitFlags = list.some((ch) => typeof ch?.isFrontMatter === 'boolean');
  if (hasExplicitFlags) {
    const indices = new Set<number>();
    for (let i = 0; i < list.length; i++) {
      if (list[i]?.isFrontMatter === true) {
        indices.add(i);
      }
    }
    let startIdx = 0;
    while (startIdx < list.length - 1 && indices.has(startIdx)) {
      startIdx += 1;
    }
    return { frontMatterIndices: indices, mainContentStartIndex: startIdx };
  }

  // 2. Автоматическое определение для всех книг (в том числе загруженных ранее)
  const maxScan = Math.min(list.length - 1, Math.max(10, Math.floor(list.length * 0.45)));

  // Шаг А: непрерывные вступительные разделы с самого начала книги
  let keywordEnd = 0;
  while (keywordEnd < maxScan && isFrontMatterTitle(list[keywordEnd]?.title)) {
    keywordEnd += 1;
  }

  // Шаг Б: если в первых 6 секциях встретился явный заголовок предисловия (например, после
  // безымянного титульного листа, который FB2-парсер назвал «Глава 1»), включаем и предшествующие ему
  const nonContiguousLimit = Math.min(6, maxScan);
  for (let i = keywordEnd; i < nonContiguousLimit; i++) {
    if (isFrontMatterTitle(list[i]?.title)) {
      keywordEnd = i + 1;
    }
  }

  // Шаг В: ищем ПЕРВУЮ явную «Главу 1 / Часть 1 / Книгу 1» начиная с keywordEnd.
  // Если она находится на индексе > keywordEnd, всё до неё — вступительные разделы.
  let mainStart = keywordEnd;
  for (let i = keywordEnd; i <= maxScan; i++) {
    if (isMainTextStartTitle(list[i]?.title, list[i + 1]?.title)) {
      mainStart = i;
      break;
    }
  }

  // Защита: оставляем хотя бы одну основную главу
  mainStart = Math.max(0, Math.min(list.length - 1, mainStart));

  const frontMatterIndices = new Set<number>();
  for (let i = 0; i < mainStart; i++) {
    frontMatterIndices.add(i);
  }

  return {
    frontMatterIndices,
    mainContentStartIndex: mainStart,
  };
}

/**
 * Проверяет, является ли переход к выбранной главе допустимым пропуском предисловия
 * или выбором стартовой главы в самом начале чтения книги (без предупреждения о перескоке).
 */
export function isAllowedPrefaceOrInitialStartJump(params: {
  targetChapterIndex: number;
  totalChapters: number;
  mainContentStartIndex: number;
  pagesTurned: number;
}): boolean {
  const { targetChapterIndex, totalChapters, mainContentStartIndex, pagesTurned } = params;

  if (targetChapterIndex <= 0) return true;

  // 1. Переход внутри предисловий или напрямую к первой основной главе всегда разрешён
  if (targetChapterIndex <= mainContentStartIndex) {
    return true;
  }

  // 2. Запасной вариант для книг с нетипичными/безымянными предисловиями:
  // в самом начале книги (до 2 перелистываний) разрешаем выбрать стартовую главу
  // в начале произведения (не в конце книги и не глубже первых ~40% / 6 глав).
  if (pagesTurned <= 2 && targetChapterIndex < totalChapters - 1) {
    const initialStartLimit = Math.min(6, Math.ceil(totalChapters * 0.4));
    if (targetChapterIndex <= initialStartLimit) {
      return true;
    }
  }

  return false;
}
