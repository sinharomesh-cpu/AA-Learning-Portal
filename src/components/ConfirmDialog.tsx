'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for destructive confirmations such as ending a class. */
  tone?: Extract<ButtonVariant, 'primary' | 'danger'>;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirmation built on the native <dialog>: the browser traps focus inside it,
 * closes it on Escape and returns focus to the control that opened it.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(480px,calc(100vw-32px))] rounded-md border border-card-border bg-surface-container-lowest p-6 text-on-surface backdrop:bg-on-surface/40"
    >
      <h2 id={titleId} className="text-[22px] font-bold leading-7">
        {title}
      </h2>
      {children ? (
        <div id={bodyId} className="mt-2 text-base leading-6 text-on-surface-variant">
          {children}
        </div>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {cancelLabel}
        </Button>
        <Button variant={tone} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
