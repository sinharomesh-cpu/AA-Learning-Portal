'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Button, LinkButton } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { type LessonFormState, shareMaterialAction, unavailableMaterialAction } from './actions';

function Result({ state }: { state: LessonFormState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  return null;
}

export interface ShareChoice {
  bookId: string;
  title: string;
  chapters: Array<{ id: string; label: string }>;
}

/**
 * TL-2: answer a teacher's material request. Share a book or chapter the teacher can already view
 * (only those are listed), upload a new book through the unchanged My books flow and come back, or
 * say it isn't available (optional note).
 */
export function MaterialAnswerForm({
  requestId,
  label,
  choices,
  noneText,
}: {
  requestId: string;
  /** What is asked, and for which lesson, for accessible names and the dialog. */
  label: string;
  choices: ShareChoice[];
  /** Shown when no book can be shared yet. */
  noneText: string;
}) {
  const [shareState, share, sharing] = useActionState<LessonFormState, FormData>(shareMaterialAction, {});
  const [noState, notAvailable, saying] = useActionState<LessonFormState, FormData>(unavailableMaterialAction, {});
  const [open, setOpen] = useState(false);
  const noForm = useRef<HTMLFormElement>(null);
  const selectId = useId();
  const noFormId = useId();
  const noteId = useId();
  return (
    <div className="flex flex-col gap-2" data-testid="answer-material">
      {choices.length ? (
        <form action={share} className="flex w-full max-w-[460px] flex-col gap-2">
          <input type="hidden" name="requestId" value={requestId} />
          <label htmlFor={selectId} className="text-sm font-bold">
            Share from your books
          </label>
          <select id={selectId} name="material" required className={INPUT} defaultValue="">
            <option value="" disabled>
              Choose a book or chapter
            </option>
            {choices.map((b) => (
              <optgroup key={b.bookId} label={b.title}>
                <option value={b.bookId}>Whole book: {b.title}</option>
                {b.chapters.map((c) => (
                  <option key={c.id} value={`${b.bookId}|${c.id}`}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Result state={shareState} />
          <Button type="submit" inactive={sharing} aria-label={`Share: ${label}`} className="self-start">
            Share
          </Button>
        </form>
      ) : (
        <p className="m-0 text-sm leading-5 text-on-surface-variant">{noneText}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/parent/content/books/new" variant="secondary" aria-label={`Upload a new book for: ${label}`}>
          Upload a new book
        </LinkButton>
        <form ref={noForm} id={noFormId} action={notAvailable}>
          <input type="hidden" name="requestId" value={requestId} />
          <Button
            type="button"
            variant="secondary"
            inactive={saying}
            onClick={() => setOpen(true)}
            aria-label={`Not available: ${label}`}
          >
            Not available
          </Button>
        </form>
      </div>
      <p className="m-0 text-sm leading-5 text-on-surface-variant">
        After uploading, publish the book for your child in this subject, then come back here to share it.
      </p>
      <Result state={noState} />
      <ConfirmDialog
        open={open}
        title="Say this isn’t available?"
        confirmLabel="Not available"
        cancelLabel="Go back"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          noForm.current?.requestSubmit();
        }}
      >
        <span className="flex flex-col gap-2">
          <span>{label}. The teacher is told in AA Pro. The lesson doesn’t change.</span>
          <label htmlFor={noteId} className="text-sm font-bold text-on-surface">
            Note for the teacher (optional)
          </label>
          <textarea id={noteId} form={noFormId} name="note" maxLength={300} rows={2} className={cx(INPUT, 'py-2')} />
        </span>
      </ConfirmDialog>
    </div>
  );
}
