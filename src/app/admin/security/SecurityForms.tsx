'use client';

import Link from 'next/link';
import { useActionState, useId, useState } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import {
  confirmEnrolmentAction,
  newRecoveryCodesAction,
  ownerSetupAction,
  recoveryCodeAction,
  resetAuthenticatorAction,
  type SecurityState,
  verifyCodeAction,
} from './actions';

/** Big 6-digit code box (board M-26). */
function CodeField({ label = 'Security code' }: { label?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold leading-5">
        {label}
      </label>
      <input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        className="min-h-14 w-full rounded-[16px] border border-outline bg-surface-container-lowest px-4 text-center font-mono text-[24px] font-bold tracking-[.3em] outline-none hover:border-on-surface-variant focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
    </div>
  );
}

/** Shown once at set-up and whenever a new set is made (board 66). */
export function RecoveryCodes({ codes, doneHref = '/admin' }: { codes: string[]; doneHref?: string }) {
  return (
    <section
      aria-labelledby="recovery-codes"
      className="flex flex-col gap-3 rounded-[20px] border border-card-border bg-surface-container-lowest p-4 sm:p-6"
      data-testid="recovery-codes"
    >
      <span className="text-xs font-bold uppercase tracking-[.06em] text-on-warning-container">Shown once</span>
      <h2 id="recovery-codes" className="text-[22px] font-bold leading-7">
        Your recovery codes
      </h2>
      <p className="text-sm leading-5 text-on-surface-variant">
        If you lose the phone with your security code, each code lets you sign in once. Print them or write them down,
        and keep them somewhere safe.
      </p>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 font-mono text-[15px]">
        {codes.map((c) => (
          <li key={c} className="rounded-[8px] bg-surface-container-low px-2.5 py-1.5" data-testid="recovery-code">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2.5 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
        <LinkButton href={doneHref}>I&apos;ve saved them</LinkButton>
      </div>
      <p className="text-sm leading-5 text-on-surface-variant">
        AA Pro stores only scrambled versions, so nobody can show them to you again. You can create a new set at any
        time, which cancels the old one.
      </p>
    </section>
  );
}

export function EnrolForm({ qrSvg, secret, uri }: { qrSvg: string; secret: string; uri: string }) {
  const [state, action, pending] = useActionState<SecurityState, FormData>(confirmEnrolmentAction, {});
  if (state.recoveryCodes) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="success">Your authenticator app is set up.</FormMessage>
        <RecoveryCodes codes={state.recoveryCodes} />
      </div>
    );
  }
  const groups = secret.match(/.{1,4}/g)?.join(' ') ?? secret;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <ol className="m-0 flex list-decimal flex-col gap-4 pl-5 text-[15px] leading-[22px]">
        <li>
          Install a free authenticator app on your phone, such as <strong>Google Authenticator</strong> or{' '}
          <strong>Microsoft Authenticator</strong>. Open it and tap <strong>+</strong> (add an account).
        </li>
        <li>
          <div className="flex flex-col gap-3">
            <span>
              Choose <strong>Scan a QR code</strong> in the app and point it at this code. Use the app&apos;s scanner,
              not the phone&apos;s normal camera.
            </span>
            <span
              role="img"
              aria-label="QR code for your authenticator app"
              className="block h-[240px] w-[240px] max-w-full rounded-[12px] border border-card-border bg-surface-container-lowest p-3 [&>svg]:h-full [&>svg]:w-full"
              // The SVG is generated on our server from the set-up link; it contains no user input.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="flex flex-col gap-2 rounded-[16px] border border-card-border bg-surface-container-low p-3 sm:p-4">
              <span className="text-sm font-bold leading-5">
                Reading this on the same phone, or the scan doesn&apos;t work?
              </span>
              <a href={uri} className="self-start text-[15px] font-bold underline">
                Open in my authenticator app
              </a>
              <span className="text-sm leading-5 text-on-surface-variant">
                Or in the app choose <strong>Enter a setup key</strong>. Account name: AA Pro. Key (time based):
              </span>
              <span
                className="break-all rounded-[8px] bg-surface-container-lowest px-3 py-2 font-mono text-[17px] font-bold tracking-[.06em]"
                data-testid="mfa-secret"
              >
                {groups}
              </span>
              <CopyButton text={secret} />
            </div>
          </div>
        </li>
        <li>Type the 6-digit code the app now shows for AA Pro. A new code appears every 30 seconds.</li>
      </ol>
      {state.error ? (
        <FormMessage tone="error">
          {state.error} If it keeps failing, check that your phone&apos;s date and time are set automatically.
        </FormMessage>
      ) : null}
      <CodeField />
      <Button type="submit" inactive={pending} className="self-start">
        Turn on security codes
      </Button>
    </form>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="self-start text-[15px] font-bold text-primary"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? 'Key copied' : 'Copy the key'}
    </button>
  );
}

