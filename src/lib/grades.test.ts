import { describe, expect, it } from 'vitest';
import { describeGrades } from './grades';

describe('describeGrades', () => {
  it('describes none, one, a run and a gap', () => {
    expect(describeGrades([])).toBe('No grades');
    expect(describeGrades([5])).toBe('Grade 5');
    expect(describeGrades([6, 4, 5, 5])).toBe('Grades 4–6');
    expect(describeGrades([8, 3, 5])).toBe('Grades 3, 5, 8');
  });
});
