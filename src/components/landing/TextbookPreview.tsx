import { brand } from '@/config/brand';
import { Icon } from '@/components/public/icons';

/**
 * Illustration of the planned textbook reader with the AI Tutor (reference: "Learn from your
 * child's exact school textbooks"). It is labelled as an illustration and uses grey lines
 * instead of textbook text, so it does not invent content or suggest the feature is live.
 */
export function TextbookPreview() {
  return (
    <figure className="m-0 flex flex-col gap-3">
      <div aria-hidden="true" className="pub-card overflow-hidden rounded-lg">
        <div className="flex items-center gap-3 border-b border-card-border px-5 py-3.5">
          <span className="flex gap-1.5">
            <span className="size-3 rounded-full bg-[#ff6b6b]" />
            <span className="size-3 rounded-full bg-[#ffb454]" />
            <span className="size-3 rounded-full bg-[#4edea3]" />
          </span>
          <span className="text-body-sm text-on-surface-variant">Your child&apos;s textbook · Chapter 3</span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-low p-5">
            <span className="text-label-sm uppercase tracking-[.08em] text-primary">PDF page 25</span>
            <span className="h-4 w-3/4 rounded bg-outline-variant" />
            {[100, 92, 96, 70, 88].map((w, i) => (
              <span key={i} className="h-2.5 rounded bg-outline-variant/70" style={{ width: `${w}%` }} />
            ))}
            <span className="mt-1 h-20 rounded-[16px] border-2 border-dashed border-primary/40 bg-primary-fixed/30" />
            {[94, 80].map((w, i) => (
              <span key={i} className="h-2.5 rounded bg-outline-variant/70" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-low p-4">
            <span className="flex items-center gap-2 font-headline text-[14px] font-bold">
              <span className="flex size-7 items-center justify-center rounded-full bg-[var(--pub-violet-bg)] text-[var(--pub-violet)]">
                <Icon name="sparkle" size={14} />
              </span>
              {brand.tutorNameShort}
            </span>
            <span className="self-start rounded-[18px] rounded-tl-[6px] bg-[var(--pub-violet-bg)] px-3.5 py-2.5 text-body-sm text-[var(--pub-violet)]">
              Let&apos;s look at this page together.
            </span>
            <span className="self-end rounded-[18px] rounded-tr-[6px] bg-primary-fixed px-3.5 py-2.5 text-body-sm text-on-primary-fixed-variant">
              Can you explain the picture?
            </span>
            <span className="self-start rounded-[18px] rounded-tl-[6px] bg-[var(--pub-violet-bg)] px-3.5 py-2.5 text-body-sm text-[var(--pub-violet)]">
              Sure. Start with the first label…
            </span>
            <span className="mt-auto flex items-center gap-2 border-t border-card-border pt-3 text-label-sm text-on-surface-variant">
              <Icon name="shield" size={14} />
              Parents stay in charge
            </span>
          </div>
        </div>
      </div>
      <figcaption className="text-body-sm text-on-surface-variant">
        Illustration of a feature that is being built. It is not available yet.
      </figcaption>
    </figure>
  );
}
