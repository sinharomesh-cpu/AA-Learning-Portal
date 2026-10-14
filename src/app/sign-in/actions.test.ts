const jar = vi.hoisted(() => new Map<string, { value: string; options: Record<string, unknown> }>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => jar.set(name, { value, options }),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const { signInAdult, signInChild } = await import('./actions');

function form(persona: string) {
  const data = new FormData();
  data.set('persona', persona);
  return data;
}

describe('demo sign-in actions (OC-27)', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jar.clear();
    process.env.AA_DEMO_MODE = 'true';
  });
  afterAll(() => {
    process.env = env;
  });

  it('refuses everything when demo mode is off', async () => {
    process.env.AA_DEMO_MODE = 'false';
    await expect(signInAdult({}, form('demo-parent'))).resolves.toEqual({ error: 'Sign-in is not available yet.' });
    expect(jar.size).toBe(0);
  });

  it('signs an adult in with an HttpOnly, SameSite=Lax cookie and sends them to their own home', async () => {
    await expect(signInAdult({}, form('demo-parent'))).rejects.toThrow('REDIRECT:/parent');
    const cookie = jar.get('aa_demo_session');
    expect(cookie?.value).toBe('demo-parent');
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('rejects a child persona on the adult form and an adult persona on the child form', async () => {
    await expect(signInAdult({}, form('demo-student-kiran'))).resolves.toHaveProperty('error');
    await expect(signInChild({}, form('demo-admin'))).resolves.toHaveProperty('error');
    expect(jar.size).toBe(0);
  });

  it('rejects unknown personas', async () => {
    await expect(signInAdult({}, form('demo-hacker'))).resolves.toHaveProperty('error');
    expect(jar.size).toBe(0);
  });

  it('signs a child in to the student area', async () => {
    await expect(signInChild({}, form('demo-student-meera'))).rejects.toThrow('REDIRECT:/student');
  });
});

export {};
