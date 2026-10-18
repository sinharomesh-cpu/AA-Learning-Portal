'use client';

import { useEffect, useState } from 'react';
import { formatFileSize } from '@/lib/filePieces';

interface FileViewerProps {
  fileId: string;
  fileName: string;
  mediaType: string;
  byteSize: number;
  pieces: number;
}

type State = { kind: 'loading'; done: number } | { kind: 'ready'; url: string } | { kind: 'error' };

/**
 * Shows a private file of any allowed size (CR-07 H-2a). The free host returns at most 4.5 MB
 * per request, so the file is fetched in pieces and joined in the browser; nothing is cached.
 */
export function FileViewer({ fileId, fileName, mediaType, byteSize, pieces }: FileViewerProps) {
  const [state, setState] = useState<State>({ kind: 'loading', done: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const parts: ArrayBuffer[] = [];
        for (let i = 0; i < pieces; i += 1) {
          const res = await fetch(`/files/${fileId}?piece=${i}`, { cache: 'no-store' });
          if (!res.ok) throw new Error('piece');
          parts.push(await res.arrayBuffer());
          if (cancelled) return;
          setState({ kind: 'loading', done: i + 1 });
        }
        url = URL.createObjectURL(new Blob(parts, { type: mediaType }));
        if (!cancelled) setState({ kind: 'ready', url });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId, mediaType, pieces, attempt]);

  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-[16px] border border-error-border bg-error-container p-4 text-on-error-container"
      >
        <p className="m-0">This file could not be opened. Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => {
            setState({ kind: 'loading', done: 0 });
            setAttempt((a) => a + 1);
          }}
          className="min-h-12 rounded-full border-2 border-outline bg-surface-container-lowest px-5 font-bold text-on-surface"
        >
          Try again
        </button>
      </div>
    );
  }
  if (state.kind === 'loading') {
    return (
      <p aria-live="polite" className="m-0 text-[15px] leading-6">
        Opening {fileName} ({formatFileSize(byteSize)})… {Math.round((state.done / pieces) * 100)}%
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <a
        href={state.url}
        download={fileName}
        data-testid="file-download"
        className="inline-flex min-h-12 items-center justify-center self-start rounded-full border-2 border-primary bg-primary px-[22px] font-bold text-on-primary no-underline"
      >
        Download {fileName}
      </a>
      {mediaType === 'application/pdf' ? (
        <iframe
          title={fileName}
          src={state.url}
          className="h-[75vh] w-full rounded-[16px] border border-card-border bg-surface-container-lowest"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a private blob, not an optimisable image
        <img
          src={state.url}
          alt={fileName}
          data-testid="file-image"
          className="h-auto max-w-full self-start rounded-[16px] border border-card-border"
        />
      )}
    </div>
  );
}
