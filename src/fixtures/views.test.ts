import { bookingDays } from './aiBooking';
import {
  childrenOf,
  familyResources,
  notificationSummary,
  parentLessons,
  parentOwnsChild,
  parentOwnsLesson,
} from './family';
import { allLessons, lessonsForParent, lessonsForStudent, lessonsForTeacher } from './schedule';
import { getStudentDashboard } from './student';
import { getTeacherDashboard, teacherLinkedTo } from './teacher';

// Wed 14 Oct 2026, 14:30 IST / 17:00 SGT.
const NOW = new Date('2026-10-14T09:00:00.000Z');

describe('one shared synthetic schedule (fixtures/schedule.ts)', () => {
  it('respects the session-length rules: human ≤ 40 min (OC-06), AI 15 min (OC-89)', () => {
    for (const l of allLessons(NOW)) {
      if (l.kind === 'human') expect(l.durationMinutes).toBeLessThanOrEqual(40);
      else expect([15]).toContain(l.durationMinutes);
    }
  });

  it('never gives one child two overlapping lessons (one at a time, OC-22)', () => {
    for (const id of ['demo-student-kiran', 'demo-student-meera']) {
      const ls = lessonsForStudent(id, NOW);
      for (let i = 1; i < ls.length; i += 1)
        expect(Date.parse(ls[i]!.startIso)).toBeGreaterThanOrEqual(Date.parse(ls[i - 1]!.endIso));
    }
  });

  it('shows the same lesson to child, parent and teacher, each in their own time zone (FR-019)', () => {
    const kidToday = getStudentDashboard('demo-student-kiran', NOW)!.today.find((s) => s.kind === 'human')!;
    const parentRow = parentLessons('demo-parent', NOW).find((l) => l.id === 'l-k1')!;
    const teacherRow = getTeacherDashboard('demo-teacher-rao', NOW)!.lessons.find((l) => l.id === 'l-k1')!;
    expect(parentRow.startIso).toBe(kidToday.startIso);
    expect(teacherRow.startIso).toBe(kidToday.startIso);
    expect(parentRow.timeLabel).toBe('4:30 pm');
    expect(teacherRow.timeLabel).toBe('7:00 pm');
    expect(parentRow.dayLabel).toBe('Today');
  });

  it('blocks AI booking times only for booked lessons; a teacher’s proposal holds no time (OC-45)', () => {
    const kiranToday = bookingDays('demo-student-kiran', NOW)[0]!.slots.find((s) => s.label === '4:30 pm')!;
    expect(kiranToday.status[15]).toBe('lesson'); // confirmed teacher lesson
    const meeraDays = bookingDays('demo-student-meera', NOW);
    const friday = meeraDays[2]!.slots.find((s) => s.label === '4:30 pm')!;
    // Meera's teacher-proposed lesson on Friday is not booked until her parent accepts it.
    expect(friday.status[15]).not.toBe('lesson');
  });
});

describe('parent views are limited to the parent’s own children (FR-002.2)', () => {
  it('lists both linked children and their lessons only', () => {
    const kids = childrenOf('demo-parent', NOW);
    expect(kids.map((k) => k.name)).toEqual(['Kiran', 'Meera']);
    expect(kids[0]!.subjects).not.toContain('IT'); // IT not enabled for Kiran
    expect(lessonsForParent('demo-parent', NOW)).toHaveLength(allLessons(NOW).length);
  });

  it('returns nothing for other roles or unknown ids', () => {
    for (const id of ['demo-student-kiran', 'demo-teacher-rao', 'demo-admin', 'nobody']) {
      expect(childrenOf(id, NOW)).toEqual([]);
      expect(parentLessons(id, NOW)).toEqual([]);
      expect(familyResources(id)).toEqual([]);
      expect(notificationSummary(id)).toBeNull();
    }
  });

  it('checks ownership before any child or booking page', () => {
    expect(parentOwnsChild('demo-parent', 'demo-student-kiran')).toBe(true);
    expect(parentOwnsChild('demo-parent', 'demo-teacher-rao')).toBe(false);
    expect(parentOwnsChild('demo-teacher-rao', 'demo-student-kiran')).toBe(false);
    expect(parentOwnsLesson('demo-parent', 'l-m2', NOW)).toBe(true);
    expect(parentOwnsLesson('demo-parent', 'l-zz', NOW)).toBe(false);
    expect(parentOwnsLesson('demo-teacher-rao', 'l-m2', NOW)).toBe(false);
  });

  it('keeps parent uploads and teacher resources distinct (FRD §7)', () => {
    const sources = familyResources('demo-parent').map((r) => `${r.source}:${r.sourceLabel}`);
    expect(sources).toContain('parent:From you');
    expect(sources).toContain('teacher:From Teacher B. Iyer');
  });
});

describe('teacher view is limited to own lessons and linked students', () => {
  it('shows only human lessons taught by this teacher, with parent confirmation still pending', () => {
    const d = getTeacherDashboard('demo-teacher-rao', NOW)!;
    expect(d.lessons.map((l) => [l.id, l.status])).toEqual([
      ['l-k1', 'confirmed'],
      ['l-m2', 'proposed'],
    ]);
    expect(lessonsForTeacher('demo-teacher-rao', NOW).every((l) => l.kind === 'human')).toBe(true);
  });

  it('counts availability slots consistently with the lessons', () => {
    const a = getTeacherDashboard('demo-teacher-rao', NOW)!.availability;
    expect(a.map((d) => [d.dayLabel, d.booked, d.waiting, d.open])).toEqual([
      ['Today', 1, 0, 2],
      ['Fri', 0, 1, 2],
      ['Mon', 0, 0, 3],
    ]);
    expect(a[0]!.from).toBe('7:00 pm');
  });

  it('gives nothing to other roles and only links real students', () => {
    expect(getTeacherDashboard('demo-parent', NOW)).toBeNull();
    expect(lessonsForTeacher('demo-parent', NOW)).toEqual([]);
    expect(teacherLinkedTo('demo-teacher-rao', 'demo-student-kiran')).toBe(true);
    expect(teacherLinkedTo('demo-teacher-rao', 'demo-parent')).toBe(false);
  });
});
