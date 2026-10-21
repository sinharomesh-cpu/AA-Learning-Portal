/**
 * Worksheet questions (CR-07 FR-022.2, FR-022.3; boards HW3 and W2). Pure functions shared by the
 * builder in the browser and the server, which checks everything again before saving.
 *
 * Every question is written by the teacher. The question plan (W-3) only makes empty questions
 * of the chosen types for the teacher to fill in; nothing here writes or suggests question text.
 *
 * The editor works with a QuestionDraft. What is stored is { prompt, data, answerKey }:
 *   single_choice  data { options }        key { correct: index }
 *   multi_select   data { options }        key { correct: index[] }
 *   fill_blank     data { parts }          key { blanks: string[][], ignoreCase }
 *                  The teacher types "Plants take in [carbon dioxide|CO2] and give out [oxygen]."
 *                  The stored prompt shows each blank as "____", so it never contains an answer.
 *   true_false     data {}                 key { correct: boolean }
 *   matching       data { left, right }    key { aligned: true } (left[i] goes with right[i];
 *                  students only ever see the right-hand list shuffled)
 *   short_answer   data {}                 no key: always marked by the teacher (FR-022.3)
 */

export const QUESTION_TYPES = [
  'single_choice',
  'multi_select',
  'fill_blank',
  'true_false',
  'matching',
  'short_answer',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: 'Multiple choice',
  multi_select: 'Multiple select',
  fill_blank: 'Fill in the blanks',
  true_false: 'True / false',
  matching: 'Matching',
  short_answer: 'Short written answer',
};

export const isQuestionType = (t: unknown): t is QuestionType =>
  typeof t === 'string' && (QUESTION_TYPES as readonly string[]).includes(t);

/** Marked by comparing with the teacher's key; short answers are always marked by the teacher. */
export const isAutoMarked = (t: QuestionType) => t !== 'short_answer';

export const LIMITS = {
  questions: 100,
  prompt: 1000,
  option: 200,
  options: { single_choice: [2, 6], multi_select: [2, 8] } as Record<
    'single_choice' | 'multi_select',
    [number, number]
  >,
  pairs: [2, 8] as [number, number],
  blanks: 10,
  alternatives: 5,
  alternative: 100,
  points: 100,
  sourcePage: 9999,
  shortAnswer: 1000,
};

export interface QuestionDraft {
  type: QuestionType;
  /** For fill in the blanks: the sentence with [answer|other answer] markers. */
  prompt: string;
  options?: string[];
  /** Indexes of correct options (one for multiple choice). */
  correct?: number[];
  /** True / false answer; null while not chosen. */
  truth?: boolean | null;
  pairs?: Array<[string, string]>;
  ignoreCase?: boolean;
  points: number;
  partialCredit?: boolean;
  sourcePage?: number | null;
}

export interface StoredQuestion {
  type: QuestionType;
  prompt: string;
  data: Record<string, unknown>;
  answerKey: Record<string, unknown> | null;
  points: number;
  partialCredit: boolean;
  sourcePage: number | null;
}

const BLANK = '____';
const MARKER = /\[([^[\]]*)\]/g;

const text = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').trim().slice(0, max) : '');
const line = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const int = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) ? n : NaN);

/** An empty question of a type, as the plan makes it (W-3). */
export function emptyQuestion(type: QuestionType, points = 1): QuestionDraft {
  const base: QuestionDraft = { type, prompt: '', points, sourcePage: null };
  switch (type) {
    case 'single_choice':
      return { ...base, options: ['', '', ''], correct: [] };
    case 'multi_select':
      return { ...base, options: ['', '', '', ''], correct: [], partialCredit: false };
    case 'fill_blank':
      return { ...base, ignoreCase: true, partialCredit: true };
    case 'true_false':
      return { ...base, truth: null };
    case 'matching':
      return {
        ...base,
        pairs: [
          ['', ''],
          ['', ''],
          ['', ''],
        ],
        partialCredit: true,
      };
    case 'short_answer':
      return base;
  }
}

export interface PlanRow {
  type: QuestionType;
  count: number;
  points: number;
}

/** The question plan: empty questions in the order of the plan. Nothing is written for the teacher. */
export function planQuestions(plan: PlanRow[]): QuestionDraft[] | null {
  const out: QuestionDraft[] = [];
  for (const row of plan) {
    const count = int(row.count);
    const points = int(row.points);
    if (!isQuestionType(row.type) || !(count >= 0 && count <= LIMITS.questions)) return null;
    if (!(points >= 0 && points <= LIMITS.points)) return null;
    for (let i = 0; i < count; i++) out.push(emptyQuestion(row.type, points));
  }
  return out.length <= LIMITS.questions ? out : null;
}

