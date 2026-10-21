import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { INPUT, SHELL } from '@/components/ui/styles';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { QUESTION_TYPE_LABEL, type StudentQuestion } from '@/lib/worksheetQuestions';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { previewWorksheet } from '@/server/worksheets';

export const metadata: Metadata = { title: 'Preview as a student' };
export const dynamic = 'force-dynamic';

const FIELD = cx(INPUT, 'min-h-12');

/** What the student would see (read-only). Built from data that never contains the answer key. */
function Question({ q, n }: { q: StudentQuestion; n: number }) {
  const label = `Question ${n}`;
  return (
    <li className="flex flex-col gap-3 rounded-[24px] border border-card-border bg-surface-container-lowest p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-on-surface-variant">
          {label} · {QUESTION_TYPE_LABEL[q.type]}
        </span>
        <span className="text-sm font-bold text-on-surface-variant">
          {q.points} {q.points === 1 ? 'mark' : 'marks'}
        </span>
      </div>
      {q.type === 'fill_blank' ? (
        <p className="m-0 text-[18px] leading-8">
          {(q.parts ?? []).map((p, i, all) => (
            <span key={i}>
              {p}
              {i < all.length - 1 ? (
                <input
                  aria-label={`${label}, blank ${i + 1}`}
                  disabled
                  className={cx(INPUT, 'mx-1 inline-block min-h-10 w-40 align-middle')}
                />
              ) : null}
            </span>
          ))}
        </p>
      ) : (
        <p className="m-0 whitespace-pre-line text-[18px] leading-7">{q.prompt}</p>
      )}
      {q.type === 'single_choice' || q.type === 'multi_select' ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled>
          <legend className="sr-only">{label} options</legend>
          {(q.options ?? []).map((o, i) => (
            <label key={i} className="flex min-h-12 items-center gap-3 rounded-[16px] border border-outline px-4">
              <input type={q.type === 'single_choice' ? 'radio' : 'checkbox'} name={`q${n}`} className="size-5" />
              {o}
            </label>
          ))}
        </fieldset>
      ) : null}
      {q.type === 'true_false' ? (
        <fieldset className="m-0 flex gap-3 border-0 p-0" disabled>
          <legend className="sr-only">{label}: true or false</legend>
          {['True', 'False'].map((t) => (
            <label
              key={t}
              className="flex min-h-12 items-center gap-2 rounded-full border border-outline px-5 font-bold"
            >
              <input type="radio" name={`q${n}`} className="size-5" />
              {t}
            </label>
          ))}
        </fieldset>
      ) : null}
      {q.type === 'matching' ? (
        <div className="flex flex-col gap-2">
          {(q.left ?? []).map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr] items-center gap-2">
              <span className="rounded-[14px] bg-surface-container-low px-3 py-2">{l}</span>
              <select aria-label={`Match for ${l}`} disabled className={FIELD}>
                <option>Choose…</option>
                {(q.right ?? []).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}
      {q.type === 'short_answer' ? (
        <textarea
          aria-label={`${label}, your answer`}
          disabled
          className={cx(INPUT, 'min-h-24 py-3')}
          placeholder={`Up to ${q.maxLength} characters`}
        />
      ) : null}
    </li>
  );
}

/** "Preview as a student" (W2): read-only; nothing is assigned or saved. */
export default async function PreviewWorksheetPage({ params }: { params: Promise<{ worksheetId: string }> }) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Preview as a student"
        body="Previews work with real accounts. The sample preview stores nothing."
        homeHref="/teacher/homework"
        homeLabel="Back to my worksheets"
      />
    );
  }
  const { worksheetId } = await params;
  const p = await previewWorksheet(db(), access.viewer.id, worksheetId);
  if (!p) notFound();
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <Link href={`/teacher/homework/${p.id}`} className="inline-flex min-h-11 items-center self-start font-bold">
        ‹ Back to editing
      </Link>
      <p
        className="m-0 rounded-[16px] border border-primary-fixed-dim bg-primary-fixed/50 px-4 py-3 text-[15px] leading-[22px] text-on-primary-fixed"
        role="note"
      >
        Preview: this is what a student sees. Answers can’t be entered here, and correct answers are never shown before
        you release marks.
      </p>
      <section aria-labelledby="pv-title" className={cx(SHELL, 'flex flex-col gap-2 p-5')}>
        <span className="text-sm font-bold text-on-surface-variant">
          {SUBJECTS[p.subject].name}
          {p.chapter ? ` · ${p.chapter}` : ''} · {p.marks} marks
        </span>
        <h1 id="pv-title" className="m-0 break-words text-[28px] font-bold leading-9">
          {p.title}
        </h1>
        {p.instructions ? <p className="m-0 whitespace-pre-line text-[17px] leading-7">{p.instructions}</p> : null}
      </section>
      {p.questions.length ? (
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {p.questions.map((q, i) => (
            <Question key={i} q={q} n={i + 1} />
          ))}
        </ol>
      ) : (
        <p className="m-0">No questions yet.</p>
      )}
    </div>
  );
}
