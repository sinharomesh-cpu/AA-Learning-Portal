import { afterAll, describe, expect, it } from 'vitest';
import {
  answerLesson,
  lessonMaintenance,
  lessonsForParent,
  lessonsForStudent,
  lessonsForTeacher,
} from '@/server/lessons';
import {
  allowMeetingLinks,
  joinTarget,
  meetingPermissionsForParent,
  normaliseZoomLink,
  setMeetingLink,
  stopMeetingLinks,
} from '@/server/meetingLinks';
import { removeTeacher } from '@/server/teacherLinks';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-17 PR 3 (D3A-1, D3A-8; migration 0030): parents allow a teacher's own Zoom links, the teacher
 * adds one per lesson, and Join Class opens it only for the lesson's people inside its window.
 * The link itself never leaves the server except as Join Class's redirect. Synthetic data only.
 */
const sql = testDb();
afterAll(() => sql.end());

const LINK = 'https://us02web.zoom.us/j/81234567890?pwd=SecretPass1';

async function teacher(name = 'Ms Rao') {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET display_name = ${name}, time_zone = 'Asia/Kolkata' WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, 0, 1440)`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', 60000, 30)`;
  return id;
}

/** Two parents (Anita, Ravi) of one child (Kiran), linked to a teacher in maths. */
async function family(t?: string) {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET display_name = 'Anita Shah' WHERE id = ${parent}`;
  await sql`UPDATE accounts SET display_name = 'Ravi Shah' WHERE id = ${parent2}`;
  const child = await createChild(sql, parent);
  await sql`UPDATE accounts SET display_name = 'Kiran' WHERE id = ${child}`;
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher());
  const link = await activeLink(sql, { teacher: tid, child, parent, subjects: ['maths'] });
  return { parent, parent2, child, t: tid, link };
}

/** A lesson starting `fromMin` minutes from now (database clock), inserted with triggers skipped. */
async function lesson(f: { t: string; child: string; parent: string }, fromMin: number, status = 'confirmed') {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [l] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${f.parent}, 'maths', s, 30, s + interval '30 minutes', s - interval '3 days',
             LEAST(s - interval '3 days' + interval '48 hours', s - interval '2 hours'), ${status},
             CASE WHEN ${status} = 'confirmed' THEN s - interval '3 days' + interval '1 minute' END,
             'INR', 60000, 30000, 'listed'
      FROM (SELECT date_trunc('minute', now()) + make_interval(mins => ${fromMin}) AS s) x
      RETURNING id`;
    return l!.id;
  });
}

const notes = (recipient: string) =>
  sql<Array<{ type: string; title: string; body: string; href: string }>>`
    SELECT type, title, body, href FROM notifications WHERE recipient_id = ${recipient} ORDER BY created_at, type`;

describe('PR 3: Zoom links accepted (https, zoom.us only, ≤ 500 characters)', () => {
  it('normalises good links and refuses everything else', () => {
    expect(normaliseZoomLink('  https://us02web.ZOOM.us/j/8123?pwd=Ab.c-d_e  ')).toBe(
      'https://us02web.zoom.us/j/8123?pwd=Ab.c-d_e',
    );
    expect(normaliseZoomLink('https://zoom.us/j/81234567890')).toBe('https://zoom.us/j/81234567890');
    for (const bad of [
      'http://zoom.us/j/1',
      'https://evilzoom.us/j/1',
      'https://zoom.us.example.com/j/1',
      'https://user:pw@zoom.us/j/1',
      'https://zoom.us:8443/j/1',
      'https://zoom.us/j/1 2',
      'javascript:alert(1)',
      'https://bit.ly/abc',
      'zoom.us/j/1',
      `https://zoom.us/j/${'1'.repeat(490)}`,
      '',
      42,
    ])
      expect(normaliseZoomLink(bad)).toBeNull();
  });
});

