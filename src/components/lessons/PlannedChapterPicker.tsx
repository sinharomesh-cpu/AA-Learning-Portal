'use client';

import { useId, useState } from 'react';
import { INPUT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';

export interface PlannableOption {
  id: string;
  /** "Book · number. title", as written by the parent (OC-63: never invented). */
  label: string;
}

/**
 * TL-3 (D-E2E-2, D-E2E-3 (b), WF-10): the teacher's optional planned chapters, from books they can
 * already view, at most `max`, each with an optional intent. Sends checkboxes named "planned" and
 * selects named "intent-<chapter id>"; the server and the database check them again. Never a
 * free-text topic or message (TL3-2).
 */
export function PlannedChapterPicker({
  chapters,
  max,
  childName,
  subjectName,
}: {
  chapters: PlannableOption[];
  max: number;
  childName: string;
  subjectName: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const helpId = useId();
  if (chapters.length === 0) {
    return (
      <p className="m-0 text-sm leading-5 text-on-surface-variant" data-testid="no-plannable-chapters">
        No {subjectName} book of {childName}’s is shared with you yet, so there are no chapters to plan. You can ask the
        parent for material once the lesson is proposed.
      </p>
    );
  }
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={helpId}>
      <legend className="mb-1 text-[15px] font-bold">Planned chapters (optional)</legend>
      <p id={helpId} className="m-0 text-sm leading-5 text-on-surface-variant">
        Up to {max} {max === 1 ? 'chapter' : 'chapters'} from {childName}’s {subjectName} books shared with you. For
        each, you can say whether it is new, a continuation or a revision. The family sees your plan.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Chapters you can plan">
        {chapters.map((c) => {
          const on = picked.includes(c.id);
          const blocked = !on && picked.length >= max;
          return (
            <li
              key={c.id}
              className={cx(
                'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] border border-card-border px-4 py-2',
                blocked && 'opacity-60',
              )}
            >
              <label
                className={cx(
                  'flex min-h-12 grow items-center gap-3',
                  blocked ? 'cursor-not-allowed' : 'cursor-pointer',
                )}
              >
                <input
                  type="checkbox"
                  name="planned"
                  value={c.id}
                  checked={on}
                  disabled={blocked}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                  className="h-[22px] w-[22px] shrink-0 accent-primary"
                />
                <span className="break-words text-[15px] leading-[22px]">{c.label}</span>
              </label>
              {on ? (
                <select
                  name={`intent-${c.id}`}
                  defaultValue=""
                  aria-label={`Intent for ${c.label}`}
                  className={cx(INPUT, 'min-h-12 w-auto')}
                >
                  <option value="">No intent</option>
                  <option value="new">New</option>
                  <option value="continue">Continue</option>
                  <option value="revise">Revise</option>
                </select>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-sm leading-5 text-on-surface-variant" aria-live="polite">
        {picked.length} of {max} chosen.
      </p>
    </fieldset>
  );
}
