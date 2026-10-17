import { AiSessionController, canOpenSession, MAX_DEFERRED_QUESTIONS, phaseAt, sessionTimes } from './controller';
import { reviewTutorTurn } from './policy';
import { MAX_HINTS_PER_SESSION, PHASE_PLAN } from './types';
import type { AiBooking, Clock, LessonContext, SessionLength, SessionViewer, TutorProvider } from './types';

/**
 * Unit tests for the provider-independent AI lesson controller.
 * Fake clock and fake provider only: no network, no API keys, no paid usage. Synthetic ids only.
 */

const MIN = 60_000;
const START = Date.parse('2026-10-20T10:00:00.000Z');

class FakeClock implements Clock {
  constructor(public t: number) {}
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

type Call =
  | { kind: 'open'; context: LessonContext; resumeHandle?: string }
  | { kind: 'setPhase'; phase: string }
  | { kind: 'question'; text: string }
  | { kind: 'hint' }
  | { kind: 'interrupt' }
  | { kind: 'close'; reason: string };

class FakeProvider implements TutorProvider {
  calls: Call[] = [];
  failNextOpen = false;
  private n = 0;
  constructor(
    private readonly clock?: FakeClock,
    private readonly openDelayMs = 0,
  ) {}
  async open(context: LessonContext, resumeHandle?: string) {
    this.calls.push({ kind: 'open', context, resumeHandle });
    if (this.clock && this.openDelayMs) this.clock.advance(this.openDelayMs);
    if (this.failNextOpen) {
      this.failNextOpen = false;
      throw new Error('provider unavailable');
    }
    this.n += 1;
    return { resumeHandle: `resume-${this.n}` };
  }
  async setPhase(phase: 'explanation' | 'qa') {
    this.calls.push({ kind: 'setPhase', phase });
  }
  async sendStudentQuestion(text: string) {
    this.calls.push({ kind: 'question', text });
  }
  async sendHintRequest() {
    this.calls.push({ kind: 'hint' });
  }
  async interruptOutput() {
    this.calls.push({ kind: 'interrupt' });
  }
  async close(reason: string) {
    this.calls.push({ kind: 'close', reason });
  }
  of<K extends Call['kind']>(kind: K) {
    return this.calls.filter((c): c is Extract<Call, { kind: K }> => c.kind === kind);
  }
}

function booking(length: SessionLength, overrides: Partial<AiBooking> = {}): AiBooking {
  return {
    bookingId: 'booking-sample-1',
    studentId: 'student-sample-a',
    subject: 'maths',
    chapterId: 'chapter-sample-g5-maths-1',
    lengthMinutes: length,
    startIso: new Date(START).toISOString(),
    status: 'booked',
    ...overrides,
  };
}

const STUDENT: SessionViewer = { id: 'student-sample-a', role: 'student' };
const OTHER_STUDENT: SessionViewer = { id: 'student-sample-b', role: 'student' };
const PARENT: SessionViewer = { id: 'parent-sample-a', role: 'parent', childIds: ['student-sample-a'] };
const OTHER_PARENT: SessionViewer = { id: 'parent-sample-b', role: 'parent', childIds: ['student-sample-b'] };
const TEACHER: SessionViewer = { id: 'teacher-sample-a', role: 'teacher' };
const ADMIN: SessionViewer = { id: 'admin-sample-a', role: 'superadmin' };

function setup(length: SessionLength, at = START, overrides: Partial<AiBooking> = {}, summaries = false) {
  const clock = new FakeClock(at);
  const provider = new FakeProvider(clock);
  const controller = new AiSessionController(booking(length, overrides), provider, clock, {
    summariesEnabled: summaries,
  });
  return { clock, provider, controller };
}

describe('phase plan', () => {
  it('the only lesson is 15 minutes: explanation ends at +10 min, lesson ends at +15 min (OC-89)', () => {
    const t = sessionTimes(booking(15));
    expect(t.explanationEndMs - START).toBe(10 * MIN);
    expect(t.endMs - START).toBe(15 * MIN);
    expect(Object.keys(PHASE_PLAN)).toEqual(['15']);
  });

  it('derives the phase from the clock only', () => {
    const t = sessionTimes(booking(15));
    expect(phaseAt(t, START - 1)).toBe('not_started');
    expect(phaseAt(t, START)).toBe('explanation');
    expect(phaseAt(t, START + 10 * MIN - 1)).toBe('explanation');
    expect(phaseAt(t, START + 10 * MIN)).toBe('qa');
    expect(phaseAt(t, START + 15 * MIN - 1)).toBe('qa');
    expect(phaseAt(t, START + 15 * MIN)).toBe('ended');
  });

  it('rejects a booking with an unreadable start time', () => {
    expect(() => sessionTimes(booking(15, { startIso: 'not-a-date' }))).toThrow();
  });
});

describe('phase transitions', () => {
  it('a 15-minute lesson runs explanation → Q&A → ended', async () => {
    const len = 15;
    const { clock, provider, controller } = setup(len);
    const opened = await controller.open(STUDENT);
    expect(opened).toMatchObject({ ok: true, phase: 'explanation' });
    expect(provider.of('open')[0]?.context).toMatchObject({
      phase: 'explanation',
      chapterId: 'chapter-sample-g5-maths-1',
      endsAtMs: START + len * MIN,
    });

    const plan = { expl: 10, qa: 5 };
    clock.advance(plan.expl * MIN - 1);
    expect(await controller.tick()).toBe('explanation');
    clock.advance(1);
    expect(await controller.tick()).toBe('qa');
    expect(provider.of('setPhase')).toEqual([{ kind: 'setPhase', phase: 'qa' }]);

    clock.advance(plan.qa * MIN);
    expect(await controller.tick()).toBe('ended');
    expect(provider.of('close')).toEqual([{ kind: 'close', reason: 'booked_end' }]);
    expect(controller.snapshot()).toMatchObject({ phase: 'ended', connected: false, endReason: 'booked_end' });
  });

  it('switches to Q&A only once, however often tick() runs', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(11 * MIN);
    await controller.tick();
    await controller.tick();
    await controller.tick();
    expect(provider.of('setPhase')).toHaveLength(1);
  });

  it('reports the time to the next boundary for the host timer', async () => {
    const { clock, controller } = setup(15, START - 2 * MIN);
    expect(controller.msUntilNextBoundary()).toBe(2 * MIN);
    clock.advance(2 * MIN);
    await controller.open(STUDENT);
    expect(controller.msUntilNextBoundary()).toBe(10 * MIN);
    clock.advance(12 * MIN);
    await controller.tick();
    expect(controller.msUntilNextBoundary()).toBe(3 * MIN);
    clock.advance(3 * MIN);
    await controller.tick();
    expect(controller.msUntilNextBoundary()).toBeNull();
  });

  it('a late join keeps the booked boundaries (shorter explanation, same end)', async () => {
    const { provider, controller } = setup(15, START + 4 * MIN);
    const opened = await controller.open(STUDENT);
    expect(opened).toEqual({ ok: true, phase: 'explanation', remainingMs: 11 * MIN, phaseRemainingMs: 6 * MIN });
    expect(provider.of('open')[0]?.context.endsAtMs).toBe(START + 15 * MIN);
  });

  it('joining during the Q&A window opens straight into Q&A', async () => {
    const { controller } = setup(15, START + 12 * MIN);
    expect(await controller.open(STUDENT)).toMatchObject({ ok: true, phase: 'qa', remainingMs: 3 * MIN });
  });
});