describe('PR 3: the parent allows the teacher’s meeting links (D3A-1, rules 1–4)', () => {
  it('either parent allows or stops; the other parent is told; a stranger or unlinked teacher gets "not found"', async () => {
    const f = await family();
    const stranger = await createAdult(sql, 'parent');
    const other = await teacher('Mr Iyer');
    expect(await allowMeetingLinks(sql, stranger, f.t, f.child)).toEqual({ ok: false, reason: 'not_found' });
    expect(await allowMeetingLinks(sql, f.parent, other, f.child)).toEqual({ ok: false, reason: 'not_found' });
    expect(await allowMeetingLinks(sql, f.parent, f.t, f.child)).toEqual({ ok: true });
    expect(await allowMeetingLinks(sql, f.parent2, f.t, f.child)).toEqual({ ok: true }); // already allowed: no change
    expect((await notes(f.parent2)).map((n) => [n.type, n.title])).toEqual([
      ['meeting_links_allowed', 'Anita allowed Ms Rao to use their own Zoom meetings for Kiran'],
    ]);
    expect(await notes(f.parent)).toEqual([]); // the parent who acted is not told
    expect((await meetingPermissionsForParent(sql, f.parent2)).map((p) => p.childId)).toEqual([f.child]);
    expect(await meetingPermissionsForParent(sql, stranger)).toEqual([]);

    expect(await stopMeetingLinks(sql, f.parent2, f.t, f.child)).toEqual({ ok: true });
    expect((await notes(f.parent)).map((n) => n.type)).toEqual(['meeting_links_stopped']);
    expect(await meetingPermissionsForParent(sql, f.parent)).toEqual([]);
    expect(await stopMeetingLinks(sql, f.parent, f.t, f.child)).toEqual({ ok: true }); // nothing to stop
  });

  it('removing the teacher withdraws the permission; re-linking needs a fresh “Allow”', async () => {
    const f = await family();
    await allowMeetingLinks(sql, f.parent, f.t, f.child);
    await removeTeacher(sql, f.parent, f.t);
    expect(await meetingPermissionsForParent(sql, f.parent)).toEqual([]);
    await activeLink(sql, { teacher: f.t, child: f.child, parent: f.parent, subjects: ['maths'] });
    expect(await meetingPermissionsForParent(sql, f.parent)).toEqual([]);
  });

  it('when a teacher accepts and no parent has allowed the links yet, both parents are asked once', async () => {
    const f = await family();
    const g = await family();
    const start = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 3 * 86_400_000);
    const ask = async (x: typeof f) => {
      const [r] = await sql<{ id: string }[]>`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, reply_deadline,
                             currency, rate_minor, price_minor, price_basis)
        VALUES (${x.t}, ${x.child}, ${x.parent}, 'maths', ${start}, 30, ${new Date(start.getTime() + 1_800_000)},
                now(), 'INR', 60000, 30000, 'listed') RETURNING id`;
      return r!.id;
    };
    const a = await ask(f);
    await allowMeetingLinks(sql, g.parent, g.t, g.child);
    const b = await ask(g);
    expect(await answerLesson(sql, f.t, a, 'accept')).toEqual({ ok: true });
    expect(await answerLesson(sql, g.t, b, 'accept')).toEqual({ ok: true });
    for (const p of [f.parent, f.parent2]) {
      const asked = (await notes(p)).filter((n) => n.type === 'lesson_link_permission_needed');
      expect(asked.map((n) => [n.title, n.href])).toEqual([
        ['Ms Rao would like to use their own Zoom meetings for Kiran’s lessons', `/parent/teachers/${f.t}`],
      ]);
    }
    expect((await notes(g.parent)).filter((n) => n.type === 'lesson_link_permission_needed')).toEqual([]);
  });
});

