/** Plain-language names for audit event types (M-30). Unknown types fall back to their words. */
const LABELS: Record<string, string> = {
  SIGN_IN: 'Sign-in',
  SIGN_UP: 'Created an account',
  SIGN_UP_EXISTING_EMAIL: 'Sign-up with an email already in use',
  EMAIL_CONFIRMED: 'Email confirmed',
  PASSWORD_SET: 'Password set', // pragma: allowlist secret
  PASSWORD_CHANGE: 'Password changed', // pragma: allowlist secret
  PASSWORD_RESET_REQUESTED: 'Password reset requested', // pragma: allowlist secret
  MFA_ENROLLED: 'Security code set up',
  MFA_ENROL_FAILED: 'Security code set-up failed',
  MFA_SUCCEEDED: 'Security code accepted',
  MFA_FAILED: 'Wrong security code',
  MFA_RESET: 'Authenticator removed',
  RECOVERY_CODES_CREATED: 'Recovery codes created',
  RECOVERY_CODE_USED: 'Recovery code used',
  RECOVERY_CODE_FAILED: 'Wrong recovery code',
  OWNER_SETUP_REQUESTED: 'Owner set-up requested',
  ADMIN_CREATED: 'Admin added',
  ADMIN_UPDATED: 'Admin changed',
  ADMIN_INVITE_RESENT: 'Admin invitation sent again',
  ACCOUNT_CREATED: 'Account created',
  ACCOUNT_UPDATED: 'Account edited',
  ACCOUNT_DEACTIVATED: 'Account deactivated',
  ACCOUNT_REACTIVATED: 'Account reactivated',
  TEACHER_DECISION: 'Teacher decision',
  AI_SESSION_STARTED: 'AI Tutor session started',
  AI_SESSION_ENDED: 'AI Tutor session ended early',
  AI_SESSION_REFUSED: 'AI Tutor session refused (one a day)',
  TEACHER_PROFILE_SUBMITTED: 'Teacher sent profile for approval',
  TEACHER_PROFILE_UPDATED: 'Teacher profile edited',
  TEACHER_PROFILE_CHANGE_SUBMITTED: 'Teacher asked to change subjects or grades',
  TEACHER_PROFILE_CHANGE_DECISION: 'Teacher profile change decided',
  TEACHER_LINKED: 'Parent added a teacher',
  TEACHER_SEARCH_VISIBILITY: 'Teacher changed whether parents can find them',
  TEACHER_LINK_CHANGED: 'Parent changed a teacher’s children or subjects',
  TEACHER_LINK_REMOVED: 'Parent removed a teacher',
  TEACHER_LINK_REFUSED: 'Teacher could not be added',
  TEACHER_REQUEST_WITHDRAWN: 'Parent withdrew a teacher request',
  LINK_REQUEST_SENT: 'Request sent to a teacher for a child',
  LINK_REQUEST_ACCEPTED: 'Teacher accepted a request for a child',
  LINK_REQUEST_DECLINED: 'Teacher declined a request for a child',
  LINK_REQUEST_EXPIRED: 'Request to a teacher expired',
  LINK_REQUEST_WITHDRAWN: 'Parent withdrew a request to a teacher',
  LINK_REQUEST_REFUSED: 'Request action refused',
  CHILD_CREDENTIALS_CREATED: 'Child account created',
  CHILD_PROFILE_UPDATED: 'Child profile edited',
  CHILD_CONSENT_GIVEN: 'Parent consent given',
  CHILD_LOGIN_SUCCEEDED: 'Child signed in',
  CHILD_LOGIN_FAILED: 'Child sign-in failed',
  CHILD_LOCKED: 'Child sign-in locked',
  CHILD_UNLOCKED: 'Child sign-in unlocked',
  CHILD_PASSWORD_RESET: 'Child password reset', // pragma: allowlist secret
  CHILD_SESSIONS_REVOKED: 'Child signed out everywhere',
  CHILD_PAUSED: 'Child account paused',
  CHILD_RESUMED: 'Child account resumed',
  CHILD_ACTION_REFUSED: 'Child action refused',
  PARENT_REAUTH_SUCCEEDED: 'Parent confirmed password', // pragma: allowlist secret
  PARENT_REAUTH_FAILED: 'Parent password check failed', // pragma: allowlist secret
  RATE_LIMIT_IP_THROTTLED: 'Too many attempts from one network',
  FILE_STORED: 'File uploaded',
  FILE_REMOVED: 'File removed',
  FILE_READ_REFUSED: 'File access refused',
  STORAGE_LIMIT_CHANGED: 'Storage limit changed',
  STORAGE_WARNING: 'Storage warning level reached',
  STORAGE_UPLOADS_STOPPED: 'Uploads stopped: storage nearly full',
};

export function auditLabel(type: string): string {
  if (LABELS[type]) return LABELS[type];
  const words = type.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
