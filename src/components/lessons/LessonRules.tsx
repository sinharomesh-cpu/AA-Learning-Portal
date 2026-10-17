import { Icon } from '@/components/icons/Icon';

/**
 * Confirmed lesson rules shown in plain words (OC-44 to OC-47). Replaces the earlier
 * "Not decided yet" notes for D-35, D-08, D-07 and D-15.
 */
export function LessonRules({ items, title = 'Lesson rules' }: { items: readonly string[]; title?: string }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-[16px] border border-card-border bg-surface-container-low px-4 py-3"
    >
      <h3 className="flex items-center gap-2 text-label-md text-on-surface">
        <Icon name="info" size={18} className="text-primary" />
        {title}
      </h3>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm leading-5 text-on-surface-variant">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
