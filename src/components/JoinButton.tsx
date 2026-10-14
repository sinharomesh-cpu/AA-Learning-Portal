import { Button } from './Button';

interface JoinButtonProps {
  className?: string;
}

/**
 * CMP-JoinButton, Phase 1 state only. The join window is undecided (D-35) and no meeting
 * links exist yet (FR-020.2, R-06), so the button is always shown as not yet available
 * and never reveals a meeting ID, link or time.
 */
export function JoinButton({ className }: JoinButtonProps) {
  return (
    <Button size="child" inactive className={className}>
      Join opens before start
    </Button>
  );
}
