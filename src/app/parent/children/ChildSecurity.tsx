'use client';

import { useActionState } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { PendingNote } from '@/components/PendingNote';
import { StatusChip } from '@/components/StatusChip';
import { TextField } from '@/components/TextField';
import { childSecurityAction, type ChildFormState, confirmParentAction } from './actions';
import { CredentialsCard } from './ChildForms';

interface Props {
  childId: string;
  childName: string;
  username: string;
  /** e.g. "4:45 pm", in the parent's time zone; null when not locked. */
  lockedUntilLabel: string | null;
  paused: boolean;
  /** The parent confirmed their password within the last 5 minutes (server's view at render). */
  confirmed: boolean;
}

function Hidden({ childId, childName, op }: { childId: string; childName: string; op: string }) {
  return (
    <>
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="childName" value={childName} />
      <input type="hidden" name="op" value={op} />
    </>
  );
}

/** M-08 "Sign-in and security" and "Pause or delete" (board 18; G1-08 §3.3–3.4). */
export function ChildSecurity({ childId, childName, username, lockedUntilLabel, paused, confirmed }: Props) {
  const [confirm, confirmAction, confirming] = useActionState<ChildFormState, FormData>(confirmParentAction, {});
  const [result, act, acting] = useActionState<ChildFormState, FormData>(childSecurityAction, {});
  // The latest answer wins: a failed or newer "please confirm" shows step 1, a fresh confirmation hides it.
  const needsConfirm = confirm.needsReauth
    ? true
    : result.needsReauth && (confirm.at ?? 0) < (result.at ?? 0)
      ? true
      : confirm.at
        ? false
        : !confirmed;

  const status = paused ? (
    <StatusChip kind="neutral">Paused</StatusChip>
  ) : lockedUntilLabel ? (
    <StatusChip kind="warning">Locked · try again at {lockedUntilLabel}</StatusChip>
  ) : (
    <StatusChip kind="success">Can sign in</StatusChip>
  );

  return (
    <>
      <Card as="section" aria-labelledby="sign-in-security" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="sign-in-security" className="text-[20px] font-bold leading-7">
          Sign-in and security
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold leading-5">Username</span>
            <span className="break-all font-mono text-[18px] font-bold" data-testid="child-username">
              {username}
            </span>
            <span className="text-sm leading-5 text-on-surface-variant">
              AA Pro adds the numbers, so every username is unique. {childName} cannot change it.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold leading-5">Sign-in status</span>
            <span>{status}</span>
            {lockedUntilLabel && !paused ? (
              <span className="text-sm leading-5 text-on-surface-variant">
                Locked after 5 wrong tries. It unlocks by itself after 15 minutes. We emailed you when it happened.
              </span>
            ) : null}
          </div>
        </div>

        {result.credentials ? (
          <CredentialsCard credentials={result.credentials}>
            <LinkButton href={`/parent/children/${childId}`} className="self-start">
              Done
            </LinkButton>
          </CredentialsCard>
        ) : null}
        {result.notice ? <FormMessage tone="success">{result.notice}</FormMessage> : null}
        {result.error && !result.needsReauth ? <FormMessage tone="error">{result.error}</FormMessage> : null}

        {needsConfirm ? (
          <form
            action={confirmAction}
            className="flex flex-col gap-3 rounded-[20px] border border-card-border p-4 sm:p-5"
            noValidate
          >
            <span className="text-xs font-bold uppercase tracking-[.06em] text-on-surface-variant">
              Step 1 · Confirm it&apos;s you
            </span>
            {result.needsReauth && result.error ? <FormMessage tone="info">{result.error}</FormMessage> : null}
            {confirm.notice ? <FormMessage tone="success">{confirm.notice}</FormMessage> : null}
            <input type="hidden" name="childId" value={childId} />
            <TextField
              label="Your AA Pro password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              error={confirm.fieldErrors?.password}
            />
            <Button type="submit" inactive={confirming} className="self-start">
              Confirm
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <form
              action={act}
              className="flex flex-col gap-3 rounded-[20px] border border-card-border p-4 sm:p-5"
              noValidate
            >
              <Hidden childId={childId} childName={childName} op="reset" />
              <TextField
                label={`New password for ${childName} (optional)`}
                name="newPassword"
                type="text"
                autoComplete="off"
                spellCheck={false}
                hint="At least 8 characters. Leave it empty and we'll make an easy-to-type one."
                error={result.fieldErrors?.newPassword}
              />
              <Button type="submit" variant="secondary" inactive={acting} className="self-start">
                Reset {childName}&apos;s password
              </Button>
            </form>
            <div className="flex flex-wrap gap-2.5">
              {lockedUntilLabel && !paused ? (
                <form action={act}>
                  <Hidden childId={childId} childName={childName} op="unlock" />
                  <Button type="submit" variant="secondary" inactive={acting}>
                    Unlock now
                  </Button>
                </form>
              ) : null}
              <form action={act}>
                <Hidden childId={childId} childName={childName} op="signout" />
                <Button type="submit" variant="secondary" inactive={acting}>
                  Sign {childName} out on all devices
                </Button>
              </form>
            </div>
          </div>
        )}
        <p className="text-sm leading-5 text-on-surface-variant">
          For each of these, you confirm your own password first. A reset signs {childName} out everywhere. Nobody can
          see an existing password, including you and AA Pro staff.
        </p>
      </Card>

      <Card
        as="section"
        aria-labelledby="pause-delete"
        className="flex flex-col gap-3.5 border-error-border p-4 sm:p-6"
      >
        <h2 id="pause-delete" className="text-[20px] font-bold leading-7">
          Pause or delete
        </h2>
        <p className="text-sm leading-5 text-on-surface-variant">
          Pausing stops {childName} from signing in and signs {childName} out. You can resume at any time.
        </p>
        <PendingNote decision="D-28">Deleting a child&apos;s data waits for the retention rules.</PendingNote>
        <div className="flex flex-wrap gap-2.5">
          <form action={act}>
            <Hidden childId={childId} childName={childName} op={paused ? 'resume' : 'pause'} />
            <Button type="submit" variant={paused ? 'secondary' : 'danger'} inactive={acting}>
              {paused ? 'Resume account' : 'Pause account'}
            </Button>
          </form>
          <Button variant="danger" inactive aria-describedby="delete-pending">
            Delete {childName}&apos;s data
          </Button>
          <span id="delete-pending" className="sr-only">
            Not available until the retention rules are decided.
          </span>
        </div>
      </Card>
    </>
  );
}
