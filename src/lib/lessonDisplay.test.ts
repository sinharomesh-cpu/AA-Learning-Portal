import { describe, expect, it } from 'vitest';
import { lessonStatusText } from './lessonDisplay';

/** CR-17 PR 2, U3 (owner decision B3): who cancelled a lesson, in words, for each viewer. */
describe('lessonStatusText: cancellation attribution', () => {
  const cancelled = (closedBy: 'parent' | 'teacher' | 'aa_pro', extra: object = {}) =>
    ({ status: 'cancelled', closedBy, closeReason: null, ...extra }) as Parameters<typeof lessonStatusText>[0];

  it('the parent who cancelled sees "you"; the other parent sees a first name', () => {
    expect(lessonStatusText(cancelled('parent', { closedByYou: true, closedByName: 'Anita' }), 'parent').text).toBe(
      'Cancelled by you',
    );
    expect(lessonStatusText(cancelled('parent', { closedByName: 'Anita' }), 'parent').text).toBe('Cancelled by Anita');
    expect(lessonStatusText(cancelled('parent'), 'parent').text).toBe('Cancelled by a parent');
  });

  it('the teacher sees "the parent", never a name', () => {
    expect(lessonStatusText(cancelled('parent', { closedByName: 'Anita' }), 'teacher').text).toBe(
      'Cancelled by the parent',
    );
  });

  it('teacher and AA Pro cancellations are unchanged', () => {
    expect(lessonStatusText(cancelled('teacher'), 'parent').text).toBe('Cancelled by the teacher');
    expect(lessonStatusText(cancelled('teacher'), 'teacher').text).toBe('Cancelled by you');
    expect(lessonStatusText(cancelled('aa_pro'), 'parent')).toEqual({ text: 'Cancelled by AA Pro', kind: 'error' });
  });
});
