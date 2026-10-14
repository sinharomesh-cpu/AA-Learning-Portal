import { findPersona } from '@/fixtures/personas';

const viewer = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('./session', () => ({ getViewer: async () => viewer.current }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const { requireRole } = await import('./authz');

describe('requireRole (FR-002)', () => {
  it('redirects to sign-in when nobody is signed in', async () => {
    viewer.current = null;
    await expect(requireRole('student')).rejects.toThrow('REDIRECT:/sign-in');
  });

  it('allows the matching role', async () => {
    viewer.current = findPersona('demo-student-kiran');
    await expect(requireRole('student')).resolves.toMatchObject({ allowed: true });
  });

  it.each([
    ['demo-student-kiran', 'parent'],
    ['demo-student-kiran', 'superadmin'],
    ['demo-parent', 'student'],
    ['demo-parent', 'teacher'],
    ['demo-teacher-rao', 'parent'],
    ['demo-admin', 'student'],
  ] as const)('denies %s access to the %s area', async (personaId, area) => {
    viewer.current = findPersona(personaId);
    const access = await requireRole(area);
    expect(access.allowed).toBe(false);
    expect(access.viewer.id).toBe(personaId);
  });
});
