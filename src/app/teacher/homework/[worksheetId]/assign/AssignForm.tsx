'use client';

import { useActionState, useId, useState } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { INPUT, SHELL } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import type { AssignOptions } from '@/server/assignments';
import { assignAction, type AssignState } from '../../actions';

const FIELD = cx(INPUT, 'min-h-12');
const CHOICE =
  'flex min-h-16 cursor-pointer items-center gap-3 rounded-[20px] border-2 border-outline bg-surface-container-lowest px-4 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/30';
const PILL =
  'flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 border-outline px-4 font-bold has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40';

/** Board W3: assign a Ready worksheet to ONE student (W-2, W-7, W-9, W-10). */
export function AssignForm({ options, today }: { options: AssignOptions; today: string }) {
  const [state, action, pending] = useActionState<AssignState, FormData>(assignAction, {});
  const [studentId, setStudentId] = useState('');
  const [later, setLater] = useState(false);
  const [checked, setChecked] = useState(false);
  const uid = useId();
  const w = options.worksheet;
  const student = options.students.find((s) => s.id === studentId);
  const gradeDiffers = student ? student.grade !== w.grade : false;
  const boardDiffers = student ? (student.board ?? '') !== w.board : false;
  const mismatch = gradeDiffers || boardDiffers;
  const first = student?.name ?? 'the student';

  return (
    <form action={action} className={cx(SHELL, 'flex flex-col gap-6 p-5 sm:p-7')}>
      <input type="hidden" name="worksheetId" value={w.id} />
      <input type="hidden" name="confirmMismatch" value={mismatch && checked ? '1' : ''} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-3 text-[17px] font-bold">1. Choose one student</legend>
        {options.students.length ? (
          options.students.map((s) => (
            <label key={s.id} className={CHOICE}>
              <input
                type="radio"
                name="studentId"
                value={s.id}
                className="size-5 flex-none accent-primary"
                checked={studentId === s.id}
                onChange={() => {
                  setStudentId(s.id);
                  setChecked(false);
                }}
              />
              <span className="flex-1">
                <strong>{s.name}</strong>
                <br />
                <span className="text-sm text-on-surface-variant">
                  {s.grade ? `Grade ${s.grade}` : 'Grade not set'} · {s.board ?? 'Board not set'}
                </span>
              </span>
              {s.copies ? (
                <span className="rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-xs font-bold">
                  Has it already{s.copies > 1 ? ` (${s.copies})` : ''}
                </span>
              ) : null}
            </label>
          ))
        ) : (
          <FormMessage tone="info">
            No child is linked to you for this subject yet. Children appear once a parent links you and ticks it.
          </FormMessage>
        )}
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          Only children whose parent linked you for this subject are listed. To give it to someone else, assign it
          again; each copy is separate.
        </p>
      </fieldset>

      {student && mismatch ? (
        <div
          className="flex flex-col gap-3 rounded-[16px] border border-warning-border bg-warning-container px-4 py-3 text-on-warning-container"
          role="status"
        >
          <p className="m-0 text-[15px] leading-[22px]">
            <strong>
              {gradeDiffers && boardDiffers
                ? 'Grade and board are different.'
                : gradeDiffers
                  ? 'Grade is different.'
                  : 'Board is different.'}
            </strong>{' '}
            This worksheet is labelled Grade {w.grade}, {w.board}; {first}’s profile says{' '}
            {student.grade ? `Grade ${student.grade}` : 'no grade'}, {student.board ?? 'no board'}. You can still assign
            it if it suits {first}.
          </p>
          <label className="flex items-start gap-3 text-[15px]">
            <input
              type="checkbox"
              className="mt-0.5 size-6 flex-none accent-primary"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            I’ve checked it suits {first}
          </label>
        </div>
      ) : null}
      {student && student.copies ? (
        <FormMessage tone="info">
          {first} already has this worksheet. Assigning it again gives a second, separate copy.
        </FormMessage>
      ) : null}

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-3 text-[17px] font-bold">2. When can {first} see it?</legend>
        <div className="flex flex-wrap gap-3">
          <label className={PILL}>
            <input
              type="radio"
              name="when"
              value="now"
              className="size-5 accent-primary"
              checked={!later}
              onChange={() => setLater(false)}
            />
            Today
          </label>
          <label className={PILL}>
            <input
              type="radio"
              name="when"
              value="later"
              className="size-5 accent-primary"
              checked={later}
              onChange={() => setLater(true)}
            />
            On a later date
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {later ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-v`} className="text-sm font-bold">
                Assignment date
              </label>
              <input id={`${uid}-v`} name="visibleOn" type="date" min={today} required className={FIELD} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-d`} className="text-sm font-bold">
              Due date (optional)
            </label>
            <input id={`${uid}-d`} name="dueOn" type="date" min={today} className={FIELD} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-t`} className="text-sm font-bold">
              Due time
            </label>
            <input id={`${uid}-t`} name="dueTime" type="time" defaultValue="18:00" className={FIELD} />
          </div>
        </div>
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          {later
            ? `Hidden from ${first} and their parent until that date. They see a notification in AA Pro the next time they open it on or after that day; AA Pro can’t alert them at a set time.`
            : `${first} sees it under My homework straight away, and their parent is told in AA Pro.`}{' '}
          Dates are in your time zone ({options.timeZone}); each family sees them in theirs.
        </p>
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-3 text-[17px] font-bold">3. When can {first} see marks?</legend>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="radio" name="releaseMode" value="manual" defaultChecked className="size-5 accent-primary" />
          When I release them
        </label>
        {options.worksheet.autoOnly ? (
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input type="radio" name="releaseMode" value="on_marking" className="size-5 accent-primary" />
            As soon as they are marked (every question here is marked automatically)
          </label>
        ) : null}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="showAnswers" value="1" defaultChecked className="size-5 accent-primary" />
          Show correct answers after release
        </label>
      </fieldset>

      <div className="rounded-[18px] bg-surface-container-low px-4 py-3 text-[15px] leading-[22px]">
        <strong>Summary:</strong> one copy for {first} only. Later changes to the library worksheet won’t change it.
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" inactive={pending || !student || (mismatch && !checked)}>
          {pending ? 'Assigning…' : student ? `Assign to ${first}` : 'Assign'}
        </Button>
        <LinkButton href="/teacher/homework" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
