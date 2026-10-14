/** FRD v1.1 FR-003.2 initial subject catalogue. */
export const SUBJECT_IDS = ['maths', 'science', 'sst', 'english', 'hindi', 'it'] as const;
export type SubjectId = (typeof SUBJECT_IDS)[number];

export const SUBJECTS: Record<SubjectId, { name: string; abbr: string; tile: string }> = {
  maths: { name: 'Maths', abbr: 'Ma', tile: 'bg-primary-fixed text-on-primary-fixed-variant' },
  science: { name: 'Science', abbr: 'Sc', tile: 'bg-success-container text-on-tertiary-fixed-variant' },
  sst: { name: 'SST', abbr: 'SS', tile: 'bg-secondary-fixed text-on-secondary-fixed-variant' },
  english: { name: 'English', abbr: 'En', tile: 'bg-surface-container text-on-surface-variant' },
  hindi: { name: 'Hindi', abbr: 'Hi', tile: 'bg-error-container text-on-error-container' },
  it: { name: 'IT', abbr: 'IT', tile: 'bg-surface-container-high text-on-surface' },
};
