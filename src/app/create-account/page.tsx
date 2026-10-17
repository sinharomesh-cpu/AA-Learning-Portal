import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LinkButton } from '@/components/Button';
import { Icon, type IconName } from '@/components/public/icons';
import { BackToHomeLink, BrandMark, PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { cx } from '@/lib/cx';
import { ROLE_HOME } from '@/lib/roles';
import { isDemoMode } from '@/server/demo';
import { realAuthEnabled } from '@/server/realAuth';
import { getViewer } from '@/server/session';
import { db } from '@/server/db/client';
import { getPublicListing } from '@/server/publicListings';
import { CreateAccountForm } from './CreateAccountForm';

export const metadata: Metadata = { title: 'Create an account' };

/** Board 62 (approved, OC-55). In demo mode or without a database: accounts are not open. */
const NEXT: Array<{ icon: IconName; title: string; body: string; tone: string }> = [
  {
    icon: 'mail',
    title: '1. Check your email',
    body: 'We send you a link to confirm your address. It works once and expires in 24 hours.',
    tone: 'bg-primary-fixed text-on-primary-fixed-variant',
  },
  {
    icon: 'family',
    title: '2. Parents: add your children',
    body: 'You choose each child’s username and password. Children never need an email or phone.',
    tone: 'bg-[var(--pub-amber-bg)] text-[var(--pub-amber)]',
  },
  {
    icon: 'teacher',
    title: '2. Teachers: tell us about your teaching',
    body: 'The AA Pro team checks every teacher before they can see any child.',
    tone: 'bg-[var(--pub-violet-bg)] text-[var(--pub-violet)]',
  },
];

/** Board 62 (approved, OC-55), in the ZIP 5 "Create an account" layout. Demo or no database: not open. */
export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  // D11: "Connect with teacher" while signed out. Only a live listing's public address is used.
  const raw = (await searchParams).connect;
  let connect: { publicId: string; teacherName: string } | undefined;
  if (realAuthEnabled() && typeof raw === 'string' && /^t-[a-z0-9]{10}$/.test(raw)) {
    const listing = await getPublicListing(db(), raw);
    if (listing) connect = { publicId: listing.publicId, teacherName: listing.name };
  }
  if (!realAuthEnabled()) {
    return (
      <PublicShell>
        <main className={cx(PUBLIC_WRAP, 'flex flex-col gap-6 py-8 md:py-12')}>
          <BackToHomeLink />
          <section className="pub-card flex max-w-[720px] flex-col gap-5 rounded-[40px] p-6 sm:p-10">
            <BrandMark />
            <h1 className="font-headline text-[34px] font-extrabold leading-[42px] tracking-[-0.02em]">
              Create an account
            </h1>
            <p className="text-body-lg text-on-surface-variant">
              Parent and teacher accounts are not open yet. They are being built now and will open before launch.
            </p>
            {isDemoMode() ? (
              <p className="text-body-md">
                This preview uses sample accounts instead. You can try them from the sign-in page.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/sign-in">Go to sign in</LinkButton>
              <LinkButton href="/" variant="secondary">
                Back to home
              </LinkButton>
            </div>
          </section>
        </main>
      </PublicShell>
    );
  }
  return (
    <PublicShell>
      <main className={cx(PUBLIC_WRAP, 'flex flex-col gap-6 py-8 md:py-12')}>
        <BackToHomeLink />
        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          <section
            aria-labelledby="create-title"
            className="pub-card flex flex-col gap-6 rounded-[40px] p-6 sm:p-10 lg:col-span-7"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <BrandMark />
              <span className="rounded-full bg-[var(--pub-amber-bg)] px-2.5 py-0.5 text-label-sm text-[var(--pub-amber)]">
                Grades 1–12
              </span>
            </div>
            <h1
              id="create-title"
              className="font-headline text-[34px] font-extrabold leading-[42px] tracking-[-0.02em] md:text-[44px] md:leading-[52px]"
            >
              Create an account
            </h1>
            <CreateAccountForm connect={connect} />
          </section>
          <aside aria-labelledby="next-steps" className="flex flex-col gap-5 lg:col-span-5">
            <div className="flex flex-col gap-1.5">
              <h2
                id="next-steps"
                className="font-headline text-[30px] font-extrabold leading-[38px] tracking-[-0.02em] md:text-[36px] md:leading-[44px]"
              >
                What happens next
              </h2>
              <p className="text-body-md text-on-surface-variant">
                Three short steps before your family or teaching home opens.
              </p>
            </div>
            {NEXT.map((n) => (
              <div key={n.title} className="pub-card flex items-start gap-4 rounded-[32px] p-6">
                <span className={cx('flex size-11 flex-none items-center justify-center rounded-full', n.tone)}>
                  <Icon name={n.icon} size={22} />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-headline text-[20px] font-bold leading-7">{n.title}</h3>
                  <p className="text-body-md text-on-surface-variant">{n.body}</p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-4 rounded-[32px] bg-surface-container p-6">
              <span className="flex size-11 flex-none items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant">
                <Icon name="shield" size={20} />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-headline text-[20px] font-bold leading-7">Parents stay in charge</h3>
                <p className="text-body-md text-on-surface-variant">
                  Children never need an email or phone. You decide which teachers can see each child, and for which
                  subjects.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}
