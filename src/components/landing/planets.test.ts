import { describe, expect, it } from 'vitest';
import { BODIES, ORBITS, angleAt, angleNear, pointOn } from './planets';

describe('hero planets (OC-83)', () => {
  it('has one planet for each of the six subjects', () => {
    expect(BODIES.filter((b) => b.label).map((b) => b.label)).toEqual([
      'Maths',
      'Science',
      'SST',
      'English',
      'Hindi',
      'IT',
    ]);
  });

  it('starts every body on its orbit close to its approved place', () => {
    for (const b of BODIES) {
      const p = pointOn(ORBITS[b.orbit], angleNear(ORBITS[b.orbit], b.start));
      expect(Math.hypot(p.x - b.start.x, p.y - b.start.y)).toBeLessThan(30);
    }
  });

  it('keeps bodies on the approved orbits as time passes', () => {
    for (const b of BODIES) {
      const o = ORBITS[b.orbit];
      const start = angleNear(o, b.start);
      for (const s of [0, 7, 33, 120]) {
        const p = pointOn(o, angleAt(b, start, s));
        // Undo the orbit's rotation and check the ellipse equation.
        const r = (-o.rotate * Math.PI) / 180;
        const dx = p.x - 200;
        const dy = p.y - 200;
        const ex = dx * Math.cos(r) - dy * Math.sin(r);
        const ey = dx * Math.sin(r) + dy * Math.cos(r);
        expect((ex / o.rx) ** 2 + (ey / o.ry) ** 2).toBeCloseTo(1, 5);
      }
    }
  });

  it('gives each orbit its own speed', () => {
    const periods = new Set(BODIES.map((b) => b.period));
    expect(periods.size).toBeGreaterThanOrEqual(6);
  });
});
