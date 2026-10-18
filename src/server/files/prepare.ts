import 'server-only';
import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';

/**
 * Upload checks for the private file store (CR-07 H-1; OC-90 Q-4).
 *
 * - The type is decided from the file's first bytes, never from its name or the browser's word.
 * - Photos and pictures are re-encoded on the server. Re-encoding drops every piece of metadata
 *   (location, camera, date) and anything hidden after the picture.
 * - iPhone HEIC/HEIF photos are converted to JPEG, so every viewer can open them.
 * - PDFs are kept as they are, after checking they are complete and not password-locked.
 */

export const FILE_MAX_BYTES = 20 * 1024 * 1024;
/** Pictures larger than this many pixels are refused ("decompression bombs"). */
const MAX_INPUT_PIXELS = 50_000_000;
/** Long side of a stored picture (FR-021.8); enough to read a handwritten page when zoomed. */
export const IMAGE_MAX_SIDE = 2400;

export type FileKind = 'pdf' | 'jpeg' | 'png' | 'webp' | 'heic';
export type StoredMediaType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
export type FileProblem = 'empty' | 'too_big' | 'type' | 'unreadable' | 'pdf_locked';

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/** The real type of a file from its signature, or null if it is not one AA Pro accepts. */
export function fileKind(bytes: Uint8Array): FileKind | null {
  const b = bytes;
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-') return 'pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(b, 8, 12))) return 'heic';
  return null;
}

const EXTENSION: Record<StoredMediaType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** A safe, short download name with the extension of the stored type ("IMG_0042.HEIC" → "IMG_0042.jpg"). */
export function safeFileName(original: string | null | undefined, mediaType: StoredMediaType): string {
  const base = (original ?? '').split(/[/\\]/).pop() ?? '';
  const stem = base
    .replace(/\.[^.]*$/, '')
    .replace(/[\x00-\x1f\x7f"<>|:*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${stem || 'file'}.${EXTENSION[mediaType]}`;
}

export type Prepared =
  { ok: true; mediaType: StoredMediaType; body: Buffer; fileName: string } | { ok: false; problem: FileProblem };

function checkPdf(bytes: Uint8Array): FileProblem | null {
  // Complete files end with %%EOF (allowing trailing whitespace); a cut-off upload does not.
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString('latin1');
  if (!tail.includes('%%EOF')) return 'unreadable';
  // A password-locked PDF cannot be opened by the child, parent or teacher in the viewer.
  if (Buffer.from(bytes).includes('/Encrypt')) return 'pdf_locked';
  return null;
}

/**
 * Every picture is stored as one viewable format (FR-021.8): JPEG, longest side at most
 * 2,400 px, transparent areas on white.
 */
async function reencode(input: Sharp): Promise<Buffer> {
  return (
    input
      .rotate() // apply the camera's orientation, then forget it
      .resize(IMAGE_MAX_SIDE, IMAGE_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      // No withMetadata(): sharp writes no EXIF, XMP or GPS data unless asked to.
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
  );
}

async function heicToSharp(bytes: Uint8Array): Promise<Sharp | null> {
  const images = await decodeHeic.all({ buffer: bytes });
  try {
    const first = images[0];
    if (!first || first.width < 1 || first.height < 1 || first.width * first.height > MAX_INPUT_PIXELS) return null;
    const { width, height, data } = await first.decode();
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
      limitInputPixels: MAX_INPUT_PIXELS,
    });
  } finally {
    images.dispose();
  }
}

/** Checks an upload and turns it into what is stored. Nothing is stored here. */
export async function prepareFile(bytes: Uint8Array, originalName?: string | null): Promise<Prepared> {
  if (bytes.length === 0) return { ok: false, problem: 'empty' };
  if (bytes.length > FILE_MAX_BYTES) return { ok: false, problem: 'too_big' };
  const kind = fileKind(bytes);
  if (!kind) return { ok: false, problem: 'type' };

  if (kind === 'pdf') {
    const problem = checkPdf(bytes);
    if (problem) return { ok: false, problem };
    return {
      ok: true,
      mediaType: 'application/pdf',
      body: Buffer.from(bytes),
      fileName: safeFileName(originalName, 'application/pdf'),
    };
  }

  try {
    let input: Sharp | null;
    if (kind === 'heic') {
      input = await heicToSharp(bytes);
    } else {
      input = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false });
      const meta = await input.metadata();
      if (!meta.width || !meta.height) input = null;
    }
    if (!input) return { ok: false, problem: 'unreadable' };
    const body = await reencode(input);
    if (body.length === 0 || body.length > FILE_MAX_BYTES) return { ok: false, problem: 'too_big' };
    const mediaType: StoredMediaType = 'image/jpeg';
    return { ok: true, mediaType, body, fileName: safeFileName(originalName, mediaType) };
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
}

/** Words for each problem, for the upload screens (H-2, H-4). */
export const FILE_PROBLEM_TEXT: Record<FileProblem, string> = {
  empty: 'This file is empty. Please choose another file.',
  too_big: 'This file is too large. Files can be up to 20 MB.',
  type: 'This type of file cannot be added. Please use a PDF or a photo (JPEG, PNG, WebP or iPhone HEIC).',
  unreadable: 'This file could not be opened. It may be damaged or incomplete. Please try another copy.',
  pdf_locked: 'This PDF is password-protected. Please remove the password and try again.',
};
