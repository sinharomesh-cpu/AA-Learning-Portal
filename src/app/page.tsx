import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/Wordmark';
import { ROLE_HOME } from '@/lib/roles';
import { isDemoMode } from '@/server/demo';
import { getViewer } from '@/server/session';

export default async function HomePage() {
  const viewer = await getViewer();
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  if (isDemoMode()) redirect('/sign-in');
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-4 px-4 py-16">
      <h1>
        <Wordmark size={36} />
      </h1>
      <p className="text-body-lg text-on-surface-variant">Sign-in and the role portals are not available yet.</p>
    </main>
  );
}
