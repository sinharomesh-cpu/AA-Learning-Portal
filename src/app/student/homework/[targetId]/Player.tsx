'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import type { Response } from '@/lib/homeworkMarking';
import type { PlayerQuestion } from '@/server/assignments';
import { saveAnswersAction, submitAction, type SubmitState } from '../actions';

/**
 * Board HW6: the child answers on screen. Saves as they go (a moment after each change); Submit
 * asks for confirmation and is final unless the teacher asks for a revision. 56 px targets.
 */

const BIG = 'min-h-14 text-[18px]';
const OPTION =
  'flex min-h-14 cursor-pointer items-center gap-3 rounded-[18px] border-2 border-outline bg-surface-container-lowest px-4 text-[18px] has-[:checked]:border-primary has-[:checked]:bg-primary-fixed/40 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-primary';

function QuestionInput({
  q,
  value,
  onChange,
  missing,
}: {
  q: PlayerQuestion;
  value: Response | null;
  onChange: (r: Response) => void;
  missing: boolean;
}) {
  const n = q.index + 1;
  const name = `q${n}`;
  return (
    <li
      className={cx(
        'flex flex-col gap-4 rounded-[24px] border bg-surface-container-lowest p-5',
        missing ? 'border-2 border-error' : 'border-card-border',
      )}
      aria-labelledby={`${name}-label`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-bold text-on-surface-variant">Question {n}</span>
        <span className="text-[15px] font-bold text-on-surface-variant">
          {q.points} {q.points === 1 ? 'mark' : 'marks'}
        </span>
      </div>
      {missing ? <p className="m-0 text-[15px] font-bold text-on-error-container">Answer this one, please.</p> : null}
      {q.type === 'fill_blank' ? (
        <p id={`${name}-label`} className="m-0 text-[20px] leading-[44px]">
          {(q.parts ?? []).map((p, i, all) => (
            <span key={i}>
              {p}
              {i < all.length - 1 ? (
                <input
                  aria-label={`Question ${n}, blank ${i + 1}`}
                  maxLength={100}
                  value={((value?.blanks as string[] | undefined) ?? [])[i] ?? ''}
                  onChange={(e) => {
                    const blanks = [...(((value?.blanks as string[] | undefined) ?? []) as string[])];
                    while (blanks.length < all.length - 1) blanks.push('');
                    blanks[i] = e.target.value;
                    onChange({ blanks });
                  }}
                  className={cx(
                    INPUT.replace('w-full', ''),
                    'mx-1 inline-block min-h-12 w-44 align-middle text-[18px]',
                  )}
                />
              ) : null}
            </span>
          ))}
        </p>
      ) : (
        <p id={`${name}-label`} className="m-0 whitespace-pre-line text-[20px] leading-8">
          {q.prompt}
        </p>
      )}

      {q.type === 'single_choice' ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only">Question {n}: choose one answer</legend>
          {(q.options ?? []).map((o, i) => (
            <label key={i} className={OPTION}>
              <input
                type="radio"
                name={name}
                className="size-6 accent-primary"
                checked={value?.choice === i}
                onChange={() => onChange({ choice: i })}
              />
              {o}
            </label>
          ))}
        </fieldset>
      ) : null}
      {q.type === 'multi_select' ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-[15px] text-on-surface-variant">Tick every correct answer.</legend>
          {(q.options ?? []).map((o, i) => {
            const chosen = (value?.choices as number[] | undefined) ?? [];
            return (
              <label key={i} className={OPTION}>
                <input
                  type="checkbox"
                  className="size-6 accent-primary"
                  checked={chosen.includes(i)}
                  onChange={(e) =>
                    onChange({ choices: e.target.checked ? [...chosen, i] : chosen.filter((c) => c !== i) })
                  }
                />
                {o}
              </label>
            );
          })}
        </fieldset>
      ) : null}
      {q.type === 'true_false' ? (
        <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
          <legend className="sr-only">Question {n}: true or false</legend>
          {([true, false] as const).map((v) => (
            <label key={String(v)} className={cx(OPTION, 'min-w-32 justify-center font-bold')}>
              <input
                type="radio"
                name={name}
                className="size-6 accent-primary"
                checked={value?.value === v}
                onChange={() => onChange({ value: v })}
              />
              {v ? 'True' : 'False'}
            </label>
          ))}
        </fieldset>
      ) : null}
      {q.type === 'matching' ? (
        <div className="flex flex-col gap-3">
          {(q.left ?? []).map((l, i) => {
            const chosen = (value?.choices as Array<string | null> | undefined) ?? [];
            return (
              <div key={i} className="grid items-center gap-2 sm:grid-cols-2">
                <span className="rounded-[14px] bg-surface-container-low px-4 py-3 text-[18px]">{l}</span>
                <select
                  aria-label={`Match for ${l}`}
                  value={chosen[i] ?? ''}
                  onChange={(e) => {
                    const next = [...chosen];
                    while (next.length < (q.left ?? []).length) next.push(null);
                    next[i] = e.target.value || null;
                    onChange({ choices: next });
                  }}
                  className={cx(INPUT, BIG)}
                >
                  <option value="">Choose…</option>
                  {(q.right ?? []).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      ) : null}
      {q.type === 'short_answer' ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            aria-label={`Question ${n}, your answer`}
            maxLength={q.maxLength}
            value={(value?.text as string | undefined) ?? ''}
            onChange={(e) => onChange({ text: e.target.value })}
            className={cx(INPUT, 'min-h-32 py-3 text-[18px]')}
          />
          <span className="text-sm text-on-surface-variant">
            {((value?.text as string | undefined) ?? '').length} of {q.maxLength} characters
          </span>
        </div>
      ) : null}
    </li>
  );
}

export function Player({ targetId, questions }: { targetId: string; questions: PlayerQuestion[] }) {
  const [answers, setAnswers] = useState<Array<Response | null>>(() => questions.map((q) => q.answer));
  const [saveNote, setSaveNote] = useState<string>('Your answers are saved as you go.');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const [state, submit, pending] = useActionState<SubmitState, FormData>(submitAction, {});
  const [confirm, setConfirm] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(answers);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flush = () =>
    startSave(async () => {
      const r = await saveAnswersAction(targetId, latest.current);
      if (r.ok) {
        setSaveError(null);
        setSaveNote('Saved.');
      } else setSaveError(r.message);
    });

  const change = (i: number, r: Response) => {
    const next = answers.map((a, j) => (j === i ? r : a));
    setAnswers(next);
    latest.current = next;
    setSaveNote('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  const missing = new Set(state.missing ?? []);
  return (
    <div className="flex flex-col gap-5">
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {questions.map((q, i) => (
          <QuestionInput
            key={i}
            q={q}
            value={answers[i] ?? null}
            missing={missing.has(i)}
            onChange={(r) => change(i, r)}
          />
        ))}
      </ol>
      <p className="m-0 text-[15px] text-on-surface-variant" role="status" aria-live="polite">
        {saveNote}
      </p>
      {saveError ? <FormMessage tone="error">{saveError}</FormMessage> : null}
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <form ref={form} action={submit}>
        <input type="hidden" name="targetId" value={targetId} />
        <Button
          size="child"
          inactive={pending}
          onClick={async () => {
            if (timer.current) {
              clearTimeout(timer.current);
              timer.current = null;
            }
            const r = await saveAnswersAction(targetId, latest.current);
            if (!r.ok) {
              setSaveError(r.message);
              return;
            }
            setConfirm(true);
          }}
        >
          {pending ? 'Handing in…' : 'Hand in my homework'}
        </Button>
        <ConfirmDialog
          open={confirm}
          title="Hand in your homework?"
          confirmLabel="Yes, hand it in"
          cancelLabel="Not yet"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            form.current?.requestSubmit();
          }}
        >
          After you hand it in, you can’t change your answers unless your teacher asks you to.
        </ConfirmDialog>
      </form>
    </div>
  );
}
