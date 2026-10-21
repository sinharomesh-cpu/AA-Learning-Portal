'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfDocLike } from '@/lib/bookChapters';

/**
 * pdf.js in the browser only (CR-17 PR B1, B-2): loaded when a parent picks a PDF or a reader
 * opens a book, never on the server. Scripts inside PDFs are never run (this build has no
 * scripting, and pdf.js 6 no longer evaluates code for fonts), XFA forms are off, and nothing is
 * fetched from outside AA Pro (the worker is bundled with the app). The "legacy" build is used:
 * the main build needs JavaScript features that many school tablets and older phones lack.
 */
let lib: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

function pdfjs() {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
    if (!m.GlobalWorkerOptions.workerPort) {
      m.GlobalWorkerOptions.workerPort = new Worker(
        new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url),
        {
          type: 'module',
        },
      );
    }
    return m;
  });
  return lib;
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  // A copy: pdf.js takes ownership of the buffer it is given.
  return m.getDocument({
    data: new Uint8Array(data.slice(0)),
    enableXfa: false,
    stopAtErrors: false,
  }).promise;
}

/** The slice of the document used by the chapter suggestions. */
export function asDocLike(doc: PDFDocumentProxy): PdfDocLike {
  return {
    numPages: doc.numPages,
    getOutline: () => doc.getOutline() as unknown as ReturnType<PdfDocLike['getOutline']>,
    getDestination: (id) => doc.getDestination(id) as unknown as Promise<unknown[] | null>,
    getPageIndex: (ref) => doc.getPageIndex(ref as never),
    getPageLabels: () => doc.getPageLabels(),
    getPage: (n) => doc.getPage(n) as unknown as ReturnType<PdfDocLike['getPage']>,
  };
}

/** True when the first pages have readable text (a "real" PDF rather than scanned pictures). */
export async function hasText(doc: PDFDocumentProxy, pages = 5): Promise<boolean> {
  for (let n = 1; n <= Math.min(pages, doc.numPages); n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    if (content.items.some((it) => 'str' in it && it.str.trim().length > 0)) return true;
  }
  return false;
}

/** The drawing in progress on each canvas: pdf.js refuses two at once on the same canvas. */
const drawing = new WeakMap<HTMLCanvasElement, { cancel: () => void; done: Promise<unknown> }>();

/**
 * Draws one page into a canvas, fitting the given CSS width. A drawing already running on the
 * canvas (a quick page turn, or React running an effect twice in development) is cancelled and
 * awaited first. Returns a function that cancels this drawing.
 */
export async function drawPage(
  doc: PDFDocumentProxy,
  n: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  zoom = 1,
) {
  const before = drawing.get(canvas);
  if (before) {
    before.cancel();
    await before.done.catch(() => {});
  }
  let cancelled = false;
  let cancelTask = () => {};
  const done = (async () => {
    const page = await doc.getPage(n);
    if (cancelled) return;
    const base = page.getViewport({ scale: 1 });
    const scale = (cssWidth / base.width) * zoom;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: scale * ratio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    const task = page.render({ canvas, viewport });
    cancelTask = () => task.cancel();
    await task.promise;
  })();
  const entry = {
    cancel: () => {
      cancelled = true;
      cancelTask();
    },
    done,
  };
  drawing.set(canvas, entry);
  done
    .catch(() => {})
    .finally(() => {
      if (drawing.get(canvas) === entry) drawing.delete(canvas);
    });
  return entry.cancel;
}
