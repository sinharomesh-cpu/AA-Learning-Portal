import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Button, LinkButton } from '@/components/Button';
import {
  BookedOutcome,
  BookingErrorOutcome,
  NotOpenOutcome,
  TimeTakenOutcome,
} from '@/components/booking/BookingOutcome';
import { Card } from '@/components/Card';
import { JoinButton } from '@/components/JoinButton';
import { SessionRow } from '@/components/SessionRow';
import { StatusChip } from '@/components/StatusChip';
import { SubjectCard } from '@/components/SubjectCard';
import { TextField } from '@/components/TextField';
import { Wordmark } from '@/components/Wordmark';
import { OfflineBanner } from '@/components/states/OfflineBanner';
import { EmptyState, ErrorState, LoadingState, SuccessMessage } from '@/components/states/States';
import { isDemoMode } from '@/server/demo';
import { TeachersSection } from '@/components/landing/TeachersSection';
import { DialogDemo } from './DialogDemo';

export const metadata: Metadata = { title: 'Design system' };

/** Synthetic listings for reviewing the card design (never shown on the home page). */
const SAMPLE_LISTINGS = [
  {
    id: 'sample-a',
    name: 'Sample Teacher A',
    subjects: ['Maths', 'Science'],
    grades: [6, 7, 8],
    curricula: ['CBSE'],
    experienceYears: 9,
    prices: ['₹600 per hour', '₹2,200 a week', '₹8,000 a month'],
  },
  {
    id: 'sample-b',
    name: 'Sample Teacher B',
    subjects: ['English', 'SST'],
    grades: [1, 2, 3, 4, 5],
    curricula: ['ICSE', 'State board'],
    experienceYears: 4,
    prices: ['₹500 per hour', '₹1,800 a week'],
  },
  {
    id: 'sample-c',
    name: 'Sample Teacher C',
    subjects: ['Hindi', 'IT'],
    grades: [9, 10, 11, 12],
    curricula: [],
    experienceYears: null,
    prices: [],
  },
];

