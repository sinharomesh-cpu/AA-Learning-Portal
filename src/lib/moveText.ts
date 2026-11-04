/**
 * TL-4: moving a confirmed lesson, in words (safe on the server and in the browser). One place for
 * every refusal so the parent's and the teacher's screens say the same thing.
 */

/** Why a move can't be started (lessons.moveTarget) or why the swap was refused (the TL-4 SQL). */
export type MoveReason =
  | 'not_found'
  | 'unavailable'
  | 'not_movable'
  | 'too_soon'
  | 'change_open'
  | 'move_unmappable'
  | 'move_limit'
  | 'move_parent_limit'
  | 'original_changed'
  | 'move_drops_requested'
  | 'move_chapters';

export const MOVE_TEXT: Record<MoveReason, string> = {
  not_found: 'That lesson can’t be found, or you can’t change it.',
  unavailable: 'Moving a lesson isn’t available yet. To change the time, cancel the lesson and book a new time.',
  not_movable: 'Only a booked lesson that hasn’t happened yet can be moved.',
  too_soon:
    'This lesson starts too soon to move: a move must be answered at least 30 minutes before the lesson. It stays booked.',
  change_open: 'A move for this lesson is already waiting for an answer. Wait for it, or withdraw it first.',
  move_unmappable:
    'The lesson couldn’t be moved: a material request is about a chapter that isn’t on the new lesson. Nothing changed; the lesson stays at its booked time.',
  move_limit:
    'The lesson couldn’t be moved: the new lesson would have more than 5 open material requests. Nothing changed; the lesson stays at its booked time.',
  move_parent_limit:
    'The lesson couldn’t be moved: it would give a parent more open material requests than allowed. Nothing changed; the lesson stays at its booked time.',
  original_changed: 'The lesson was cancelled or changed meanwhile, so it can’t be moved. Nothing else changed.',
  move_chapters:
    'A moved lesson keeps the chapters it was moved with, so chapters can’t be added when accepting the move. Accept it without chapters. Nothing changed.',
  move_drops_requested:
    'A material request on this lesson is about a chapter you haven’t chosen, so the parents couldn’t accept this move. Add that chapter, or choose no chapters so the lesson’s own chapters move with it. Nothing was sent.',
};

export const isMoveReason = (r: string): r is MoveReason => Object.hasOwn(MOVE_TEXT, r);
