import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { axeViolations } from '../../../../tests/unit/axe';
import { PackageEditor, type PackageInitial } from './PackageBuilder';

vi.mock('./offerActions', () => ({
  savePackageAction: vi.fn(async () => ({})),
  withdrawPackageAction: vi.fn(async () => ({})),
}));

/** OC-108 (boards PT0–PT1): teacher4's case — one Friday window, 4 classes a week asked for. */
const FRI = [{ weekday: 5, start: 960, end: 1080 }];
const NEEDS: PackageInitial = {
  status: 'needs_review',
  currency: 'INR',
  priceMinor: 150000,
  classes: 22,
  perWeek: null,
  minutes: 40,
  weeks: null,
  times: [],
  negotiable: false,
  termsNote: null,
  reviewIssues: ['details_missing'],
};

describe('learning package builder', () => {
  it('says when the classes a week cannot fit, and offers a number that does', async () => {
    const user = userEvent.setup();
    render(<PackageEditor initial={NEEDS} slots={FRI} masterOn />);
    expect(screen.getByText('4 classes a week won’t fit your usual times')).toBeInTheDocument();
    expect(screen.getByText(/fit 2 classes of 40 minutes a week/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use 2 a week · 11 weeks' }));
    expect(screen.getByRole('button', { name: '2 a week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'Complete within (weeks)' })).toHaveValue('11');
    expect(screen.queryByText(/won’t fit your usual times/)).not.toBeInTheDocument();
  });

  it('allows two Friday classes that do not overlap and greys out the one that would', async () => {
    const user = userEvent.setup();
    const { container } = render(<PackageEditor initial={{ ...NEEDS, perWeek: 2, weeks: 11 }} slots={FRI} masterOn />);
    const week = screen.getByRole('group', { name: 'Class times by day' });
    await user.click(within(week).getByRole('button', { name: 'Friday 4:00 pm' }));
    expect(within(week).getByRole('button', { name: 'Friday 4:30 pm, overlaps another class' })).toBeDisabled();
    await user.click(within(week).getByRole('button', { name: 'Friday 5:00 pm' }));
    expect(screen.getByText('All 2 chosen')).toBeInTheDocument();
    // The form sends exactly the chosen times; the server checks them again.
    const sent = [...container.querySelectorAll<HTMLInputElement>('input[name="time"]')].map((i) => i.value);
    expect(sent).toEqual(['5:960', '5:1020']);
    expect(screen.getByRole('complementary', { name: 'Package preview' })).toHaveTextContent('₹1,500 for 22 classes');
    expect(await axeViolations(container)).toEqual([]);
  });
});
