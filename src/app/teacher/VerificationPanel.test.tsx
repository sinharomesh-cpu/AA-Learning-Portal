import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { axeViolations } from '../../../tests/unit/axe';
import { VerifiedTick } from '@/components/listing/VerifiedTick';
import { adminMenuFor } from '@/config/menus';
import {
  looksLikeIdNumber,
  mayRequestFrom,
  VERIFIED_EXPLANATION,
  verificationState,
  type VerificationState,
} from '@/lib/verification';
import { VerificationPanel } from './VerificationPanel';

vi.mock('./verificationActions', () => ({ requestVerificationAction: vi.fn(async () => ({})) }));

/** CR-15 §5.1 "AA Pro Verified" (OC-106 (2)): states, wording and the accessible tick. */
const EXPLANATION =
  "AA Pro checked this teacher's email, reviewed their profile and confirmed their identity on a video call. This does not independently verify teaching qualifications, experience or background checks.";

describe('verification state', () => {
  const T = new Date('2026-10-20T06:00:00Z');
  const EXP = new Date('2027-10-20T06:00:00Z');
  it('reads the newest decision and any open request', () => {
    expect(verificationState(null, false, T)).toBe('not_started');
    expect(verificationState(null, true, T)).toBe('pending');
    expect(verificationState({ outcome: 'verified', expiresAt: EXP }, false, T)).toBe('verified');
    expect(verificationState({ outcome: 'verified', expiresAt: EXP }, false, new Date(EXP.getTime() - 1))).toBe(
      'verified',
    );
    expect(verificationState({ outcome: 'verified', expiresAt: EXP }, false, EXP)).toBe('expired');
    expect(verificationState({ outcome: 'verified', expiresAt: EXP }, true, EXP)).toBe('pending');
    expect(verificationState({ outcome: 'not_verified', expiresAt: null }, false, T)).toBe('not_verified');
    expect(verificationState({ outcome: 'revoked', expiresAt: null }, false, T)).toBe('revoked');
  });

  it('allows a request from not started, not verified, expired and removed only', () => {
    const all: VerificationState[] = ['not_started', 'pending', 'verified', 'not_verified', 'expired', 'revoked'];
    expect(all.filter(mayRequestFrom)).toEqual(['not_started', 'not_verified', 'expired', 'revoked']);
  });

  it('spots ID numbers in notes but lets dates and short numbers through', () => {
    expect(looksLikeIdNumber('ID 123456789012')).toBe(true);
    expect(looksLikeIdNumber('1234 5678 9012')).toBe(true);
    expect(looksLikeIdNumber('Call on 2026-10-20 at 10:30, 15 minutes')).toBe(false);
    expect(looksLikeIdNumber('Checked on a video call')).toBe(false);
  });

  it('uses the approved wording exactly', () => {
    expect(VERIFIED_EXPLANATION).toBe(EXPLANATION);
  });
});

describe('VerifiedTick', () => {
  it('on cards: the label, and the explanation behind a keyboard-friendly disclosure', async () => {
    const user = userEvent.setup();
    const { container } = render(<VerifiedTick />);
    const tick = screen.getByTestId('verified-tick');
    expect(tick.tagName).toBe('DETAILS');
    expect(within(tick).getByText('AA Pro Verified')).toBeInTheDocument();
    await user.click(within(tick).getByText('What this means'));
    expect(tick).toHaveAttribute('open');
    expect(within(tick).getByText(EXPLANATION)).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('on a profile: the explanation written out in full', async () => {
    const { container } = render(<VerifiedTick variant="full" />);
    expect(screen.getByText('AA Pro Verified')).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION)).toBeVisible();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('teacher verification panel', () => {
  const base = { requestedOn: null, verifiedOn: null, expiresOn: null, canRequest: false, blocked: null };

  it('not started: a request button and the explanation', async () => {
    const { container } = render(<VerificationPanel {...base} state="not_started" canRequest />);
    const panel = screen.getByRole('region', { name: 'AA Pro Verified' });
    expect(within(panel).getByText('Not started')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Request verification' })).toBeInTheDocument();
    expect(within(panel).getByText(EXPLANATION)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('waiting, verified, not verified, expired and removed', async () => {
    const { rerender, container } = render(
      <VerificationPanel {...base} state="pending" requestedOn="20 October 2026" />,
    );
    expect(screen.getByText('Waiting for review', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/Waiting for review since 20 October 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<VerificationPanel {...base} state="verified" verifiedOn="20 October 2026" expiresOn="20 October 2027" />);
    expect(screen.getByText(/Verified on 20 October 2026. Re-check due 20 October 2027/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    rerender(<VerificationPanel {...base} state="not_verified" canRequest />);
    // A neutral message: never the Super Admin's note.
    expect(screen.getByText(/could not complete your verification this time/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request verification again' })).toBeInTheDocument();

    rerender(<VerificationPanel {...base} state="expired" expiresOn="20 October 2027" canRequest />);
    expect(screen.getByText(/ended on 20 October 2027. The tick is hidden until you are checked again/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Request verification again' })).toBeInTheDocument();

    rerender(<VerificationPanel {...base} state="revoked" canRequest />);
    expect(screen.getByText('Removed')).toBeInTheDocument();
    expect(screen.getByText(/The tick is hidden until you are checked again/)).toBeVisible();
  });

  it('an unconfirmed email: no button, and what to do', () => {
    render(<VerificationPanel {...base} state="not_started" blocked="email_unconfirmed" />);
    expect(screen.getByText(/Confirm your email address first/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('admin menu', () => {
  it('Verification is in the Super Admin menu only', () => {
    expect(adminMenuFor('superadmin').map((i) => i.href)).toContain('/admin/verification');
    expect(adminMenuFor('admin', ['accounts', 'teacher_approvals', 'audit_log']).map((i) => i.href)).not.toContain(
      '/admin/verification',
    );
  });
});
