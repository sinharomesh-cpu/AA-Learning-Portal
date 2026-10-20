import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationRowData } from '@/server/notifications/view';

/**
 * CR-16 N2 component checks (AC-38, AC-39, AC-60, AC-61): the bell, its panel and the menu
 * badge, with the server actions replaced by test doubles.
 */

const actions = vi.hoisted(() => ({
  refreshBellAction: vi.fn(),
  loadNotificationsAction: vi.fn(),
  markReadAction: vi.fn(),
  markAllReadAction: vi.fn(),
  openNotificationAction: vi.fn(),
}));
vi.mock('@/app/notifications/actions', () => actions);
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/teacher' }));

import { NotificationBell } from '@/components/notifications/NotificationBell';
import { capCount, MenuBadge, NotificationCountsProvider } from '@/components/notifications/NotificationCounts';
import { relativeTime } from '@/components/notifications/NotificationRows';
import { NavLink } from '@/components/shell/NavLink';

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const row = (over: Partial<NotificationRowData> = {}): NotificationRowData => ({
  id: '00000000-0000-4000-8000-000000000001',
  createdAt: new Date().toISOString(),
  when: '20 Oct 2026, 2:05 pm',
  unread: true,
  redacted: false,
  kind: 'action',
  title: 'New enquiry from Anita',
  body: 'Grade 5 · Maths',
  label: 'Needs your reply',
  ...over,
});

function renderBell(
  opts: { unread?: number | null; role?: 'parent' | 'teacher' | 'student'; badges?: Record<string, number> } = {},
) {
  return render(
    <NotificationCountsProvider
      role={opts.role ?? 'teacher'}
      seeAll={opts.role !== 'student'}
      initialUnread={opts.unread === undefined ? 3 : opts.unread}
      initialBadges={opts.badges ?? {}}
      renderedAt={1}
    >
      <NotificationBell />
      <NavLink href="/teacher/enquiries" badgeLabel="Enquiries" activeClassName="a" inactiveClassName="b">
        Enquiries
        <MenuBadge href="/teacher/enquiries" />
      </NavLink>
    </NotificationCountsProvider>,
  );
}

describe('counts and times', () => {
  it('caps at 9+ and words relative times', () => {
    expect(capCount(1)).toBe('1');
    expect(capCount(9)).toBe('9');
    expect(capCount(10)).toBe('9+');
    const now = Date.parse('2026-10-20T10:00:00Z');
    expect(relativeTime('2026-10-20T09:59:30Z', now)).toBe('Just now');
    expect(relativeTime('2026-10-20T09:55:00Z', now)).toBe('5 min ago');
    expect(relativeTime('2026-10-20T07:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2026-10-18T09:00:00Z', now)).toBe('2 days ago');
  });
});

