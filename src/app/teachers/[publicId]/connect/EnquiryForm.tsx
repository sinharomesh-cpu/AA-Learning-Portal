'use client';

import { useActionState, useState, useSyncExternalStore } from 'react';
import { CHIP, OVERLAY_INPUT, TILE } from '@/components/ui/styles';
import { Icon } from '@/components/icons/Icon';
import { SelectField } from '@/components/ui/SelectField';
import { Chip } from '@/components/ui/Panel';
import { cx } from '@/lib/cx';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { CURRICULA_LIST } from '@/lib/curricula';
import { keepValuesOnSubmit } from '@/lib/keepValuesOnSubmit';
import { describePrice, type ListingPrice, PRICE_MODEL_LABEL } from '@/lib/listing';
import { convertUsualTimes, describeUsualTime, type UsualTime } from '@/lib/usualTimes';
import { type EnquiryFormState, sendEnquiryAction } from './actions';

const CHOICE = CHIP;
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const subscribe = () => () => {};

function Err({ id, text }: { id: string; text?: string }) {
  return text ? (
    <span id={id} className="text-sm font-bold leading-5 text-on-error-container">
      {text}
    </span>
  ) : null;
}

/**
 * Board D3 / D11 step 4: send an enquiry. The teacher sees the parent's first name and the
 * child's grade, curriculum and subjects — never the child's name. Nothing is booked or shared.
 */
