import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { CURRICULA } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getViewer } from '@/server/session';
import { getTeacherProfile } from '@/server/teacherProfile';
import { ownPhotoState } from '@/server/teacherPhotos';
import { PhotoForm } from './PhotoForm';
import { SearchVisibilityForm } from './SearchVisibilityForm';
import { type ProfileMode, TeacherProfileForm } from './TeacherProfileForm';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

const describe = (subjects: string[], grades: number[]) =>
  [
    subjects.map((s) => SUBJECTS[s as SubjectId]?.name ?? s).join(', ') || 'No subjects',
    grades.length ? `Grades ${grades.join(', ')}` : 'No grades',
  ].join(' · ');

/**
 * M-20 onboarding (before approval) and M-22 edit (after approval). Unlike other teacher pages,
 * a teacher waiting for approval may open this one (OC-38); a rejected teacher may not (OC-72).
 */
export default async function TeacherProfilePage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.role !== 'teacher') return <AccessDenied viewerRole={viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Profile"
        body="Your teacher profile works with real accounts. The sample preview has no profile to edit."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  const profile = await getTeacherProfile(db(), viewer.id);
  if (!profile || profile.approvalStatus === 'rejected') redirect('/teacher/status');
  const photo = await ownPhotoState(db(), viewer.id);
  const mode: ProfileMode = profile.approvalStatus;
  const approved = mode === 'approved';
  const change = profile.pendingChange;
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: viewer.timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  const chip: Record<ProfileMode, [string, 'warning' | 'neutral' | 'success']> = {
    draft: ['Not sent yet', 'neutral'],
    changes_requested: ['Needs changes', 'warning'],
    submitted: ['Under review', 'warning'],
    approved: ['Approved', 'success'],
  };
  return (
    <div className="flex max-w-[940px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="flex flex-wrap items-center gap-3 text-headline-lg-mobile lg:text-headline-lg">
          {approved ? 'Your teacher profile' : 'Set up your teacher profile'}
          <StatusChip kind={chip[mode][1]}>{chip[mode][0]}</StatusChip>
        </h1>
        <p className="text-body-md text-on-surface-variant">
          {approved
            ? 'Parents see this when choosing a teacher.'
            : 'Parents see this when choosing a teacher. AA Pro reviews it before you can publish times or see students.'}
        </p>
      </div>
      {mode === 'changes_requested' && profile.decisionNote ? (
        <div className="flex flex-col gap-2 rounded-[16px] bg-surface-container-low px-4 py-3 text-[15px] leading-[22px]">
          <strong>Note from AA Pro:</strong>
          <p className="whitespace-pre-line">{profile.decisionNote}</p>
        </div>
      ) : null}
      {mode === 'submitted' ? (
        <FormMessage tone="info">
          Sent for approval{profile.submittedAt ? ` on ${day(profile.submittedAt)}` : ''}. You can still correct it; the
          AA Pro team sees your latest version.
        </FormMessage>
      ) : null}
      {approved && change ? (
        <FormMessage tone="info">
          Waiting for review since {day(change.submittedAt)}: {describe(change.subjects, change.grades)}. Families see
          your approved subjects and grades until then ({describe(profile.subjects, profile.grades)}).
        </FormMessage>
      ) : null}
      {approved && !change && profile.lastChange ? (
        <FormMessage tone={profile.lastChange.decision === 'approved' ? 'success' : 'warning'}>
          {profile.lastChange.decision === 'approved'
            ? `Your subject and grade change was approved on ${day(profile.lastChange.decidedAt)}.`
            : `Your subject and grade change was not accepted on ${day(profile.lastChange.decidedAt)}; your approved subjects and grades stay.`}
          {profile.lastChange.note ? ` Note from AA Pro: ${profile.lastChange.note}` : ''}
        </FormMessage>
      ) : null}
      <TeacherProfileForm
        mode={mode}
        needTerms={!approved && !profile.termsAccepted}
        curriculaOptions={CURRICULA}
        initial={{
          name: profile.name,
          email: profile.email,
          timeZone: profile.timeZone,
          // An approved teacher edits their waiting change, if any, so they can adjust or withdraw it.
          subjects: change?.subjects ?? profile.subjects,
          grades: change?.grades ?? profile.grades,
          bio: profile.bio,
          curricula: profile.curricula,
          experienceYears: profile.experienceYears,
        }}
      />
      <PhotoForm
        initial={[...profile.name.replace(/^(Teacher|Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s+/i, '')][0]?.toUpperCase() ?? '?'}
        approvedId={photo.approvedId}
        pending={photo.pending ? { id: photo.pending.id, since: day(photo.pending.uploadedAt) } : null}
        declined={photo.declined ? { note: photo.declined.note, on: day(photo.declined.decidedAt) } : null}
      />
      <SearchVisibilityForm hidden={profile.hiddenFromSearch} approved={approved} />
    </div>
  );
}