export function VerifyForm() {
  const [state, action, pending] = useActionState<SecurityState, FormData>(verifyCodeAction, {});
  const [recovery, recoveryAction, recovering] = useActionState<SecurityState, FormData>(recoveryCodeAction, {});
  const [useRecovery, setUseRecovery] = useState(false);
  if (useRecovery) {
    return (
      <form action={recoveryAction} className="flex flex-col gap-4" noValidate>
        {recovery.error ? <FormMessage tone="error">{recovery.error}</FormMessage> : null}
        <TextField
          label="Recovery code"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          hint="One of the codes you printed, for example ABCD-2345."
          required
        />
        <Button type="submit" inactive={recovering}>
          Use recovery code
        </Button>
        <button
          type="button"
          className="self-start text-[15px] font-bold text-primary"
          onClick={() => setUseRecovery(false)}
        >
          Use my authenticator app instead
        </button>
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <CodeField />
      <Button type="submit" inactive={pending}>
        Verify
      </Button>
      <button
        type="button"
        className="self-start text-[15px] font-bold text-primary"
        onClick={() => setUseRecovery(true)}
      >
        Lost your phone? Use a recovery code
      </button>
      <p className="text-sm leading-5 text-on-surface-variant">
        Five wrong codes sign you out. Every attempt is recorded in the audit log.
      </p>
    </form>
  );
}

export function SecuritySettings() {
  const [codes, codesAction, making] = useActionState<SecurityState, FormData>(newRecoveryCodesAction, {});
  const [reset, resetAction, resetting] = useActionState<SecurityState, FormData>(resetAuthenticatorAction, {});
  if (codes.recoveryCodes) return <RecoveryCodes codes={codes.recoveryCodes} doneHref="/admin/security" />;
  return (
    <div className="flex flex-col gap-4">
      {codes.error ? <FormMessage tone="error">{codes.error}</FormMessage> : null}
      {reset.error ? <FormMessage tone="error">{reset.error}</FormMessage> : null}
      <div className="flex flex-wrap gap-2.5">
        <form action={codesAction}>
          <Button type="submit" variant="secondary" inactive={making}>
            Create new recovery codes
          </Button>
        </form>
        <form action={resetAction}>
          <Button type="submit" variant="secondary" inactive={resetting}>
            Set up a new authenticator
          </Button>
        </form>
      </div>
      <p className="text-sm leading-5 text-on-surface-variant">
        New recovery codes cancel the old ones. Setting up a new authenticator stops the old phone&apos;s codes working;
        you scan a new QR code straight away. Both need a security-code check in the last 10 minutes.
      </p>
    </div>
  );
}

export function OwnerSetupForm() {
  const [state, action, pending] = useActionState<SecurityState, FormData>(ownerSetupAction, {});
  if (state.notice) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage tone="success">{state.notice}</FormMessage>
        <Link href="/sign-in" className="font-bold">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextField label="Your name" name="name" autoComplete="name" required />
      <TextField label="Owner's email" name="email" type="email" autoComplete="email" required />
      <Button type="submit" inactive={pending}>
        Send set-up link
      </Button>
    </form>
  );
}
