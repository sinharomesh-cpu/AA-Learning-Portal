import { readFileSync } from 'node:fs';
import { ACCOUNTS, adminCounts } from './admin';
import { PERSONAS } from './personas';
import { getStudentDashboard } from './student';

describe('synthetic fixtures (OC-04)', () => {
  it('use only reserved example.com email addresses', () => {
    const emails = [...PERSONAS.map((p) => p.email).filter(Boolean), ...ACCOUNTS.map((a) => a.email)];
    for (const e of emails) expect(e).toMatch(/@example\.com$/);
  });

  it('respect session-length rules: human ≤ 40 min (OC-06), AI 15 or 30 min (OC-22)', () => {
    for (const id of ['demo-student-kiran', 'demo-student-meera']) {
      for (const s of getStudentDashboard(id)!.today) {
        if (s.kind === 'human') expect(s.durationMinutes).toBeLessThanOrEqual(40);
        else expect([15, 30]).toContain(s.durationMinutes);
      }
    }
  });

  it('return only the requested student’s data and nothing for other roles', () => {
    expect(getStudentDashboard('demo-student-kiran')!.firstName).toBe('Kiran');
    expect(getStudentDashboard('demo-parent')).toBeNull();
    expect(getStudentDashboard('demo-admin')).toBeNull();
    expect(getStudentDashboard('unknown')).toBeNull();
  });

  it('give Kiran the subjects on the approved boards (IT not enabled)', () => {
    expect(getStudentDashboard('demo-student-kiran')!.subjects.map((s) => s.id)).toEqual([
      'maths',
      'science',
      'sst',
      'english',
      'hindi',
    ]);
  });

  it('admin counts are computed from the account list', () => {
    expect(adminCounts()).toEqual({ activeParents: 1, activeTeachers: 2, teachersAwaitingApproval: 1 });
  });

  it('contain no meeting links, IDs or phone numbers', () => {
    const text = ['personas.ts', 'student.ts', 'admin.ts']
      .map((f) => readFileSync(`src/fixtures/${f}`, 'utf8'))
      .join('\n');
    expect(text).not.toMatch(/zoom\.us|meeting id|passcode|\+\d{2}[ -]?\d{4}/i);
  });
});
