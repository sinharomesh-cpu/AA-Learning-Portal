import { LinkButton } from '../Button';
import { EmptyState } from './States';

interface NotReadyYetProps {
  title: string;
  /** Plain-language reason, written for the role that sees it. */
  body: string;
  homeHref?: string;
  homeLabel?: string;
  child?: boolean;
}

/** Honest placeholder for a section that a later work package or phase delivers. */
export function NotReadyYet({ title, body, homeHref, homeLabel, child = false }: NotReadyYetProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">{title}</h1>
      <EmptyState
        title="Not ready yet"
        action={
          homeHref && homeLabel ? (
            <LinkButton href={homeHref} size={child ? 'child' : 'md'}>
              {homeLabel}
            </LinkButton>
          ) : undefined
        }
      >
        {body}
      </EmptyState>
    </div>
  );
}
