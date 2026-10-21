import { describe, expect, it } from 'vitest';
import { autoMark, cleanResponse, correctAnswerText, isAnswered } from '@/lib/homeworkMarking';
import { toStored } from '@/lib/worksheetQuestions';

/** D3A-18 as approved (21 Oct 2026): key matching only, no AI; part marks switched by the teacher. */
const q = (raw: Record<string, unknown>) => toStored(raw)!.question;

const single = q({ type: 'single_choice', prompt: 'Q', options: ['A', 'B', 'C'], correct: [1], points: 2 });
const multi = q({ type: 'multi_select', prompt: 'Q', options: ['A', 'B', 'C', 'D'], correct: [0, 1, 2], points: 3 });
const multiPart = { ...multi, partialCredit: true };
const blank = q({ type: 'fill_blank', prompt: 'Take in [carbon dioxide|CO2] and give out [oxygen].', points: 2 });
// Copies made before D3A-18 was approved could carry ignoreCase: false; capitals are ignored anyway.
const blankCase = { ...blank, answerKey: { ...blank.answerKey, ignoreCase: false } };
const tf = q({ type: 'true_false', prompt: 'Q', truth: false, points: 1 });
const match = q({
  type: 'matching',
  prompt: 'Q',
  pairs: [
    ['Leaf', 'Food'],
    ['Root', 'Water'],
    ['Stem', 'Support'],
  ],
  points: 3,
});
const short = q({ type: 'short_answer', prompt: 'Why?', points: 2 });

describe('automatic marks', () => {
  it('multiple choice and true/false: all or nothing', () => {
    expect(autoMark(single, { choice: 1 })).toBe(2);
    expect(autoMark(single, { choice: 0 })).toBe(0);
    expect(autoMark(tf, { value: false })).toBe(1);
    expect(autoMark(tf, { value: true })).toBe(0);
    expect(autoMark(tf, null)).toBe(0);
  });

  it('multiple select: all or nothing, or part marks with wrong ticks taken away', () => {
    expect(autoMark(multi, { choices: [0, 1, 2] })).toBe(3);
    expect(autoMark(multi, { choices: [0, 1] })).toBe(0);
    expect(autoMark(multiPart, { choices: [0, 1] })).toBe(2);
    expect(autoMark(multiPart, { choices: [0, 1, 3] })).toBe(1);
    expect(autoMark(multiPart, { choices: [3] })).toBe(0);
  });

  it('fill in the blanks (D3A-18): a share per blank, any accepted answer, capitals and extra spaces ignored', () => {
    expect(autoMark(blank, { blanks: ['  co2 ', 'Oxygen'] })).toBe(2);
    expect(autoMark(blank, { blanks: ['carbon  dioxide', 'nitrogen'] })).toBe(1);
    expect(autoMark(blankCase, { blanks: ['co2', 'oxygen'] })).toBe(2);
    expect(autoMark(blank, { blanks: ['CO 2', 'oxygen.'] })).toBe(0);
  });

  it('part marks off: fill in the blanks and matching are all or nothing (teacher’s switch)', () => {
    const blankAll = { ...blank, partialCredit: false };
    const matchAll = { ...match, partialCredit: false };
    expect(autoMark(blankAll, { blanks: ['co2', 'nitrogen'] })).toBe(0);
    expect(autoMark(blankAll, { blanks: ['CO2', 'Oxygen '] })).toBe(2);
    expect(autoMark(matchAll, { choices: ['Food', 'Support', 'Water'] })).toBe(0);
    expect(autoMark(matchAll, { choices: ['Food', 'Water', 'Support'] })).toBe(3);
  });

  it('matching: a share per correct pair; short answers are left to the teacher', () => {
    expect(autoMark(match, { choices: ['Food', 'Water', 'Support'] })).toBe(3);
    expect(autoMark(match, { choices: ['Water', 'Food', 'Support'] })).toBe(1);
    expect(autoMark(short, { text: 'Chlorophyll' })).toBeNull();
  });
});

describe('answers the player may send', () => {
  it('accepts only valid shapes', () => {
    expect(cleanResponse(single, { choice: 2 })).toEqual({ choice: 2 });
    expect(cleanResponse(single, { choice: 3 })).toBeNull();
    expect(cleanResponse(multi, { choices: [2, 0, 2] })).toEqual({ choices: [0, 2] });
    expect(cleanResponse(blank, { blanks: ['a'] })).toEqual({ blanks: ['a', ''] });
    expect(cleanResponse(blank, { blanks: ['a', 'b', 'c'] })).toBeNull();
    expect(cleanResponse(match, { choices: ['Food', 'Nope'] })).toBeNull();
    expect(cleanResponse(short, { text: 'x'.repeat(1001) })).toBeNull();
    expect(cleanResponse(tf, { value: 'yes' })).toBeNull();
  });

  it('knows what counts as answered', () => {
    expect(isAnswered('single_choice', { choice: null })).toBe(false);
    expect(isAnswered('fill_blank', { blanks: [' ', ''] })).toBe(false);
    expect(isAnswered('short_answer', { text: 'ok' })).toBe(true);
  });

  it('describes the correct answer for results after release', () => {
    expect(correctAnswerText(multi)).toBe('A, B, C');
    expect(correctAnswerText(blank)).toBe('carbon dioxide or CO2; oxygen');
    expect(correctAnswerText(match)).toBe('Leaf → Food; Root → Water; Stem → Support');
    expect(correctAnswerText(short)).toBeNull();
  });
});
