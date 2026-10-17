import 'server-only';
import type { TurnReview } from './types';

/**
 * Policy check on the tutor's outgoing turns (text or the provider's output transcript).
 *
 * Owner rules: the tutor never runs quizzes, and in the Q&A phase it only answers — it does not
 * ask the student questions. This is a second line of defence: the system instructions say the
 * same thing first. Limitation (documented in the feasibility report): with streaming voice, the
 * transcript arrives slightly after or alongside the audio, so a blocked turn is cut short, not
 * prevented before the first words are heard.
 */

const QUIZ_PATTERNS: readonly RegExp[] = [
  /\bquiz\b/,
  /\btest (you|your)\b/,
  /\btrue or false\b/,
  /\bmultiple[- ]choice\b/,
  /\b(question|problem|exercise) (number )?\d+\b/,
  /\b(your turn|over to you)\b/,
  /\blet'?s (practi[cs]e|check what you|see if you|see what you)\b/,
  /\btry (this|these|the next) (one|question|problem|sum)s?\b/,
  /\b(can|could) you (tell me|solve|answer|work out|find|calculate|guess)\b/,
  /\bwhat do you think\b/,
  /\b(option|choice) [a-d]\b/,
];

function normalise(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

/** Sentences that end with a question mark. A plain heuristic; the PoC measures how well it works. */
function asksAQuestion(text: string): boolean {
  return /\?\s*(["')\]]\s*)?$/.test(text) || /\?\s+\S/.test(text);
}

export function reviewTutorTurn(text: string, phase: 'explanation' | 'qa'): TurnReview {
  const t = normalise(text);
  if (QUIZ_PATTERNS.some((p) => p.test(t))) return { allowed: false, reason: 'quiz' };
  if (phase === 'qa' && asksAQuestion(t)) return { allowed: false, reason: 'ai_question' };
  return { allowed: true };
}
