import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { NO_LONGER_AVAILABLE } from '@/server/notifications/queries';

/**
 * CR-16 §8, D-8: where the open step sends a user whose access to a notification's record has
 * ended. It says only "This is no longer available to you." — nothing about the record: no
 * title, contents, names or identifiers, in the page or the address.
 */
export function AccessEnded({
  homeHref,
  homeLabel,
  child = false,
}: {
  homeHref: string;
  homeLabel: string;
  child?: boolean;
}) {
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <Card className="flex flex-col items-start gap-4">
        <h1 className="text-[24px] font-bold leading-8" data-testid="access-ended">
          {NO_LONGER_AVAILABLE}
        </h1>
        <LinkButton href={homeHref} size={child ? 'child' : 'md'}>
          {homeLabel}
        </LinkButton>
      </Card>
    </div>
  );
}
