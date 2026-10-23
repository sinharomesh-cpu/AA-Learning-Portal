import 'server-only';
import { childrenOf, type ChildSummary } from '@/fixtures/family';
import { findPersona, type Persona } from '@/fixtures/personas';
import { SUBJECTS } from '@/fixtures/subjects';
import { getChild, listChildren } from './children';
import { db } from './db/client';
import { isDemoMode } from './demo';
import { parentHomeLessons } from './lessonViews';

/**
 * The signed-in parent's children for the family pages (P19, M-07): synthetic in demo mode,
 * otherwise from the database, with each child's open lesson requests and upcoming lessons (CR-17 PR 2).
 */
export async function familyChildren(viewer: Persona, now: Date): Promise<ChildSummary[]> {
  if (viewer.role !== 'parent') return [];
  if (isDemoMode()) return childrenOf(viewer.id, now);
  const rows = await listChildren(db(), viewer.id);
  const lessons = await parentHomeLessons(viewer.id, viewer.timeZone, now);
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    initial: [...c.name][0]?.toUpperCase() ?? '?',
    grade: c.grade,
    curriculum: c.curriculum ?? 'Not set',
    timeZone: c.timeZone,
    subjects: c.subjects.map((s) => SUBJECTS[s].name),
    lessons: lessons.filter((l) => l.studentId === c.id),
    paused: c.status === 'suspended',
  }));
}

/** True only when the child is linked to the signed-in parent (FR-002.2). */
export function viewerOwnsChild(viewer: Persona, childId: string): boolean {
  return viewer.role === 'parent' && (viewer.childIds ?? []).includes(childId);
}

/** A linked child's first name, or null when the child is not the signed-in parent's. */
export async function ownChildName(viewer: Persona, childId: string): Promise<string | null> {
  if (!viewerOwnsChild(viewer, childId)) return null;
  if (isDemoMode()) return findPersona(childId)?.displayName ?? null;
  return (await getChild(db(), viewer.id, childId))?.name ?? null;
}
