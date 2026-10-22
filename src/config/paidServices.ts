/**
 * Paid services register (OC-91: the approved budget is $0).
 *
 * No service that may incur charges is integrated, activated or called until the owner approves
 * that specific service and budget in writing. Approval is recorded here with the decision id,
 * and a test fails if this register, the code or the dependencies drift from it.
 * Research, cost estimates and integration designs are allowed; activation is not.
 */
export interface PaidService {
  id: string;
  purpose: string;
  /** Owner decision approving the service and its budget, e.g. "OC-123". Null = not approved. */
  approvedBy: string | null;
  /** npm packages that would integrate it. None may be installed while unapproved. */
  packages: readonly string[];
  /** API hosts it would call. None may appear in the code while unapproved. */
  hosts: readonly string[];
}

export const PAID_SERVICES: readonly PaidService[] = [
  {
    id: 'ai-voice-gemini',
    purpose: 'AI Teacher voice (Google Gemini Live on Google Cloud)',
    approvedBy: null,
    packages: ['@google/genai', '@google-cloud/vertexai', '@google-cloud/aiplatform'],
    hosts: ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com'],
  },
  {
    id: 'ai-voice-openai',
    purpose: 'AI Teacher voice alternative (OpenAI Realtime)',
    approvedBy: null,
    packages: ['openai', '@openai/agents', '@openai/realtime-api-beta'],
    hosts: ['api.openai.com'],
  },
  {
    id: 'ai-voice-elevenlabs',
    purpose: 'AI Teacher voice (FRD baseline)',
    approvedBy: null,
    packages: ['elevenlabs', '@elevenlabs/elevenlabs-js', '@elevenlabs/react', '@elevenlabs/client'],
    hosts: ['api.elevenlabs.io'],
  },
  {
    id: 'ai-text-anthropic',
    purpose: 'AI Teacher text model alternative (Anthropic)',
    approvedBy: null,
    packages: ['@anthropic-ai/sdk'],
    hosts: ['api.anthropic.com'],
  },
  {
    id: 'ai-aws',
    purpose: 'AI Teacher alternative (AWS Bedrock / Nova Sonic)',
    approvedBy: null,
    packages: ['@aws-sdk/client-bedrock-runtime'],
    hosts: ['bedrock-runtime.'],
  },
  {
    id: 'email',
    purpose: 'Real email delivery with Resend, free plan only (OC-65, OC-133)',
    // OC-133: Resend's free plan at ₹0 a month; no paid plan, no automatic billing, no fallback.
    // Code may call Resend; sending stays off until the owner switches it on (src/server/email).
    approvedBy: 'OC-133',
    packages: [],
    hosts: ['api.resend.com'],
  },
  {
    id: 'email-other',
    purpose: 'Other email providers (not chosen)',
    approvedBy: null,
    packages: ['resend', 'postmark', '@sendgrid/mail', 'nodemailer', '@aws-sdk/client-ses', 'mailgun.js'],
    hosts: ['api.postmarkapp.com', 'api.sendgrid.com', 'api.mailgun.net'],
  },
  {
    id: 'whatsapp',
    purpose: 'WhatsApp notifications',
    approvedBy: null,
    packages: ['twilio'],
    hosts: ['api.twilio.com', 'graph.facebook.com'],
  },
  {
    id: 'zoom',
    purpose: 'Zoom meetings for human-teacher lessons',
    approvedBy: null,
    packages: ['@zoom/meetingsdk', '@zoom/videosdk'],
    hosts: ['api.zoom.us', 'zoom.us/oauth'],
  },
  {
    id: 'object-storage',
    purpose: 'File storage outside the database (C-5, OC-87 Q-9)',
    approvedBy: null,
    packages: ['@aws-sdk/client-s3', '@vercel/blob', '@google-cloud/storage', '@supabase/storage-js'],
    hosts: ['amazonaws.com', 'blob.vercel-storage.com', 'r2.cloudflarestorage.com', 'storage.googleapis.com'],
  },
  {
    id: 'payments',
    purpose: 'Payments (not approved; OC-79 asks only a survey question)',
    approvedBy: null,
    packages: ['stripe', 'razorpay'],
    hosts: ['api.stripe.com', 'api.razorpay.com'],
  },
];

/** True only for a service the owner has approved in writing (OC-91). */
export function paidServiceApproved(id: string): boolean {
  return PAID_SERVICES.some((s) => s.id === id && s.approvedBy !== null);
}