describe('student questions during the explanation are deferred', () => {
  it('holds questions back and does not send them to the tutor', async () => {
    const { provider, controller } = setup(15);
    await controller.open(STUDENT);
    expect(await controller.studentQuestion('Why do we carry the one?')).toEqual({ status: 'deferred', position: 1 });
    expect(await controller.studentQuestion('  What is a factor?  ')).toEqual({ status: 'deferred', position: 2 });
    expect(provider.of('question')).toHaveLength(0);
    expect(controller.snapshot().deferredQuestions).toBe(2);
  });

  it('passes deferred questions on, in order, when Q&A starts', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    await controller.studentQuestion('First question');
    await controller.studentQuestion('Second question');
    clock.advance(10 * MIN);
    await controller.tick();
    expect(provider.calls.slice(-3)).toEqual([
      { kind: 'setPhase', phase: 'qa' },
      { kind: 'question', text: 'First question' },
      { kind: 'question', text: 'Second question' },
    ]);
    expect(controller.snapshot().deferredQuestions).toBe(0);
  });

  it('limits the queue and validates question text', async () => {
    const { controller } = setup(15);
    await controller.open(STUDENT);
    for (let i = 0; i < MAX_DEFERRED_QUESTIONS; i += 1) await controller.studentQuestion(`Question ${i}`);
    expect(await controller.studentQuestion('One too many')).toEqual({ status: 'rejected', reason: 'queue_full' });
    expect(await controller.studentQuestion('   ')).toEqual({ status: 'rejected', reason: 'invalid' });
    expect(await controller.studentQuestion('x'.repeat(501))).toEqual({ status: 'rejected', reason: 'invalid' });
  });

  it('rejects questions before the start and after the end', async () => {
    const early = setup(15, START - MIN);
    expect(await early.controller.studentQuestion('Hello?')).toEqual({ status: 'rejected', reason: 'not_started' });
    const { clock, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(15 * MIN);
    expect(await controller.studentQuestion('Too late?')).toEqual({ status: 'rejected', reason: 'ended' });
  });
});