/** Splits a fill-in sentence into its text parts and blanks. */
export function parseBlanks(sentence: string): { parts: string[]; blanks: string[][] } {
  const parts: string[] = [];
  const blanks: string[][] = [];
  let last = 0;
  for (const m of sentence.matchAll(MARKER)) {
    parts.push(sentence.slice(last, m.index));
    blanks.push(
      m[1]!
        .split('|')
        .map((a) => line(a, LIMITS.alternative))
        .filter(Boolean),
    );
    last = m.index! + m[0].length;
  }
  parts.push(sentence.slice(last));
  return { parts, blanks };
}

export type QuestionProblem =
  'empty' | 'options' | 'correct' | 'blanks' | 'truth' | 'pairs' | 'points' | 'too_long' | 'source_page';

export const QUESTION_PROBLEM_TEXT: Record<QuestionProblem, string> = {
  empty: 'Write the question.',
  options: 'Fill in every option (at least two).',
  correct: 'Choose the correct answer.',
  blanks: 'Put each answer in [ ], for example [oxygen]. Use | for other accepted answers.',
  truth: 'Choose True or False as the correct answer.',
  pairs: 'Fill in both sides of every pair (at least two pairs).',
  points: 'Marks must be a whole number from 0 to 100.',
  too_long: 'This question is too long.',
  source_page: 'The source page must be a page number.',
};

/**
 * Turns an editor question into what is stored. `problems` lists what still stops it being
 * ready; a draft may be saved with problems, a Ready worksheet may not. Returns null for
 * something no editor could have sent (wrong type or shape).
 */
export function toStored(raw: unknown): { question: StoredQuestion; problems: QuestionProblem[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (!isQuestionType(d.type)) return null;
  const type = d.type;
  const problems: QuestionProblem[] = [];
  const points = int(d.points);
  if (!(points >= 0 && points <= LIMITS.points)) return null;
  const sourcePage =
    d.sourcePage === null || d.sourcePage === undefined || d.sourcePage === '' ? null : int(d.sourcePage);
  if (sourcePage !== null && !(sourcePage >= 1 && sourcePage <= LIMITS.sourcePage)) return null;
  if (typeof d.prompt === 'string' && d.prompt.trim().length > LIMITS.prompt) problems.push('too_long');
  const prompt = text(d.prompt, LIMITS.prompt);
  const base = { type, points, partialCredit: false, sourcePage };

  if (type === 'single_choice' || type === 'multi_select') {
    if (!Array.isArray(d.options) || !Array.isArray(d.correct)) return null;
    const [min, max] = LIMITS.options[type];
    if (d.options.length > max) return null;
    const options = d.options.map((o) => line(o, LIMITS.option));
    const correct = [...new Set(d.correct.map(int))].sort((a, b) => a - b);
    if (correct.some((i) => !(i >= 0 && i < options.length))) return null;
    if (!prompt) problems.push('empty');
    if (options.length < min || options.some((o) => !o)) problems.push('options');
    const okCount = type === 'single_choice' ? correct.length === 1 : correct.length >= 1;
    if (!okCount) problems.push('correct');
    const complete = problems.length === 0;
    return {
      question: {
        ...base,
        prompt,
        data: { options },
        answerKey: complete || okCount ? { correct: type === 'single_choice' ? (correct[0] ?? null) : correct } : null,
        partialCredit: type === 'multi_select' && d.partialCredit === true,
      },
      problems,
    };
  }

  if (type === 'fill_blank') {
    const sentence = text(d.prompt, LIMITS.prompt * 2);
    const { parts, blanks } = parseBlanks(sentence);
    const shown = parts.join(BLANK).trim();
    if (!sentence) problems.push('empty');
    else if (blanks.length === 0 || blanks.length > LIMITS.blanks || blanks.some((b) => b.length === 0))
      problems.push('blanks');
    if (blanks.some((b) => b.length > LIMITS.alternatives)) return null;
    if (shown.length > LIMITS.prompt) problems.push('too_long');
    const ok = problems.length === 0;
    return {
      question: {
        ...base,
        prompt: shown.slice(0, LIMITS.prompt),
        data: { parts },
        // D3A-18: capital letters are always ignored.
        answerKey: ok ? { blanks, ignoreCase: true } : null,
        // Part marks (a share per blank) unless the teacher turned them off (owner, 21 Oct).
        partialCredit: d.partialCredit !== false,
      },
      problems,
    };
  }

  if (type === 'true_false') {
    const truth = d.truth === true ? true : d.truth === false ? false : null;
    if (!prompt) problems.push('empty');
    if (truth === null) problems.push('truth');
    return { question: { ...base, prompt, data: {}, answerKey: truth === null ? null : { correct: truth } }, problems };
  }

  if (type === 'matching') {
    if (!Array.isArray(d.pairs) || d.pairs.length > LIMITS.pairs[1]) return null;
    const pairs = d.pairs.map((p) =>
      Array.isArray(p) ? ([line(p[0], LIMITS.option), line(p[1], LIMITS.option)] as const) : (['', ''] as const),
    );
    if (!prompt) problems.push('empty');
    if (pairs.length < LIMITS.pairs[0] || pairs.some(([l, r]) => !l || !r)) problems.push('pairs');
    return {
      question: {
        ...base,
        prompt,
        data: { left: pairs.map((p) => p[0]), right: pairs.map((p) => p[1]) },
        answerKey: problems.length === 0 ? { aligned: true } : null,
        // Part marks (a share per pair) unless the teacher turned them off (owner, 21 Oct).
        partialCredit: d.partialCredit !== false,
      },
      problems,
    };
  }

  // short_answer
  if (!prompt) problems.push('empty');
  return { question: { ...base, prompt, data: { maxLength: LIMITS.shortAnswer }, answerKey: null }, problems };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : '')) : []);

