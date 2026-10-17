'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';
import { type EnquiryProblem, sendEnquiry } from '@/server/teacherEnquiries';

export interface EnquiryFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};
const list = (fd: FormData, key: string) => fd.getAll(key).filter((v): v is string => typeof v === 'string');
const int = (s: string) => (/^\d{1,3}$/.test(s) ? Number(s) : NaN);

const PROBLEM: Record<EnquiryProblem, [string, string]> = {
  child: ['child', 'Choose one of your children, or “A child I haven’t added yet”.'],
  grade: ['grade', 'Choose the child’s grade.'],
  curriculum: ['curriculum', 'Choose a curriculum from the list.'],
  subjects: ['subjects', 'Choose at least one subject this teacher teaches.'],
  times: ['times', 'Choose times from the teacher’s list.'],
  price: ['price', 'Choose one of the teacher’s plans, or “Not sure yet”.'],
  message: ['message', 'Keep the message to 500 characters.'],
};

/** Board D3/D11: send an enquiry. The parent comes from the session only. */
export async function sendEnquiryAction(_prev: EnquiryFormState, fd: FormData): Promise<EnquiryFormState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'parent') redirect('/sign-in');
  const publicId = str(fd, 'publicId');
  const who = str(fd, 'who');
  const plan = str(fd, 'plan');
  const r = await sendEnquiry(
    db(),
    real.session.accountId,
    {
      publicId,
      childId: who && who !== 'new' ? who : null,
      grade: who === 'new' ? int(str(fd, 'grade')) || null : null,
      curriculum: who === 'new' && str(fd, 'curriculum') ? str(fd, 'curriculum') : null,
      subjects: list(fd, 'subjects'),
      times: list(fd, 'times').map(int),
      priceIndex: plan === '' || plan === 'none' ? null : int(plan),
      message: str(fd, 'message'),
    },
    await siteBaseUrl(),
  );
  if (r.ok) redirect('/parent/enquiries?sent=1');
  switch (r.reason) {
    case 'not_allowed':
      redirect('/parent');
    case 'gone':
      redirect(`/teachers/${/^t-[a-z0-9]{10}$/.test(publicId) ? publicId : 'gone'}/connect`);
    case 'duplicate':
      return {
        error:
          'You already have an active enquiry with this teacher for this child. You can follow it in My enquiries.',
        at: Date.now(),
      };
    case 'limit_pending':
      return {
        error: 'You have 5 enquiries waiting for an answer. Withdraw one in My enquiries, or wait for answers.',
        at: Date.now(),
      };
    case 'limit_daily':
      return { error: 'You have sent 10 enquiries today. Please try again tomorrow.', at: Date.now() };
    case 'invalid': {
      const fieldErrors: Record<string, string> = {};
      for (const p of r.problems) fieldErrors[PROBLEM[p][0]] ??= PROBLEM[p][1];
      return { fieldErrors, at: Date.now() };
    }
  }
}
