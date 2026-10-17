import { type FormEvent, startTransition } from 'react';

/**
 * React resets a form after its action finishes. For forms whose fields are controlled by state
 * (a live preview, rows the user adds), that reset makes the page and the submitted values
 * disagree on the next submit. This submit handler sends the same data without the reset; the
 * form's `action` still works when JavaScript is off.
 */
export function keepValuesOnSubmit(action: (fd: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const fd = new FormData(event.currentTarget, submitter ?? undefined);
    startTransition(() => action(fd));
  };
}
