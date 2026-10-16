import type { Metadata } from 'next';
import { BackToHome } from '@/components/BackToHome';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { Wordmark } from '@/components/Wordmark';

export const metadata: Metadata = { title: 'Teacher terms (draft)' };

/**
 * OC-71: teacher terms drafted by Claude for the owner's review. Clearly a DRAFT and not legal
 * advice; the owner (and, if they choose, a lawyer) approves the final wording before launch.
 * Teachers accept version TEACHER_TERMS_VERSION when sending their profile (server/teacherProfile.ts).
 */
const SECTIONS: Array<[string, string[]]> = [
  [
    '1. Who these terms are for',
    [
      'These terms apply to anyone who uses AA Pro as a teacher, whether they registered themselves or were added by a parent.',
      'You must be at least 18 years old and able to teach the subjects and grades you list on your profile.',
    ],
  ],
  [
    '2. Your profile and approval',
    [
      'The information on your profile must be true and your own. Do not add phone numbers, personal email addresses or links to outside contact channels.',
      'The AA Pro team reviews every teacher before they can see any child. AA Pro may approve, ask for changes or decline a profile.',
      'If you later change your subjects or grades, the change is reviewed again. You keep teaching your approved subjects and grades meanwhile.',
    ],
  ],
  [
    '3. Keeping children safe',
    [
      'You only see children whose parent has linked you, and only for the subjects that parent chose.',
      'Communicate with families through AA Pro. Do not ask a child for personal information, photos or contact details, and do not arrange to meet a child in person.',
      'If you are worried about a child’s safety, tell AA Pro support straight away.',
    ],
  ],
  [
    '4. Learning materials',
    [
      'Books and materials uploaded by a parent are for viewing inside AA Pro only. Do not download, copy, record or share them.',
      'Only share your own materials if you have the right to do so.',
    ],
  ],
  [
    '5. Lessons and meetings',
    [
      'Join booked lessons on time and tell the family through AA Pro as early as possible if you cannot.',
      'Do not record lessons unless AA Pro and the parent have both agreed in writing.',
    ],
  ],
  [
    '6. Privacy',
    [
      'Use children’s and families’ information only to teach them on AA Pro, and keep it confidential.',
      'Keep your password private and do not let anyone else use your account.',
    ],
  ],
  [
    '7. Suspension and ending your account',
    [
      'AA Pro may pause or close a teacher account that breaks these terms or puts a child at risk.',
      'You can ask AA Pro support to close your account at any time.',
    ],
  ],
  [
    '8. Changes to these terms',
    ['If these terms change, AA Pro will tell you and ask you to accept the new version before you continue teaching.'],
  ],
];

export default function TeacherTermsPage() {
  return (
    <>
      <BackToHome />
      <main id="main" className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-12">
        <Wordmark size={36} href="/" />
        <h1 className="text-headline-lg-mobile md:text-headline-lg">AA Pro teacher terms</h1>
        <FormMessage tone="warning">
          <strong>DRAFT for owner review — not final and not legal advice.</strong> This wording was prepared by the
          build team as a starting point. It has not been reviewed by a lawyer and may change before AA Pro opens to
          real users. Payment, cancellation and booking rules are not covered yet.
        </FormMessage>
        <Card className="flex flex-col gap-6">
          {SECTIONS.map(([title, paragraphs]) => (
            <section key={title} className="flex flex-col gap-2">
              <h2 className="text-[20px] font-bold leading-7">{title}</h2>
              {paragraphs.map((p) => (
                <p key={p} className="text-body-md">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </Card>
        <p className="text-body-sm text-on-surface-variant">Draft version: 16 Oct 2026.</p>
      </main>
    </>
  );
}
