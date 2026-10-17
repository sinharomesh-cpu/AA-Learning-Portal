'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CURRENCIES, type ListingPrice, parseAmount, PRICE_MODELS } from '@/lib/listing';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';
import { type ListingProblem, renewListing, saveListing, setListingStatus } from '@/server/teacherListings';

/**
 * The teacher's own listing (board D5). The teacher comes from the session only; the server
 * functions check approval, the approved subjects and grades, prices and limits again.
 */
export interface ListingFormState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};
const list = (fd: FormData, key: string) => fd.getAll(key).map((v) => (typeof v === 'string' ? v : ''));

const PROBLEM: Record<ListingProblem, [string, string]> = {
  subjects: ['subjects', 'Only subjects AA Pro approved on your profile can be listed.'],
  grades: ['grades', 'Only grades AA Pro approved on your profile can be listed.'],
  subjects_required: ['subjects', 'Choose at least one subject to publish.'],
  grades_required: ['grades', 'Choose at least one grade to publish.'],
  curricula: ['curricula', 'Choose curricula from the list.'],
  experience: ['experienceYears', 'Enter whole years from 0 to 60, or leave it empty.'],
  consent: ['consent', 'Please tick to agree before your listing is shown publicly.'],
  preview_changed: [
    'form',
    'Your details changed while you were editing (for example in another tab). Nothing was published. Please check “What parents see” and publish again.',
  ],
  expired: ['form', 'Your listing has ended. Renew it below first, then publish your changes.'],
  price_count: ['prices', 'Up to 3 prices.'],
  price_model: ['prices', 'Choose a plan for each price.'],
  price_currency: ['prices', 'Choose INR, SGD or USD for each price.'],
  price_amount: ['prices', 'Enter each amount as a number, for example 600 or 45.50.'],
  price_sessions: ['prices', 'Weekly, every-two-weeks and monthly plans need the number of sessions (1 to 31).'],
  price_minutes: ['prices', 'Sessions are 10 to 40 minutes long.'],
};

async function teacherId(): Promise<string> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  return real.session.accountId;
}

export async function saveListingAction(_prev: ListingFormState, fd: FormData): Promise<ListingFormState> {
  const id = await teacherId();
  const intent = str(fd, 'intent') === 'publish' ? 'publish' : 'draft';
  // Price rows: a row is used when it has an amount.
  const models = list(fd, 'priceModel');
  const currencies = list(fd, 'priceCurrency');
  const amounts = list(fd, 'priceAmount');
  const sessions = list(fd, 'priceSessions');
  const minutes = list(fd, 'priceMinutes');
  const prices: ListingPrice[] = [];
  let badAmount = false;
  amounts.forEach((text, i) => {
    if (text.trim() === '') return;
    const amountMinor = parseAmount(text);
    if (amountMinor === null) badAmount = true;
    const model = (PRICE_MODELS as readonly string[]).includes(models[i] ?? '') ? models[i] : 'invalid';
    prices.push({
      model: model as ListingPrice['model'],
      currency: ((CURRENCIES as readonly string[]).includes(currencies[i] ?? '')
        ? currencies[i]
        : 'invalid') as ListingPrice['currency'],
      amountMinor: amountMinor ?? 0,
      sessions: model === 'hourly' ? null : /^\d{1,2}$/.test(sessions[i] ?? '') ? Number(sessions[i]) : NaN,
      minutes: /^\d{1,2}$/.test(minutes[i] ?? '') ? Number(minutes[i]) : NaN,
    });
  });
  if (badAmount) return { fieldErrors: { prices: PROBLEM.price_amount[1] }, at: Date.now() };
  const exp = str(fd, 'experienceYears').trim();
  const r = await saveListing(
    db(),
    id,
    {
      subjects: list(fd, 'subjects'),
      grades: list(fd, 'grades').map(Number),
      curricula: list(fd, 'curricula'),
      experienceYears: exp === '' ? null : /^\d{1,3}$/.test(exp) ? Number(exp) : NaN,
      prices,
      previewKey: str(fd, 'previewKey'),
    },
    intent,
    str(fd, 'consent') === 'yes',
  );
  if (!r.ok) {
    if (r.reason !== 'invalid') {
      if (r.reason === 'not_allowed') redirect('/teacher');
      return { error: 'You have saved your listing 10 times today. Please try again tomorrow.', at: Date.now() };
    }
    const fieldErrors: Record<string, string> = {};
    for (const p of r.problems) {
      const [field, message] = PROBLEM[p];
      fieldErrors[field] ??= message;
    }
    return { fieldErrors, at: Date.now() };
  }
  revalidatePath('/teacher/listing');
  const notice = {
    draft_saved: 'Draft saved. Nothing is shown publicly until you publish.',
    draft_saved_public_unchanged: 'Draft saved. Your public listing still shows the details you agreed to earlier.',
    published: 'Published. Parents can see your listing as shown in “What parents see”.',
    unchanged: 'Saved. Your public listing already shows these details.',
  }[r.outcome];
  return { notice, at: Date.now() };
}

export async function listingStatusAction(_prev: ListingFormState, fd: FormData): Promise<ListingFormState> {
  const id = await teacherId();
  const action = str(fd, 'action');
  if (action !== 'pause' && action !== 'withdraw') return { error: 'Choose an action.', at: Date.now() };
  const r = await setListingStatus(db(), id, action);
  revalidatePath('/teacher/listing');
  if (!r.ok) return { error: 'Your listing has already changed. Please check it again.', at: Date.now() };
  // The buttons may disappear with the new status, so the message is shown by the page.
  redirect(`/teacher/listing?done=${action}`);
}

export async function renewListingAction(_prev: ListingFormState, fd: FormData): Promise<ListingFormState> {
  const id = await teacherId();
  const r = await renewListing(db(), id, {
    times: str(fd, 'confirmTimes') === 'yes',
    prices: str(fd, 'confirmPrices') === 'yes',
    subjects: str(fd, 'confirmSubjects') === 'yes',
  });
  if (!r.ok) {
    if (r.reason === 'confirm') return { fieldErrors: { renew: 'All three are needed to renew.' }, at: Date.now() };
    if (r.reason === 'not_allowed') redirect('/teacher');
    return { error: 'There is no listing to renew.', at: Date.now() };
  }
  revalidatePath('/teacher/listing');
  redirect('/teacher/listing?done=renew');
}
