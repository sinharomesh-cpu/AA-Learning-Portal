'use client';

import { useActionState, useRef, useState } from 'react';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { type PhotoFormState, removePhotoAction, uploadPhotoAction } from './actions';

/** Keep uploads under the server's limit: shrink in the browser before sending (the server re-checks). */
const SEND_MAX_BYTES = 850 * 1024;
const SEND_MAX_SIDE = 1200;

async function shrink(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, SEND_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SEND_MAX_BYTES) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
}

/**
 * PR-D1b: optional profile photo (OC-84, OC-85). The AA Pro team checks every photo before
 * families or visitors can see it; the teacher sees their own photo at once.
 */
export function PhotoForm({
  initial,
  approvedId,
  pending,
  declined,
}: {
  initial: string;
  approvedId: string | null;
  pending: { id: string; since: string } | null;
  declined: { note: string | null; on: string } | null;
}) {
  const [upState, upload, uploading] = useActionState<PhotoFormState, FormData>(uploadPhotoAction, {});
  const [rmState, remove, removing] = useActionState<PhotoFormState, FormData>(removePhotoAction, {});
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const shown = pending?.id ?? approvedId;
  const state = (rmState.at ?? 0) > (upState.at ?? 0) ? rmState : upState;

  const onPick = async () => {
    const el = input.current;
    const file = el?.files?.[0];
    if (!el || !file) return;
    setPreparing(true);
    try {
      const small = await shrink(file);
      if (small !== file && typeof DataTransfer === 'function') {
        const dt = new DataTransfer();
        dt.items.add(small);
        el.files = dt.files;
      }
    } catch {
      // The server explains if the file cannot be used.
    } finally {
      setPreparing(false);
    }
  };

  return (
    <section aria-labelledby="tp-photo" className={SHELL}>
      <PanelHead id="tp-photo" title="Profile photo (optional)" />
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start gap-5">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, uncached image from our own route
            <img
              src={`/teacher-photo/${shown}`}
              alt={pending ? 'Your new photo, waiting for review' : 'Your profile photo'}
              width={112}
              height={112}
              className="size-28 flex-none rounded-[22px] border border-card-border object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-28 flex-none items-center justify-center rounded-[22px] bg-primary-fixed font-headline text-[44px] font-extrabold text-on-primary-fixed"
            >
              {initial}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-[15px] leading-[22px]">
            {pending ? (
              <FormMessage tone="info">
                Waiting for the AA Pro team since {pending.since}.{' '}
                {approvedId
                  ? 'Families keep seeing your current approved photo until then.'
                  : 'Until then families see your initial.'}
              </FormMessage>
            ) : approvedId ? (
              <FormMessage tone="success">Approved by the AA Pro team.</FormMessage>
            ) : (
              <p className="text-on-surface-variant">No photo. Families see your initial.</p>
            )}
            {declined && !pending ? (
              <FormMessage tone="warning">
                Your last photo was not accepted on {declined.on}.
                {declined.note ? ` Note from AA Pro: ${declined.note}` : ''}
              </FormMessage>
            ) : null}
            <ul className="m-0 list-disc pl-5 text-on-surface-variant">
              <li>A clear, recent photo of you only — no children, other people, text or contact details.</li>
              <li>The AA Pro team checks every photo before families can see it.</li>
              <li>We shrink it to 400 × 400 and remove hidden details such as location.</li>
            </ul>
          </div>
        </div>
        {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
        {state.notice ? <FormMessage tone="success">{state.notice}</FormMessage> : null}
        <form action={upload} className="flex flex-col gap-3" noValidate>
          <label htmlFor="tp-photo-file" className="text-sm font-bold leading-5">
            Choose a photo (JPG, PNG or WebP)
          </label>
          <input
            ref={input}
            id="tp-photo-file"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="max-w-full rounded-[16px] border-2 border-outline bg-surface-container-lowest p-3 text-base file:mr-3 file:rounded-full file:border-0 file:bg-primary-fixed file:px-4 file:py-2 file:font-bold file:text-on-primary-fixed"
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" inactive={uploading || preparing}>
              {uploading ? 'Sending…' : preparing ? 'Preparing…' : 'Send photo for review'}
            </Button>
          </div>
        </form>
        {shown ? (
          <form action={remove}>
            <Button type="submit" variant="secondary" inactive={removing}>
              {removing ? 'Removing…' : 'Remove my photo'}
            </Button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
