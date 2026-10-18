'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FileUploadField } from '@/components/files/FileUploadField';
import { FormMessage } from '@/components/forms/FormMessage';
import { TextField } from '@/components/TextField';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import {
  archiveAction,
  editResourceAction,
  type ResourceFormState,
  shareMoreAction,
  shareResourceAction,
  unshareAction,
} from './actions';

export interface StudentOption {
  studentId: string;
  name: string;
  grade: number | null;
  subjects: SubjectId[];
}

const SELECT =
  'box-border min-h-[52px] w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 text-base font-medium text-on-surface';
const AREA =
  'box-border min-h-24 w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest px-4 py-3 text-base text-on-surface';

function StudentChecks({ students, subject }: { students: StudentOption[]; subject: SubjectId | '' }) {
  const linked = subject ? students.filter((s) => s.subjects.includes(subject)) : [];
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-sm font-bold leading-5">Share with</legend>
      {linked.length ? (
        <div className="flex flex-wrap gap-2">
          {linked.map((s) => (
            <label
              key={s.studentId}
              className="flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 border-outline bg-surface-container-lowest px-4 has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40"
            >
              <input type="checkbox" name="studentIds" value={s.studentId} className="h-5 w-5 accent-primary" />
              {s.name}
              {s.grade ? ` · Grade ${s.grade}` : ''}
            </label>
          ))}
        </div>
      ) : null}
      <span className="text-sm leading-5 text-on-surface-variant">
        {subject
          ? `Students linked to you for ${SUBJECTS[subject].name}. Others don't appear.`
          : 'Choose a subject first.'}
      </span>
    </fieldset>
  );
}

/** Board HW2: upload a file and share it with linked students in one step. */
export function ShareForm({ students }: { students: StudentOption[] }) {
  const [state, action, pending] = useActionState<ResourceFormState, FormData>(shareResourceAction, {});
  const subjects = [...new Set(students.flatMap((s) => s.subjects))] as SubjectId[];
  const [subject, setSubject] = useState<SubjectId | ''>(subjects.length === 1 ? subjects[0]! : '');
  const [title, setTitle] = useState('');
  const [formKey, setFormKey] = useState(0);
  const titleId = useId();
  const seen = useRef<number | undefined>(undefined);

  useEffect(() => {
    // After a successful share, start a fresh form (the upload is used up).
    if (state.at && state.at !== seen.current) {
      seen.current = state.at;
      setTitle('');
      setFormKey((k) => k + 1);
    }
  }, [state.at]);

  return (
    <form key={formKey} action={action} className="flex flex-col gap-4">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <FileUploadField
        name="upload"
        label="File"
        hint="PDF, JPG, PNG, WebP or HEIC (iPhone photos), up to 20 MB. Photos are turned into a standard image and camera and location details are removed."
        onReady={(file) => {
          if (file && !title) setTitle(file.name.replace(/\.[^.]*$/, '').slice(0, 120));
        }}
      />
      <TextField
        label="Title"
        name="title"
        maxLength={120}
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${titleId}-subject`} className="text-sm font-bold leading-5">
            Subject
          </label>
          <select
            id={`${titleId}-subject`}
            name="subject"
            className={SELECT}
            value={subject}
            aria-describedby={`${titleId}-subject-hint`}
            onChange={(e) => setSubject(e.target.value as SubjectId | '')}
          >
            <option value="">Choose a subject</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {SUBJECTS[s].name}
              </option>
            ))}
          </select>
          <span id={`${titleId}-subject-hint`} className="text-sm leading-5 text-on-surface-variant">
            Only subjects a parent ticked for at least one of your students.
          </span>
        </div>
        <TextField
          label="Chapter (optional)"
          name="chapter"
          maxLength={120}
          hint="Typed by you, as the student's book names it."
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${titleId}-note`} className="text-sm font-bold leading-5">
          Note for students (optional)
        </label>
        <textarea id={`${titleId}-note`} name="note" maxLength={1000} className={AREA} />
      </div>
      <StudentChecks students={students} subject={subject} />
      <div>
        <Button type="submit" inactive={pending}>
          {pending ? 'Sharing…' : 'Share'}
        </Button>
      </div>
    </form>
  );
}

function useResult(action: (s: ResourceFormState, fd: FormData) => Promise<ResourceFormState>) {
  return useActionState<ResourceFormState, FormData>(action, {});
}

