import 'server-only';
import { reviewTutorTurn } from './policy';
import {
  type AiBooking,
  type Clock,
  type EndReason,
  type OpenResult,
  PHASE_PLAN,
  type Phase,
  type QuestionResult,
  type SessionPrivacy,
  type SessionSnapshot,
  type SessionViewer,
  type TurnReview,
  type TutorProvider,
} from './types';

const MINUTE = 60_000;
/** Longest student question accepted (characters). */
export const MAX_QUESTION_LENGTH = 500;
/** Most questions held back during the explanation. */
export const MAX_DEFERRED_QUESTIONS = 10;

/** Who may open an AI lesson: the booked student, or a parent with an active link to that child. */
export function canOpenSession(viewer: SessionViewer, booking: AiBooking): boolean {
  if (viewer.role === 'student') return viewer.id === booking.studentId;
  if (viewer.role === 'parent') return (viewer.childIds ?? []).includes(booking.studentId);
  // Teachers, Admins and the Super Admin never open a child's AI lesson (OC-21).
  return false;
}

export interface SessionTimes {
  startMs: number;
  explanationEndMs: number;
  endMs: number;
}

/**
 * Phase boundaries are fixed to the BOOKED start, not to when the student joins, so a late join
 * gets a shorter lesson and the booked end time never moves. (Owner decision Q-3 may change how
 * a late join splits the remaining time; the end time stays fixed either way.)
 */
export function sessionTimes(booking: AiBooking): SessionTimes {
  const startMs = Date.parse(booking.startIso);
  if (Number.isNaN(startMs)) throw new Error('Invalid booking start');
  const plan = PHASE_PLAN[booking.lengthMinutes];
  const explanationEndMs = startMs + plan.explanationMinutes * MINUTE;
  return { startMs, explanationEndMs, endMs: explanationEndMs + plan.qaMinutes * MINUTE };
}

/** Phase from the clock alone. The clock, not the provider, decides. */
export function phaseAt(times: SessionTimes, nowMs: number): Exclude<Phase, 'ended'> | 'ended' {
  if (nowMs < times.startMs) return 'not_started';
  if (nowMs < times.explanationEndMs) return 'explanation';
  if (nowMs < times.endMs) return 'qa';
  return 'ended';
}

/**
 * Server-side controller for one booked AI lesson. Provider-independent and holds no API keys.
 * The host (a server relay) calls `tick()` on a timer and before every event; every public
 * method also calls it, so the booked end is enforced even if a timer is late.
 * It keeps no transcript or audio: only counts and the deferred question texts until Q&A.
 */
export class AiSessionController {
  private readonly times: SessionTimes;
  private phase: Phase = 'not_started';
  private connected = false;
  private resumeHandle: string | undefined;
  private deferred: string[] = [];
  private blockedTurns = 0;
  private endReason: EndReason | null = null;
  private cancelled = false;

  constructor(
    private readonly booking: AiBooking,
    private readonly provider: TutorProvider,
    private readonly clock: Clock,
    private readonly privacy: SessionPrivacy = { summariesEnabled: false },
  ) {
    this.times = sessionTimes(booking);
  }

  /** Open the lesson, or reconnect after a drop. Never extends the booked end. */
  async open(viewer: SessionViewer): Promise<OpenResult> {
    await this.tick();
    if (!canOpenSession(viewer, this.booking)) return { ok: false, reason: 'forbidden', retryable: false };
    if (this.isCancelled()) return { ok: false, reason: 'cancelled', retryable: false };
    if (this.phase === 'ended') return { ok: false, reason: 'ended', retryable: false };
    if (this.phase === 'not_started') return { ok: false, reason: 'not_started', retryable: true };

    const phase = this.phase;
    if (this.connected) {
      // A second open (page reload, second tab) takes over the single live connection.
      await this.safeClose('superseded');
      this.connected = false;
    }
    try {
      const opened = await this.provider.open(
        {
          bookingId: this.booking.bookingId,
          subject: this.booking.subject,
          chapterId: this.booking.chapterId,
          phase,
          endsAtMs: this.times.endMs,
        },
        this.resumeHandle,
      );
      this.resumeHandle = opened.resumeHandle;
      this.connected = true;
    } catch {
      return { ok: false, reason: 'provider_unavailable', retryable: this.clock.now() < this.times.endMs };
    }
    // Opening took time: re-check the clock so a late connection cannot outlive the booking.
    const current = await this.tick();
    if (current === 'ended' || current === 'not_started') return { ok: false, reason: 'ended', retryable: false };
    // Questions held back while the connection was down are passed on once Q&A is live.
    if (current === 'qa' && this.connected) await this.flushDeferred();
    const now = this.clock.now();
    const phaseEnd = current === 'explanation' ? this.times.explanationEndMs : this.times.endMs;
    return {
      ok: true,
      phase: current,
      remainingMs: this.times.endMs - now,
      phaseRemainingMs: phaseEnd - now,
    };
  }

