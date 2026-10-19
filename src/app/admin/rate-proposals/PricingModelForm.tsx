'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormMessage } from '@/components/forms/FormMessage';
import { pricingModelAction, type RateLimitFormState } from './actions';

/** CR-15 reading 1: the "New pricing model" switch, with a confirmation. */
export function PricingModelForm({ on }: { on: boolean }) {
  const [state, action, pending] = useActionState<RateLimitFormState, FormData>(pricingModelAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="on" value={on ? 'no' : 'yes'} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
      <div>
        <Button type="button" variant={on ? 'secondary' : 'primary'} inactive={pending} onClick={() => setOpen(true)}>
          {on ? 'Turn the new pricing model off' : 'Turn the new pricing model on'}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title={on ? 'Turn the new pricing model off?' : 'Turn the new pricing model on?'}
        confirmLabel={on ? 'Turn off' : 'Turn on'}
        cancelLabel="Back"
        tone={on ? 'danger' : 'primary'}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          form.current?.requestSubmit();
        }}
      >
        {on
          ? 'Teachers stop seeing hourly lessons and packages in their editor. Listings already published with them keep showing what the teacher agreed to until they publish again.'
          : 'Teachers see hourly lessons and a learning package instead of the earlier prices. Only for the test site until the owner approves the release.'}
      </ConfirmDialog>
    </form>
  );
}