describe('Q&A behaviour', () => {
  it('sends a question straight to the tutor during Q&A', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(12 * MIN);
    expect(await controller.studentQuestion('Can you explain step two again?')).toEqual({ status: 'sent' });
    expect(provider.of('question')).toEqual([{ kind: 'question', text: 'Can you explain step two again?' }]);
  });

  it('blocks an AI-initiated question in Q&A and interrupts the tutor', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(11 * MIN);
    expect(await controller.reviewTutorTurn('Now, what is seven times eight?')).toEqual({
      allowed: false,
      reason: 'ai_question',
    });
    expect(provider.of('interrupt')).toHaveLength(1);
    expect(controller.snapshot().blockedTurns).toBe(1);
  });

  it('allows a plain answer in Q&A', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(11 * MIN);
    expect(await controller.reviewTutorTurn('We carry the one because ten ones make one ten.')).toEqual({
      allowed: true,
    });
    expect(provider.of('interrupt')).toHaveLength(0);
  });

  it('blocks quizzes in both phases', async () => {
    const { clock, controller } = setup(15);
    await controller.open(STUDENT);
    expect(await controller.reviewTutorTurn("Let's do a quick quiz.")).toEqual({ allowed: false, reason: 'quiz' });
    clock.advance(11 * MIN);
    expect(await controller.reviewTutorTurn('True or false: 9 is a prime number.')).toEqual({
      allowed: false,
      reason: 'quiz',
    });
  });

  it('allows explanatory wording during the explanation, including a rhetorical question', async () => {
    const { controller } = setup(15);
    await controller.open(STUDENT);
    expect(await controller.reviewTutorTurn('So why does this work? Because each place is ten times bigger.')).toEqual({
      allowed: true,
    });
  });

  it.each([
    'Can you solve 12 divided by 3?',
    'Your turn: work out the next one.',
    'Try this problem for me.',
    'Question 3: what comes next.',
    'Is it option B or option C?',
  ])('policy flags quiz-style wording: %s', (text) => {
    expect(reviewTutorTurn(text, 'explanation').allowed).toBe(false);
  });
});

