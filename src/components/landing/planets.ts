/**
 * Geometry for the home page planetary scene (approved composition, OC-83). Everything is in
 * a 400 × 400 design space, the same space as the approved SVG orbits, so the scene keeps its
 * placement and scale at every screen size.
 */

export interface Orbit {
  rx: number;
  ry: number;
  /** Rotation of the ellipse in degrees (as in the approved SVG). */
  rotate: number;
}

/** The three approved orbits, unchanged: wide tilted ellipse, dashed circle, inner ellipse. */
export const ORBITS = {
  wide: { rx: 185, ry: 70, rotate: -18 },
  ring: { rx: 150, ry: 150, rotate: 0 },
  inner: { rx: 105, ry: 44, rotate: 24 },
} satisfies Record<string, Orbit>;

export type OrbitId = keyof typeof ORBITS;
export const CENTER = 200;

export interface Body {
  id: string;
  /** Subject name shown on the label, or null for the small unlabelled planets. */
  label: string | null;
  orbit: OrbitId;
  /** Where the body sits at the start: the approved position of its chip or planet. */
  start: { x: number; y: number };
  /** Seconds for one full orbit; each body differs. Negative = the other direction. */
  period: number;
  radius: number;
  /** Surface colours: base, light, dark, atmosphere glow. */
  colors: { base: string; light: string; dark: string; glow: string };
  /** Surface pattern that turns with the planet. */
  surface: 'bands' | 'spots' | 'land' | 'ring' | 'grid' | 'plain';
  /** Seconds for one turn of the surface pattern. */
  spin: number;
}

/**
 * Six subject planets start where the approved subject chips were, so the opening frame keeps
 * the approved layout; the three small planets start at their approved positions too.
 */
export const BODIES: Body[] = [
  {
    id: 'maths',
    label: 'Maths',
    orbit: 'ring',
    start: { x: 94, y: 94 },
    period: 140,
    radius: 15,
    colors: { base: '#2bb8d6', light: '#b9f6ff', dark: '#0b4a63', glow: 'rgba(69,214,232,0.45)' },
    surface: 'ring',
    spin: 14,
  },
  {
    id: 'science',
    label: 'Science',
    orbit: 'ring',
    start: { x: 214, y: 51 },
    period: 140,
    radius: 14,
    colors: { base: '#f0a33a', light: '#ffe2b0', dark: '#7a4300', glow: 'rgba(255,180,84,0.45)' },
    surface: 'spots',
    spin: 11,
  },
  {
    id: 'sst',
    label: 'SST',
    orbit: 'wide',
    start: { x: 362, y: 118 },
    period: 95,
    radius: 15,
    colors: { base: '#2f7fd8', light: '#c8e4ff', dark: '#0d2f66', glow: 'rgba(120,190,255,0.45)' },
    surface: 'land',
    spin: 16,
  },
  {
    id: 'english',
    label: 'English',
    orbit: 'inner',
    start: { x: 296, y: 238 },
    period: 62,
    radius: 13,
    colors: { base: '#8b70ff', light: '#e6deff', dark: '#33208f', glow: 'rgba(139,112,255,0.5)' },
    surface: 'bands',
    spin: 9,
  },
  {
    id: 'hindi',
    label: 'Hindi',
    orbit: 'ring',
    start: { x: 150, y: 341 },
    period: 140,
    radius: 14,
    colors: { base: '#ff8a3d', light: '#ffd9b8', dark: '#8a3200', glow: 'rgba(255,138,61,0.45)' },
    surface: 'bands',
    spin: 12,
  },
  {
    id: 'it',
    label: 'IT',
    orbit: 'wide',
    start: { x: 36, y: 266 },
    period: 95,
    radius: 13,
    colors: { base: '#1fbf8f', light: '#c4f8e0', dark: '#06513a', glow: 'rgba(78,222,163,0.45)' },
    surface: 'grid',
    spin: 10,
  },
  {
    id: 'amber-moon',
    label: null,
    orbit: 'ring',
    start: { x: 352, y: 148 },
    period: -170,
    radius: 9,
    colors: { base: '#ffb454', light: '#fff1d6', dark: '#9a5a00', glow: 'rgba(255,180,84,0.35)' },
    surface: 'plain',
    spin: 20,
  },
  {
    id: 'violet-moon',
    label: null,
    orbit: 'ring',
    start: { x: 72, y: 270 },
    period: -210,
    radius: 7,
    colors: { base: '#a48bff', light: '#efe9ff', dark: '#3d2a9e', glow: 'rgba(164,139,255,0.35)' },
    surface: 'plain',
    spin: 20,
  },
  {
    id: 'cyan-moon',
    label: null,
    orbit: 'ring',
    start: { x: 286, y: 330 },
    period: -120,
    radius: 5,
    colors: { base: '#45d6e8', light: '#e0fbff', dark: '#0b5563', glow: 'rgba(69,214,232,0.35)' },
    surface: 'plain',
    spin: 20,
  },
];

const RAD = Math.PI / 180;

/** Point on an orbit at angle t (radians), in design space, and whether it is on the far side. */
export function pointOn(orbit: Orbit, t: number): { x: number; y: number; far: boolean; depth: number } {
  const ex = orbit.rx * Math.cos(t);
  const ey = orbit.ry * Math.sin(t);
  const r = orbit.rotate * RAD;
  const x = CENTER + ex * Math.cos(r) - ey * Math.sin(r);
  const y = CENTER + ex * Math.sin(r) + ey * Math.cos(r);
  // The orbits are tilted circles seen from above the plane: the upper half (sin t < 0) is the
  // far side. A perfect circle (the ring) has no tilt, so it stays at one depth.
  const tilted = orbit.ry < orbit.rx;
  const depth = tilted ? Math.sin(t) : 0; // -1 far … +1 near
  return { x, y, far: tilted && depth < 0, depth };
}

/** The orbit angle closest to a starting point (so bodies begin at their approved places). */
export function angleNear(orbit: Orbit, p: { x: number; y: number }): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 720; i += 1) {
    const t = (i / 720) * Math.PI * 2;
    const q = pointOn(orbit, t);
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** Angle of a body after `seconds`. */
export function angleAt(body: Body, startAngle: number, seconds: number): number {
  return startAngle + (seconds / body.period) * Math.PI * 2;
}
