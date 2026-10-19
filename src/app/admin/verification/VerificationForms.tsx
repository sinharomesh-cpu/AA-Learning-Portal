'use client';

import { useActionState, useId, useState } from 'react';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { Icon } from '@/components/icons/Icon';
import { StatusChip } from '@/components/StatusChip';
import { TickCard } from '@/components/ui/Panel';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { keepValuesOnSubmit } from '@/lib/keepValuesOnSubmit';
import { NOTE_HINT } from '@/lib/verification';
import { decideVerificationAction, revokeVerificationAction, type VerificationFormState } from './actions';

/** Client forms for Admin → Verification (CR-15 §5.1). Every value is checked again on the server. */

function NoteField({ label, name, error }: { label: string; name: string; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold leading-5">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={3}
        maxLength={500}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? `${id}-e` : '', `${id}-h`].filter(Boolean).join(' ')}
        className={cx(INPUT, 'min-h-24 w-full py-3')}
      />
      {error ? (
        <span id={`${id}-e`} className="text-sm font-bold leading-5 text-on-error-container">
          {error}
        </span>
      ) : null}
      <span id={`${id}-h`} className="text-sm leading-5 text-on-surface-variant">
        {NOTE_HINT}
      </span>
    </div>
  );
}

export function DecisionForm({
  teacherId,
  name,
  emailConfirmed,
  eligible,
}: {
  teacherId: string;
  name: string;
  /** From the account record; shown read-only. */
  emailConfirmed: boolean;
  eligible: boolean;
}) {
  const [state, action, pending] = useActionState<VerificationFormState, FormData>(decideVerificationAction, {});
  const canVerify = emailConfirmed && eligible;
  return (
    // The typed note and ticks stay after a refused attempt (React would otherwise reset them).
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="teacherId" value={teacherId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2.5 p-0 text-sm font-bold">Checks (all three needed to mark verified)</legend>
        <TickCard defaultChecked={emailConfirmed} disabled aria-describedby={`em-${teacherId}`}>
          <strong>Email address confirmed</strong>
          <br />
          <span id={`em-${teacherId}`} className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            From the account, not ticked by hand:{' '}
            <StatusChip kind={emailConfirmed ? 'success' : 'warning'}>
              {emailConfirmed ? 'Confirmed' : 'Not confirmed'}
            </StatusChip>
          </span>
        </TickCard>
        <TickCard name="profileReviewed" value="yes">
          <strong>I reviewed this teacher&apos;s profile</strong>
        </TickCard>
        <TickCard name="identityChecked" value="yes">
          <strong>I checked this teacher&apos;s identity on a video call</strong>
          <br />
          <span className="text-sm text-on-surface-variant">
            Nothing from an identity document is recorded: no copy, image or number.
          </span>
        </TickCard>
      </fieldset>
      <NoteField label="Decision note (required)" name="note" error={state.fieldErrors?.note} />
      {!emailConfirmed ? (
        <FormMessage tone="warning">
          The email address is not confirmed, so {name} cannot be marked verified yet. You can still record “Not
          verified”.
        </FormMessage>
      ) : !eligible ? (
        <FormMessage tone="warning">
          {name} is not an approved, active teacher right now, so they cannot be marked verified.
        </FormMessage>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="submit"
          name="outcome"
          value="verified"
          inactive={pending || !canVerify}
          aria-label={`Mark ${name} verified`}
        >
          <Icon name="verified" size={18} />
          Mark verified
        </Button>
        <Button
          type="submit"
          name="outcome"
          value="not_verified"
          variant="secondary"
          inactive={pending}
          aria-label={`Not verified: ${name}`}
        >
          Not verified
        </Button>
      </div>
    </form>
  );
}

export function RevokeForm({ teacherId, name }: { teacherId: string; name: string }) {
  const [state, action, pending] = useActionState<VerificationFormState, FormData>(revokeVerificationAction, {});
  const [open, setOpen] = useState(false);
  const titleId = useId();
  if (!open) {
    return (
      <div className="flex flex-col gap-3">
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        <Button
          variant="danger"
          onClick={() => setOpen(true)}
          className="self-start"
          aria-label={`Remove verification: ${name}`}
        >
          Remove verification
        </Button>
      </div>
    );
  }
  return (
    <form
      action={action}
      onSubmit={keepValuesOnSubmit(action)}
      className="flex flex-col gap-3 rounded-[20px] border border-error-border p-4"
      aria-labelledby={titleId}
      noValidate
    >
      <h4 id={titleId} className="text-[18px] font-bold">
        Remove {name}&apos;s verification?
      </h4>
      <p className="m-0 text-[15px] leading-[22px] text-on-surface-variant">
        The tick disappears from their public profile and cards at once. They can ask to be checked again.
      </p>
      <input type="hidden" name="teacherId" value={teacherId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <NoteField label="Reason (required)" name="reason" error={state.fieldErrors?.reason} />
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" variant="danger" inactive={pending}>
          Remove verification
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
