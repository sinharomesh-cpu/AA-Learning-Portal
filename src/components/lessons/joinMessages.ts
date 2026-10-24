/**
 * What a page says when Join Class sent someone back (CR-17 PR 3): the server re-checked the
 * lesson at the moment of the click and Join could not open. `?join=` on the page's address.
 */
export type JoinRefusal = 'not_open' | 'ended' | 'not_allowed' | 'no_link';

const ADULT: Record<JoinRefusal, string> = {
  not_open: 'Join Class opens 10 minutes before the lesson starts.',
  ended: 'That lesson has ended, so Join Class is closed.',
  not_allowed: 'Join Class can’t open: a parent hasn’t allowed this teacher’s meeting links for the child.',
  no_link: 'Join Class can’t open yet: the teacher hasn’t added the meeting link.',
};

const CHILD: Record<JoinRefusal, string> = {
  not_open: 'Join opens 10 minutes before your lesson.',
  ended: 'That lesson has ended.',
  not_allowed: 'Your teacher’s class link isn’t ready yet. Ask your parent.',
  no_link: 'Your teacher’s class link isn’t ready yet.',
};

export function joinRefusalText(raw: unknown, child = false): string | null {
  if (typeof raw !== 'string' || !(raw in ADULT)) return null;
  return (child ? CHILD : ADULT)[raw as JoinRefusal];
}
