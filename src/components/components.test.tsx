import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axeViolations } from '../../tests/unit/axe';
import { Button, LinkButton } from './Button';
import { Card } from './Card';
import { ConfirmDialog } from './ConfirmDialog';
import { JoinButton } from './JoinButton';
import { PendingNote } from './PendingNote';
import { SessionRow } from './SessionRow';
import { StatusChip } from './StatusChip';
import { SubjectCard } from './SubjectCard';
import { TextField } from './TextField';
import { TimeDisplay } from './TimeDisplay';
import { Wordmark } from './Wordmark';
import { AccessDenied } from './states/AccessDenied';
import { EmptyState, ErrorState, LoadingState, SuccessMessage } from './states/States';

describe('Button', () => {
  it('uses 48 px targets by default and 56 px for child actions', () => {
    render(
      <>
        <Button>Save</Button>
        <Button size="child">Let&apos;s go</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('min-h-12');
    expect(screen.getByRole('button', { name: "Let's go" }).className).toContain('min-h-14');
  });

  it('keeps an inactive button focusable, announced, and inert', async () => {
    const onClick = vi.fn();
    render(
      <Button inactive onClick={onClick}>
        Not yet
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Not yet' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('secondary buttons use the outline token (DV-02)', () => {
    render(
      <LinkButton href="/x" variant="secondary">
        Read
      </LinkButton>,
    );
    expect(screen.getByRole('link', { name: 'Read' }).className).toContain('border-outline');
  });
});

describe('StatusChip and SessionRow', () => {
  it('always shows the status in words', () => {
    render(<StatusChip kind="success">Confirmed</StatusChip>);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('labels AI and human sessions differently', () => {
    render(
      <ul>
        <SessionRow
          kind="human"
          subject="Science"
          startIso="2026-10-14T11:00:00Z"
          durationMinutes={40}
          timeZone="Asia/Kolkata"
        />
        <SessionRow
          kind="ai"
          subject="Maths"
          startIso="2026-10-14T11:45:00Z"
          durationMinutes={30}
          timeZone="Asia/Kolkata"
          last
        />
      </ul>,
    );
    expect(screen.getByText('Teacher')).toBeInTheDocument();
    expect(screen.getByText('AI Tutor')).toBeInTheDocument();
    expect(screen.getByText('4:30 pm')).toBeInTheDocument();
    expect(screen.getByText('5:15 pm')).toBeInTheDocument();
  });
});

describe('TimeDisplay', () => {
  it('renders a machine-readable time in the viewer zone', () => {
    render(<TimeDisplay iso="2026-10-14T11:00:00Z" timeZone="Asia/Singapore" />);
    const time = screen.getByText('7:00 pm');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', '2026-10-14T11:00:00Z');
  });
});

describe('TextField', () => {
  it('connects label, hint and error', () => {
    render(<TextField label="Your username" hint="Ask your parent" error="That didn't match" defaultValue="x" />);
    const input = screen.getByLabelText('Your username');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription("That didn't match Ask your parent");
  });
});

describe('JoinButton (OC-44: opens 10 minutes before, until the end)', () => {
  const lesson = (now: string) => ({
    startIso: '2026-10-20T10:00:00.000Z',
    endIso: '2026-10-20T10:40:00.000Z',
    nowIso: now,
  });

  it('says when it opens, and never shows a time, link or meeting ID', () => {
    const { container } = render(<JoinButton />);
    expect(screen.getByRole('button', { name: 'Join opens 10 min before the start' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(container.innerHTML).not.toMatch(/zoom\.us|https?:|\d{3}[ -]\d{3}/i);
  });

  it('inside the window it says Zoom is not connected yet; afterwards that the lesson ended', () => {
    const { rerender } = render(<JoinButton who="teacher" lesson={lesson('2026-10-20T09:50:00.000Z')} />);
    expect(screen.getByRole('button', { name: 'Start — Zoom not connected yet' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    rerender(<JoinButton lesson={lesson('2026-10-20T09:49:00.000Z')} />);
    expect(screen.getByRole('button', { name: 'Join opens 10 min before the start' })).toBeInTheDocument();
    rerender(<JoinButton lesson={lesson('2026-10-20T10:40:00.000Z')} />);
    expect(screen.getByRole('button', { name: 'Lesson ended' })).toBeInTheDocument();
  });
});

describe('States', () => {
  it('error state shows a reference to adults only', () => {
    const { rerender } = render(<ErrorState audience="adult" reference="REF-TEST-01" />);
    expect(screen.getByText('REF-TEST-01')).toBeInTheDocument();
    rerender(<ErrorState audience="child" reference="REF-TEST-01" />);
    expect(screen.queryByText('REF-TEST-01')).not.toBeInTheDocument();
  });

  it('loading state is announced', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it.each([
    ['student', 'This page is for grown-ups', '/student'],
    ['parent', 'Page not found', '/parent'],
    ['teacher', "You can't open this", '/teacher'],
    ['superadmin', 'Not available to admins', '/admin'],
  ] as const)('access denied for %s uses its own copy and home', (role, title, home) => {
    render(<AccessDenied viewerRole={role} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole('link')).toHaveAttribute('href', home);
    expect(document.body.textContent).not.toMatch(/audit log/i);
  });
});

describe('ConfirmDialog', () => {
  beforeAll(() => {
    // jsdom does not implement the modal dialog API.
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  it('labels the dialog and calls the right handler', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="End the class?"
        confirmLabel="End class"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        You can book another lesson later.
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'End the class?' });
    expect(dialog).toHaveAccessibleDescription('You can book another lesson later.');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'End class' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('accessibility (axe-core, jsdom)', () => {
  it('a page of components has no axe violations', async () => {
    const { container } = render(
      <main>
        <h1>
          <Wordmark />
        </h1>
        <Card>
          <h2>Card</h2>
          <StatusChip kind="ai">AI Tutor</StatusChip>
          <PendingNote decision="D-05b">How far ahead a lesson must be booked.</PendingNote>
          <SubjectCard subject="maths" detail="Maths practice book (sample)" href="/student/library" />
          <TextField label="Your username" />
          <JoinButton />
          <EmptyState title="Nothing here yet" action={<LinkButton href="/student">Book an AI lesson</LinkButton>}>
            You have no lessons today.
          </EmptyState>
          <SuccessMessage>Saved. Your changes are in place.</SuccessMessage>
        </Card>
      </main>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
