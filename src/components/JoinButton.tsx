import { Button } from './Button';

interface JoinButtonProps {
  className?: string;
  /** Teachers see "Start opens before the lesson" (board P21); children see the default. */
  label?: string;
  size?: 'md' | 'child';
}

/**
 * CMP-JoinButton, Phase 1 state only. The join window is undecided (D-35) and no meeting
 * links exist yet (FR-020.2, R-06), so the button is always shown as not yet available
 * and never reveals a meeting ID, link or time.
 */
export function JoinButton({ className, label = 'Join opens before start', size = 'child' }: JoinButtonProps) {
  return (
    <Button size={size} inactive className={className}>
      {label}
    </Button>
  );
}