describe('session cutoff at the booked end', () => {
  it('ends exactly at the booked end even if the host timer is late', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(40 * MIN); // the host never called tick() in between
    expect(await controller.studentQuestion('Are you still there?')).toEqual({ status: 'rejected', reason: 'ended' });
    expect(provider.of('close')).toEqual([{ kind: 'close', reason: 'booked_end' }]);
    expect(await controller.reviewTutorTurn('One more thing.')).toEqual({ allowed: false, reason: 'session_closed' });
  });

  it('cannot be opened after the end', async () => {
    const { controller, provider } = setup(15, START + 15 * MIN);
    expect(await controller.open(STUDENT)).toEqual({ ok: false, reason: 'ended', retryable: false });
    expect(provider.of('open')).toHaveLength(0);
  });

  it('cannot be opened before the booked start', async () => {
    const { controller } = setup(15, START - 30_000);
    expect(await controller.open(STUDENT)).toEqual({ ok: false, reason: 'not_started', retryable: true });
  });

  it('a slow provider connection that finishes after the end is closed at once', async () => {
    const clock = new FakeClock(START + 15 * MIN - 1_000);
    const provider = new FakeProvider(clock, 5_000);
    const controller = new AiSessionController(booking(15), provider, clock);
    expect(await controller.open(STUDENT)).toEqual({ ok: false, reason: 'ended', retryable: false });
    expect(provider.of('close')).toEqual([{ kind: 'close', reason: 'booked_end' }]);
  });

  it('a cancelled booking cannot be opened, and cancelling mid-lesson closes it', async () => {
    const cancelled = setup(15, START, { status: 'cancelled' });
    expect(await cancelled.controller.open(STUDENT)).toEqual({ ok: false, reason: 'cancelled', retryable: false });
    const { provider, controller } = setup(15);
    await controller.open(STUDENT);
    await controller.cancel();
    expect(provider.of('close')).toEqual([{ kind: 'close', reason: 'booking_cancelled' }]);
    expect(controller.snapshot().endReason).toBe('booking_cancelled');
  });

  it('End Class by the student ends the lesson; a summary is offered only when enabled', async () => {
    const off = setup(15);
    await off.controller.open(STUDENT);
    expect(await off.controller.endByUser(STUDENT)).toBe(true);
    expect(off.controller.snapshot()).toMatchObject({
      phase: 'ended',
      endReason: 'ended_by_user',
      summaryAllowed: false,
    });

    const on = setup(15, START, {}, true);
    await on.controller.open(STUDENT);
    expect(on.controller.snapshot().summaryAllowed).toBe(false); // not before the end
    await on.controller.endByUser(STUDENT);
    expect(on.controller.snapshot().summaryAllowed).toBe(true);
  });
});

describe('access control', () => {
  it.each([
    ['the booked student', STUDENT, true],
    ['a linked parent', PARENT, true],
    ['another student', OTHER_STUDENT, false],
    ['an unlinked parent', OTHER_PARENT, false],
    ['a parent with no children', { id: 'parent-sample-c', role: 'parent' } as SessionViewer, false],
    ['a teacher', TEACHER, false],
    ['the Super Admin', ADMIN, false],
  ])('%s → allowed: %s', async (_label, viewer, allowed) => {
    expect(canOpenSession(viewer, booking(15))).toBe(allowed);
    const { controller, provider } = setup(15);
    const result = await controller.open(viewer);
    expect(result.ok).toBe(allowed);
    if (!allowed) {
      expect(result).toEqual({ ok: false, reason: 'forbidden', retryable: false });
      expect(provider.of('open')).toHaveLength(0);
    }
  });

  it('an unauthorised user cannot end someone else’s lesson', async () => {
    const { controller } = setup(15);
    await controller.open(STUDENT);
    expect(await controller.endByUser(OTHER_PARENT)).toBe(false);
    expect(controller.snapshot().phase).toBe('explanation');
  });

  it('the provider is told the chapter id from the booking, never anything from the viewer', async () => {
    const { controller, provider } = setup(15);
    await controller.open(PARENT);
    const ctx = provider.of('open')[0]?.context;
    expect(ctx).toEqual({
      bookingId: 'booking-sample-1',
      subject: 'maths',
      chapterId: 'chapter-sample-g5-maths-1',
      phase: 'explanation',
      endsAtMs: START + 15 * MIN,
    });
  });
});

