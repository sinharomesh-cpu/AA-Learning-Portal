'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { Icon } from '@/components/icons/Icon';
import { StatusChip } from '@/components/StatusChip';
import { Panel } from '@/components/ui/Panel';
import { TILE, TILE_KEY } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { STATE_CHIP, VERIFIED_EXPLANATION, VERIFIED_LABEL, type VerificationState } from '@/lib/verification';
import { requestVerificationAction, type VerificationRequestState } from './verificationActions';

/**
 * CR-15 §5.1 (OC-106 (2)): the teacher's "AA Pro Verified" status on the dashboard, beside the
 * other status panels. Dates arrive already written out in the teacher's time zone.
 */
export function VerificationPanel({
  state,
  requestedOn,
  verifiedOn,
  expiresOn,
  canRequest,
  blocked,
}: {
  state: VerificationState;
  requestedOn: string | null;
  verifiedOn: string | null;
  expiresOn: string | null;
  canRequest: boolean;
  blocked: 'email_unconfirmed' | 'not_eligible' | null;
}) {
  const [result, action, pending] = useActionState<VerificationRequestState, FormData>(requestVerificationAction, {});
  const chip = STATE_CHIP[state];
  const again = state !== 'not_started';
  const text: Record<VerificationState, string> = {
    not_started:
      'Ask AA Pro to check your account. Once verified, parents see the AA Pro Verified tick on your public profile for 12 months.',
    pending: `Waiting for review since ${requestedOn ?? 'your request'}. AA Pro reviews your profile and checks your identity on a short video call. No identity document, image or number is stored.`,
    verified: `Verified on ${verifiedOn ?? '—'}. Re-check due ${expiresOn ?? '—'}. Parents see the tick on your public profile until then.`,
    not_verified: 'AA Pro could not complete your verification this time. You can ask again whenever you are ready.',
    expired: `Your verification ended on ${expiresOn ?? '—'}. The tick is hidden until you are checked again.`,
    revoked: 'Your verification was removed. The tick is hidden until you are checked again.',
  };
  return (
    <Panel
      id="verification"
      title={VERIFIED_LABEL}
      intro="A tick on your public profile that shows AA Pro has checked your account."
      badge={<StatusChip kind={chip.kind}>{chip.text}</StatusChip>}
    >
      <p className="m-0 flex items-start gap-2 text-[15px] leading-[22px]" data-testid="verification-state">
        <Icon
          name={state === 'verified' ? 'verified_fill' : state === 'pending' ? 'hourglass_top' : 'info'}
          size={20}
          className={cx('mt-0.5', state === 'verified' ? 'text-on-success-container' : 'text-primary')}
        />
        <span>{text[state]}</span>
      </p>
      {result.error ? <FormMessage tone="error">{result.error}</FormMessage> : null}
      {result.notice ? <FormMessage tone="success">{result.notice}</FormMessage> : null}
      {blocked === 'email_unconfirmed' ? (
        <FormMessage tone="warning">Confirm your email address first. Then you can ask to be verified.</FormMessage>
      ) : null}
      {canRequest ? (
        <form action={action}>
          <Button type="submit" inactive={pending}>
            {again ? 'Request verification again' : 'Request verification'}
          </Button>
        </form>
      ) : null}
      <div className={TILE}>
        <span className={TILE_KEY}>What the tick means</span>
        <p className="m-0 text-[15px] leading-[22px]">{VERIFIED_EXPLANATION}</p>
      </div>
    </Panel>
  );
}