export function EnquiryForm({
  publicId,
  teacherName,
  subjects,
  usualTimes,
  teacherZone,
  prices,
  kids,
}: {
  publicId: string;
  teacherName: string;
  subjects: string[];
  usualTimes: UsualTime[];
  teacherZone: string;
  prices: ListingPrice[];
  kids: Array<{ id: string; name: string; grade: number; curriculum: string | null; subjects: string[] }>;
}) {
  const [state, action, pending] = useActionState<EnquiryFormState, FormData>(sendEnquiryAction, {});
  const e = state.fieldErrors ?? {};
  const [who, setWho] = useState(kids[0]?.id ?? 'new');
  const zone = useSyncExternalStore(subscribe, browserZone, () => null);
  const child = kids.find((k) => k.id === who);
  const offered = child ? child.subjects : subjects;
  const label = (t: UsualTime) =>
    zone && zone !== teacherZone
      ? convertUsualTimes([t], teacherZone, zone).map(describeUsualTime).join(' + ')
      : describeUsualTime(t);

  return (
    <form action={action} onSubmit={keepValuesOnSubmit(action)} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="publicId" value={publicId} />
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {Object.keys(e).length ? <FormMessage tone="error">Please check the highlighted parts.</FormMessage> : null}

      <fieldset className={cx(TILE, 'm-0')} aria-describedby="eq-child-error">
        <legend className="float-left w-full mb-2.5 p-0 text-[16px] font-bold">Who is it for?</legend>
        {kids.map((k) => (
          <Chip key={k.id} type="radio" name="who" value={k.id} checked={who === k.id} onChange={() => setWho(k.id)}>
            {k.name} · Grade {k.grade}
            {k.curriculum ? ` · ${k.curriculum}` : ''}
          </Chip>
        ))}
        <label className={CHOICE}>
          <input
            type="radio"
            name="who"
            value="new"
            checked={who === 'new'}
            onChange={() => setWho('new')}
            className={OVERLAY_INPUT}
          />
          <Icon name="check" size={16} className="hidden group-has-[:checked]:block" />A child I haven&apos;t added yet
        </label>
        <Err id="eq-child-error" text={e.child} />
        {child ? (
          <p className="text-sm text-on-surface-variant">
            We send {teacherName} only {child.name.split(' ')[0]}&apos;s grade, curriculum and the subjects you pick —
            not their name.
          </p>
        ) : null}
      </fieldset>

      {who === 'new' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="grade"
            label="Grade"
            defaultValue=""
            error={e.grade}
            options={[
              ['', 'Choose a grade'] as const,
              ...Array.from({ length: 12 }, (_, i) => [String(i + 1), `Grade ${i + 1}`] as const),
            ]}
          />
          <SelectField
            name="curriculum"
            label="Curriculum (optional)"
            defaultValue=""
            error={e.curriculum}
            options={[['', 'Not sure'] as const, ...CURRICULA_LIST.map((c) => [c, c] as const)]}
          />
        </div>
      ) : null}

      <fieldset className={cx(TILE, 'm-0')} aria-describedby="eq-subjects-error eq-subjects-hint">
        <legend className="float-left w-full mb-2.5 p-0 text-[16px] font-bold">Subjects</legend>
        {offered.length ? (
          <div className="flex flex-wrap gap-2.5">
            {offered.map((s) => (
              <label key={`${who}-${s}`} className={CHOICE}>
                <input type="checkbox" name="subjects" value={s} className={OVERLAY_INPUT} />
                <Icon name="check" size={16} className="hidden group-has-[:checked]:block" />
                {SUBJECTS[s as SubjectId]?.name ?? s}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-[15px]">
            {child?.name.split(' ')[0]} doesn&apos;t study any of the subjects this teacher lists.
          </p>
        )}
        <Err id="eq-subjects-error" text={e.subjects} />
        <span id="eq-subjects-hint" className="text-sm text-on-surface-variant">
          {child
            ? `Only subjects ${child.name.split(' ')[0]} studies and this teacher teaches.`
            : 'Subjects this teacher teaches.'}
        </span>
      </fieldset>

      {usualTimes.length ? (
        <fieldset className={cx(TILE, 'm-0')} aria-describedby="eq-times-error">
          <legend className="float-left w-full mb-2.5 p-0 text-[16px] font-bold">Times that suit you (optional)</legend>
          <div className="flex flex-wrap gap-2.5">
            {usualTimes.map((t, i) => (
              <Chip key={i} name="times" value={i}>
                {label(t)}
              </Chip>
            ))}
          </div>
          <span className="text-sm text-on-surface-variant">
            {zone ? `Shown in your time zone (${zone}).` : `In the teacher's time zone (${teacherZone}).`} A guide only.
          </span>
          <Err id="eq-times-error" text={e.times} />
        </fieldset>
      ) : null}

      {prices.length ? (
        <fieldset className={cx(TILE, 'm-0')} aria-describedby="eq-price-error">
          <legend className="float-left w-full mb-2.5 p-0 text-[16px] font-bold">Plan you&apos;re asking about</legend>
          {prices.map((p, i) => (
            <Chip key={i} type="radio" name="plan" value={i}>
              {PRICE_MODEL_LABEL[p.model]} · {describePrice(p)}
            </Chip>
          ))}
          <label className={CHOICE}>
            <input type="radio" name="plan" value="none" defaultChecked className={OVERLAY_INPUT} />
            <Icon name="check" size={16} className="hidden group-has-[:checked]:block" />
            Not sure yet
          </label>
          <span className="text-sm text-on-surface-variant">
            We save the asking price shown today with your enquiry. Any price you later agree is between you and the
            teacher.
          </span>
          <Err id="eq-price-error" text={e.price} />
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="eq-message" className="text-[16px] font-bold">
          Message (optional)
        </label>
        <textarea
          id="eq-message"
          name="message"
          rows={4}
          maxLength={500}
          aria-describedby="eq-message-hint eq-message-error"
          className="min-h-[110px] w-full rounded-[16px] border border-outline bg-surface-container-lowest px-4 py-3 text-base outline-none hover:border-on-surface-variant focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <Err id="eq-message-error" text={e.message} />
        <span id="eq-message-hint" className="text-sm text-on-surface-variant">
          Up to 500 characters, plain text. Please don&apos;t put phone numbers, email addresses or home addresses in
          this message.
        </span>
      </div>

      <div className="flex flex-col gap-2 rounded-[18px] bg-surface-container-low p-4 text-[15px] leading-[22px]">
        <p>
          <strong>How:</strong> Online. All lessons are online for now.
        </p>
        <p>
          The teacher sees your first name, the child&apos;s grade and curriculum, the subjects, your times, “online”
          and your message — never the child&apos;s name or anything the child has done on AA Pro.
        </p>
        <p>Sending this doesn&apos;t book a lesson, reserve a time, start a payment or give the teacher access.</p>
      </div>

      <div>
        <Button type="submit" inactive={pending}>
          {pending ? 'Sending…' : 'Send enquiry'}
        </Button>
      </div>
    </form>
  );
}
