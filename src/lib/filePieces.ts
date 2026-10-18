/** Shared by the browser upload and download helpers (CR-07 H-2a). Mirrors the server values. */
export const PIECE_BYTES = 3 * 1024 * 1024;
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*';

/** "1.2 MB", "860 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Splits a size into piece ranges [start, end). */
export function pieceRanges(size: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < size; start += PIECE_BYTES) ranges.push([start, Math.min(size, start + PIECE_BYTES)]);
  return ranges;
}

const UPLOAD_PROBLEM: Record<string, string> = {
  too_big: 'This file is too large. Files can be up to 20 MB.',
  busy: 'Several uploads are still running. Wait for them to finish, then try again.',
  storage_full:
    "New files can't be added right now because AA Pro's test storage is nearly full. Nothing you have already added is affected.",
  not_allowed: 'Your account cannot upload files here.',
  invalid: 'The upload went wrong. Please choose the file again.',
};

export function uploadProblemText(reason: string): string {
  return UPLOAD_PROBLEM[reason] ?? 'The upload stopped. Check your connection and try again.';
}
