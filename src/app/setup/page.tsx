import type { Metadata } from 'next';
import { HEAD, SHELL } from '@/components/ui/styles';
import { notFound } from 'next/navigation';
import { BackToHome } from '@/components/BackToHome';
import { Wordmark } from '@/components/Wordmark';
import { ownerSetupOpen } from '@/server/auth/owner';
import { db } from '@/server/db/client';
import { realAuthEnabled } from '@/server/realAuth';
import { OwnerSetupForm } from '../admin/security/SecurityForms';

export const metadata: Metadata = { title: 'Owner set-up', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * One-off Super Admin set-up for the owner (OC-50). It exists only until the owner has set a
 * password; after that the address shows "page not found".
 */
export default async function OwnerSetupPage() {
  if (!realAuthEnabled() || !(await ownerSetupOpen(db()))) notFound();
  return (
    <>
      <BackToHome />
      <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 py-10">
        <Wordmark size={32} href="/" />
        <section className={SHELL}>
          <div className={HEAD}>
            <h1 id="page-title" className="font-headline text-[28px] font-bold leading-9">
              Set up the Super Admin
            </h1>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            <p className="text-body-md text-on-surface-variant">
              This page is for the owner of AA Pro and works only once. Enter the owner&apos;s email address and
              we&apos;ll send a link to set your password. After that you set up a security code on your phone.
            </p>
            <OwnerSetupForm />
          </div>
        </section>
      </main>
    </>
  );
}
