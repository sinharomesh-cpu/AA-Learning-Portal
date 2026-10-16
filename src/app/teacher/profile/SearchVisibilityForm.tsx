'use client';

import { useActionState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { setSearchVisibilityAction, type VisibilityFormState } from './actions';

/**
 * OC-54: a teacher can hide from the parents' teacher directory (board 65). Hiding never removes
 * existing links, and a parent who knows the teacher's email can still add them (OC-36).
 */
export function SearchVisibilityForm({ hidden, approved }: { hidden: boolean; approved: boolean }) {
  const [state, action, pending] = useActionState<VisibilityFormState, FormData>(setSearchVisibilityAction, {});
  return (
    <Card as="section" aria-labelledby="vis-h" className="flex flex-col gap-3 p-4 sm:p-6">
      <h2 id="vis-h" className="text-[20px] font-bold leading-7">
        Find a teacher
      </h2>
      <p className="text-[15px] leading-[22px]" id="vis-state">
        {hidden
          ? 'You are hidden. Parents can’t find you when they search for a teacher.'
          : approved
            ? 'Parents can find you when they search for a teacher. They see your name, subjects, grades, time zone and bio — never your email.'
            : 'Once you are approved, parents can find you when they search for a teacher. They see your name, subjects, grades, time zone and bio — never your email.'}
      </p>
      <p className="text-sm leading-5 text-on-surface-variant">
        Hiding doesn&apos;t affect families who already added you, and a parent who knows your email can still add you.
      </p>
      {state.notice ? (
        <FormMessage tone="success" key={state.at}>
          {state.notice}
        </FormMessage>
      ) : null}
      <form action={action}>
        <input type="hidden" name="hidden" value={hidden ? 'no' : 'yes'} />
        <Button type="submit" variant="secondary" inactive={pending} aria-describedby="vis-state">
          {hidden ? 'Show me in search' : 'Hide me from search'}
        </Button>
      </form>
    </Card>
  );
}
