'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { MESSAGE_MAX, REQUEST_DAYS } from '@/lib/linkRequests';
import {
  addFromDirectoryAction,
  addTeacherAction,
  removeTeacherAction,
  resendRequestAction,
  type TeacherFormState,
  updateLinksAction,
  withdrawRequestAction,
} from './actions';

/** TR1: optional message to the teacher (Reading B), with the privacy hint. */
function MessageField({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold leading-5">
        Message to the teacher (optional)
      </label>
      <textarea
        id={id}
        name="message"
        maxLength={MESSAGE_MAX}
        defaultValue={defaultValue ?? ''}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={error ? true : undefined}
        className="box-border min-h-24 w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 py-3 text-base text-on-surface"
      />
      <span id={`${id}-hint`} className="text-sm leading-5 text-on-surface-variant">
        Up to {MESSAGE_MAX} characters. Please don&apos;t include phone numbers, emails, addresses or your
        children&apos;s names: the teacher sees names only after accepting.
      </span>
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-sm font-bold leading-5 text-on-error-container">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** TR1 "What happens next". */
export function RequestSteps() {
  return (
    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[22px]">
      <li>
        The teacher gets one request <strong>for each child</strong> you tick.
      </li>
      <li>
        Before answering they see only each child&apos;s grade and curriculum, the subjects, your first name and your
        message. <strong>Not</strong> your children&apos;s names, books or homework.
      </li>
      <li>
        They have <strong>{REQUEST_DAYS} days</strong> to accept or decline. You can withdraw a request while it waits.
      </li>
      <li>If they accept, they work with that child in those subjects only.</li>
    </ul>
  );
}

/** Boards 57 and 58: choose children and, for each, the subjects this teacher teaches (OC-41). */
export interface PickableChild {
  id: string;
  name: string;
  grade: number;
  subjects: string[];
}

function ChildSubjectPicker({
  kids,
  initial,
  error,
}: {
  kids: PickableChild[];
  initial: Record<string, string[]>;
  error?: string;
}) {
  const [picks, setPicks] = useState<Record<string, string[]>>(initial);
  const toggleChild = (id: string, on: boolean) =>
    setPicks((p) => {
      const next = { ...p };
      if (on) next[id] = next[id] ?? [];
      else delete next[id];
      return next;
    });
  const toggleSubject = (id: string, s: string, on: boolean) =>
    setPicks((p) => ({ ...p, [id]: on ? [...(p[id] ?? []), s] : (p[id] ?? []).filter((x) => x !== s) }));
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" aria-describedby={error ? 'pick-error' : undefined}>
      <legend className="mb-1 p-0 text-sm font-bold leading-5">
        Which children, and which subjects will this teacher teach?
      </legend>
      <p className="text-sm leading-5 text-on-surface-variant">
        The teacher will see only these children and subjects, and can read the books you upload for them. Tick all
        subjects if they teach everything.
      </p>
      {kids.map((k) => {
        const on = k.id in picks;
        return (
          <div
            key={k.id}
            className={cx(
              'flex flex-col gap-3 rounded-[20px] border-2 p-4',
              on ? 'border-primary bg-primary-fixed/20' : 'border-card-border',
            )}
          >
            <label className="flex items-center gap-3 text-[17px] font-bold">
              <input
                type="checkbox"
                name="child"
                value={k.id}
                disabled={k.subjects.length === 0}
                checked={on}
                onChange={(e) => toggleChild(k.id, e.target.checked)}
                className="h-[22px] w-[22px] accent-primary"
              />
              {k.name} · Grade {k.grade}
            </label>
            {on ? (
              <div role="group" aria-label={`Subjects for ${k.name}`} className="flex flex-wrap gap-2">
                {k.subjects.map((s) => (
                  <label
                    key={s}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-outline bg-surface-container-lowest px-3.5 text-sm font-bold has-[:checked]:border-primary has-[:checked]:bg-primary-fixed has-[:checked]:text-on-primary-fixed has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
                  >
                    <input
                      type="checkbox"
                      name={`subjects:${k.id}`}
                      value={s}
                      checked={(picks[k.id] ?? []).includes(s)}
                      onChange={(e) => toggleSubject(k.id, s, e.target.checked)}
                      className="h-[18px] w-[18px] accent-primary"
                    />
                    {SUBJECTS[s as SubjectId]?.name ?? s}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => setPicks((p) => ({ ...p, [k.id]: [...k.subjects] }))}
                  className="inline-flex min-h-11 items-center rounded-full border-2 border-outline bg-surface-container-lowest px-3.5 text-sm font-bold"
                >
                  Tick all
                </button>
              </div>
            ) : (
              <p className="text-sm leading-5 text-on-surface-variant">
                {k.subjects.length === 0
                  ? `No subjects in common: this teacher doesn't teach any of ${k.name}'s subjects.`
                  : `Tick ${k.name} to choose subjects.`}
              </p>
            )}
            {on ? (
              <p className="text-sm leading-5 text-on-surface-variant">Only {k.name}&apos;s subjects are shown.</p>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <span id="pick-error" role="alert" className="text-sm font-bold leading-5 text-on-error-container">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

export function AddTeacherForm({ kids }: { kids: PickableChild[] }) {
  const [state, action, pending] = useActionState<TeacherFormState, FormData>(addTeacherAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="flex max-w-[760px] flex-col gap-5">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Card className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="Teacher's name"
            name="name"
            autoComplete="off"
            maxLength={80}
            defaultValue={state.values?.name ?? ''}
            error={e.name}
          />
          <TextField
            label="Teacher's email"
            name="email"
            type="email"
            autoComplete="off"
            maxLength={254}
            defaultValue={state.values?.email ?? ''}
            error={e.email}
          />
        </div>
        <ChildSubjectPicker
          key={state.at ?? 0}
          kids={kids}
          initial={state.values?.picks ?? (kids.length === 1 ? { [kids[0]!.id]: [] } : {})}
          error={e.children}
        />
        <MessageField key={`m${state.at ?? 0}`} defaultValue={state.values?.message} error={e.message} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" inactive={pending}>
            {pending ? 'Sending…' : 'Send request'}
          </Button>
          <LinkButton href="/parent/teachers" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </Card>
    </form>
  );
}

/** Board 65 → board 58 checklist for a teacher picked from the directory (C-1 option (a)). */
export function DirectoryAddForm({ teacherId, kids }: { teacherId: string; kids: PickableChild[] }) {
  const [state, action, pending] = useActionState<TeacherFormState, FormData>(addFromDirectoryAction, {});
  const usable = kids.filter((k) => k.subjects.length > 0);
  return (
    <form action={action} noValidate className="flex max-w-[760px] flex-col gap-5">
      <input type="hidden" name="teacherId" value={teacherId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Card className="flex flex-col gap-5 p-4 sm:p-6">
        <ChildSubjectPicker
          key={state.at ?? 0}
          kids={kids}
          initial={state.values?.picks ?? (usable.length === 1 ? { [usable[0]!.id]: [] } : {})}
          error={state.fieldErrors?.children}
        />
        <MessageField
          key={`m${state.at ?? 0}`}
          defaultValue={state.values?.message}
          error={state.fieldErrors?.message}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" inactive={pending}>
            {pending ? 'Sending…' : 'Send request'}
          </Button>
          <LinkButton href="/parent/teachers/find" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </Card>
    </form>
  );
}

export function ChangeLinksForm({
  teacherId,
  kids,
  initial,
}: {
  teacherId: string;
  kids: PickableChild[];
  initial: Record<string, string[]>;
}) {
  const [state, action, pending] = useActionState<TeacherFormState, FormData>(updateLinksAction, {});
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="teacherId" value={teacherId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <ChildSubjectPicker
        key={state.at ?? 0}
        kids={kids}
        initial={state.values?.picks ?? initial}
        error={state.fieldErrors?.children}
      />
      <p className="text-sm leading-5 text-on-surface-variant">
        Changes apply straight away. Unticking a child or subject stops the teacher seeing it at once, and withdraws a
        waiting request. A child you tick for the first time becomes a new request that the teacher accepts or declines.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" inactive={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        <LinkButton href="/parent/teachers" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

/** "Remove teacher", "Cancel request" or "Remove from list", always confirmed first (board 57). */
export function RemoveTeacherButton({
  teacherId,
  label,
  title,
  body,
  confirmLabel,
}: {
  teacherId: string;
  label: string;
  title: string;
  body: string;
  confirmLabel: string;
}) {
  const [state, action, pending] = useActionState<TeacherFormState, FormData>(removeTeacherAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="teacherId" value={teacherId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="button" variant="danger" inactive={pending} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        confirmLabel={confirmLabel}
        cancelLabel="Keep teacher"
        tone="danger"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        {body}
      </ConfirmDialog>
    </form>
  );
}

/** TR2 "Withdraw request", confirmed first. */
export function WithdrawRequestButton({
  requestId,
  teacher,
  child,
}: {
  requestId: string;
  teacher: string;
  child: string;
}) {
  const [state, action, pending] = useActionState<TeacherFormState, FormData>(withdrawRequestAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="button" variant="secondary" inactive={pending} onClick={() => setOpen(true)}>
        Withdraw request
      </Button>
      <ConfirmDialog
        open={open}
        title={`Withdraw the request for ${child}?`}
        confirmLabel="Withdraw"
        cancelLabel="Keep waiting"
        tone="danger"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        {teacher} will no longer be able to accept it. You can send a new request at any time.
      </ConfirmDialog>
    </form>
  );
}

/** TR2 "Send again" for an expired, withdrawn or (after the wait) declined request. */
export function SendAgainButton({ requestId, primary }: { requestId: string; primary?: boolean }) {
  const [state, action, pending] = useActionState<TeacherFormState, FormData>(resendRequestAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="submit" variant={primary ? 'primary' : 'secondary'} inactive={pending}>
        {pending ? 'Sending…' : 'Send again'}
      </Button>
    </form>
  );
}
