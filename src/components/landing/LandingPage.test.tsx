import { render, screen, within } from '@testing-library/react';
import { axeViolations } from '../../../tests/unit/axe';
import { MARKETPLACE } from '@/config/landing';
import { LandingPage } from './LandingPage';
import { TeachersSection } from './TeachersSection';

// The search toolbar navigates with the App Router; there is none in these component tests.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

/** Boards H1/H2 (approved 16 Oct 2026): the home page teachers section, now "Meet Our Subject Specialists" (OC-84). */

const WRAP = 'mx-auto';

describe('home page with listings (PR-D3) and enquiries (PR-D4a) live', () => {
  it('ships with both marketplace switches on', () => {
    expect(MARKETPLACE).toEqual({ listings: true, enquiries: true });
  });

  it('links "Find a teacher" to the new section and shows the approved empty state', async () => {
    const { container } = render(<LandingPage />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link', { name: 'Find a teacher' })[0]).toHaveAttribute('href', '#teachers');
    expect(screen.getAllByRole('link', { name: 'Find a teacher' }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole('heading', { level: 2, name: 'Meet Our Subject Specialists' })).toBeInTheDocument();
    expect(screen.getByText(/No teachers are listed right now/)).toBeInTheDocument();
    expect(screen.getByText(/Parents with an account can already search approved teachers/)).toBeInTheDocument();
    // No search or filter controls while there is nothing to search (owner, OC-84).
    expect(within(container.querySelector('#teachers')!).queryAllByRole('searchbox')).toHaveLength(0);
    expect(within(container.querySelector('#teachers')!).queryAllByRole('combobox')).toHaveLength(0);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('describes listings and enquiries; "How connecting works" only appears with listings shown', () => {
    render(<LandingPage />);
    expect(screen.getByText('Can I find a new teacher on AA Pro?')).toBeInTheDocument();
    expect(screen.queryByText(/How connecting works/)).not.toBeInTheDocument();
    // True today: teachers can publish listings.
    expect(screen.getByRole('heading', { name: 'Looking for students?' })).toBeInTheDocument();
    expect(screen.getByText('How do I pay a teacher?')).toBeInTheDocument();
  });

  it('a loading problem shows a message instead of teachers, and no search controls', () => {
    const { container } = render(<LandingPage teachers={{ listings: [], loadError: true, more: false }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Teacher profiles can.t be shown right now/);
    expect(within(container.querySelector('#teachers')!).queryAllByRole('combobox')).toHaveLength(0);
  });
});

describe('home page once listings and enquiries are live', () => {
  it('shows the H1 wording', () => {
    render(<LandingPage marketplace={{ listings: true, enquiries: true }} />);
    expect(screen.getByRole('heading', { name: 'Looking for students?' })).toBeInTheDocument();
    expect(screen.getByText('Can I find a new teacher on AA Pro?')).toBeInTheDocument();
    expect(screen.getByText(/publish a “Looking for students” listing/)).toBeInTheDocument();
    expect(screen.getByText(/Experience on a listing is as stated by the teacher/)).toBeInTheDocument();
  });

  it('cards show only the public listing fields', async () => {
    const { container } = render(
      <TeachersSection
        wrap={WRAP}
        marketplace={{ listings: true, enquiries: true }}
        listings={[
          {
            id: 'a1b2',
            name: 'Teacher K. Menon',
            subjects: ['Maths', 'Science'],
            grades: [6, 4, 5],
            curricula: ['CBSE', 'ICSE'],
            experienceYears: 8,
            prices: ['₹600 per hour · 40-minute sessions', '₹4,000 a month · 8 sessions × 40 min'],
          },
        ]}
      />,
    );
    const card = screen.getByRole('article', { name: 'Teacher K. Menon' });
    expect(within(card).getByText('Grades 4–6')).toBeInTheDocument();
    expect(within(card).getByText('CBSE')).toBeInTheDocument();
    expect(within(card).getByText('Online')).toBeInTheDocument();
    expect(within(card).getByText('Maths · Science')).toBeInTheDocument();
    expect(card.textContent).toMatch(/8 years \(as stated\)/);
    expect(within(card).getByText('₹600 per hour · 40-minute sessions')).toBeInTheDocument();
    expect(screen.getByText(/How connecting works/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/@|rating|review/i);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('an empty list still shows the empty state', () => {
    render(<TeachersSection wrap={WRAP} marketplace={{ listings: true, enquiries: true }} listings={[]} />);
    expect(screen.getByText(/No teachers are listed right now/)).toBeInTheDocument();
    expect(screen.queryByText(/How connecting works/)).not.toBeInTheDocument();
  });
});

describe('owner rule (17 Oct 2026): no unverified claims on the home page', () => {
  it('shows no ratings, certifications, compliance badges, guarantees or invented figures', () => {
    const { container } = render(<LandingPage marketplace={{ listings: true, enquiries: true }} />);
    const text = container.textContent ?? '';
    for (const claim of [
      /COPPA|FERPA|GDPR/i,
      /\bratings?\b|parent reviews|★|\/5\.0/i,
      /certified|accredited|audited|vetted/i,
      /background[- ]check/i,
      /guarantee/i,
      /encrypt/i,
      /\d+(,\d{3})+\+?/, // counts such as 10,000+
      /\d+(\.\d+)?\s?%/, // percentages such as 98%
      /top 1/i,
      /zero contact|contact leak/i,
    ]) {
      expect(text, String(claim)).not.toMatch(claim);
    }
  });
});
