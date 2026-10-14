import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/landing/LandingPage';
import { brand } from '@/config/brand';
import { ROLE_HOME } from '@/lib/roles';
import { getViewer } from '@/server/session';

export const metadata: Metadata = {
  title: { absolute: brand.productName },
  description: `${brand.productName}: learning at home with an ${brand.tutorNameShort} and real teachers.`,
};

/** `/`: signed-in users go to their own home; everyone else sees the landing page (OC-39). */
export default async function HomePage() {
  const viewer = await getViewer();
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  return <LandingPage />;
}
