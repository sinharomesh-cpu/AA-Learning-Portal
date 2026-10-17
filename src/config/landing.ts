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

/**
 * Marketplace switches for the home page (boards H1/H2, approved 16 Oct 2026; OC-79 C2).
 * Parts of H1 describe features that are not built yet: teacher listings (board D5) and
 * enquiries (D3, D11). They stay hidden until these switches are turned on in the pull request
 * that builds the feature, so the page never describes something that does not work (C-7).
 */
export interface MarketplaceSwitches {
  /** Approved teachers can publish "Looking for students" listings, shown publicly. */
  listings: boolean;
  /** Signed-in parents can send an enquiry ("Connect with teacher"). */
  enquiries: boolean;
}

// Listings are live since PR-D3 and enquiries since PR-D4a.
export const MARKETPLACE: MarketplaceSwitches = { listings: true, enquiries: true };

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
      'Book AI lessons, add your child’s own teacher or find one here, and see what your child learned.',
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
    /** H1 wording once listings exist. */
    stepsWithListings: [
      'Register yourself, or accept the invitation when a parent adds you.',
      'The AA Pro team checks and approves your profile.',
      'Set your available times, publish a “Looking for students” listing if you want new students, and teach your students on Zoom.',
    ],
  },
] as const;

export const SAFETY = [
  {
    id: 'checked',
    title: 'Every teacher is checked',
    body: 'The AA Pro team approves each teacher before they can see any child. A teacher only sees the children a parent has linked to them.',
    /** Added once listings exist (H1). */
    withListings: 'Experience on a listing is as stated by the teacher.',
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
    id: 'books',
    title: 'Your books stay in AA Pro',
    body: 'Teachers can read the books you share for the subjects they teach, but they can’t download them.',
  },
] as const;

export interface FaqItem {
  q: string;
  a: string;
  /** Shown only when this marketplace feature is live. */
  needs?: keyof MarketplaceSwitches;
}

export const FAQ: readonly FaqItem[] = [
  {
    q: 'Does my child need an email address?',
    a: 'No. You create your child’s account with a username and password. Children never need an email or phone number.',
  },
  {
    q: 'Can I find a new teacher on AA Pro?',
    a: 'Yes. Browse “Meet Our Subject Specialists” without signing in. To contact a teacher, sign in or create a parent account and send a short enquiry. The teacher sees your first name and your child’s grade, curriculum and subjects, never your child’s name.',
    needs: 'enquiries',
  },
  {
    q: 'How do I pay a teacher?',
    a: 'You agree the price with the teacher and pay them directly. AA Pro doesn’t take, hold or refund payments.',
  },
  {
    q: 'How do teachers get my child’s books?',
    a: 'Upload a book once for your child. Each teacher you’ve ticked for that subject can read it in AA Pro, any time while they teach your child. No more sending files over WhatsApp or email.',
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
];

/**
 * Home page subjects (ZIP 5 "Explore your school subjects"). Plain descriptions of each
 * subject only: no curriculum, accreditation or outcome claims (owner, 17 Oct 2026).
 */
export const SUBJECT_CARDS = [
  { id: 'maths', name: 'Maths', icon: 'calc', tone: 'cyan', body: 'Numbers, shapes, measurement and problem solving.' },
  {
    id: 'science',
    name: 'Science',
    icon: 'flask',
    tone: 'amber',
    body: 'Living things, materials, forces and the world around us.',
  },
  {
    id: 'sst',
    name: 'SST',
    icon: 'globe',
    tone: 'cyan',
    body: 'Social studies: history, geography, civics and communities.',
  },
  {
    id: 'english',
    name: 'English',
    icon: 'letter',
    tone: 'violet',
    body: 'Reading, writing, grammar and speaking with confidence.',
  },
  { id: 'hindi', name: 'Hindi', icon: 'hindi', tone: 'amber', body: 'Reading, writing and grammar in Hindi.' },
  {
    id: 'it',
    name: 'IT',
    icon: 'laptop',
    tone: 'violet',
    body: 'Using computers safely, digital skills and first steps in coding.',
  },
] as const;

/**
 * Neutral facts for the strip under the hero. They replace the reference's unverified figures
 * ("10,000+ lessons", "98% satisfaction", "100% vetted", "0 leaks"), which stay out until
 * evidence and owner approval exist.
 */
export const HOME_FACTS = [
  { value: 'Grades 1–12', label: 'One place for every school year' },
  { value: '6 subjects', label: 'Maths, Science, SST, English, Hindi, IT' },
  { value: '3 roles', label: 'Parents, students and teachers' },
  { value: 'No child email', label: 'Children sign in with a username' },
] as const;

/** Hero feature row: neutral descriptions of what AA Pro is for (no badges or ratings). */
export const HERO_POINTS = [
  { icon: 'family', title: 'Parents in charge', body: 'You add your children and choose their teachers' },
  { icon: 'shield', title: 'Teachers approved first', body: 'Checked by the AA Pro team before they see a child' },
  { icon: 'sparkle', title: 'AI Tutor', body: 'Lessons with your own textbook — being built' },
] as const;