function Result({ state }: { state: ResourceFormState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.notice) return <FormMessage tone="success">{state.notice}</FormMessage>;
  return null;
}

/** Rename, chapter and note for one resource. */
export function EditResource({
  resourceId,
  title,
  chapter,
  note,
}: {
  resourceId: string;
  title: string;
  chapter: string | null;
  note: string | null;
}) {
  const [state, action, pending] = useResult(editResourceAction);
  const id = useId();
  return (
    <details className="rounded-[16px] border border-card-border bg-surface-container-low px-4 py-2">
      <summary className="min-h-11 cursor-pointer py-2 font-bold">Edit title, chapter or note</summary>
      <form action={action} className="flex flex-col gap-3 pb-3 pt-1">
        <input type="hidden" name="resourceId" value={resourceId} />
        <Result state={state} />
        <TextField label="Title" name="title" maxLength={120} required defaultValue={title} />
        <TextField label="Chapter (optional)" name="chapter" maxLength={120} defaultValue={chapter ?? ''} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-sm font-bold leading-5">
            Note for students (optional)
          </label>
          <textarea id={`${id}-note`} name="note" maxLength={1000} defaultValue={note ?? ''} className={AREA} />
        </div>
        <div>
          <Button type="submit" variant="secondary" inactive={pending}>
            Save changes
          </Button>
        </div>
      </form>
    </details>
  );
}

/** "Stop sharing" for one student, with a confirmation. */
export function StopSharing({ resourceId, studentId, name }: { resourceId: string; studentId: string; name: string }) {
  const [state, action, pending] = useResult(unshareAction);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="resourceId" value={resourceId} />
      <input type="hidden" name="studentId" value={studentId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <Button type="button" variant="secondary" inactive={pending} onClick={() => setOpen(true)}>
        Stop sharing with {name}
      </Button>
      <ConfirmDialog
        open={open}
        title={`Stop sharing with ${name}?`}
        confirmLabel="Stop sharing"
        cancelLabel="Keep sharing"
        tone="danger"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        {name} and their parents will no longer see this file.
      </ConfirmDialog>
    </form>
  );
}

/** Share an existing resource with more linked students in its subject. */
export function ShareMore({ resourceId, options }: { resourceId: string; options: StudentOption[] }) {
  const [state, action, pending] = useResult(shareMoreAction);
  if (options.length === 0) return null;
  return (
    <details className="rounded-[16px] border border-card-border bg-surface-container-low px-4 py-2">
      <summary className="min-h-11 cursor-pointer py-2 font-bold">Share with more students</summary>
      <form action={action} className="flex flex-col gap-3 pb-3 pt-1">
        <input type="hidden" name="resourceId" value={resourceId} />
        <Result state={state} />
        <div className="flex flex-wrap gap-2">
          {options.map((s) => (
            <label
              key={s.studentId}
              className="flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 border-outline bg-surface-container-lowest px-4"
            >
              <input type="checkbox" name="studentIds" value={s.studentId} className="h-5 w-5 accent-primary" />
              {s.name}
            </label>
          ))}
        </div>
        <div>
          <Button type="submit" variant="secondary" inactive={pending}>
            Share
          </Button>
        </div>
      </form>
    </details>
  );
}

/** Delete (kept 30 days) or restore. */
export function ArchiveButton({
  resourceId,
  title,
  restore,
}: {
  resourceId: string;
  title: string;
  restore?: boolean;
}) {
  const [state, action, pending] = useResult(archiveAction);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="resourceId" value={resourceId} />
      {restore ? <input type="hidden" name="restore" value="1" /> : null}
      <Result state={state} />
      {restore ? (
        <Button type="submit" variant="secondary" inactive={pending}>
          Restore
        </Button>
      ) : (
        <>
          <Button type="button" variant="danger" inactive={pending} onClick={() => setOpen(true)}>
            Delete
          </Button>
          <ConfirmDialog
            open={open}
            title={`Delete “${title}”?`}
            confirmLabel="Delete"
            cancelLabel="Keep it"
            tone="danger"
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              setOpen(false);
              form.current?.requestSubmit();
            }}
          >
            Students and parents will no longer see it. You can restore it for 30 days; then it is removed for good.
          </ConfirmDialog>
        </>
      )}
    </form>
  );
}
