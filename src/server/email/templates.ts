import 'server-only';
import { brand } from '@/config/brand';
import type { EmailTemplate } from '@/server/auth/outbox';

/**
 * The words of every AA Pro email (A-02, OC-133). Plain, short and the same in text and HTML.
 * Built only from the queued payload: display values and one-time links, never a password.
 * Every value is escaped in the HTML; only http(s) links become buttons.
 */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type P = Record<string, string>;

interface Message {
  subject: string;
  /** Paragraphs of plain text. */
  lines: string[];
  /** The one main link, with its button label. */
  action?: { label: string; url: string };
  /** A short safety note under the button (link lifetime, "if this wasn't you"). */
  note?: string;
}

const NOT_YOU = "If you didn't expect this email, you can ignore it.";
const hi = (name?: string) => (name ? `Hello ${name},` : 'Hello,');
const when = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)} (India time)`;
};

const MESSAGES: Record<EmailTemplate, (p: P) => Message> = {
  confirm_email: (p) => ({
    subject: `Confirm your email for ${brand.productName}`,
    lines: [hi(p.name), `Please confirm this email address to finish creating your ${brand.productName} account.`],
    action: { label: 'Confirm my email', url: p.link ?? '' },
    note: `This link works once and expires after 24 hours. ${NOT_YOU}`,
  }),
  account_exists: (p) => ({
    subject: `You already have a ${brand.productName} account`,
    lines: [
      hi(),
      `Someone tried to create a ${brand.productName} account with this email address, but you already have one.`,
      `You can sign in at ${p.signInUrl ?? ''}, or reset your password at ${p.resetUrl ?? ''}.`,
    ],
    action: { label: 'Sign in', url: p.signInUrl ?? '' },
    note: NOT_YOU,
  }),
  password_reset: (p) => ({
    subject: `Reset your ${brand.productName} password`,
    lines: [hi(p.name), 'We received a request to reset your password.'],
    action: { label: 'Choose a new password', url: p.link ?? '' },
    note: `This link works once and expires after 30 minutes. If you didn't ask for this, ignore this email; your password stays the same.`,
  }),
  password_changed: (p) => ({
    subject: `Your ${brand.productName} password was changed`,
    lines: [
      hi(p.name),
      `Your password was changed on ${when(p.when)}.`,
      `If this was not you, reset your password straight away and tell the ${brand.productName} team.`,
    ],
  }),
  teacher_added_by_parent: (p) => ({
    subject: `You've been added as a teacher on ${brand.productName}`,
    lines: [
      hi(p.name),
      `A parent has added you as their child's teacher on ${brand.productName}.`,
      'Set your password, complete your teacher profile and send it for approval.',
    ],
    action: { label: 'Set my password', url: p.link ?? '' },
    note: `This link works once and expires after 72 hours. ${NOT_YOU}`,
  }),
  teacher_approved_set_password: (p) => ({
    subject: `Your ${brand.productName} teacher account is approved`,
    lines: [hi(p.name), 'Your teacher account has been approved. Set your password to sign in.'],
    action: { label: 'Set my password', url: p.link ?? '' },
    note: 'This link works once and expires after 72 hours.',
  }),
  parent_teacher_approved: (p) => ({
    subject: `${p.teacher ?? 'Your teacher'} is approved on ${brand.productName}`,
    lines: [hi(p.name), `${p.teacher ?? 'The teacher you added'} has been approved and can now work with your child.`],
    action: { label: 'See my teachers', url: p.teachersUrl ?? '' },
  }),
  parent_teacher_not_approved: (p) => ({
    subject: `About the teacher you added on ${brand.productName}`,
    lines: [hi(p.name), `${p.teacher ?? 'The teacher you added'} was not approved.`],
    action: { label: 'See my teachers', url: p.teachersUrl ?? '' },
  }),
  teacher_linked_to_child: (p) => ({
    subject: `You've been linked to a student on ${brand.productName}`,
    lines: [hi(p.name), 'A parent has linked you to their child. Sign in to see the details.'],
    action: p.link ? { label: `Open ${brand.productName}`, url: p.link } : undefined,
  }),
  teacher_link_request: (p) => ({
    subject: `New student request on ${brand.productName}`,
    lines: [hi(p.name), `You have ${p.requests ?? 'a'} student request(s) waiting for your answer.`],
    action: { label: 'See requests', url: p.requestsUrl ?? '' },
  }),
  parent_link_request_accepted: (p) => ({
    subject: `${p.teacher ?? 'The teacher'} accepted your request`,
    lines: [hi(p.name), `${p.teacher ?? 'The teacher'} accepted your request to teach ${p.child ?? 'your child'}.`],
    action: { label: 'See my teachers', url: p.teachersUrl ?? '' },
  }),
  parent_link_request_declined: (p) => ({
    subject: `${p.teacher ?? 'The teacher'} declined your request`,
    lines: [hi(p.name), `${p.teacher ?? 'The teacher'} declined your request to teach ${p.child ?? 'your child'}.`],
    action: { label: 'See my teachers', url: p.teachersUrl ?? '' },
  }),
  parent_link_request_expired: (p) => ({
    subject: 'Your teacher request has expired',
    lines: [
      hi(p.name),
      `Your request for ${p.teacher ?? 'the teacher'} to teach ${p.child ?? 'your child'} expired without an answer.`,
    ],
  }),
  rate_proposal_received: (p) => ({
    subject: `New rate proposal on ${brand.productName}`,
    lines: [
      hi(p.name),
      `${p.parentFirstName ?? 'A parent'} sent you a rate proposal (${p.basis ?? ''}${p.subject ? `, ${p.subject}` : ''}).`,
    ],
    action: { label: 'See the proposal', url: p.link ?? '' },
  }),
  rate_counter_offer: (p) => ({
    subject: 'New counter-offer',
    lines: [hi(p.name), `${p.from ?? 'The other side'} made a counter-offer (${p.basis ?? ''}).`],
    action: { label: 'See the offer', url: p.link ?? '' },
  }),
  rate_proposal_accepted: (p) => ({
    subject: 'Your rate proposal was accepted',
    lines: [hi(p.name), `${p.from ?? 'The other side'} accepted the rate (${p.basis ?? ''}).`],
    action: { label: 'See the details', url: p.link ?? '' },
  }),
  rate_proposal_declined: (p) => ({
    subject: 'Your rate proposal was declined',
    lines: [hi(p.name), `${p.from ?? 'The other side'} declined the rate (${p.basis ?? ''}).`],
    action: { label: 'See the details', url: p.link ?? '' },
  }),
  rate_proposal_withdrawn: (p) => ({
    subject: 'A rate proposal was withdrawn',
    lines: [hi(p.name), `${p.from ?? 'The other side'} withdrew the rate proposal (${p.basis ?? ''}).`],
    action: { label: 'See the details', url: p.link ?? '' },
  }),
  rate_proposal_expired: () => ({
    subject: 'A rate proposal has expired',
    lines: [hi(), `A rate proposal on ${brand.productName} expired without an answer. Sign in to see the details.`],
  }),
  child_locked: (p) => ({
    subject: `${p.childName ?? 'Your child'}'s sign-in is locked for 15 minutes`,
    lines: [
      hi(p.name),
      `There were several wrong sign-in attempts for ${p.childName ?? 'your child'} on ${when(p.when)}, so their sign-in is locked for 15 minutes.`,
      'You can unlock it or set a new password from your Children page.',
    ],
  }),
  child_password_reset: (p) => ({
    subject: `${p.childName ?? 'Your child'}'s password was changed`,
    lines: [hi(p.name), `The password for ${p.childName ?? 'your child'} was changed on ${when(p.when)}.`, NOT_YOU],
  }),
  owner_set_password: (p) => ({
    subject: `Set up the ${brand.productName} owner account`,
    lines: [hi(p.name), `Set a password to finish setting up the ${brand.productName} owner (Super Admin) account.`],
    action: { label: 'Set my password', url: p.link ?? '' },
    note: `This link works once and expires after 72 hours. ${NOT_YOU}`,
  }),
  admin_invite: (p) => ({
    subject: `You've been invited to help run ${brand.productName}`,
    lines: [hi(p.name), `You've been added as an ${brand.productName} administrator. Set your password to sign in.`],
    action: { label: 'Set my password', url: p.link ?? '' },
    note: `This link works once and expires after 72 hours. ${NOT_YOU}`,
  }),
  account_created_set_password: (p) => ({
    subject: `Your ${brand.productName} account is ready`,
    lines: [hi(p.name), `An ${brand.productName} account has been created for you. Set your password to sign in.`],
    action: { label: 'Set my password', url: p.link ?? '' },
    note: `This link works once and expires after 72 hours. ${NOT_YOU}`,
  }),
  account_email_changed: (p) => ({
    subject: `Your ${brand.productName} email address was changed`,
    lines: [
      hi(p.name),
      `The email address on your account was changed to ${p.newEmail ?? 'a new address'}.`,
      `If you did not expect this, tell the ${brand.productName} team.`,
    ],
  }),
  teacher_approved: (p) => ({
    subject: `Your ${brand.productName} teacher account is approved`,
    lines: [hi(p.name), 'Your teacher account has been approved. You can now sign in.'],
    action: { label: 'Sign in', url: p.signInUrl ?? '' },
  }),
  teacher_not_approved: (p) => ({
    subject: `About your ${brand.productName} teacher application`,
    lines: [hi(p.name), 'Your teacher application was not approved. Sign in to see the details.'],
    action: { label: 'Sign in', url: p.signInUrl ?? '' },
  }),
  teacher_changes_requested: (p) => ({
    subject: 'Changes requested to your teacher profile',
    lines: [
      hi(p.name),
      'Please make a few changes to your teacher profile and send it again. Sign in to see what is needed.',
    ],
    action: { label: 'Sign in', url: p.signInUrl ?? '' },
  }),
  teacher_profile_change_approved: (p) => ({
    subject: 'Your profile changes are approved',
    lines: [hi(p.name), 'The changes to your teacher profile have been approved.'],
    action: { label: 'See my profile', url: p.profileUrl ?? '' },
  }),
  teacher_profile_change_declined: (p) => ({
    subject: 'Your profile changes were not approved',
    lines: [hi(p.name), 'The changes to your teacher profile were not approved. Sign in to see the details.'],
    action: { label: 'See my profile', url: p.profileUrl ?? '' },
  }),
  parent_teacher_link_ended: (p) => ({
    subject: `${p.teacher ?? 'A teacher'} no longer teaches ${p.child ?? 'your child'}`,
    lines: [hi(p.name), `${p.teacher ?? 'A teacher'} is no longer linked to ${p.child ?? 'your child'}.`],
    action: { label: 'See my teachers', url: p.teachersUrl ?? '' },
  }),
  parent_teacher_subjects_reduced: (p) => ({
    subject: `Subjects changed for ${p.teacher ?? 'a teacher'}`,
    lines: [hi(p.name), `The subjects ${p.teacher ?? 'a teacher'} teaches ${p.child ?? 'your child'} have changed.`],
    action: { label: 'See my teachers', url: p.teachersUrl ?? '' },
  }),
  listing_expiry_reminder: (p) => ({
    subject: 'Your teacher listing ends soon',
    lines: [
      hi(p.name),
      `Your public teacher listing ends on ${p.endsOn ?? 'its end date'}. Renew it to stay visible to parents.`,
    ],
    action: { label: 'Renew my listing', url: p.listingUrl ?? '' },
  }),
  enquiry_received: (p) => ({
    subject: `New enquiry on ${brand.productName}`,
    lines: [
      hi(p.name),
      `${p.parentFirstName ?? 'A parent'} sent you an enquiry (${[p.subjects, p.grade].filter(Boolean).join(', ')}).`,
    ],
    action: { label: 'See the enquiry', url: p.link ?? '' },
  }),
  enquiry_accepted: (p) => ({
    subject: `${p.teacher ?? 'The teacher'} accepted your enquiry`,
    lines: [hi(p.name), `${p.teacher ?? 'The teacher'} accepted your enquiry.`],
    action: { label: 'See my enquiries', url: p.link ?? '' },
  }),
  enquiry_declined: (p) => ({
    subject: `${p.teacher ?? 'The teacher'} declined your enquiry`,
    lines: [hi(p.name), `${p.teacher ?? 'The teacher'} declined your enquiry.`],
    action: { label: 'See my enquiries', url: p.link ?? '' },
  }),
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = (u: string) => (/^https?:\/\/[^\s"'<>]+$/.test(u) ? u : null);
/** Header and footer text (no images, no tracking). */
const FOOTER = `You are receiving this because of your ${brand.productName} account. This is an automatic message; replies are not read.`;

/** Subject, plain text and HTML for one queued email. Null for an unknown template. */
export function renderEmail(template: string, payload: Record<string, unknown>): RenderedEmail | null {
  const build = MESSAGES[template as EmailTemplate];
  if (!build) return null;
  const p: P = {};
  for (const [k, v] of Object.entries(payload)) if (typeof v === 'string') p[k] = v.slice(0, 2000);
  const m = build(p);
  const url = m.action ? safeUrl(m.action.url) : null;
  const subject = m.subject.replace(/[\r\n]+/g, ' ').slice(0, 200);
  const text = [
    ...m.lines,
    ...(url && m.action ? [`${m.action.label}: ${url}`] : []),
    ...(m.note ? [m.note] : []),
    `— ${brand.productName}`,
    FOOTER,
  ].join('\n\n');
  const para = (s: string) =>
    `<p style="margin:0 0 16px;font:16px/24px Arial,sans-serif;color:#1b1c1e">${escapeHtml(s)}</p>`;
  const button =
    url && m.action
      ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#006194;color:#ffffff;font:bold 16px Arial,sans-serif;text-decoration:none;padding:12px 24px;border-radius:24px">${escapeHtml(m.action.label)}</a></p><p style="margin:0 0 16px;font:13px/20px Arial,sans-serif;color:#40484f">Or copy this link: ${escapeHtml(url)}</p>`
      : '';
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f6f7fb"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px"><p style="margin:0 0 24px;font:bold 22px Arial,sans-serif;color:#006194">${escapeHtml(brand.productName)}</p>${m.lines.map(para).join('')}${button}${m.note ? `<p style="margin:0 0 16px;font:14px/20px Arial,sans-serif;color:#40484f">${escapeHtml(m.note)}</p>` : ''}<p style="margin:24px 0 0;font:12px/18px Arial,sans-serif;color:#5b636a">${escapeHtml(FOOTER)}</p></div></body></html>`;
  return { subject, text, html };
}
