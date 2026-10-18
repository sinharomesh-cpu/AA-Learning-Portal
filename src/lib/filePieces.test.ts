import { FILE_MAX_BYTES, formatFileSize, PIECE_BYTES, pieceRanges, uploadProblemText } from './filePieces';

/** CR-07 H-2a: pieces stay under the free host's 4.5 MB request limit. */
describe('pieceRanges', () => {
  it('covers the whole file with pieces of at most 3 MB', () => {
    expect(PIECE_BYTES).toBeLessThan(4.5 * 1024 * 1024 - 64 * 1024);
    const ranges = pieceRanges(FILE_MAX_BYTES);
    expect(ranges).toHaveLength(7);
    expect(ranges[0]).toEqual([0, PIECE_BYTES]);
    expect(ranges.at(-1)![1]).toBe(FILE_MAX_BYTES);
    expect(pieceRanges(10)).toEqual([[0, 10]]);
  });

  it('formats sizes and explains problems', () => {
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1.3 MB');
    expect(formatFileSize(860 * 1024)).toBe('860 KB');
    expect(uploadProblemText('too_big')).toContain('20 MB');
    expect(uploadProblemText('weird')).toContain('Check your connection');
  });
});