/** Review page for WP-1/WP-2 components. Exists only in demo mode (OC-27). */
export default function DesignSystemPage() {
  if (!isDemoMode()) notFound();
  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-4 py-8 sm:px-6">
      <Wordmark size={32} />
      <h1 className="text-headline-lg">Design system review</h1>
      <p className="text-body-md text-on-surface-variant">
        Components and states from the approved Tokens and Common-states boards, with synthetic content.
      </p>

      <Card aria-labelledby="ds-type">
        <h2 id="ds-type" className="mb-4 text-headline-md">
          Typography
        </h2>
        <p className="font-headline text-headline-xl">Headline XL 40/52</p>
        <p className="font-headline text-headline-lg">Headline L 32/40</p>
        <p className="font-headline text-headline-md">Headline M 24/32</p>
        <p className="font-headline text-headline-sm">Headline S 20/28</p>
        <p className="text-body-lg">Body L 18/28</p>
        <p className="text-body-md">Body M 16/24</p>
        <p className="text-body-sm">Body S 14/20</p>
        <p className="text-label-sm uppercase">Label S 12/16</p>
      </Card>

      <Card aria-labelledby="ds-buttons">
        <h2 id="ds-buttons" className="mb-4 text-headline-md">
          Buttons
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Save changes</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger">Delete</Button>
          <Button size="child">Let&apos;s go</Button>
          <Button inactive>Not available yet</Button>
          <LinkButton href="/design-system" variant="secondary">
            Link styled as a button
          </LinkButton>
        </div>
      </Card>

      <Card aria-labelledby="ds-chips">
        <h2 id="ds-chips" className="mb-4 text-headline-md">
          Status chips
        </h2>
        <div className="flex flex-wrap gap-2">
          <StatusChip kind="ai">AI Tutor</StatusChip>
          <StatusChip kind="human">Teacher</StatusChip>
          <StatusChip kind="success">Confirmed</StatusChip>
          <StatusChip kind="warning">Waiting for parent</StatusChip>
          <StatusChip kind="error">Cancelled</StatusChip>
          <StatusChip kind="neutral">Draft</StatusChip>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="ds-fields">
          <h2 id="ds-fields" className="mb-4 text-headline-md">
            Fields
          </h2>
          <div className="flex flex-col gap-4">
            <TextField label="Email" type="email" hint="Use your AA Pro email." autoComplete="off" />
            <TextField label="Your username" size="child" error="Oops, that didn't match." defaultValue="kiran-4821" />
          </div>
        </Card>
        <Card aria-labelledby="ds-sessions">
          <h2 id="ds-sessions" className="mb-2 text-headline-md">
            Sessions
          </h2>
          <ul className="m-0 list-none p-0">
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
          </ul>
          <div className="mt-4 flex flex-col items-start gap-3">
            <JoinButton />
          </div>
        </Card>
      </div>

      <Card aria-labelledby="ds-subjects">
        <h2 id="ds-subjects" className="mb-4 text-headline-md">
          Subject cards
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <SubjectCard subject="maths" detail="Maths practice book (sample)" href="/design-system" />
          <SubjectCard subject="science" detail="Science notes (sample)" href="/design-system" />
          <SubjectCard subject="sst" detail="No book assigned yet" href="/design-system" />
        </div>
      </Card>

      <Card aria-labelledby="ds-states">
        <h2 id="ds-states" className="mb-4 text-headline-md">
          Common states
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <LoadingState />
          <EmptyState
            title="Nothing here yet"
            action={<LinkButton href="/design-system">Book an AI lesson</LinkButton>}
          >
            You have no lessons booked for today.
          </EmptyState>
          <ErrorState
            audience="adult"
            reference="REF-7F3A-21C0"
            action={<Button variant="secondary">Try again</Button>}
          />
          <SuccessMessage>
            <strong>Saved.</strong> Your changes are in place.
          </SuccessMessage>
          <OfflineBanner />
        </div>
      </Card>

      <Card aria-labelledby="ds-outcomes">
        <h2 id="ds-outcomes" className="mb-2 text-headline-md">
          AI booking outcomes (M-17)
        </h2>
        <p className="mb-4 text-body-md text-on-surface-variant">
          All four outcome states. In the demo flow only &quot;booked&quot; and &quot;not open&quot; can occur; the
          other two need real concurrent bookings (Phase 3).
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <BookedOutcome
            headingLevel={2}
            subjectName="Maths"
            chapter="Chapter 6 — Maths practice book (sample)"
            dayLabel="Today"
            timeLabel="5:15 pm"
            length={30}
          />
          <TimeTakenOutcome
            headingLevel={2}
            timeLabel="5:15 pm"
            alternatives={[
              { label: '5:30 pm', href: '/design-system#ds-outcomes' },
              { label: '6:00 pm', href: '/design-system#ds-outcomes-2' },
              { label: '6:15 pm', href: '/design-system#ds-outcomes-3' },
            ]}
          />
          <BookingErrorOutcome headingLevel={2} />
          <NotOpenOutcome headingLevel={2} />
        </div>
      </Card>

      <Card aria-labelledby="ds-dialog">
        <h2 id="ds-dialog" className="mb-4 text-headline-md">
          Confirmation dialog
        </h2>
        <DialogDemo />
      </Card>

      <div className="aa-public rounded-md border border-card-border px-4 sm:px-6">
        <p className="mt-6 rounded-[14px] border border-warning-border bg-warning-container px-4 py-3 text-[15px] font-bold text-on-warning-container">
          Sample listings for design review only — not real teachers. The home page shows listing cards only once
          teachers can publish listings (OC-84).
        </p>
        <TeachersSection wrap="" marketplace={{ listings: true, enquiries: false }} listings={SAMPLE_LISTINGS} />
      </div>
    </main>
  );
}
