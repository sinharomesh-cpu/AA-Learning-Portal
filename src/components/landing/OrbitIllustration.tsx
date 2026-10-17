'use client';

import { useEffect, useRef } from 'react';
import { Icon, type IconName } from '@/components/public/icons';
import { paintPlanet } from './planetPainter';
import { BODIES, ORBITS, angleAt, angleNear, pointOn, type Body } from './planets';

/**
 * Hero planetary scene (approved composition, OC-82/OC-83). The orbits, star dots, core glow
 * and central AA Pro hub are the approved SVG and HTML, unchanged. The six subject planets and
 * the three small planets are drawn on two canvases (behind and in front of the hub) and move
 * along those orbits; each subject label travels with its planet.
 *
 * - Starts where the approved composition placed the subjects, so the first frame matches it.
 * - Reduced motion or Save-Data: one still frame, no animation.
 * - Pauses when off screen or when the tab is hidden.
 * - Without JavaScript or canvas: still SVG planets and labels at the approved positions.
 * Decorative only: hidden from assistive technology (the subjects are listed on the page).
 */

const SUBJECT_META: Record<string, { icon: IconName; tone: 'cyan' | 'amber' | 'violet' }> = {
  maths: { icon: 'calc', tone: 'cyan' },
  science: { icon: 'flask', tone: 'amber' },
  sst: { icon: 'globe', tone: 'cyan' },
  english: { icon: 'letter', tone: 'violet' },
  hindi: { icon: 'hindi', tone: 'amber' },
  it: { icon: 'laptop', tone: 'violet' },
};

const TONE = {
  cyan: 'text-primary',
  amber: 'text-[var(--pub-amber)]',
  violet: 'text-[var(--pub-violet)]',
};

const START = BODIES.map((b) => angleNear(ORBITS[b.orbit], b.start));
const TILT = BODIES.map((_, i) => ((i % 3) - 1) * 0.35);
const MAX_DPR = 2;

interface Placed {
  body: Body;
  index: number;
  x: number;
  y: number;
  far: boolean;
  scale: number;
  dim: number;
}

/** Where every body is after `seconds`, in the 400 × 400 design space. */
export function placeBodies(seconds: number): Placed[] {
  return BODIES.map((body, index) => {
    const p = pointOn(ORBITS[body.orbit], angleAt(body, START[index] ?? 0, seconds));
    return {
      body,
      index,
      x: p.x,
      y: p.y,
      far: p.far,
      // Nearer = slightly larger and brighter; farther = smaller and dimmer.
      scale: 1 + 0.16 * p.depth,
      dim: 0.75 + (0.25 * (p.depth + 1)) / 2 + (p.depth === 0 ? 0.25 : 0),
    };
  });
}

function labelStyle(p: Placed) {
  const x = Math.min(88, Math.max(12, p.x / 4));
  const y = (p.y + p.body.radius * p.scale + 4) / 4;
  return { left: `${x}%`, top: `${y}%`, zIndex: p.far ? 1 : 4 };
}

function paint(back: HTMLCanvasElement, front: HTMLCanvasElement, seconds: number) {
  const size = back.width; // square, in device pixels
  const k = size / 400;
  const placed = placeBodies(seconds).sort((a, b) => a.scale - b.scale);
  for (const canvas of [back, front]) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.clearRect(0, 0, size, size);
  }
  const bctx = back.getContext('2d')!;
  const fctx = front.getContext('2d')!;
  for (const p of placed) {
    const dx = 200 - p.x;
    const dy = 200 - p.y;
    const len = Math.hypot(dx, dy) || 1;
    paintPlanet({
      ctx: p.far ? bctx : fctx,
      body: p.body,
      x: p.x * k,
      y: p.y * k,
      r: p.body.radius * p.scale * k,
      spin: (seconds / p.body.spin) * Math.PI * 2,
      light: { x: dx / len, y: dy / len },
      dim: Math.min(1, p.dim),
      tilt: TILT[p.index] ?? 0,
    });
  }
  return true;
}