/** Turns a stored question back into what the editor shows. */
export function toDraft(q: StoredQuestion): QuestionDraft {
  const base = { type: q.type, points: q.points, sourcePage: q.sourcePage };
  const key = q.answerKey ?? {};
  switch (q.type) {
    case 'single_choice': {
      const c = key.correct;
      return { ...base, prompt: q.prompt, options: strings(q.data.options), correct: typeof c === 'number' ? [c] : [] };
    }
    case 'multi_select':
      return {
        ...base,
        prompt: q.prompt,
        options: strings(q.data.options),
        correct: Array.isArray(key.correct) ? (key.correct as number[]) : [],
        partialCredit: q.partialCredit,
      };
    case 'fill_blank': {
      const parts = strings(q.data.parts);
      const blanks = Array.isArray(key.blanks) ? (key.blanks as string[][]) : [];
      const sentence = parts.length
        ? parts.map((p, i) => (i < blanks.length ? `${p}[${blanks[i]!.join('|')}]` : p)).join('')
        : q.prompt;
      return {
        ...base,
        prompt: blanks.length ? sentence : q.prompt,
        ignoreCase: key.ignoreCase !== false,
        partialCredit: q.partialCredit,
      };
    }
    case 'true_false':
      return { ...base, prompt: q.prompt, truth: typeof key.correct === 'boolean' ? key.correct : null };
    case 'matching': {
      const left = strings(q.data.left);
      const right = strings(q.data.right);
      return {
        ...base,
        prompt: q.prompt,
        pairs: left.map((l, i) => [l, right[i] ?? ''] as [string, string]),
        partialCredit: q.partialCredit,
      };
    }
    case 'short_answer':
      return { ...base, prompt: q.prompt };
  }
}

/** Total marks of a list of questions. */
export const totalPoints = (qs: Array<{ points: number }>) => qs.reduce((s, q) => s + q.points, 0);

/** A stable shuffle (same order every time for the same seed), for showing matching answers. */
export function stableShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = items.map((item, i) => ({ item, k: (Math.imul(h ^ (i + 1), 2654435761) >>> 0) % 1_000_003 }));
  out.sort((a, b) => a.k - b.k);
  const shuffled = out.map((o) => o.item);
  // Never leave the list in its original order (that order is the answer key for matching).
  if (items.length > 1 && shuffled.every((x, i) => x === items[i])) shuffled.push(shuffled.shift()!);
  return shuffled;
}

/** What a student may see of a question: never the answer key. */
export interface StudentQuestion {
  type: QuestionType;
  prompt: string;
  points: number;
  options?: string[];
  parts?: string[];
  left?: string[];
  /** Matching answers in a shuffled order, so the order gives nothing away. */
  right?: string[];
  maxLength?: number;
}

export function studentView(
  q: Pick<StoredQuestion, 'type' | 'prompt' | 'data' | 'points'>,
  seed: string,
): StudentQuestion {
  const base = { type: q.type, prompt: q.prompt, points: q.points };
  switch (q.type) {
    case 'single_choice':
    case 'multi_select':
      return { ...base, options: strings(q.data.options) };
    case 'fill_blank':
      return { ...base, parts: strings(q.data.parts) };
    case 'matching':
      return { ...base, left: strings(q.data.left), right: stableShuffle(strings(q.data.right), seed) };
    case 'short_answer':
      return { ...base, maxLength: LIMITS.shortAnswer };
    default:
      return base;
  }
}
