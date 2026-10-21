'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { archiveWorksheetAction, duplicateWorksheetAction, type LibraryState } from './actions';

function Result({ state }: { state: LibraryState }) {
  if (state.error) return <FormMessage tone="error">{state.error}</FormMessage>;
  if (state.notice) return <FormMessage tone="success">{state.notice}</FormMessage>;
  return null;
}

/** "Duplicate" (W1): a new draft copy; nothing is assigned. */
export function DuplicateButton({ worksheetId, title }: { worksheetId: string; title: string }) {
  const [state, action, pending] = useActionState<LibraryState, FormData>(duplicateWorksheetAction, {});
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="worksheetId" value={worksheetId} />
      <Result state={state} />
      <Button type="submit" variant="secondary" inactive={pending} aria-label={`Duplicate ${title}`}>
        Duplicate
      </Button>
    </form>
  );
}

/** "Archive" with a confirmation, or "Restore" (W1). */
export function ArchiveWorksheetButton({
  worksheetId,
  title,
  restore,
}: {
  worksheetId: string;
  title: string;
  restore?: boolean;
}) {
  const [state, action, pending] = useActionState<LibraryState, FormData>(archiveWorksheetAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="worksheetId" value={worksheetId} />
      {restore ? <input type="hidden" name="restore" value="1" /> : null}
      <Result state={state} />
      {restore ? (
        <Button type="submit" variant="secondary" inactive={pending} aria-label={`Restore ${title}`}>
          Restore
        </Button>
      ) : (
        <>
          <Button
            type="button"
            variant="secondary"
            inactive={pending}
            onClick={() => setOpen(true)}
            aria-label={`Archive ${title}`}
          >
            Archive
          </Button>
          <ConfirmDialog
            open={open}
            title={`Archive “${title}”?`}
            confirmLabel="Archive"
            cancelLabel="Keep it"
            onCancel={() => setOpen(false)}
            onConfirm={() => {
              setOpen(false);
              form.current?.requestSubmit();
            }}
          >
            You won’t be able to assign it until you restore it. Students who already have a copy keep it, and you can
            still review their work.
          </ConfirmDialog>
        </>
      )}
    </form>
  );
}
