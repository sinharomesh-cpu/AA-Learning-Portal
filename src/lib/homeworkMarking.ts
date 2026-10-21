import { LIMITS, type QuestionType, type StoredQuestion } from './worksheetQuestions';

/**
 * Students' answers and automatic marking (CR-07 FR-022.6; D3A-18 as recommended, awaiting the
 * owner's explicit approval). Marking only compares an answer with the key the teacher wrote:
 * no AI is used, and short written answers are always marked by the teacher (FR-022.3). The
 * teacher can override every mark.
 *
 * Answers, by type:
 *   single_choice  { choice: index | null }
 *   multi_select   { choices: index[] }
 *   fill_blank     { blanks: string[] }
 *   true_false     { value: boolean | null }
 *   matching       { choices: (text | null)[] }   the chosen right-hand text for each left item
 *   short_answer   { text: string }
 */

export type Response = Record<string, unknown>;

const int = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) ? n : NaN);
const str = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').slice(0, max) : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : '')) : []);

/** Checks and cleans a student's answer for a question. Null for anything the player can't send. */
export function cleanResponse(q: Pick<StoredQuestion, 'type' | 'data'>, raw: unknown): Response | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  switch (q.type) {
    case 'single_choice': {
      if (r.choice === null || r.choice === undefined) return { choice: null };
      const i = int(r.choice);
      return i >= 0 && i < strings(q.data.options).length ? { choice: i } : null;
    }
    case 'multi_select': {
      if (!Array.isArray(r.choices)) return null;
      const n = strings(q.data.options).length;
      const choices = [...new Set(r.choices.map(int))].sort((a, b) => a - b);
      return choices.every((i) => i >= 0 && i < n) ? { choices } : null;
    }
    case 'fill_blank': {
      const blanks = strings(q.data.parts).length - 1;
      if (!Array.isArray(r.blanks) || r.blanks.length > blanks) return null;
      const out = r.blanks.map((b) => str(b, LIMITS.alternative));
      if (out.some((b) => b === null)) return null;
      while (out.length < blanks) out.push('');
      return { blanks: out };
    }
    case 'true_false':
      return r.value === true || r.value === false ? { value: r.value } : r.value == null ? { value: null } : null;
    case 'matching': {
      const left = strings(q.data.left).length;
      const right = new Set(strings(q.data.right));
      if (!Array.isArray(r.choices) || r.choices.length > left) return null;
      const out = r.choices.map((c) =>
        c === null || c === '' ? null : typeof c === 'string' && right.has(c) ? c : undefined,
      );
      if (out.some((c) => c === undefined)) return null;
      while (out.length < left) out.push(null);
      return { choices: out };
    }
    case 'short_answer': {
      const text = str(r.text, LIMITS.shortAnswer + 1);
      return text !== null && text.length <= LIMITS.shortAnswer ? { text } : null;
    }
  }
}

/** Has the student answered this question at all? */
export function isAnswered(type: QuestionType, r: Response | null | undefined): boolean {
  if (!r) return false;
  switch (type) {
    case 'single_choice':
      return typeof r.choice === 'number';
    case 'multi_select':
      return Array.isArray(r.choices) && r.choices.length > 0;
    case 'fill_blank':
      return Array.isArray(r.blanks) && r.blanks.some((b) => typeof b === 'string' && b.trim() !== '');
    case 'true_false':
      return typeof r.value === 'boolean';
    case 'matching':
      return Array.isArray(r.choices) && r.choices.some((c) => typeof c === 'string');
    case 'short_answer':
      return typeof r.text === 'string' && r.text.trim() !== '';
  }
}

/** D3A-18 (approved 21 Oct): exact match, ignoring capital letters and extra spaces only. */
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Automatic marks for one answer, from the teacher's key only; null for a short written answer
 * (the teacher marks it). Unanswered gets 0.
 *   - multiple choice, true/false: all marks or none;
 *   - multiple select: all or nothing, or with part marks on, each correct tick earns a share
 *     and each wrong tick takes one away (never below 0);
 *   - fill in the blanks: any accepted answer counts, ignoring capital letters and extra spaces
 *     (D3A-18); with part marks on, an equal share per blank, otherwise all or nothing;
 *   - matching: with part marks on, an equal share per correct pair, otherwise all or nothing.
 * The teacher switches part marks on or off per question (owner, 21 Oct 2026).
 */
export function autoMark(
  q: Pick<StoredQuestion, 'type' | 'data' | 'answerKey' | 'points' | 'partialCredit'>,
  r: Response | null,
): number | null {
  if (q.type === 'short_answer') return null;
  const key = q.answerKey ?? {};
  const pts = q.points;
  if (!r || !isAnswered(q.type, r)) return 0;
  switch (q.type) {
    case 'single_choice':
      return r.choice === key.correct ? pts : 0;
    case 'true_false':
      return r.value === key.correct ? pts : 0;
    case 'multi_select': {
      const correct = new Set(Array.isArray(key.correct) ? (key.correct as number[]) : []);
      const chosen = new Set(r.choices as number[]);
      const right = [...chosen].filter((c) => correct.has(c)).length;
      const wrong = chosen.size - right;
      if (!q.partialCredit) return right === correct.size && wrong === 0 ? pts : 0;
      return correct.size ? round2(Math.max(0, ((right - wrong) * pts) / correct.size)) : 0;
    }
    case 'fill_blank': {
      const blanks = Array.isArray(key.blanks) ? (key.blanks as string[][]) : [];
      if (!blanks.length) return 0;
      const given = r.blanks as string[];
      const hits = blanks.filter((accepted, i) => accepted.some((a) => norm(a) === norm(given[i] ?? ''))).length;
      if (!q.partialCredit) return hits === blanks.length ? pts : 0;
      return round2((hits * pts) / blanks.length);
    }
    case 'matching': {
      const right = strings(q.data.right);
      if (!right.length) return 0;
      const chosen = r.choices as Array<string | null>;
      const hits = right.filter((text, i) => chosen[i] === text).length;
      if (!q.partialCredit) return hits === right.length ? pts : 0;
      return round2((hits * pts) / right.length);
    }
  }
}

/** What the student sees as the correct answer after release, when the teacher allows it. */
export function correctAnswerText(q: Pick<StoredQuestion, 'type' | 'data' | 'answerKey'>): string | null {
  const key = q.answerKey ?? {};
  switch (q.type) {
    case 'single_choice':
      return strings(q.data.options)[key.correct as number] ?? null;
    case 'multi_select':
      return (Array.isArray(key.correct) ? (key.correct as number[]) : [])
        .map((i) => strings(q.data.options)[i])
        .join(', ');
    case 'true_false':
      return key.correct === true ? 'True' : key.correct === false ? 'False' : null;
    case 'fill_blank':
      return (Array.isArray(key.blanks) ? (key.blanks as string[][]) : []).map((b) => b.join(' or ')).join('; ');
    case 'matching': {
      const left = strings(q.data.left);
      const right = strings(q.data.right);
      return left.map((l, i) => `${l} → ${right[i]}`).join('; ');
    }
    case 'short_answer':
      return null;
  }
}
