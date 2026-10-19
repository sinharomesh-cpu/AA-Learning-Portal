import { render, screen, within } from '@testing-library/react';
import { axeViolations } from '../../../tests/unit/axe';
import { PACKAGE_TERMS_VERSION } from '@/lib/pricing';
import { HourlyOfferBox, PackageOfferBox } from './Offers';

const PKG = {
  currency: 'INR' as const,
  priceMinor: 850000,
  classes: 22,
  perWeek: 2,
  minutes: 40,
  weeks: 11,
  times: [
    { weekday: 1, start: 1020 },
    { weekday: 3, start: 1020 },
  ],
  termsVersion: PACKAGE_TERMS_VERSION,
  termsNote: null,
};

describe('CR-15 offer boxes (PM1)', () => {
  it('hourly: rate, calculated lesson price, a setting per time, no minimum', async () => {
    const { container } = render(
      <HourlyOfferBox
        hourly={{ currency: 'INR', rateMinor: 60000, minutes: 40 }}
        slots={[
          { weekday: 1, start: 1020, end: 1080, negotiable: true },
          { weekday: 6, start: 600, end: 720, negotiable: false },
        ]}
        teacherZone="Asia/Kolkata"
        convert={false}
      />,
    );
    const box = screen.getByRole('region', { name: 'Hourly lessons' });
    expect(box).toHaveTextContent('₹600');
    expect(box).toHaveTextContent('₹400 a 40-minute lesson');
    expect(within(box).getByText('Open to offers')).toBeInTheDocument();
    expect(within(box).getByText('Fixed rate')).toBeInTheDocument();
    expect(box).toHaveTextContent('no minimum number of lessons');
    expect(box).not.toHaveTextContent(/22/);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('package: total price, own setting, period in weeks, never "month", no renewal', async () => {
    const { container } = render(
      <PackageOfferBox pkg={PKG} negotiable={false} teacherZone="Asia/Kolkata" convert={false} />,
    );
    const box = screen.getByRole('region', { name: 'Learning package' });
    expect(box).toHaveTextContent('₹8,500');
    expect(box).toHaveTextContent('22 classes × 40 min · 2 a week · complete within 11 weeks');
    expect(within(box).getByText('Fixed price')).toBeInTheDocument();
    expect(box).toHaveTextContent('never renews automatically');
    expect(box).toHaveTextContent('Mon 5:00 pm–5:40 pm');
    expect(box).not.toHaveTextContent(/month/i);
    expect(box).not.toHaveTextContent(/save|discount|per class/i);
    expect(await axeViolations(container)).toEqual([]);
  });
});
