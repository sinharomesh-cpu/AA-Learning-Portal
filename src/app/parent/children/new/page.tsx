import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';
import { CURRICULA, hasChildConsents } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { ConsentForm, CreateChildForm } from '../ChildForms';

export const metadata: Metadata = { title: 'Add a child' };

const SECTIONS = [
  [
    'What we collect about your child',
    "First name, grade, curriculum, subjects, time zone and the sign-in details you create. We do not ask for your child's email, phone number, school or photo.",
  ],
  [
    'How the AA Pro AI Tutor works',
    "During a lesson, the AI Tutor receives your child's grade, subject, chosen chapter and the textbook pages for that lesson so it can teach from them.",
  ],
  ['Voice and recordings', 'Your child talks to the AI Tutor by voice. Raw audio is not stored.'],
] as const;

/**
 * Add a child: M-06 privacy notice and guardian consent the first time (board 16), then the
 * M-08 create form (board 18). Real accounts only; the sample preview shows a placeholder.
 */
export default async function AddChildPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Add a child"
        body="Adding a child works with real accounts. The sample preview uses built-in sample children."
        homeHref="/parent/children"
        homeLabel="Back to children"
      />
    );
  }
  const consented = await hasChildConsents(db(), access.viewer.id);
  return (
    <div className="flex max-w-[920px] flex-col gap-6">
      <Link href="/parent/children" className="self-start text-[15px] font-bold">
        ← Back to children
      </Link>
      {consented ? (
        <>
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">Add a child</h1>
          <CreateChildForm
            curricula={CURRICULA}
            initial={{
              name: '',
              grade: 5,
              curriculum: null,
              timeZone: access.viewer.timeZone,
              subjects: [],
              avatar: 'star',
            }}
          />
        </>
      ) : (
        <>
          <p className="rounded-[16px] border-2 border-dashed border-error bg-error-container px-4 py-3 text-[15px] font-bold text-on-error-container">
            DRAFT — not legal text. Final wording comes from legal review.
          </p>
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">Before you add your child</h1>
          <p className="text-body-lg text-on-surface-variant">
            Please read how AA Pro uses your family&apos;s information, then choose what you agree to.
          </p>
          <div className="rounded-md border border-card-border bg-white px-4 sm:px-6">
            {SECTIONS.map(([title, body]) => (
              <section key={title} className="flex flex-col gap-1.5 border-b border-surface-container py-4">
                <h2 className="text-[18px] font-bold leading-[26px]">{title}</h2>
                <p className="text-[15px] leading-6 text-on-surface-variant">{body}</p>
              </section>
            ))}
            <section className="flex flex-col gap-1.5 border-b border-surface-container py-4">
              <h2 className="text-[18px] font-bold leading-[26px]">Session summaries</h2>
              <p className="text-[15px] leading-6 text-on-surface-variant">
                After a lesson AA Pro keeps a short summary and progress notes that you and your child can see.
              </p>
              <p className="text-sm leading-5 text-on-warning-container">
                <strong>Not decided yet (D-24):</strong> how summaries are made and how long they are kept.
              </p>
            </section>
            <section className="flex flex-col gap-1.5 py-4">
              <h2 className="text-[18px] font-bold leading-[26px]">Keeping and deleting data</h2>
              <p className="text-[15px] leading-6 text-on-surface-variant">
                You will be able to ask us to delete your child&apos;s data from the child&apos;s profile.
              </p>
              <p className="text-sm leading-5 text-on-warning-container">
                <strong>Not decided yet (D-28):</strong> retention periods and hosting region.
              </p>
            </section>
          </div>
          <ConsentForm />
        </>
      )}
    </div>
  );
}
