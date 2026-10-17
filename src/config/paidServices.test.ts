import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAID_SERVICES, paidServiceApproved } from './paidServices';

/**
 * OC-91 preventive control: with a $0 budget, no paid service may be approved, installed or
 * called. This test fails the build if a paid SDK is added to package.json or a paid API host
 * appears in the code, before the owner's written approval is recorded in the register.
 */
const ROOT = join(__dirname, '..', '..');
const SELF = new Set(['paidServices.ts', 'paidServices.test.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !SELF.has(name) ? [p] : [];
  });
}

describe('paid services register (OC-91, budget $0)', () => {
  it('no paid service is approved', () => {
    expect(PAID_SERVICES.filter((s) => s.approvedBy !== null)).toEqual([]);
    for (const s of PAID_SERVICES) expect(paidServiceApproved(s.id)).toBe(false);
    expect(paidServiceApproved('unknown')).toBe(false);
  });

  it('no SDK of an unapproved paid service is a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
    const found = PAID_SERVICES.filter((s) => !s.approvedBy).flatMap((s) => s.packages.filter((p) => installed.has(p)));
    expect(found).toEqual([]);
  });

  it('no code calls the API of an unapproved paid service', () => {
    const files = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'scripts'))];
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const s of PAID_SERVICES.filter((x) => !x.approvedBy)) {
        for (const h of s.hosts) if (text.includes(h)) hits.push(`${f.replace(ROOT, '')}: ${h}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