describe('PR 3: the teacher adds the lesson’s link', () => {
  it('only with permission, only the lesson’s own teacher, only a confirmed lesson that hasn’t ended', async () => {
    const f = await family();
    const other = await teacher('Mr Iyer');
    const l = await lesson(f, 3 * 24 * 60);
    expect(await setMeetingLink(sql, f.t, l, LINK)).toEqual({ ok: false, reason: 'not_allowed' });
    await allowMeetingLinks(sql, f.parent, f.t, f.child);
    expect(await setMeetingLink(sql, other, l, LINK)).toEqual({ ok: false, reason: 'not_found' });
    expect(await setMeetingLink(sql, f.t, l, 'http://zoom.us/j/1')).toEqual({ ok: false, reason: 'invalid' });
    const requested = await lesson(f, 5 * 24 * 60, 'requested');
    expect(await setMeetingLink(sql, f.t, requested, LINK)).toEqual({ ok: false, reason: 'closed' });
    const ended = await lesson(f, -120);
    expect(await setMeetingLink(sql, f.t, ended, LINK)).toEqual({ ok: false, reason: 'closed' });

    expect(await setMeetingLink(sql, f.t, l, LINK)).toEqual({ ok: true, changed: true });
    expect(await setMeetingLink(sql, f.t, l, LINK)).toEqual({ ok: true, changed: false }); // same link: no news
    expect(await setMeetingLink(sql, f.t, l, 'https://zoom.us/j/999')).toEqual({ ok: true, changed: true });
    for (const p of [f.parent, f.parent2]) {
      const n = (await notes(p)).filter((x) => x.type.startsWith('lesson_link_'));
      expect(n.map((x) => x.type)).toEqual(['lesson_link_added', 'lesson_link_changed']);
      expect(n[0]!.title).toMatch(/^Ms Rao added the meeting link for Kiran’s Maths lesson, /);
    }
  });

  it('the link is never in a notification, a lesson list or a permission list', async () => {
    const f = await family();
    await allowMeetingLinks(sql, f.parent, f.t, f.child);
    const l = await lesson(f, 60);
    await setMeetingLink(sql, f.t, l, LINK);
    const everything = JSON.stringify([
      await sql`SELECT * FROM notifications WHERE recipient_id IN ${sql([f.parent, f.parent2, f.t, f.child])}`,
      await lessonsForParent(sql, f.parent),
      await lessonsForTeacher(sql, f.t),
      await lessonsForStudent(sql, f.child),
      await meetingPermissionsForParent(sql, f.parent),
    ]);
    expect(everything).not.toContain('zoom.us');
    expect(everything).not.toContain('SecretPass1');
    const [item] = (await lessonsForParent(sql, f.parent)).filter((x) => x.id === l);
    expect(item!.meeting).toMatchObject({ allowed: true, added: true, joinOpen: false });
  });
});

