import { render, screen } from '@testing-library/react';
import { StorageMeter } from '@/components/StorageMeter';
import { adminMenuFor } from '@/config/menus';
import { formatMb, MB, uploadRefusalText } from './storage';

/** OC-96: storage numbers and the words people see when a limit is reached. */
describe('formatMb', () => {
  it('rounds for people', () => {
    expect(formatMb(0)).toBe('0 MB');
    expect(formatMb(1000)).toBe('0.1 MB');
    expect(formatMb(4.25 * MB)).toBe('4.3 MB');
    expect(formatMb(85.4 * MB)).toBe('85 MB');
    expect(formatMb(1024 * MB)).toBe('1.0 GB');
  });
});

describe('limit messages', () => {
  const now = new Date('2026-10-21T04:00:00Z'); // 9:30 am in India

  it('daily limit: when more files can be added, in the viewer’s time', () => {
    const text = uploadRefusalText(
      { reason: 'daily_limit', limit: 100, nextUploadAt: new Date('2026-10-21T10:10:00Z') },
      'Asia/Kolkata',
      now,
    );
    expect(text).toBe(
      'You have added 100 files in the last 24 hours, the most allowed while AA Pro is being tested. You can add more after 3:40 pm.',
    );
    expect(
      uploadRefusalText(
        { reason: 'daily_limit', limit: 100, nextUploadAt: new Date('2026-10-22T03:00:00Z') },
        'Asia/Kolkata',
        now,
      ),
    ).toContain('after 8:30 am tomorrow');
  });

  it('space full: what is used and what to do', () => {
    expect(uploadRefusalText({ reason: 'space_full', usedBytes: 196.4 * MB, limitBytes: 200 * MB })).toBe(
      'This file would take you past your 200 MB of storage (you are using 196 MB). Remove some files you no longer need, then try again.',
    );
  });

  it('environment full: honest, and nothing already added is affected', () => {
    const text = uploadRefusalText({ reason: 'storage_full' });
    expect(text).toContain("can't be added right now");
    expect(text).toContain('Nothing you have already added is affected');
  });
});

describe('StorageMeter', () => {
  it('says "85 MB of 200 MB used" with today’s uploads', () => {
    render(<StorageMeter usedBytes={85 * MB} limitBytes={200 * MB} uploadsToday={3} uploadsPerDay={100} />);
    expect(screen.getByTestId('storage-used')).toHaveTextContent('85 MB of 200 MB used');
    expect(screen.getByText(/3 of 100 uploads in the last 24 hours/)).toBeInTheDocument();
    expect(screen.queryByText(/nearly full/)).not.toBeInTheDocument();
  });

  it('warns when nearly full and when full', () => {
    const { rerender } = render(
      <StorageMeter usedBytes={160 * MB} limitBytes={200 * MB} uploadsToday={0} uploadsPerDay={100} />,
    );
    expect(screen.getByText(/nearly full/)).toBeInTheDocument();
    rerender(<StorageMeter usedBytes={200 * MB} limitBytes={200 * MB} uploadsToday={0} uploadsPerDay={100} />);
    expect(screen.getByText(/Your storage is full/)).toBeInTheDocument();
  });
});

describe('Admin → Storage', () => {
  it('is in the Super Admin’s menu only', () => {
    expect(adminMenuFor('superadmin').map((i) => i.href)).toContain('/admin/storage');
    expect(adminMenuFor('admin', ['accounts', 'teacher_approvals', 'audit_log']).map((i) => i.href)).not.toContain(
      '/admin/storage',
    );
  });
});
