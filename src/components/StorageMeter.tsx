import { formatMb } from '@/lib/storage';
import { cx } from '@/lib/cx';

interface StorageMeterProps {
  usedBytes: number;
  limitBytes: number;
  uploadsToday: number;
  uploadsPerDay: number;
  /** Shown under the numbers, e.g. the sample-data note in the demo. */
  note?: string;
}

/**
 * "85 MB of 200 MB used" (OC-96). The words carry the meaning; the bar only repeats them, so it
 * is hidden from screen readers.
 */
export function StorageMeter({ usedBytes, limitBytes, uploadsToday, uploadsPerDay, note }: StorageMeterProps) {
  const share = limitBytes > 0 ? Math.min(1, usedBytes / limitBytes) : 1;
  const near = share >= 0.75;
  const full = share >= 0.99;
  return (
    <section
      aria-labelledby="storage-meter"
      data-testid="storage-meter"
      className="flex flex-col gap-2 rounded-[16px] border border-card-border bg-surface-container-low px-4 py-3"
    >
      <h2 id="storage-meter" className="text-sm font-bold leading-5">
        Your file storage
      </h2>
      <p className="m-0 text-[15px] leading-6">
        <strong data-testid="storage-used">
          {formatMb(usedBytes)} of {formatMb(limitBytes)} used
        </strong>
        <span className="text-on-surface-variant">
          {' '}
          · {uploadsToday} of {uploadsPerDay} uploads in the last 24 hours
        </span>
      </p>
      <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={cx('h-full rounded-full', full ? 'bg-error' : near ? 'bg-secondary' : 'bg-primary')}
          style={{ width: `${Math.max(share * 100, usedBytes > 0 ? 2 : 0)}%` }}
        />
      </div>
      {full || near ? (
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          {full
            ? 'Your storage is full. Remove files you no longer need to add new ones.'
            : 'Your storage is nearly full. Remove files you no longer need to make space.'}
        </p>
      ) : null}
      <p className="m-0 text-xs leading-4 text-on-surface-variant">
        {note ?? 'These limits apply while AA Pro is being tested.'}
      </p>
    </section>
  );
}