describe('failure recovery', () => {
  it('a reconnect inside the window resumes the correct phase with the remaining time', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    controller.connectionLost();
    clock.advance(12 * MIN); // the drop lasted into the Q&A window
    const result = await controller.open(STUDENT);
    expect(result).toEqual({ ok: true, phase: 'qa', remainingMs: 3 * MIN, phaseRemainingMs: 3 * MIN });
    const opens = provider.of('open');
    expect(opens[1]?.resumeHandle).toBe('resume-1');
    expect(opens[1]?.context).toMatchObject({ phase: 'qa', endsAtMs: START + 15 * MIN });
  });

  it('never extends the lesson: time lost to a drop is not given back', async () => {
    const { clock, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(3 * MIN);
    controller.connectionLost();
    clock.advance(5 * MIN);
    const result = await controller.open(STUDENT);
    expect(result).toMatchObject({ ok: true, phase: 'explanation', remainingMs: 7 * MIN });
    clock.advance(7 * MIN);
    expect(await controller.tick()).toBe('ended');
  });

  it('questions deferred before a drop are delivered once Q&A is live again', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    await controller.studentQuestion('Held question');
    controller.connectionLost();
    clock.advance(11 * MIN);
    await controller.tick(); // Q&A starts while disconnected: nothing can be sent yet
    expect(provider.of('question')).toHaveLength(0);
    await controller.open(STUDENT);
    expect(provider.of('question')).toEqual([{ kind: 'question', text: 'Held question' }]);
  });

  it('a provider error is reported as retryable before the end, and a retry succeeds', async () => {
    const { clock, provider, controller } = setup(15);
    provider.failNextOpen = true;
    expect(await controller.open(STUDENT)).toEqual({ ok: false, reason: 'provider_unavailable', retryable: true });
    clock.advance(MIN);
    expect(await controller.open(STUDENT)).toMatchObject({ ok: true, phase: 'explanation', remainingMs: 14 * MIN });
  });

  it('a reconnect after the end is refused', async () => {
    const { clock, controller } = setup(15);
    await controller.open(STUDENT);
    controller.connectionLost();
    clock.advance(16 * MIN);
    expect(await controller.open(STUDENT)).toEqual({ ok: false, reason: 'ended', retryable: false });
  });

  it('a second open takes over the single live connection without changing the end time', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(2 * MIN);
    const second = await controller.open(STUDENT);
    expect(provider.of('close')).toEqual([{ kind: 'close', reason: 'superseded' }]);
    expect(second).toMatchObject({ ok: true, remainingMs: 13 * MIN });
    expect(controller.snapshot().connected).toBe(true);
  });

  it('survives a provider connection limit of about 10 minutes inside the 15-minute lesson', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(10 * MIN);
    controller.connectionLost(); // provider GoAway at its connection limit
    expect((await controller.open(STUDENT)).ok).toBe(true);
    expect(provider.of('open').map((o) => o.resumeHandle)).toEqual([undefined, 'resume-1']);
    clock.advance(5 * MIN);
    expect(await controller.tick()).toBe('ended');
  });
});

describe('Give Me a Hint, with no Next Question (OC-89(2))', () => {
  it('has no way to ask the tutor for a new question or a quiz', () => {
    const methods = Object.getOwnPropertyNames(AiSessionController.prototype);
    expect(methods.some((m) => /(next|new)question|quiz|assess/i.test(m))).toBe(false);
    expect(methods).toContain('requestHint');
  });

  it('a hint is only available during Q&A and only when the student asks', async () => {
    const { clock, provider, controller } = setup(15);
    await controller.open(STUDENT);
    expect(await controller.requestHint()).toEqual({ status: 'rejected', reason: 'explanation' });
    clock.advance(10 * MIN);
    expect(await controller.requestHint()).toEqual({ status: 'sent', hintsLeft: MAX_HINTS_PER_SESSION - 1 });
    expect(provider.of('hint')).toHaveLength(1);
    clock.advance(5 * MIN);
    expect(await controller.requestHint()).toEqual({ status: 'rejected', reason: 'ended' });
  });

  it('a hint may carry one guiding question, but never a quiz; the next turn is checked normally', async () => {
    const { clock, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(10 * MIN);
    await controller.requestHint();
    expect(await controller.reviewTutorTurn('Hint: what happens if you double both numbers?')).toEqual({
      allowed: true,
    });
    expect(await controller.reviewTutorTurn('And what is 6 times 7?')).toEqual({
      allowed: false,
      reason: 'ai_question',
    });
    await controller.requestHint();
    expect(await controller.reviewTutorTurn("Let's do a quick quiz instead.")).toEqual({
      allowed: false,
      reason: 'quiz',
    });
  });

  it('limits hints per lesson', async () => {
    const { clock, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(10 * MIN);
    for (let i = 0; i < MAX_HINTS_PER_SESSION; i += 1) expect((await controller.requestHint()).status).toBe('sent');
    expect(await controller.requestHint()).toEqual({ status: 'rejected', reason: 'limit' });
  });

  it('cannot send a hint while disconnected', async () => {
    const { clock, controller } = setup(15);
    await controller.open(STUDENT);
    clock.advance(11 * MIN);
    controller.connectionLost();
    expect(await controller.requestHint()).toEqual({ status: 'rejected', reason: 'not_connected' });
  });
});
