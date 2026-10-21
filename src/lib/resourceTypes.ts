/** Type labels for teacher-shared files (CR-17 PR 4, migration 0027). Matches the database list. */
export const RESOURCE_TYPE_LABEL = {
  notes: 'Notes',
  worksheet: 'Worksheet',
  slides: 'Slides',
  other: 'Other',
} as const;
export type ResourceTypeId = keyof typeof RESOURCE_TYPE_LABEL;
export const RESOURCE_TYPE_OPTIONS = Object.entries(RESOURCE_TYPE_LABEL) as ReadonlyArray<readonly [string, string]>;