export function OrbitIllustration() {
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const root = rootRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    if (!root || !back || !front || !back.getContext('2d')) return;
    // data-planets: 'static' = server / no-canvas fallback; 'still' = one frame; 'moving'.
    const setMode = (mode: 'still' | 'moving') => {
      root.dataset.planets = mode;
    };

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    let elapsed = 0;
    let last = 0;
    let raf = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const px = Math.max(1, Math.round(root.clientWidth * dpr));
      for (const c of [back, front]) {
        if (c.width !== px) {
          c.width = px;
          c.height = px;
        }
      }
    };

    const draw = () => {
      paint(back, front, elapsed);
      const placed = placeBodies(elapsed);
      placed.forEach((p) => {
        const el = labelRefs.current[p.index];
        if (!el) return;
        const s = labelStyle(p);
        el.style.left = s.left;
        el.style.top = s.top;
        el.style.zIndex = String(s.zIndex);
      });
    };

    const still = () => reduce?.matches === true || saveData;

    const tick = (now: number) => {
      if (last) elapsed += Math.min(0.1, (now - last) / 1000); // no jump after a pause
      last = now;
      draw();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (still()) {
        draw();
        setMode('still');
        return;
      }
      if (!visible || document.hidden) return;
      setMode('moving');
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    resize();
    draw();
    start();

    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(root);
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) start();
      else stop();
    });
    io.observe(root);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    reduce?.addEventListener?.('change', start);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduce?.removeEventListener?.('change', start);
    };
  }, []);

  const first = placeBodies(0);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-planets="static"
      className="relative mx-auto aspect-square w-full max-w-[520px] select-none [contain:layout]"
    >
      <svg viewBox="0 0 400 400" className="absolute inset-0 z-0 h-full w-full" fill="none">
        <defs>
          <radialGradient id="orbit-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--pub-planet-a)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--pub-planet-a)" stopOpacity="0" />
          </radialGradient>
          {BODIES.map((b) => (
            <radialGradient key={b.id} id={`planet-${b.id}`} cx="35%" cy="35%" r="70%">
              <stop offset="0%" stopColor={b.colors.light} />
              <stop offset="100%" stopColor={b.colors.base} />
            </radialGradient>
          ))}
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
        <circle cx="120" cy="90" r="2" fill="var(--pub-planet-a)" />
        <circle cx="320" cy="260" r="2" fill="var(--pub-planet-c)" />
        <circle cx="210" cy="40" r="1.5" fill="var(--pub-planet-b)" />
        <circle cx="40" cy="160" r="1.5" fill="var(--pub-planet-a)" />
        {/* Lightweight fallback: still planets until the canvas takes over. */}
        <g className="planet-fallback">
          {first.map((p) => (
            <circle key={p.body.id} cx={p.x} cy={p.y} r={p.body.radius * p.scale} fill={`url(#planet-${p.body.id})`} />
          ))}
        </g>
      </svg>
      <canvas ref={backRef} className="absolute inset-0 z-0 h-full w-full" />
      <div className="absolute left-1/2 top-1/2 z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <span className="pub-glow flex size-24 items-center justify-center rounded-full border border-primary/50 bg-surface-container-lowest text-primary md:size-28">
          <Icon name="book" size={44} />
        </span>
        <span className="rounded-full border border-primary/40 bg-surface-container-lowest px-4 py-1 font-headline text-[17px] font-extrabold">
          <span className="pub-brand-aa">AA</span> <span className="text-primary">Pro</span>
        </span>
      </div>
      <canvas ref={frontRef} className="pointer-events-none absolute inset-0 z-[3] h-full w-full" />
      {first.map((p) => {
        const meta = SUBJECT_META[p.body.id];
        if (!meta || !p.body.label) return null;
        return (
          <span
            key={p.body.id}
            ref={(el) => {
              labelRefs.current[p.index] = el;
            }}
            data-planet-label={p.body.id}
            style={labelStyle(p)}
            className="pub-card absolute flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-headline text-[13px] font-bold md:text-[14px]"
          >
            <Icon name={meta.icon} size={14} className={TONE[meta.tone]} />
            {p.body.label}
          </span>
        );
      })}
    </div>
  );
}
