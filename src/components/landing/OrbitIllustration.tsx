import { cx } from '@/lib/cx';
import { Icon, type IconName } from '@/components/public/icons';

/**
 * Hero illustration: the reference's "learning universe" — orbits with the six subjects as
 * floating chips around the AA Pro book. Drawn with SVG and CSS (the reference's hosted image
 * cannot be used: third-party host, no licence information). Decorative only.
 */

const CHIPS: Array<{ label: string; icon: IconName; tone: 'cyan' | 'amber' | 'violet'; pos: string; delay: string }> = [
  { label: 'Maths', icon: 'calc', tone: 'cyan', pos: 'left-[4%] top-[14%]', delay: '0s' },
  { label: 'Science', icon: 'flask', tone: 'amber', pos: 'left-[44%] top-[2%]', delay: '1.2s' },
  { label: 'SST', icon: 'globe', tone: 'cyan', pos: 'right-[2%] top-[20%]', delay: '2.1s' },
  { label: 'English', icon: 'letter', tone: 'violet', pos: 'right-[0%] top-[58%]', delay: '0.6s' },
  { label: 'Hindi', icon: 'hindi', tone: 'amber', pos: 'left-[30%] bottom-[4%]', delay: '1.8s' },
  { label: 'IT', icon: 'laptop', tone: 'violet', pos: 'left-[0%] top-[62%]', delay: '2.6s' },
];

const TONE = {
  cyan: 'bg-primary-fixed text-on-primary-fixed-variant',
  amber: 'bg-[var(--pub-amber-bg)] text-[var(--pub-amber)]',
  violet: 'bg-[var(--pub-violet-bg)] text-[var(--pub-violet)]',
};

export function OrbitIllustration() {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[520px] select-none">
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" fill="none">
        <defs>
          <radialGradient id="orbit-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--pub-planet-a)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--pub-planet-a)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orbit-p1" cx="35%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--pub-planet-b)" />
          </radialGradient>
          <radialGradient id="orbit-p2" cx="35%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--pub-planet-c)" />
          </radialGradient>
          <radialGradient id="orbit-p3" cx="35%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--pub-planet-a)" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="120" fill="url(#orbit-core)" />
        <ellipse
          cx="200"
          cy="200"
          rx="185"
          ry="70"
          stroke="var(--pub-orbit)"
          strokeWidth="1.5"
          transform="rotate(-18 200 200)"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="150"
          ry="150"
          stroke="var(--pub-orbit)"
          strokeWidth="1.5"
          strokeDasharray="4 8"
        />
        <ellipse
          cx="200"
          cy="200"
          rx="105"
          ry="44"
          stroke="var(--pub-orbit)"
          strokeWidth="1.5"
          transform="rotate(24 200 200)"
        />
        <circle cx="352" cy="148" r="14" fill="url(#orbit-p1)" />
        <circle cx="72" cy="270" r="10" fill="url(#orbit-p2)" />
        <circle cx="286" cy="330" r="7" fill="url(#orbit-p3)" />
        <circle cx="120" cy="90" r="2" fill="var(--pub-planet-a)" />
        <circle cx="320" cy="260" r="2" fill="var(--pub-planet-c)" />
        <circle cx="210" cy="40" r="1.5" fill="var(--pub-planet-b)" />
        <circle cx="40" cy="160" r="1.5" fill="var(--pub-planet-a)" />
      </svg>
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <span className="pub-glow flex size-24 items-center justify-center rounded-full border border-primary/50 bg-surface-container-lowest text-primary md:size-28">
          <Icon name="book" size={44} />
        </span>
        <span className="rounded-full border border-primary/40 bg-surface-container-lowest px-4 py-1 font-headline text-[17px] font-extrabold">
          <span className="pub-brand-aa">AA</span> <span className="text-primary">Pro</span>
        </span>
      </div>
      {CHIPS.map((c) => (
        <span
          key={c.label}
          className={cx(
            'pub-float pub-card absolute flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 font-headline text-[14px] font-bold md:text-[15px]',
            c.pos,
          )}
          style={{ animationDelay: c.delay }}
        >
          <span className={cx('flex size-8 items-center justify-center rounded-full', TONE[c.tone])}>
            <Icon name={c.icon} size={16} />
          </span>
          {c.label}
        </span>
      ))}
    </div>
  );
}
