import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { FileViewer } from '@/components/files/FileViewer';
import { AccessDenied } from '@/components/states/AccessDenied';
import { Wordmark } from '@/components/Wordmark';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { fileOutline } from '@/server/files/pieces';
import { noteRefusedRead } from '@/server/files/store';
import { getViewer } from '@/server/session';

export const metadata: Metadata = { title: 'File' };
export const dynamic = 'force-dynamic';

const HOME: Record<string, string> = { parent: '/parent', teacher: '/teacher', student: '/student' };

/**
 * Opens a private file (CR-07 H-2a): a teacher resource or a homework page. The same access
 * rules as the file itself; anyone else sees their role's "not found" page.
 */
export default async function FileViewPage({ params }: { params: Promise<{ id: string }> }) {
  if (isDemoMode()) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.mfaPending) redirect('/security-check');
  const { id } = await params;
  const outline = await fileOutline(db(), viewer.id, id);
  if (!outline) {
    await noteRefusedRead(db(), viewer.id, id);
    // The same role-specific "not found" as every other refused page (board 9).
    return (
      <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-6 px-4 py-8">
        <Wordmark size={24} href={HOME[viewer.role] ?? '/'} />
        <AccessDenied viewerRole={viewer.role} />
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-[1040px] flex-col gap-4 bg-surface px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Wordmark size={24} href={HOME[viewer.role] ?? '/'} />
        <a href={HOME[viewer.role] ?? '/'} className="font-bold">
          Back to {viewer.role === 'student' ? 'my home' : 'home'}
        </a>
      </div>
      <h1 className="m-0 break-words text-headline-sm">{outline.fileName}</h1>
      <FileViewer
        fileId={id}
        fileName={outline.fileName}
        mediaType={outline.mediaType}
        byteSize={outline.byteSize}
        pieces={outline.pieces}
      />
    </main>
  );
}
