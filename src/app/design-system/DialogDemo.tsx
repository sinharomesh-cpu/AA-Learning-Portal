'use client';

import { useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export function DialogDemo() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="danger" onClick={() => setOpen(true)}>
        End class
      </Button>
      <p role="status" className="text-sm text-on-surface-variant">
        {result ?? 'No choice made yet.'}
      </p>
      <ConfirmDialog
        open={open}
        title="End the class now?"
        confirmLabel="End class"
        cancelLabel="Keep learning"
        tone="danger"
        onConfirm={() => {
          setOpen(false);
          setResult('You chose: End class.');
        }}
        onCancel={() => {
          setOpen(false);
          setResult('You chose: Keep learning.');
        }}
      >
        You can book another lesson later.
      </ConfirmDialog>
    </div>
  );
}
