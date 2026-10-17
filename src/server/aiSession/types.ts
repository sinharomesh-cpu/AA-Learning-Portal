import 'server-only';

/**
 * AI Tutor session controller — shared types (feasibility proof of concept, not wired into the UI).
 * Provider-independent: Gemini Live, AI-Tutor.ai or any other engine sits behind `TutorProvider`.
 * See docs/ai-teacher/AI_Teacher_Provider_Feasibility.md.
 */

/** One AI lesson length only (OC-89(4), replacing 15 or 30 of OC-22). */
export type SessionLength = 15;

/** Owner rule: 15 minutes = 10 minutes of explanation + 5 minutes of Q&A. */
export const PHASE_PLAN: Record<SessionLength, { explanationMinutes: number; qaMinutes: number }> = {
  15: { explanationMinutes: 10, qaMinutes: 5 },
};

/** Most "Give Me a Hint" requests in one lesson (proposed, OC-89(2)); limits cost and repetition. */
export const MAX_HINTS_PER_SESSION = 5;

export type Phase = 'not_started' | 'explanation' | 'qa' | 'ended';

export type EndReason = 'booked_end' | 'ended_by_user' | 'booking_cancelled';

/** The booking as the server sees it. The client never supplies any of these fields. */
export interface AiBooking {
  bookingId: string;
  studentId: string;
  subject: string;
  /** Id of a chapter the parent assigned to this child (OC-79). Never free text from the client. */
  chapterId: string;
  lengthMinutes: SessionLength;
  /** Booked start, UTC ISO string (R-07). */
  startIso: string;
  status: 'booked' | 'cancelled';
}

/** Who is asking to open the session. Built on the server from the session cookie. */
export interface SessionViewer {
  id: string;
  role: 'student' | 'parent' | 'teacher' | 'admin' | 'superadmin';
  /** For a parent: ids of children with an active guardian link. */
  childIds?: readonly string[];
}

/** Privacy settings that apply to this child (D-24 is still open; default is off). */
export interface SessionPrivacy {
  summariesEnabled: boolean;
}

/** Injected clock, so tests never depend on real time. */
export interface Clock {
  now(): number;
}

/** What the controller tells the provider about the lesson. Only authorised, server-loaded context. */
export interface LessonContext {
  bookingId: string;
  subject: string;
  chapterId: string;
  phase: Exclude<Phase, 'not_started' | 'ended'>;
  /** Hard end, epoch ms. The provider must never be told a later time. */
  endsAtMs: number;
}

/**
 * The only surface the controller uses. A real adapter (Gemini Live via a server relay, or
 * another provider) implements this; tests use a fake. API keys live inside the adapter on the
 * server and never pass through the controller.
 */
export interface TutorProvider {
  /** Open (or resume, when `resumeHandle` is given) a provider connection. */
  open(context: LessonContext, resumeHandle?: string): Promise<{ resumeHandle: string }>;
  /** Switch the tutor's instructions to the new phase. */
  setPhase(phase: 'explanation' | 'qa'): Promise<void>;
  /** Pass a student question to the tutor (Q&A phase only). */
  sendStudentQuestion(text: string): Promise<void>;
  /**
   * The student pressed "Give Me a Hint" (OC-89(2)). The adapter asks the tutor for one short
   * hint about the current question, concept or chapter — never a new question or a quiz.
   */
  sendHintRequest(): Promise<void>;
  /** Stop the tutor's current output immediately (policy block). */
  interruptOutput(): Promise<void>;
  /** Close the provider connection. */
  close(reason: EndReason | 'superseded'): Promise<void>;
}

export type OpenResult =
  | { ok: true; phase: 'explanation' | 'qa'; remainingMs: number; phaseRemainingMs: number }
  | {
      ok: false;
      reason: 'forbidden' | 'not_started' | 'ended' | 'cancelled' | 'provider_unavailable';
      /** True only when trying again could work (provider error before the booked end). */
      retryable: boolean;
    };

export type QuestionResult =
  | { status: 'deferred'; position: number }
  | { status: 'sent' }
  | { status: 'rejected'; reason: 'ended' | 'not_started' | 'invalid' | 'queue_full' | 'not_connected' };

export type HintResult =
  | { status: 'sent'; hintsLeft: number }
  | { status: 'rejected'; reason: 'ended' | 'not_started' | 'explanation' | 'limit' | 'not_connected' };

export type TurnReview = { allowed: true } | { allowed: false; reason: 'quiz' | 'ai_question' | 'session_closed' };

export interface SessionSnapshot {
  bookingId: string;
  phase: Phase;
  connected: boolean;
  deferredQuestions: number;
  blockedTurns: number;
  endReason: EndReason | null;
  /** Only true when the session ended and summaries are enabled for this child. */
  summaryAllowed: boolean;
}
