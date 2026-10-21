import { describe, expect, it } from 'vitest';
import {
  emptyQuestion,
  parseBlanks,
  planQuestions,
  QUESTION_TYPES,
  stableShuffle,
  studentView,
  toDraft,
  toStored,
} from '@/lib/worksheetQuestions';

describe('question plan (W-3)', () => {
  it('makes empty questions only, in plan order, with the chosen marks', () => {
    const qs = planQuestions([
      { type: 'multi_select', count: 2, points: 2 },
      { type: 'short_answer', count: 1, points: 3 },
      { type: 'matching', count: 0, points: 3 },
    ])!;
    expect(qs.map((q) => [q.type, q.points, q.prompt])).toEqual([
      ['multi_select', 2, ''],
      ['multi_select', 2, ''],
      ['short_answer', 3, ''],
    ]);
    expect(qs.every((q) => (q.options ?? []).every((o) => o === ''))).toBe(true);
  });

  it('refuses nonsense and more than 100 questions', () => {
    expect(planQuestions([{ type: 'single_choice', count: 101, points: 1 }])).toBeNull();
    expect(
      planQuestions([
        { type: 'single_choice', count: 60, points: 1 },
        { type: 'true_false', count: 41, points: 1 },
      ]),
    ).toBeNull();
    expect(planQuestions([{ type: 'single_choice', count: 1.5, points: 1 }])).toBeNull();
    expect(planQuestions([{ type: 'single_choice', count: 1, points: -1 }])).toBeNull();
    expect(planQuestions([{ type: 'essay' as never, count: 1, points: 1 }])).toBeNull();
  });
});

describe('fill in the blanks', () => {
  it('splits answers out of the sentence; the stored prompt never shows them', () => {
    expect(parseBlanks('Plants take in [carbon dioxide| CO2 ] and give out [oxygen].')).toEqual({
      parts: ['Plants take in ', ' and give out ', '.'],
      blanks: [['carbon dioxide', 'CO2'], ['oxygen']],
    });
    const r = toStored({
      type: 'fill_blank',
      prompt: 'Plants take in [carbon dioxide|CO2] and give out [oxygen].',
      points: 2,
    })!;
    expect(r.problems).toEqual([]);
    expect(r.question.prompt).toBe('Plants take in ____ and give out ____.');
    expect(r.question.answerKey).toEqual({ blanks: [['carbon dioxide', 'CO2'], ['oxygen']], ignoreCase: true });
    expect(toDraft(r.question).prompt).toBe('Plants take in [carbon dioxide|CO2] and give out [oxygen].');
    // Part marks: on unless the teacher turns them off (owner, 21 Oct); multi-select stays off unless on.
    expect(r.question.partialCredit).toBe(true);
    expect(
      toStored({ type: 'fill_blank', prompt: 'A [b].', points: 1, partialCredit: false })!.question.partialCredit,
    ).toBe(false);
    expect(emptyQuestion('matching').partialCredit).toBe(true);
    expect(emptyQuestion('multi_select').partialCredit).toBe(false);
    // D3A-18: capital letters are always ignored, whatever is sent.
    const sent = toStored({ type: 'fill_blank', prompt: 'A [b].', points: 1, ignoreCase: false })!;
    expect(sent.question.answerKey).toEqual({ blanks: [['b']], ignoreCase: true });
  });

  it('needs at least one [answer] and no empty [ ]', () => {
    expect(toStored({ type: 'fill_blank', prompt: 'No blanks.', points: 1 })!.problems).toEqual(['blanks']);
    expect(toStored({ type: 'fill_blank', prompt: 'Empty [] blank.', points: 1 })!.problems).toEqual(['blanks']);
    expect(toStored({ type: 'fill_blank', prompt: 'Too many [a|b|c|d|e|f].', points: 1 })).toBeNull();
  });
});

describe('each type round-trips through storage', () => {
  it.each(QUESTION_TYPES)('%s: an empty question is a draft with problems; toDraft(toStored(x)) keeps it', (type) => {
    const empty = toStored(emptyQuestion(type, 2))!;
    expect(empty.problems.length).toBeGreaterThan(0);
    expect(empty.question.points).toBe(2);
    expect(toDraft(empty.question).type).toBe(type);
  });

  it('keeps choices, keys and part marks', () => {
    const single = toStored({
      type: 'single_choice',
      prompt: 'Q?',
      options: ['A', 'B', 'C'],
      correct: [2],
      points: 1,
    })!;
    expect(single).toMatchObject({
      problems: [],
      question: { data: { options: ['A', 'B', 'C'] }, answerKey: { correct: 2 } },
    });
    expect(toDraft(single.question)).toMatchObject({ correct: [2] });
    const multi = toStored({
      type: 'multi_select',
      prompt: 'Q?',
      options: ['A', 'B'],
      correct: [1, 0, 1],
      partialCredit: true,
      points: 2,
    })!;
    expect(multi.question).toMatchObject({ answerKey: { correct: [0, 1] }, partialCredit: true });
    const two = toStored({ type: 'single_choice', prompt: 'Q?', options: ['A', 'B'], correct: [0, 1], points: 1 })!;
    expect(two.problems).toContain('correct');
    const tf = toStored({ type: 'true_false', prompt: 'Q', truth: false, points: 1 })!;
    expect(tf.question.answerKey).toEqual({ correct: false });
    const m = toStored({
      type: 'matching',
      prompt: 'Match',
      pairs: [
        ['a', '1'],
        ['b', '2'],
      ],
      points: 2,
    })!;
    expect(m.question).toMatchObject({ data: { left: ['a', 'b'], right: ['1', '2'] }, answerKey: { aligned: true } });
    expect(toDraft(m.question).pairs).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    const sa = toStored({ type: 'short_answer', prompt: 'Why?', points: 2 })!;
    expect(sa.question.answerKey).toBeNull();
  });
});

describe('what a student sees', () => {
  it('has no key, and matching answers are shuffled the same way every time', () => {
    const m = toStored({
      type: 'matching',
      prompt: 'Match',
      pairs: [
        ['a', '1'],
        ['b', '2'],
        ['c', '3'],
        ['d', '4'],
      ],
      points: 4,
    })!;
    const one = studentView(m.question, 'seed-1');
    expect(one).not.toHaveProperty('answerKey');
    expect(JSON.stringify(one)).not.toContain('aligned');
    expect(studentView(m.question, 'seed-1').right).toEqual(one.right);
    expect([...one.right!].sort()).toEqual(['1', '2', '3', '4']);
    expect(stableShuffle([1, 2, 3], 'x')).toHaveLength(3);
    // Never the answer-key order, whatever the seed.
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      expect(stableShuffle(['1', '2'], seed)).toEqual(['2', '1']);
      expect(stableShuffle(['1', '2', '3'], seed)).not.toEqual(['1', '2', '3']);
    }
  });
});
