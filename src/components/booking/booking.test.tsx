import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingWizard } from '@/app/student/book/BookingWizard';
import type { BookingDay } from '@/fixtures/aiBooking';
import { axeViolations } from '../../../tests/unit/axe';
import { BookedOutcome, BookingErrorOutcome, NotOpenOutcome, TimeTakenOutcome } from './BookingOutcome';

describe('AI booking outcomes (M-17)', () => {
  it('render the four approved states accessibly', async () => {
    const { container } = render(
      <>
        <BookedOutcome
          headingLevel={2}
          subjectName="Maths"
          chapter={null}
          dayLabel="Today"
          timeLabel="5:15 pm"
          length={30}
        />
        <TimeTakenOutcome headingLevel={2} timeLabel="5:15 pm" alternatives={[{ label: '5:30 pm', href: '/x' }]} />
        <BookingErrorOutcome headingLevel={2} />
        <NotOpenOutcome headingLevel={2} />
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent("You're booked!");
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('say plainly that the demo booked nothing', () => {
    render(<BookedOutcome subjectName="Maths" chapter={null} dayLabel="Today" timeLabel="5:15 pm" length={30} />);
    expect(screen.getByText(/Nothing was really booked/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: "You're booked!" })).toBeInTheDocument();
  });

  it('give the child no detail of the parent’s rules when a time is not open (R-08)', () => {
    render(<NotOpenOutcome />);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/quiet|parent|limit|rule/i);
    expect(screen.getByRole('link', { name: 'Show open times' })).toHaveAttribute('href', '/student/book');
  });
});

const DAYS: BookingDay[] = [
  {
    key: '2026-10-14',
    label: 'Today',
    slots: [
      {
        startIso: '2026-10-14T10:45:00.000Z',
        label: '4:15 pm',
        part: 'afternoon',
        status: { 15: 'open' },
      },
      {
        startIso: '2026-10-14T11:00:00.000Z',
        label: '4:30 pm',
        part: 'afternoon',
        status: { 15: 'lesson' },
      },
      { startIso: '2026-10-14T12:30:00.000Z', label: '6:00 pm', part: 'evening', status: { 15: 'open' } },
      {
        startIso: '2026-10-14T12:45:00.000Z',
        label: '6:15 pm',
        part: 'evening',
        status: { 15: 'daily_limit' },
      },
    ],
  },
  {
    key: '2026-10-15',
    label: 'Thu 15 Oct',
    slots: [{ startIso: '2026-10-15T01:30:00.000Z', label: '7:00 am', part: 'morning', status: { 15: 'open' } }],
  },
];

function renderWizard() {
  return render(
    <BookingWizard
      subjects={[
        { id: 'maths', name: 'Maths' },
        { id: 'science', name: 'Science' },
      ]}
      chapters={{ maths: ['Chapter 6 — Maths practice book (sample)'], science: [] }}
      days={DAYS}
      zoneName="IST"
      lengths={[15]}
    />,
  );
}

describe('S13 booking wizard (demo)', () => {
  it('keeps "Book this lesson" inactive until a subject and an open time are chosen', async () => {
    const user = userEvent.setup();
    renderWizard();
    const book = screen.getByRole('button', { name: 'Book this lesson' });
    expect(book).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('radio', { name: /Maths/ }));
    await user.click(screen.getByRole('radio', { name: /4:15 pm/ }));
    expect(book).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Today, 4:15 pm (IST)')).toBeInTheDocument();
  });

  it('has one lesson length, 15 minutes, with no length choice (OC-89)', () => {
    renderWizard();
    expect(screen.queryByRole('group', { name: 'Lesson length' })).toBeNull();
    expect(screen.getByText('Length').nextElementSibling).toHaveTextContent('15 minutes');
    expect(document.querySelector('input[name="length"]')).toHaveValue('15');
  });

  it('shows why a time is not open, in child words', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('radio', { name: 'Afternoon' }));
    expect(screen.getByRole('radio', { name: /4:30 pm.*You have a lesson/ })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Evening' }));
    expect(screen.getByRole('radio', { name: /6:15 pm.*One AI class a day/ })).toBeDisabled();
  });

  it('only shows chapters that were shared, and says so when there are none', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('radio', { name: /Maths/ }));
    expect(screen.getByRole('combobox', { name: 'Which chapter?' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Science/ }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText(/No chapters have been shared/)).toBeInTheDocument();
  });

  it('switches days and parts of the day, and has no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = renderWizard();
    await user.click(screen.getByRole('radio', { name: 'Thu 15 Oct' }));
    expect(screen.getByRole('radio', { name: 'Morning' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /7:00 am/ })).toBeEnabled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('has no control for booking a human teacher (FR-008.2)', () => {
    renderWizard();
    expect(screen.queryByText(/book a teacher|human teacher booking/i)).not.toBeInTheDocument();
    expect(screen.getByText(/only parents can book teachers/)).toBeInTheDocument();
  });
});
