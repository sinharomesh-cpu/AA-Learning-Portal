/**
 * Teacher search addresses (OC-84, OC-105). Every result page has its own address, so the
 * search works without JavaScript and Back / sharing keep the choices.
 */
export interface SearchValues {
  name: string;
  subject: string | null;
  grade: number | null;
  curriculum: string | null;
  minExperience: number | null;
  sort: 'newest' | 'experience';
}

/** Address of the teacher list with these values (empty values left out). */
export function teachersHref(v: Partial<SearchValues>, hash = ''): string {
  const q = new URLSearchParams();
  if (v.name) q.set('name', v.name);
  if (v.subject) q.set('subject', v.subject);
  if (v.grade) q.set('grade', String(v.grade));
  if (v.curriculum) q.set('curriculum', v.curriculum);
  if (v.minExperience) q.set('experience', String(v.minExperience));
  if (v.sort && v.sort !== 'newest') q.set('sort', v.sort);
  const s = q.toString();
  return `/teachers${s ? `?${s}` : ''}${hash}`;
}
