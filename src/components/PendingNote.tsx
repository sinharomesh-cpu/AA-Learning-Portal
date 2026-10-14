import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface PendingNoteProps {
  /** Open decision ID from the decision register, e.g. "D-35". */
  decision: string;
  children: ReactNode;
  className?: string;
}

/**
 * Review-build marker for a rule that is still undecided (G1-10 §2). It states what is
 * pending instead of guessing behaviour. Shown in the Phase 1 review build only.
 */
export function PendingNote({ decision, children, className }: PendingNoteProps) {
  return (
    <p
      className={cx(
        'rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container',
        className,
      )}
    >
      <strong>Not decided yet ({decision}):</strong> {children}
    </p>
  );
}
