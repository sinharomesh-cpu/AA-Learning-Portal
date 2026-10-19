'use client';

import { useActionState, useId, useState } from 'react';
import { Chip } from '@/components/ui/Panel';
import { INPUT, TILE } from '@/components/ui/styles';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import { cx } from '@/lib/cx';
import {
  type AdminFormState,
  createAccountAction,
  createAdminAction,
  decideProfileChangeAction,
  decidePhotoAction,
  decideTeacherAction,
  setAccountActiveAction,
  updateAccountAction,
  updateAdminAction,
} from './actions';

/** Client forms for the admin area (WP2-5b). Every value is checked again on the server. */

const PERMISSIONS = [
  ['accounts', 'Accounts', 'Create, edit and deactivate parent and teacher accounts, with a reason.'],
  ['teacher_approvals', 'Teacher approvals', 'Approve or reject teachers, including those added by parents.'],
  ['audit_log', 'Audit log', 'Read the audit log. Nobody can change it.'],
] as const;

function Messages({ state }: { state: AdminFormState }) {
  return (
    <>
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
    </>
  );
}

function TextArea({ label, name, error, hint }: { label: string; name: string; error?: string; hint?: string }) {
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
        aria-describedby={[error ? `${id}-e` : '', hint ? `${id}-h` : ''].filter(Boolean).join(' ') || undefined}
        className={cx(INPUT, 'min-h-24 w-full py-3', error ? 'border-error' : '')}
      />
      {error ? (
        <span id={`${id}-e`} className="text-sm font-bold leading-5 text-on-error-container">
          {error}
        </span>
      ) : null}
      {hint ? (
        <span id={`${id}-h`} className="text-sm leading-5 text-on-surface-variant">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function PermissionBoxes({ checked, error }: { checked: readonly string[]; error?: string }) {
  return (
    <fieldset className={cx(TILE, 'm-0')} aria-describedby={error ? 'perm-error' : undefined}>
      <legend className="float-left w-full mb-2 p-0 text-sm font-bold">What can this admin manage?</legend>
      {PERMISSIONS.map(([value, title, hint]) => (
        <label
          key={value}
          className="flex items-start gap-3 rounded-[16px] border-2 border-card-border p-3 has-[:checked]:border-primary"
        >
          <input
            type="checkbox"
            name="permissions"
            value={value}
            defaultChecked={checked.includes(value)}
            className="mt-0.5 h-[22px] w-[22px] flex-none accent-primary"
          />
          <span>
            <strong>{title}</strong>
            <br />
            <span className="text-sm leading-5 text-on-surface-variant">{hint}</span>
          </span>
        </label>
      ))}
      {error ? (
        <span id="perm-error" className="text-sm font-bold text-on-error-container">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

const NEVER = (
  <p className="rounded-[16px] border border-error-border bg-error-container px-4 py-3 text-sm leading-[21px] text-on-error-container">
    <strong>No admin can ever:</strong> sign in as another person, see children&apos;s lessons or books, reset a
    child&apos;s password, or manage other admins. Only you, the Super Admin, can add admins or change what they manage.
  </p>
);

export function AddAdminForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createAdminAction, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate key={state.notice ?? 'form'}>
      <Messages state={state} />
      <TextField label="Name" name="name" defaultValue={v.name as string} error={e.name} required />
      <TextField label="Email" name="email" type="email" defaultValue={v.email as string} error={e.email} required />
      <PermissionBoxes checked={(v.permissions as string[]) ?? []} error={e.permissions} />
      {NEVER}
      <Button type="submit" inactive={pending} className="self-start">
        Send invitation
      </Button>
      <p className="text-sm leading-5 text-on-surface-variant">
        The admin gets a set-password link and must set up a security code (MFA) on first sign-in. Every change is
        recorded in the audit log.
      </p>
    </form>
  );
}

export function AdminRowForm({
  admin,
}: {
  admin: { id: string; name: string; status: string; invited: boolean; permissions: string[] };
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(updateAdminAction, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${admin.name}`}
        className="self-start"
      >
        Edit
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="adminId" value={admin.id} />
      <Messages state={state} />
      <PermissionBoxes checked={admin.permissions} />
      <label className="flex items-center gap-3 text-[15px] font-bold">
        <input
          type="checkbox"
          name="active"
          value="yes"
          defaultChecked={admin.status === 'active'}
          className="h-[22px] w-[22px] accent-primary"
        />
        Can sign in (untick to turn this admin off)
      </label>
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" name="op" value="save" inactive={pending}>
          Save
        </Button>
        {admin.invited && admin.status === 'active' ? (
          <Button type="submit" name="op" value="resend" variant="secondary" inactive={pending}>
            Send a new set-password link
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}

export function CreateAccountForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createAccountAction, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <fieldset className="m-0 flex flex-wrap gap-2.5 border-0 p-0">
        <legend className="mb-2.5 p-0 text-sm font-bold">Account type</legend>
        {(
          [
            ['parent', 'Parent'],
            ['teacher', 'Teacher'],
          ] as const
        ).map(([value, label]) => (
          <Chip key={value} type="radio" name="role" value={value} defaultChecked={(v.role ?? 'parent') === value}>
            {label}
          </Chip>
        ))}
      </fieldset>
      <TextField label="Name" name="name" defaultValue={v.name as string} error={e.name} required />
      <TextField label="Email" name="email" type="email" defaultValue={v.email as string} error={e.email} required />
      <p className="text-sm leading-5 text-on-surface-variant">
        The person gets an email to set their own password. Teachers still complete their profile and approval.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" inactive={pending}>
          Create and send email
        </Button>
        <LinkButton href="/admin/accounts" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

export function EditAccountForm({ account }: { account: { id: string; name: string; email: string } }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(updateAccountAction, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="accountId" value={account.id} />
      <Messages state={state} />
      <TextField label="Name" name="name" defaultValue={(v.name as string) ?? account.name} error={e.name} required />
      <TextField
        label="Email"
        name="email"
        type="email"
        defaultValue={(v.email as string) ?? account.email}
        error={e.email}
        hint="If you change it, the old address is told."
        required
      />
      <Button type="submit" inactive={pending} className="self-start">
        Save changes
      </Button>
      <p className="text-sm leading-5 text-on-surface-variant">
        Changes are recorded in the audit log with your name and the time.
      </p>
    </form>
  );
}

export function AccountStatusForm({ account }: { account: { id: string; name: string; status: string } }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(setAccountActiveAction, {});
  const [confirming, setConfirming] = useState(false);
  const inactive = account.status === 'deactivated' || account.status === 'suspended';
  if (inactive) {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="accountId" value={account.id} />
        <input type="hidden" name="active" value="yes" />
        <Messages state={state} />
        <Button type="submit" variant="secondary" inactive={pending} className="self-start">
          Reactivate account
        </Button>
      </form>
    );
  }
  if (!confirming) {
    return (
      <div className="flex flex-col gap-3">
        <Messages state={state} />
        <Button variant="danger" onClick={() => setConfirming(true)} className="self-start">
          Deactivate account
        </Button>
      </div>
    );
  }
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-[20px] border border-error-border p-4"
      aria-labelledby="deactivate-title"
      noValidate
    >
      <h3 id="deactivate-title" className="text-[20px] font-bold">
        Deactivate {account.name}?
      </h3>
      <p className="text-[15px] leading-[22px] text-on-surface-variant">
        They won&apos;t be able to sign in and are signed out everywhere. You can reactivate the account later.
      </p>
      <input type="hidden" name="accountId" value={account.id} />
      <input type="hidden" name="active" value="no" />
      <Messages state={state} />
      <TextArea label="Reason (required)" name="reason" error={state.fieldErrors?.reason} />
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" variant="danger" inactive={pending}>
          Deactivate
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-sm leading-5 text-on-surface-variant">
        There are no lessons to affect yet: bookings arrive with scheduling (Phase 3). What happens to a deactivated
        teacher’s lessons is still to be decided (D-45).
      </p>
    </form>
  );
}

export function DecisionForm({
  teacherId,
  name,
  allowApprove = true,
  allowChanges,
}: {
  teacherId: string;
  name: string;
  allowApprove?: boolean;
  allowChanges: boolean;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(decideTeacherAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="teacherId" value={teacherId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextArea
        label="Decision note (required)"
        name="note"
        error={state.fieldErrors?.note}
        hint="Stored with the decision. The teacher sees it if you ask for changes."
      />
      <div className="flex flex-wrap gap-2.5">
        {allowApprove ? (
          <Button type="submit" name="decision" value="approve" inactive={pending} aria-label={`Approve ${name}`}>
            Approve
          </Button>
        ) : null}
        {allowChanges ? (
          <Button type="submit" name="decision" value="changes" variant="secondary" inactive={pending}>
            Request changes
          </Button>
        ) : null}
        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="danger"
          inactive={pending}
          aria-label={`Reject ${name}`}
        >
          Reject
        </Button>
      </div>
    </form>
  );
}

/** OC-73: an approved teacher's subject/grade change. */
export function ProfileChangeForm({ teacherId, name }: { teacherId: string; name: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(decideProfileChangeAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="teacherId" value={teacherId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextArea
        label="Decision note (required)"
        name="note"
        error={state.fieldErrors?.note}
        hint="Stored with the decision. The teacher sees it on their profile page."
      />
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="submit"
          name="decision"
          value="approve"
          inactive={pending}
          aria-label={`Accept the change for ${name}`}
        >
          Accept change
        </Button>
        <Button
          type="submit"
          name="decision"
          value="decline"
          variant="secondary"
          inactive={pending}
          aria-label={`Decline the change for ${name}`}
        >
          Decline change
        </Button>
      </div>
    </form>
  );
}

/** PR-D1b: approve or decline a teacher photo (OC-85). */
export function PhotoDecisionForm({ photoId, name }: { photoId: string; name: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(decidePhotoAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="photoId" value={photoId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextArea
        label="Note for the teacher (required to decline)"
        name="note"
        error={state.fieldErrors?.note}
        hint="The teacher sees it on their profile page. Stored with the decision."
      />
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="submit"
          name="decision"
          value="approve"
          inactive={pending}
          aria-label={`Approve the photo of ${name}`}
        >
          Approve photo
        </Button>
        <Button
          type="submit"
          name="decision"
          value="decline"
          variant="secondary"
          inactive={pending}
          aria-label={`Decline the photo of ${name}`}
        >
          Decline photo
        </Button>
      </div>
    </form>
  );
}