describe('PR 3: Join Class (OC-44 window, D3A-1)', () => {
  it('opens for the teacher, both parents and the child inside the window; anyone else gets "not found"', async () => {
    const f = await family();
    const g = await family();
    const other = await teacher('Mr Iyer');
    await allowMeetingLinks(sql, f.parent, f.t, f.child);
    const l = await lesson(f, 5); // starts in 5 minutes: inside the 10-minute window
    expect(await joinTarget(sql, { id: f.parent, role: 'parent' }, l)).toEqual({ ok: false, reason: 'no_link' });
    await setMeetingLink(sql, f.t, l, LINK);
    for (const v of [
      { id: f.t, role: 'teacher' as const },
      { id: f.parent, role: 'parent' as const },
      { id: f.parent2, role: 'parent' as const },
      { id: f.child, role: 'student' as const },
    ])
      expect(await joinTarget(sql, v, l)).toEqual({ ok: true, url: LINK });
    for (const v of [
      { id: g.parent, role: 'parent' as const },
      { id: g.child, role: 'student' as const },
      { id: other, role: 'teacher' as const },
      { id: f.child, role: 'parent' as const },
      { id: f.parent, role: 'student' as const },
    ])
      expect(await joinTarget(sql, v, l)).toEqual({ ok: false, reason: 'not_found' });
    expect(await joinTarget(sql, { id: f.parent, role: 'parent' }, 'not-a-uuid')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('closed before the window and after the end; refused at once when a parent stops allowing', async () => {
    const f = await family();
    await allowMeetingLinks(sql, f.parent, f.t, f.child);
    const early = await lesson(f, 11);
    await setMeetingLink(sql, f.t, early, LINK);
    expect(await joinTarget(sql, { id: f.child, role: 'student' }, early)).toEqual({ ok: false, reason: 'not_open' });
    const now = await lesson(f, 2 * 60);
    await setMeetingLink(sql, f.t, now, LINK);
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lessons SET starts_at = date_trunc('minute', now()) - interval '29 minutes',
                                  ends_at = date_trunc('minute', now()) + interval '1 minute' WHERE id = ${now}`;
    });
    expect(await joinTarget(sql, { id: f.child, role: 'student' }, now)).toEqual({ ok: true, url: LINK });
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lessons SET starts_at = starts_at - interval '2 minutes', ends_at = ends_at - interval '2 minutes'
               WHERE id = ${now}`;
    });
    expect(await joinTarget(sql, { id: f.child, role: 'student' }, now)).toEqual({ ok: false, reason: 'ended' });

    const h = await family();
    await allowMeetingLinks(sql, h.parent, h.t, h.child);
    const soon = await lesson(h, 4);
    await setMeetingLink(sql, h.t, soon, LINK);
    await stopMeetingLinks(sql, h.parent2, h.t, h.child);
    for (const v of [
      { id: h.t, role: 'teacher' as const },
      { id: h.parent, role: 'parent' as const },
      { id: h.child, role: 'student' as const },
    ])
      expect(await joinTarget(sql, v, soon)).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('a cancelled lesson has no link and no Join; after the teacher is removed the teacher gets "not found"', async () => {
    const f = await family();
    await allowMeetingLinks(sql, f.parent, f.t, f.child);
    const l = await lesson(f, 3 * 24 * 60);
    await setMeetingLink(sql, f.t, l, LINK);
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${l}`;
    expect(await sql`SELECT 1 FROM lesson_meeting_links WHERE lesson_id = ${l}`).toHaveLength(0);
    expect(await joinTarget(sql, { id: f.parent, role: 'parent' }, l)).toEqual({ ok: false, reason: 'not_found' });

    const m = await lesson(f, 5);
    await setMeetingLink(sql, f.t, m, LINK);
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE id = ${f.link}`;
    expect(await joinTarget(sql, { id: f.t, role: 'teacher' }, m)).toEqual({ ok: false, reason: 'not_found' });
    expect(await joinTarget(sql, { id: f.parent, role: 'parent' }, m)).toEqual({ ok: false, reason: 'not_allowed' });
  });
});

describe('PR 3: deleting links 7 days after the lesson (D3A-8), with no scheduler', () => {
  it('the lesson maintenance removes links past their time and keeps the others', async () => {
    const f = await family();
    await allowMeetingLinks(sql, f.parent, f.t, f.child);
    const keep = await lesson(f, 2 * 24 * 60);
    const due = await lesson(f, 3 * 24 * 60);
    await setMeetingLink(sql, f.t, keep, LINK);
    await setMeetingLink(sql, f.t, due, LINK);
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lesson_meeting_links SET delete_after = now() - interval '1 second' WHERE lesson_id = ${due}`;
    });
    await lessonMaintenance(sql);
    expect(await sql`SELECT 1 FROM lesson_meeting_links WHERE lesson_id = ${due}`).toHaveLength(0);
    expect(await sql`SELECT 1 FROM lesson_meeting_links WHERE lesson_id = ${keep}`).toHaveLength(1);
  });
});
