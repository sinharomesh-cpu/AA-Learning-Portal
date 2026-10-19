/**
 * "AA Pro Verified" (CR-15 §5.1; owner decision OC-106 (2)). Wording and states shared by the
 * teacher panel, the Super Admin page and the public tick. Safe in server and client code.
 */

export const VERIFIED_LABEL = 'AA Pro Verified';

/** Shown wherever the tick appears (exact wording, OC-106 (2)). */
export const VERIFIED_EXPLANATION =
  "AA Pro checked this teacher's email, reviewed their profile and confirmed their identity on a video call. This does not independently verify teaching qualifications, experience or background checks.";

/** Hint under every Super Admin note field: no identity document, image or number is stored. */
export const NOTE_HINT = 'Do not type ID numbers.';

/** How long a verification lasts, in calendar months from the decision. */
export const VALIDITY_MONTHS = 12;

export type VerificationState = 'not_started' | 'pending' | 'verified' | 'not_verified' | 'expired' | 'revoked';

export type DecisionOutcome = 'verified' | 'not_verified' | 'revoked';

/**
 * The current state from the newest decision and any open request. A verification counts only
 * until its expiry instant: at `expiresAt` exactly it is already expired.
 */
export function verificationState(
  latest: { outcome: DecisionOutcome; expiresAt: Date | null } | null,
  openRequest: boolean,
  now: Date,
): VerificationState {
  if (openRequest) return 'pending';
  if (!latest) return 'not_started';
  if (latest.outcome === 'verified') {
    return latest.expiresAt && now.getTime() < latest.expiresAt.getTime() ? 'verified' : 'expired';
  }
  return latest.outcome;
}

/** States from which a teacher may ask to be checked (again). */
export function mayRequestFrom(state: VerificationState): boolean {
  return state === 'not_started' || state === 'not_verified' || state === 'expired' || state === 'revoked';
}

/**
 * Notes must never hold an identity number: refuses any run of 8 or more digits, also when
 * written in groups separated by spaces (e.g. "1234 5678 9012"). Dates such as 2026-10-20 pass.
 */
export function looksLikeIdNumber(text: string): boolean {
  return /\d{8,}/.test(text.replace(/(\d) +(?=\d)/g, '$1'));
}

export const STATE_CHIP: Record<VerificationState, { text: string; kind: 'success' | 'warning' | 'neutral' }> = {
  not_started: { text: 'Not started', kind: 'neutral' },
  pending: { text: 'Waiting for review', kind: 'warning' },
  verified: { text: 'Verified', kind: 'success' },
  not_verified: { text: 'Not verified', kind: 'neutral' },
  expired: { text: 'Expired', kind: 'neutral' },
  revoked: { text: 'Removed', kind: 'neutral' },
};
