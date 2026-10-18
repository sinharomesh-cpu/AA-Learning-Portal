'use client';

import { useId, useRef, useState } from 'react';
import { ACCEPTED_FILES, FILE_MAX_BYTES, formatFileSize, pieceRanges, uploadProblemText } from '@/lib/filePieces';
import { cx } from '@/lib/cx';

type State =
  | { kind: 'empty' }
  | { kind: 'sending'; name: string; size: number; done: number }
  | { kind: 'ready'; name: string; size: number; uploadId: string }
  | { kind: 'error'; message: string };

interface FileUploadFieldProps {
  /** Name of the hidden field that carries the finished upload's id to the form. */
  name: string;
  label: string;
  hint?: string;
  /** Called when a file is ready or cleared, e.g. to suggest a title. */
  onReady?: (file: { name: string; size: number } | null) => void;
}

/**
 * Upload box with progress (CR-07 H-2a). The free host accepts at most 4.5 MB per request, so
 * the file is sent in pieces of 3 MB; the server joins and checks it when the form is sent.
 * The server decides whether the file is acceptable; this box only catches the obvious cases.
 */
export function FileUploadField({ name, label, hint, onReady }: FileUploadFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: 'empty' });

  async function send(file: File) {
    if (file.size === 0) return setState({ kind: 'error', message: 'This file is empty. Please choose another file.' });
    if (file.size > FILE_MAX_BYTES) {
      return setState({ kind: 'error', message: 'This file is too large. Files can be up to 20 MB.' });
    }
    const uploadId = crypto.randomUUID();
    const ranges = pieceRanges(file.size);
    setState({ kind: 'sending', name: file.name, size: file.size, done: 0 });
    for (let i = 0; i < ranges.length; i += 1) {
      const [start, end] = ranges[i]!;
      const params = new URLSearchParams({
        upload: uploadId,
        piece: String(i),
        of: String(ranges.length),
        name: file.name,
      });
      let res: Response | null = null;
      // One retry for a dropped connection or a server hiccup; the server replaces a repeated piece.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          res = await fetch(`/files/upload?${params}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-AA-Upload': '1' },
            body: file.slice(start, end),
          });
        } catch {
          res = null;
        }
        if (res && res.status < 500) break;
      }
      if (!res?.ok) {
        const reason = res ? (((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? '') : '';
        setState({ kind: 'error', message: uploadProblemText(reason) });
        onReady?.(null);
        return;
      }
      setState({ kind: 'sending', name: file.name, size: file.size, done: i + 1 });
    }
    setState({ kind: 'ready', name: file.name, size: file.size, uploadId });
    onReady?.({ name: file.name, size: file.size });
  }

  const sending = state.kind === 'sending';
  const total = sending ? pieceRanges(state.size).length : 1;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold leading-5">
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPTED_FILES}
        aria-describedby={`${id}-hint ${id}-status`}
        disabled={sending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
        className={cx(
          'block w-full cursor-pointer rounded-[16px] border-2 border-dashed border-outline bg-surface-container-lowest p-3 text-[15px]',
          'file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-primary file:px-5 file:font-bold file:text-on-primary',
        )}
      />
      {hint ? (
        <span id={`${id}-hint`} className="text-sm leading-5 text-on-surface-variant">
          {hint}
        </span>
      ) : null}
      <input type="hidden" name={name} value={state.kind === 'ready' ? state.uploadId : ''} />
      <div id={`${id}-status`} aria-live="polite" className="text-[15px] leading-6">
        {sending ? (
          <span className="flex flex-col gap-1">
            <span>
              Sending {state.name}… {Math.round((state.done / total) * 100)}%
            </span>
            <progress
              max={total}
              value={state.done}
              aria-label={`Sending ${state.name}`}
              className="h-2 w-full accent-primary"
            />
          </span>
        ) : state.kind === 'ready' ? (
          <span data-testid="upload-ready">
            <strong>{state.name}</strong> · {formatFileSize(state.size)} · ready
          </span>
        ) : state.kind === 'error' ? (
          <span role="alert" className="font-bold text-on-error-container">
            {state.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
