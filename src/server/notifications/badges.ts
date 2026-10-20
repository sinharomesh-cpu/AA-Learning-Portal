import 'server-only';
import { REMINDER_DAYS } from '@/lib/listing';
import type { Db } from '../db/client';
import type { NotificationViewer } from './access';

/**
 * Menu badges (CR-16 §4.1, §4.2, N-2): counts of the signed-in user's pending actions, from the
 * business records only — never from notifications. An item whose `expires_at` has passed is not
 * counted even before any expiry sweep has changed its status, so badges never wait for the
 * shared sweep, its throttle or the user-scoped check. Reading, opening or removing notifications
 * never changes a badge. Keys are the menu items' paths.
 */
export type MenuBadges = Record<string, number>;

const DAY = 24 * 60 * 60 * 1000;

export async function menuBadges(sql: Db, v: NotificationViewer | null, now: Date = new Date()): Promise<MenuBadges> {
  // Teachers awaiting approval or not approved, students, Super Admin and Admin: none (D-5, D-6).
  if (!v || v.standing !== 'full') return {};
  if (v.role === 'teacher') {
    const [c] = await sql<
      Array<{ students: number; enquiries: number; rates: number; renewal: boolean; pkg: boolean }>
    >`
      SELECT
        (SELECT count(*)::int FROM teacher_student_links
          WHERE teacher_id = ${v.id} AND status = 'requested' AND expires_at > ${now}) AS students,
        (SELECT count(*)::int FROM teacher_enquiries
          WHERE teacher_id = ${v.id} AND status = 'pending' AND expires_at > ${now}) AS enquiries,
        (SELECT count(*)::int FROM rate_negotiations
          WHERE teacher_id = ${v.id} AND status IN ('pending', 'countered') AND turn = 'teacher'
            AND expires_at > ${now}) AS rates,
        -- The listing page's renewalDue rule: published or paused (also once ended), ending within 7 days.
        EXISTS (SELECT 1 FROM teacher_listings
                WHERE teacher_id = ${v.id} AND status IN ('published', 'paused') AND expires_at IS NOT NULL
                  AND expires_at <= ${new Date(now.getTime() + REMINDER_DAYS * DAY)}) AS renewal,
        -- packageNeedsDetails: a converted package in needs_review while pricing model v2 is on.
        (EXISTS (SELECT 1 FROM learning_packages WHERE teacher_id = ${v.id} AND status = 'needs_review')
         AND EXISTS (SELECT 1 FROM platform_settings WHERE key = 'pricing_model_v2' AND value = 1)) AS pkg`;
    return {
      '/teacher/students': c!.students,
      '/teacher/enquiries': c!.enquiries + c!.rates,
      '/teacher/listing': (c!.renewal ? 1 : 0) + (c!.pkg ? 1 : 0),
    };
  }
  if (v.role === 'parent') {
    const [c] = await sql<Array<{ rates: number }>>`
      SELECT count(*)::int AS rates FROM rate_negotiations
      WHERE parent_id = ${v.id} AND status IN ('pending', 'countered') AND turn = 'parent' AND expires_at > ${now}`;
    return { '/parent/enquiries': c!.rates };
  }
  return {};
}
