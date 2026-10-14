/**
 * Public landing page content (board 63, OC-39). Kept in one place so the owner's About us
 * text and contact address can be dropped in without touching layout code.
 *
 * Rules (OC-39):
 * - About us is a DRAFT until the owner supplies the text; no invented company facts.
 * - Safety and privacy states only decided rules (OC-35, OC-36, OC-41, master instructions §12).
 * - `null` means "owner to provide": the page shows a clearly marked placeholder.
 */
export interface LandingContent {
  about: { draft: boolean; intro: string; ownerParagraphs: Array<string | null> };
  contactEmail: string | null;
  pricing: string | null;
}

export const landing: LandingContent = {
  about: {
    draft: true,
    intro:
      'AA Pro is a learning platform for school children, their parents and their teachers. It combines an AI Tutor, real teachers and each family’s own learning materials, with parents in control.',
    // Owner to provide (OC-39): who we are, why AA Pro was started, where we are based.
    ownerParagraphs: [null, null, null],
  },
  contactEmail: null,
  pricing: null,
};

export const ABOUT_PLACEHOLDERS = [
  'Who we are — owner to add',
  'Why we started AA Pro — owner to add',
  'Where we are based — owner to add',
] as const;

export const HOW_IT_WORKS = [
  {
    id: 'parents',
    label: 'For parents',
    tone: 'parent',
    steps: [
      'Create your account and add each child. You choose their username and password.',
      'Pick their subjects and set quiet times when lessons can’t be booked.',
      'Book AI lessons or a teacher, and see what your child learned.',
    ],
  },
  {
    id: 'students',
    label: 'For students',
    tone: 'student',
    steps: [
      'Sign in with the username your parent gave you.',
      'Book an AI lesson at a time that’s open for you.',
      'Talk with the AI Tutor while your book is on the screen.',
    ],
  },
  {
    id: 'teachers',
    label: 'For teachers',
    tone: 'teacher',
    steps: [
      'Register yourself, or accept the invitation when a parent adds you.',
      'The AA Pro team checks and approves your profile.',
      'Set your available times and teach your students on Zoom.',
    ],
  },
] as const;

export const SAFETY = [
  {
    id: 'checked',
    title: 'Every teacher is checked',
    body: 'The AA Pro team approves each teacher before they can see any child. A teacher only sees the children a parent has linked to them.',
  },
  {
    id: 'parents',
    title: 'Parents are in charge',
    body: 'You create your children’s accounts, choose their subjects and limits, and decide which teachers work with them.',
  },
  {
    id: 'no-contact',
    title: 'No email or phone for children',
    body: 'Children sign in with a username from their parent. Only a parent can unlock or reset their sign-in.',
  },
  {
    id: 'no-recording',
    title: 'AI lessons aren’t recorded',
    body: 'AA Pro doesn’t keep recordings of your child’s voice from AI lessons.',
  },
] as const;

export const FAQ = [
  {
    q: 'Does my child need an email address?',
    a: 'No. You create your child’s account with a username and password. Children never need an email or phone number.',
  },
  {
    q: 'Can my child book a teacher on their own?',
    a: 'No. Children can book AI lessons within the limits you set. Only parents book sessions with teachers.',
  },
  {
    q: 'How are teachers checked?',
    a: 'The AA Pro team reviews every teacher’s profile and approves it before the teacher can see any child.',
  },
  {
    q: 'My child’s teacher isn’t on AA Pro. Can I add them?',
    a: 'Yes. Add them with their name and email. We email them, and they can start once the AA Pro team approves them.',
  },
  {
    q: 'Which subjects are covered?',
    a: 'Maths, Science, SST, English, Hindi and IT. You choose which ones each child sees.',
  },
] as const;