describe('NotificationBell', () => {
  it('AC-2, AC-61: names the bell with the number; hides it at 0; the live region is silent on first render', () => {
    renderBell({ unread: 12, badges: { '/teacher/enquiries': 3 } });
    expect(screen.getByRole('button', { name: 'Notifications, 12 unread' })).toBeInTheDocument();
    expect(screen.getByTestId('bell-count')).toHaveTextContent('9+');
    expect(screen.getByTestId('bell-live')).toHaveTextContent('');
    expect(screen.getByTestId('bell-live')).toHaveAttribute('aria-live', 'polite');
    // The menu badge: amber pair, read as "3 waiting for you".
    expect(screen.getByRole('link', { name: 'Enquiries, 3 waiting for you' })).toBeInTheDocument();
    const badge = screen.getByTestId('menu-badge');
    expect(badge).toHaveClass('bg-secondary-container', 'text-on-secondary-container');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });

  it('AC-2: no number at 0', () => {
    renderBell({ unread: 0 });
    expect(screen.queryByTestId('bell-count')).toBeNull();
    expect(screen.getByRole('link', { name: 'Enquiries' })).toBeInTheDocument();
  });

  it('AC-38: a loading skeleton while the rows load, then the empty state', async () => {
    let resolve: (v: unknown) => void = () => {};
    actions.loadNotificationsAction.mockReturnValue(new Promise((r) => (resolve = r)));
    renderBell({ unread: 0 });
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading notifications');
    // AC-4: opening loads with the panel view only and marks nothing read.
    expect(actions.loadNotificationsAction).toHaveBeenCalledWith({ view: 'panel' });
    expect(actions.markReadAction).not.toHaveBeenCalled();
    await act(async () => resolve({ ok: true, items: [], nextCursor: null }));
    expect(screen.getByTestId('notifications-empty')).toHaveTextContent("You're all caught up");
  });

  it('AC-38: the student sheet is child-friendly: "Your updates", no labels, no See all', async () => {
    actions.loadNotificationsAction.mockResolvedValue({ ok: true, items: [], nextCursor: null });
    renderBell({ unread: 0, role: 'student' });
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    expect(await screen.findByTestId('notifications-empty')).toHaveTextContent("You're all caught up!");
    expect(screen.getByRole('heading', { name: 'Your updates' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'See all notifications' })).toBeNull();
  });

  it('AC-31, D-7: the student sheet never shows an action label', async () => {
    actions.loadNotificationsAction.mockResolvedValue({ ok: true, items: [row()], nextCursor: null });
    renderBell({ unread: 1, role: 'student' });
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    await screen.findByTestId('notification-row');
    expect(screen.queryByText('Needs your reply')).toBeNull();
  });

  it('AC-39: a load failure shows Try again, which loads again', async () => {
    actions.loadNotificationsAction
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, items: [row()], nextCursor: null });
    renderBell();
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load your notifications.");
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('notification-row')).toHaveTextContent('Needs your reply');
  });

  it('AC-6, AC-61: Mark as read lowers the bell at once and announces it once', async () => {
    actions.loadNotificationsAction.mockResolvedValue({ ok: true, items: [row()], nextCursor: null });
    actions.markReadAction.mockResolvedValue({ ok: true, unread: 2 });
    renderBell({ unread: 3 });
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as read: New enquiry from Anita' }));
    expect(screen.getByTestId('bell-count')).toHaveTextContent('2');
    expect(screen.getByTestId('bell-live')).toHaveTextContent('2 unread notifications');
    expect(screen.getByTestId('notification-row')).toHaveAttribute('data-unread', 'false');
  });

  it('AC-60: a failed Mark as read keeps the row unread, restores the bell and offers a retry', async () => {
    actions.loadNotificationsAction.mockResolvedValue({ ok: true, items: [row()], nextCursor: null });
    actions.markReadAction.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, unread: 2 });
    renderBell({ unread: 3 });
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as read: New enquiry from Anita' }));
    expect(await screen.findByText("Couldn't mark as read. Try again.")).toBeInTheDocument();
    expect(screen.getByTestId('notification-row')).toHaveAttribute('data-unread', 'true');
    expect(screen.getByTestId('bell-count')).toHaveTextContent('3');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('bell-count')).toHaveTextContent('2'));
    expect(screen.queryByText("Couldn't mark as read. Try again.")).toBeNull();
  });

  it('AC-60: a failed Mark all changes nothing and says so once; a failed open stays and keeps the row unread', async () => {
    actions.loadNotificationsAction.mockResolvedValue({ ok: true, items: [row()], nextCursor: null });
    actions.markAllReadAction.mockResolvedValue({ ok: false });
    actions.openNotificationAction.mockResolvedValue({ ok: false });
    renderBell({ unread: 3 });
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    await screen.findByTestId('notification-row');
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findAllByText("Couldn't mark all as read. Try again.")).toHaveLength(1);
    expect(screen.getByTestId('bell-count')).toHaveTextContent('3');
    await userEvent.click(screen.getByRole('button', { name: /^New enquiry from Anita/ }));
    expect(await screen.findByText("Couldn't open this. Try again.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId('notification-row')).toHaveAttribute('data-unread', 'true');
  });

  it('AC-5: opening goes through the open step and follows only the internal path it returns', async () => {
    actions.loadNotificationsAction.mockResolvedValue({ ok: true, items: [row()], nextCursor: null });
    actions.openNotificationAction.mockResolvedValue({ ok: true, href: '/teacher/enquiries', unread: 2 });
    renderBell({ unread: 3 });
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^New enquiry from Anita/ }));
    expect(actions.openNotificationAction).toHaveBeenCalledWith(row().id);
    expect(push).toHaveBeenCalledWith('/teacher/enquiries');
    expect(screen.getByTestId('bell-count')).toHaveTextContent('2');
  });

  it('AC-67: a redacted row shows only the neutral title, time and unread state', async () => {
    actions.loadNotificationsAction.mockResolvedValue({
      ok: true,
      items: [row({ redacted: true, kind: null, title: 'Notification no longer available', body: null, label: null })],
      nextCursor: null,
    });
    renderBell();
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    const r = await screen.findByTestId('notification-row');
    expect(within(r).getByTestId('notification-title')).toHaveTextContent('Notification no longer available');
    expect(r).not.toHaveTextContent('Needs your reply');
    expect(r).toHaveTextContent('Unread');
  });
});
