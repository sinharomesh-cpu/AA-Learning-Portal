import type { SymbolName } from '@/components/icons/Icon';
import type { SubjectId } from '@/fixtures/subjects';

/** One icon per subject, used wherever a subject is shown with an icon (design's outlined set). */
export const SUBJECT_ICONS: Record<SubjectId, SymbolName> = {
  maths: 'calculate',
  science: 'science',
  sst: 'public',
  english: 'menu_book',
  hindi: 'translate',
  it: 'computer',
};
