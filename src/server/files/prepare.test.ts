// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { FILE_MAX_BYTES, fileKind, IMAGE_MAX_SIDE, prepareFile, safeFileName } from './prepare';
import { fileResponse, notFoundResponse } from './response';
import type { FileMeta } from './store';

/** CR-07 H-1 upload checks (tests T-F2, T-F4, T-F5, T-F6). Synthetic files only. */

const heic = readFileSync(fileURLToPath(new URL('../../../tests/fixtures/files/synthetic-blue.heic', import.meta.url)));

const pdf = (body = '1 0 obj << /Type /Catalog >> endobj') =>
  Buffer.from(`%PDF-1.4\n${body}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, 'latin1');

async function photoWithLocation(): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'SyntheticCam', Model: 'Test 1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '77/1 35/1 0/1' },
    })
    .toBuffer();
}

describe('the real type comes from the contents (T-F4)', () => {
  it('recognises each accepted signature', async () => {
    expect(fileKind(pdf())).toBe('pdf');
    expect(
      fileKind(
        await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000' } })
          .png()
          .toBuffer(),
      ),
    ).toBe('png');
    expect(
      fileKind(
        await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000' } })
          .webp()
          .toBuffer(),
      ),
    ).toBe('webp');
    expect(fileKind(await photoWithLocation())).toBe('jpeg');
    expect(fileKind(heic)).toBe('heic');
  });

  it('refuses a mislabelled file whatever its name says', async () => {
    const script = Buffer.from('<html><script>alert(1)</script></html>');
    expect(fileKind(script)).toBeNull();
    expect(await prepareFile(script, 'homework.jpg')).toEqual({ ok: false, problem: 'type' });
    expect(await prepareFile(Buffer.from('MZ\x90\x00 not a pdf'), 'notes.pdf')).toEqual({ ok: false, problem: 'type' });
  });

  it('refuses empty and over-size files', async () => {
    expect(await prepareFile(new Uint8Array(0), 'a.pdf')).toEqual({ ok: false, problem: 'empty' });
    const huge = Buffer.alloc(FILE_MAX_BYTES + 1);
    huge.write('%PDF-1.4');
    expect(await prepareFile(huge, 'big.pdf')).toEqual({ ok: false, problem: 'too_big' });
  });
});

describe('photos are re-encoded without metadata (T-F5)', () => {
  it('removes location and camera details from a JPEG', async () => {
    const before = await sharp(await photoWithLocation()).metadata();
    expect(before.exif).toBeDefined();
    const r = await prepareFile(await photoWithLocation(), 'page1.jpeg');
    if (!r.ok) throw new Error(r.problem);
    expect(r.mediaType).toBe('image/jpeg');
    const after = await sharp(r.body).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(r.body.includes(Buffer.from('SyntheticCam'))).toBe(false);
    expect(r.fileName).toBe('page1.jpg');
  });

  it('shrinks very large pictures to a readable size', async () => {
    const big = await sharp({ create: { width: 5000, height: 2000, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const r = await prepareFile(big, 'scan.png');
    if (!r.ok) throw new Error(r.problem);
    const meta = await sharp(r.body).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(IMAGE_MAX_SIDE);
  });

  it('refuses a broken picture', async () => {
    const good = await photoWithLocation();
    expect(await prepareFile(good.subarray(0, 200), 'cut.jpg')).toEqual({ ok: false, problem: 'unreadable' });
  });
});

describe('phone uploads, including iPhone HEIC (T-F6, OC-90 Q-4)', () => {
  it('converts HEIC to a viewable JPEG with the right name', async () => {
    const r = await prepareFile(heic, 'IMG_0042.HEIC');
    if (!r.ok) throw new Error(r.problem);
    expect(r.mediaType).toBe('image/jpeg');
    expect(r.fileName).toBe('IMG_0042.jpg');
    const meta = await sharp(r.body).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 320, height: 240 });
    // The synthetic photo is blue with a yellow box in the middle; the colours survive.
    const { data } = await sharp(r.body)
      .extract({ left: 10, top: 10, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[2]).toBeGreaterThan(150);
  });

  it('a damaged HEIC gets the "could not be opened" message', async () => {
    expect(await prepareFile(heic.subarray(0, 120), 'IMG_1.heic')).toEqual({ ok: false, problem: 'unreadable' });
  });
});

describe('PDFs', () => {
  it('keeps a complete PDF unchanged', async () => {
    const r = await prepareFile(pdf(), 'Worksheet 3.pdf');
    expect(r.ok && r.mediaType === 'application/pdf' && r.body.equals(pdf()) && r.fileName).toBe('Worksheet 3.pdf');
  });

  it('refuses a cut-off or password-locked PDF', async () => {
    expect(await prepareFile(pdf().subarray(0, 30), 'cut.pdf')).toEqual({ ok: false, problem: 'unreadable' });
    expect(await prepareFile(pdf('/Encrypt 5 0 R'), 'locked.pdf')).toEqual({ ok: false, problem: 'pdf_locked' });
  });
});

describe('download names', () => {
  it('are short, plain and never a path', () => {
    expect(safeFileName('../../etc/passwd', 'application/pdf')).toBe('passwd.pdf');
    expect(safeFileName('C:\\Users\\x\\My "page".png', 'image/png')).toBe('My page.png');
    expect(safeFileName('', 'image/webp')).toBe('file.webp');
    expect(safeFileName(`${'a'.repeat(300)}.pdf`, 'application/pdf')).toHaveLength(104);
  });
});

describe('file responses (T-F1, T-F2)', () => {
  const meta: FileMeta = {
    id: '00000000-0000-4000-8000-000000000001',
    ownerId: '00000000-0000-4000-8000-000000000002',
    purpose: 'teacher_resource',
    mediaType: 'image/png',
    byteSize: 3,
    fileName: 'Fractions — page 1.png',
  };

  it('are never cached, never sniffed, and pictures cannot run anything', () => {
    const r = fileResponse(meta, Buffer.from([1, 2, 3]), false);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain('sandbox');
    expect(r.headers.get('content-disposition')).toMatch(
      /^inline; filename="Fractions _ page 1.png"; filename\*=UTF-8''/,
    );
  });

  it('download asks the browser to save the file', () => {
    expect(fileResponse(meta, Buffer.from([1]), true).headers.get('content-disposition')).toMatch(/^attachment;/);
  });

  it('every refusal is the same "not found"', async () => {
    const a = notFoundResponse();
    const b = notFoundResponse();
    expect(a.status).toBe(404);
    expect(await a.text()).toBe(await b.text());
    expect([...a.headers.entries()]).toEqual([...b.headers.entries()]);
    expect(a.headers.get('cache-control')).toBe('private, no-store');
  });
});
