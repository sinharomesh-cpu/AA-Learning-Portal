// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { FILE_MAX_BYTES, IMAGE_MAX_SIDE, prepareFile } from '@/server/files/prepare';

/**
 * V-5 (CR-17 PR B1, B-7): how much one page photo takes once stored. A reproducible stand-in for a
 * phone photo of a printed page: 12 megapixels (4032 × 3024), off-white paper lit unevenly, rows
 * of dark text, light sensor noise, saved as a JPEG as a phone would. Real photos vary; this
 * gives a repeatable figure for the storage estimate, not a promise.
 */
async function pagePhoto(seed: number, format: 'jpeg' | 'png' = 'jpeg'): Promise<Buffer> {
  const w = 3024;
  const h = 4032;
  const lines = Array.from({ length: 46 }, (_, i) => {
    const y = 300 + i * 80;
    const len = 1800 + ((i * 7919 + seed * 104729) % 700);
    // Words as dark blocks of varying width, like printed text seen from a distance.
    let x = 260;
    let words = '';
    while (x < 260 + len) {
      const wordW = 60 + ((x * 31 + i * 17 + seed) % 160);
      words += `<rect x="${x}" y="${y}" width="${wordW}" height="34" rx="6" fill="#262626"/>`;
      x += wordW + 34;
    }
    return words;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><radialGradient id="light" cx="40%" cy="35%" r="80%">
      <stop offset="0" stop-color="#f4f1e8"/><stop offset="1" stop-color="#cfc8b6"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#light)"/>${lines}</svg>`;
  const base = sharp(Buffer.from(svg)).rotate(1.5, { background: '#bdb6a4' }).resize(w, h, { fit: 'cover' });
  const noise = await sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: '#808080',
      noise: { type: 'gaussian', mean: 128, sigma: 7 },
    },
  })
    .png()
    .toBuffer();
  const photo = base.composite([{ input: noise, blend: 'soft-light' }]);
  return format === 'jpeg' ? photo.jpeg({ quality: 92 }).toBuffer() : photo.png().toBuffer();
}

describe('V-5: stored size of a page photo', () => {
  it('a 12-megapixel page photo is stored as a JPEG of at most 2,400 px, well under 1.5 MB', async () => {
    const sizes: Array<{ input: number; stored: number }> = [];
    for (const seed of [1, 2, 3]) {
      const input = await pagePhoto(seed);
      const r = await prepareFile(new Uint8Array(input), 'IMG_0001.jpg');
      if (!r.ok) throw new Error(r.problem);
      const meta = await sharp(r.body).metadata();
      expect(r.mediaType).toBe('image/jpeg');
      expect(Math.max(meta.width!, meta.height!)).toBe(IMAGE_MAX_SIDE);
      expect(meta.exif).toBeUndefined();
      sizes.push({ input: input.length, stored: r.body.length });
    }
    for (const s of sizes) {
      expect(s.stored).toBeLessThan(1.5 * 1024 * 1024);
      expect(s.stored).toBeLessThan(s.input);
    }
    // 30 such photos (B-9) stay far below one family's 200 MB.
    const thirty = 30 * Math.max(...sizes.map((s) => s.stored));
    expect(thirty).toBeLessThan(45 * 1024 * 1024);
    // V5_REPORT=1 prints the measured sizes (used for the storage estimate).
    if (process.env.V5_REPORT) console.warn('V5', JSON.stringify(sizes));
  }, 120_000);

  it('a photo over 20 MB is refused before any conversion', async () => {
    const r = await prepareFile(new Uint8Array(FILE_MAX_BYTES + 1), 'big.jpg');
    expect(r).toEqual({ ok: false, problem: 'too_big' });
  });
});
