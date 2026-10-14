import { bookingDays, chaptersFor, checkDemoBooking, nextOpenTimes, SLOT_STEP_MINUTES } from './aiBooking';
import { getStudentHistory } from './history';

// 14 Oct 2026, 14:30 in Asia/Kolkata (UTC+05:30). Kiran's synthetic lessons today:
// Teacher 16:30–17:10 and AI Tutor 17:15–17:45 (IST). Family quiet time 20:00–07:00.
const NOW = new Date('2026-10-14T09:00:00.000Z');
const KIRAN = 'demo-student-kiran';
const ist = (hhmm: string, day = 14) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, day, h - 5, m - 30)).toISOString();
};
const today = () => bookingDays(KIRAN, NOW)[0]!;
const slotAt = (iso: string) =>
  bookingDays(KIRAN, NOW)
    .flatMap((d) => d.slots)
    .find((s) => s.startIso === iso);

describe('demo AI booking times (OC-05, OC-22) — WP-8, nothing is stored', () => {
  it('offers five days in the student’s own time zone, starting today', () => {
    const days = bookingDays(KIRAN, NOW);
    expect(days[0]!.label).toBe('Today');
    expect(days).toHaveLength(5);
    expect(days[1]!.label).toMatch(/Thu.*15.*Oct/);
  });

  it('puts every start on a 15-minute boundary and never in the past', () => {
    for (const s of bookingDays(KIRAN, NOW).flatMap((d) => d.slots)) {
      expect(new Date(s.startIso).getUTCMinutes() % SLOT_STEP_MINUTES).toBe(0);
      expect(Date.parse(s.startIso)).toBeGreaterThan(NOW.getTime());
    }
    expect(slotAt(ist('14:30'))).toBeUndefined();
    expect(today().slots[0]!.startIso).toBe(ist('14:45'));
  });

  it('lists 07:00 to 20:45 on later days', () => {
    const tomorrow = bookingDays(KIRAN, NOW)[1]!.slots;
    expect(tomorrow).toHaveLength(56);
    expect(tomorrow[0]!.label).toBe('7:00 am');
    expect(tomorrow.at(-1)!.label).toBe('8:45 pm');
  });

  it('never offers a time that overlaps another lesson: one lesson at a time (OC-22)', () => {
    expect(slotAt(ist('16:15'))!.status).toEqual({ 15: 'open', 30: 'lesson' });
    expect(slotAt(ist('16:30'))!.status).toEqual({ 15: 'lesson', 30: 'lesson' });
    expect(slotAt(ist('17:00'))!.status[15]).toBe('lesson'); // teacher lesson runs to 17:10
    expect(slotAt(ist('17:30'))!.status[15]).toBe('lesson'); // AI lesson runs to 17:45
    expect(slotAt(ist('17:45'))!.status).toEqual({ 15: 'open', 30: 'open' });
  });

  it('respects the family quiet time as a blocked period (OC-05)', () => {
    expect(slotAt(ist('19:45'))!.status).toEqual({ 15: 'open', 30: 'quiet' });
    expect(slotAt(ist('20:00'))!.status).toEqual({ 15: 'quiet', 30: 'quiet' });
  });

  it('only offers chapters from shared books', () => {
    expect(chaptersFor(KIRAN, 'maths')).toHaveLength(2);
    expect(chaptersFor(KIRAN, 'hindi')).toEqual([]);
    expect(chaptersFor('demo-student-meera', 'maths')).toEqual([]);
  });

  it('suggests the next open times after a taken one', () => {
    expect(nextOpenTimes(KIRAN, ist('16:00'), 30, NOW).map((s) => s.label)).toEqual(['5:45 pm', '6:00 pm', '6:15 pm']);
  });
});

describe('server re-check of a wizard choice (FR-006.2 pattern, demo)', () => {
  const ok = { subject: 'maths', start: ist('18:00'), length: '30' };

  it('accepts an open time for the signed-in student', () => {
    const r = checkDemoBooking(KIRAN, { ...ok, chapter: 'Chapter 6 — Maths practice book (sample)' }, NOW);
    expect(r.ok && r.booking).toMatchObject({
      subjectName: 'Maths',
      length: 30,
      dayLabel: 'Today',
      timeLabel: '6:00 pm',
    });
  });

  it.each([
    ['a length other than 15 or 30', { ...ok, length: '45' }],
    ['a subject the parent has not enabled', { ...ok, subject: 'it' }],
    ['an unknown subject', { ...ok, subject: 'spanish' }],
    ['a chapter that was not shared', { ...ok, chapter: 'Chapter 99 (invented)' }],
    ['a start off the 15-minute grid', { ...ok, start: ist('18:05') }],
    ['a start overlapping another lesson', { ...ok, start: ist('16:15') }],
    ['a start in the quiet time', { ...ok, start: ist('21:00') }],
    ['a start in the past', { ...ok, start: ist('10:00') }],
    ['a start beyond the booking window', { ...ok, start: ist('18:00', 25) }],
    ['a malformed start', { ...ok, start: 'tomorrow' }],
    ['missing fields', {}],
  ])('rejects %s as "not an open time"', (_label, req) => {
    expect(checkDemoBooking(KIRAN, req, NOW)).toMatchObject({ ok: false, reason: 'not-open' });
  });

  it('never books for a non-student, even with a valid request', () => {
    for (const id of ['demo-parent', 'demo-teacher-rao', 'demo-admin', 'nobody']) {
      expect(checkDemoBooking(id, ok, NOW).ok).toBe(false);
    }
  });
});

describe('demo learning history (M-16, FR-016)', () => {
  it('returns only the signed-in student’s sessions, newest first', () => {
    const kiran = getStudentHistory(KIRAN, NOW)!;
    expect(kiran.map((h) => h.id)).toEqual(['h-k1', 'h-k2', 'h-k3']);
    expect(kiran[0]!.whenLabel).toBe('Yesterday');
    expect(getStudentHistory('demo-student-meera', NOW)!.map((h) => h.id)).toEqual(['h-m1']);
    expect(getStudentHistory('demo-parent', NOW)).toBeNull();
  });

  it('keeps session outcome separate from booking: a lesson may end early (FR-016.1)', () => {
    const english = getStudentHistory(KIRAN, NOW)!.find((h) => h.id === 'h-k3')!;
    expect(english.minutes).toBe(12);
    for (const h of getStudentHistory(KIRAN, NOW)!) {
      expect(h.minutes).toBeLessThanOrEqual(h.kind === 'human' ? 40 : 30);
    }
  });
});
