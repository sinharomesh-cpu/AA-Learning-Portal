'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { DECLINE_NOTE_MAX, DECLINE_REASON_TEXT, DECLINE_REASONS } from '@/lib/linkRequests';
import { acceptRequestAction, declineRequestAction, type RequestFormState } from './actions';

export interface RequestView {
  id: string;
  /** "Child 1": the position in this list. The child's name is shown only after accepting (Reading B). */
  label: string;
  grade: number;
  curriculum: string | null;
  subjects: string[];
  parentFirstName: string;
  message: string | null;
  received: string;
  expires: string;
  daysLeft: number;
}

const subjectNames = (ids: string[]) => ids.map((s) => SUBJECTS[s as SubjectId]?.name ?? s);

/** Board TR3 card with the TR4 accept and decline dialogs. */
export function RequestCard({ r }: { r: RequestView }) {
  const headingId = useId();
  const title = `${r.label} · Grade ${r.grade}${r.curriculum ? ` · ${r.curriculum}` : ''}`;
  return (
    <Card as="article" aria-labelledby={headingId} className="flex h-full flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-[19px] font-bold leading-7">
          {title}
        </h3>
        <StatusChip kind="neutral">
          {r.daysLeft <= 1 ? 'Last day to answer' : `${r.daysLeft} days left to answer`}
        </StatusChip>
      </div>
      <ul aria-label="Subjects requested" className="m-0 flex list-none flex-wrap gap-2 p-0">
        {subjectNames(r.subjects).map((s) => (
          <li key={s}>
            <StatusChip kind="human">{s}</StatusChip>
          </li>
        ))}
      </ul>
      <p className="text-[15px] leading-[22px]">
        Request from <strong>{r.parentFirstName}</strong> (parent) · received {r.received} · expires{' '}
        <strong>{r.expires}</strong>
      </p>
      {r.message ? (
        <blockquote className="m-0 whitespace-pre-line break-words rounded-r-[12px] border-l-4 border-primary-fixed-dim bg-surface-container-low px-3.5 py-2.5 text-[15px] leading-[22px]">
          “{r.message}”
        </blockquote>
      ) : null}
      <div className="mt-auto flex flex-wrap gap-2.5">
        <AcceptButton r={r} title={title} />
        <DeclineButton r={r} title={title} />
      </div>
    </Card>
  );
}

function AcceptButton({ r, title }: { r: RequestView; title: string }) {
  const [state, action, pending] = useActionState<RequestFormState, FormData>(acceptRequestAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const subjects = subjectNames(r.subjects).join(', ');
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={r.id} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="button" inactive={pending} onClick={() => setOpen(true)}>
        {pending ? 'Accepting…' : 'Accept'}
      </Button>
      <ConfirmDialog
        open={open}
        title={`Accept ${title}?`}
        confirmLabel="Accept"
        cancelLabel="Back"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        <p className="m-0">
          You&apos;ll work with this child in <strong>{subjects}</strong>. After accepting you&apos;ll see the
          child&apos;s first name and grade, and the books their parent shared for these subjects (view only). You can
          share resources with them in these subjects.
        </p>
        <p className="mb-0 mt-2 text-sm">Only {subjects}. Other subjects or other children need their own request.</p>
      </ConfirmDialog>
    </form>
  );
}

function DeclineButton({ r, title }: { r: RequestView; title: string }) {
  const [state, action, pending] = useActionState<RequestFormState, FormData>(declineRequestAction, {});
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={r.id} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="button" variant="danger" inactive={pending} onClick={() => setOpen(true)}>
        {pending ? 'Declining…' : 'Decline'}
      </Button>
      <ConfirmDialog
        open={open}
        title={`Decline ${title}?`}
        confirmLabel="Decline"
        cancelLabel="Back"
        tone="danger"
        onCancel={() => {
          setOpen(false);
          setMissing(false);
        }}
        onConfirm={() => {
          const chosen = form.current ? new FormData(form.current).get('reason') : null;
          if (!chosen) {
            setMissing(true);
            return;
          }
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={missing ? `${id}-err` : undefined}>
          <legend className="mb-2 p-0 text-sm font-bold leading-5 text-on-surface">Reason (required)</legend>
          {DECLINE_REASONS.map((reason) => (
            <label
              key={reason}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 text-base text-on-surface has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40"
            >
              <input
                type="radio"
                name="reason"
                value={reason}
                className="h-5 w-5 accent-primary"
                onChange={() => setMissing(false)}
              />
              {DECLINE_REASON_TEXT[reason]}
            </label>
          ))}
          {missing ? (
            <span id={`${id}-err`} role="alert" className="text-sm font-bold leading-5 text-on-error-container">
              Choose a reason.
            </span>
          ) : null}
        </fieldset>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-sm font-bold leading-5 text-on-surface">
            Note to the parent (optional)
          </label>
          <textarea
            id={`${id}-note`}
            name="note"
            maxLength={DECLINE_NOTE_MAX}
            aria-describedby={`${id}-note-hint`}
            className="box-border min-h-20 w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 py-3 text-base text-on-surface"
          />
          <span id={`${id}-note-hint`} className="text-sm leading-5">
            Up to {DECLINE_NOTE_MAX} characters. The parent sees your reason and this note. Please don&apos;t share
            contact details.
          </span>
        </div>
      </ConfirmDialog>
    </form>
  );
}
