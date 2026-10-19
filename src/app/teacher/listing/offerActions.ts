'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseAmount } from '@/lib/listing';
import { HOURLY_PROBLEM_TEXT, PACKAGE_PROBLEM_TEXT, type PackageProblem, type PackageTime } from '@/lib/pricing';
import { db } from '@/server/db/client';
import {
  isPricingV2,
  saveHourly,
  savePackage,
  setPackageNegotiable,
  setSlotNegotiable,
  withdrawPackage,
} from '@/server/pricingModel';
import { getRealSession } from '@/server/session';

/**
 * CR-15 boards PM2 and PM3: the teacher's hourly lessons, the setting of each usual time and the
 * learning package. The teacher comes from the session only; the server functions check every
 * rule again, and nothing here works while the new pricing model is switched off.
 */
export interface OfferFormState {
  error?: string;
  notice?: string;
  problems?: string[];
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v.trim() : '';
};
const whole = (v: string) => (/^\d{1,3}$/.test(v) ? Number(v) : null);

async function teacher(): Promise<string> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  if (!(await isPricingV2(db()))) redirect('/teacher/listing');
  return real.session.accountId;
}

export async function saveHourlyAction(_prev: OfferFormState, fd: FormData): Promise<OfferFormState> {
  const id = await teacher();
  const offered = str(fd, 'offered') === 'yes';
  const rate = parseAmount(str(fd, 'rate'));
  const minutes = whole(str(fd, 'minutes'));
  if (offered && rate === null) return { problems: [HOURLY_PROBLEM_TEXT.rate], at: Date.now() };
  const r = await saveHourly(db(), id, {
    offered,
    currency: str(fd, 'currency'),
    rateMinor: rate ?? 0,
    minutes: minutes ?? 0,
  });
  if (!r.ok) {
    if (r.reason === 'not_allowed') redirect('/teacher');
    return { problems: r.problems.map((p) => HOURLY_PROBLEM_TEXT[p]), at: Date.now() };
  }
  revalidatePath('/teacher/listing');
  return {
    notice: offered
      ? 'Hourly lessons saved. Publish your listing below to show the new details to parents.'
      : 'Hourly lessons turned off. Publish your listing below to remove them from your public page.',
    at: Date.now(),
  };
}

export async function slotNegotiableAction(_prev: OfferFormState, fd: FormData): Promise<OfferFormState> {
  const id = await teacher();
  const n = (k: string) => (/^\d{1,4}$/.test(str(fd, k)) ? Number(str(fd, k)) : -1);
  const r = await setSlotNegotiable(
    db(),
    id,
    { weekday: n('weekday'), start: n('start'), end: n('end') },
    str(fd, 'negotiable') === 'yes',
  );
  if (!r.ok) {
    if (r.reason === 'not_allowed') redirect('/teacher');
    return { error: 'This time has changed. Please reload the page.', at: Date.now() };
  }
  revalidatePath('/teacher/listing');
  return { notice: 'Saved. This applies at once.', at: Date.now() };
}

export async function savePackageAction(_prev: OfferFormState, fd: FormData): Promise<OfferFormState> {
  const id = await teacher();
  const offer = str(fd, 'intent') === 'offer';
  const priceText = str(fd, 'price');
  const price = priceText === '' ? null : parseAmount(priceText);
  if (priceText !== '' && price === null) return { problems: [PACKAGE_PROBLEM_TEXT.price], at: Date.now() };
  const times: PackageTime[] = fd
    .getAll('time')
    .map((v) => (typeof v === 'string' ? v : ''))
    .filter((v) => /^[1-7]:\d{1,4}$/.test(v))
    .map((v) => {
      const [weekday, start] = v.split(':').map(Number);
      return { weekday: weekday!, start: start! };
    });
  const r = await savePackage(db(), id, {
    offer,
    currency: str(fd, 'currency'),
    priceMinor: price,
    classes: whole(str(fd, 'classes')),
    perWeek: whole(str(fd, 'perWeek')),
    minutes: whole(str(fd, 'minutes')),
    weeks: whole(str(fd, 'weeks')),
    times,
    termsNote: str(fd, 'termsNote'),
  });
  if (!r.ok) {
    if (r.reason === 'not_allowed') redirect('/teacher');
    const seen = new Set<PackageProblem>(r.problems);
    return { problems: [...seen].map((p) => PACKAGE_PROBLEM_TEXT[p]), at: Date.now() };
  }
  // The package's own setting (P-8): applies at once.
  await setPackageNegotiable(db(), id, str(fd, 'negotiable') === 'yes');
  revalidatePath('/teacher/listing');
  return {
    notice:
      r.status === 'offered'
        ? 'Package saved. Publish your listing below to show it to parents.'
        : r.status === 'needs_review'
          ? 'Saved. The package still needs review: complete every detail and choose “Offer this package”.'
          : 'Draft saved. Parents don’t see it until you offer it and publish your listing.',
    at: Date.now(),
  };
}

// useActionState passes the previous state first; this action does not need it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function withdrawPackageAction(_prev: OfferFormState): Promise<OfferFormState> {
  const id = await teacher();
  const r = await withdrawPackage(db(), id);
  if (!r.ok && r.reason === 'not_allowed') redirect('/teacher');
  revalidatePath('/teacher/listing');
  return {
    notice: 'You no longer offer the package. Publish your listing below to remove it from your public page.',
    at: Date.now(),
  };
}