  /** Advance the state machine from the clock. Safe to call at any time, any number of times. */
  async tick(): Promise<Phase> {
    if (this.phase === 'ended') return this.phase;
    if (this.isCancelled()) {
      await this.finish('booking_cancelled');
      return this.phase;
    }
    const target = phaseAt(this.times, this.clock.now());
    if (target === 'ended') {
      await this.finish('booked_end');
    } else if (target === 'qa' && this.phase !== 'qa') {
      this.phase = 'qa';
      if (this.connected) {
        await this.provider.setPhase('qa');
        await this.flushDeferred();
      }
    } else if (target === 'explanation' && this.phase === 'not_started') {
      this.phase = 'explanation';
    }
    return this.phase;
  }

  /** Milliseconds until the next phase change or the hard end, for the host's timer. */
  msUntilNextBoundary(): number | null {
    if (this.phase === 'ended') return null;
    const now = this.clock.now();
    const next = [this.times.startMs, this.times.explanationEndMs, this.times.endMs].find((t) => t > now);
    return next === undefined ? 0 : next - now;
  }

  /** A student question. Held back during the explanation; passed on during Q&A. */
  async studentQuestion(raw: string): Promise<QuestionResult> {
    await this.tick();
    const text = raw.trim();
    if (this.phase === 'ended') return { status: 'rejected', reason: 'ended' };
    if (this.phase === 'not_started') return { status: 'rejected', reason: 'not_started' };
    if (text.length === 0 || text.length > MAX_QUESTION_LENGTH) return { status: 'rejected', reason: 'invalid' };
    if (this.phase === 'explanation') {
      if (this.deferred.length >= MAX_DEFERRED_QUESTIONS) return { status: 'rejected', reason: 'queue_full' };
      this.deferred.push(text);
      return { status: 'deferred', position: this.deferred.length };
    }
    if (!this.connected) return { status: 'rejected', reason: 'not_connected' };
    await this.provider.sendStudentQuestion(text);
    return { status: 'sent' };
  }

  /** Check one outgoing tutor turn (text or output transcript). Blocks quizzes and Q&A questions. */
  async reviewTutorTurn(text: string): Promise<TurnReview> {
    await this.tick();
    if (this.phase !== 'explanation' && this.phase !== 'qa') return { allowed: false, reason: 'session_closed' };
    const review = reviewTutorTurn(text, this.phase);
    if (!review.allowed) {
      this.blockedTurns += 1;
      if (this.connected) await this.provider.interruptOutput();
    }
    return review;
  }

  /** The provider connection dropped (network loss, provider GoAway). The clock keeps running. */
  connectionLost(): void {
    this.connected = false;
  }

  /** The student or parent pressed End Class. */
  async endByUser(viewer: SessionViewer): Promise<boolean> {
    if (!canOpenSession(viewer, this.booking)) return false;
    await this.finish('ended_by_user');
    return true;
  }

  /** The booking was cancelled while the lesson was open. */
  async cancel(): Promise<void> {
    this.cancelled = true;
    await this.finish('booking_cancelled');
  }

  snapshot(): SessionSnapshot {
    return {
      bookingId: this.booking.bookingId,
      phase: this.phase,
      connected: this.connected,
      deferredQuestions: this.deferred.length,
      blockedTurns: this.blockedTurns,
      endReason: this.endReason,
      summaryAllowed: this.phase === 'ended' && this.privacy.summariesEnabled,
    };
  }

  private async flushDeferred(): Promise<void> {
    const queued = this.deferred;
    this.deferred = [];
    for (const q of queued) await this.provider.sendStudentQuestion(q);
  }

  private async finish(reason: EndReason): Promise<void> {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.endReason = reason;
    this.deferred = [];
    this.resumeHandle = undefined;
    if (this.connected) {
      this.connected = false;
      await this.safeClose(reason);
    }
  }

  private isCancelled(): boolean {
    return this.cancelled || this.booking.status === 'cancelled';
  }

  private async safeClose(reason: EndReason | 'superseded'): Promise<void> {
    try {
      await this.provider.close(reason);
    } catch {
      // The session is over on our side whatever the provider says; the relay drops the socket.
    }
  }
}
