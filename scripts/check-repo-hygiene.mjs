#!/usr/bin/env node
// AA Pro repository-hygiene check. Uses Node built-ins only.
// Checks every file tracked by Git (or staged, with --staged) for:
//   1. identifying demo terms (supplied outside Git via the IDENTIFYING_TERMS secret or --terms-file)
//   2. meeting links, international phone numbers and non-example email addresses
//   3. hot-linked third-party images outside docs/
//   4. banned brand strings outside docs/ and design-reference/
//   5. forbidden files (.env, archives, original screenshots, keys) and files over 5 MB
// Findings never print an identifying term, only its index number.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const args = process.argv.slice(2);
const SELF = 'scripts/check-repo-hygiene.mjs';
const BINARY = /\.(pdf|png|jpe?g|gif|ico|webp|woff2?|ttf|otf)$/i;
const MAX_BYTES = 5 * 1024 * 1024;

function trackedFiles() {
  const gitArgs = args.includes('--staged')
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '-z'];
  return execFileSync('git', gitArgs, { encoding: 'utf8' }).split('\0').filter(Boolean);
}

function loadTerms() {
  const i = args.indexOf('--terms-file');
  const raw = i >= 0 ? readFileSync(args[i + 1], 'utf8') : (process.env.IDENTIFYING_TERMS || '');
  const terms = raw.split(/[\n,]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 3);
  if (terms.length === 0) {
    console.error('FAIL: no identifying terms configured. Set the IDENTIFYING_TERMS repository secret (or pass --terms-file locally).');
    process.exit(2);
  }
  return terms;
}

const terms = loadTerms();
const findings = [];
const add = (file, rule, detail) => findings.push(`${file}: ${rule}${detail ? ` (${detail})` : ''}`);

const PATTERNS = [
  ['meeting-link', /zoom\.us\/(j|my|w)\//i],
  ['phone-number', /\+\d{1,3}[ -]?\d{3,5}[ -]?\d{3,5}\b/],
];
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
// example.* is reserved for documentation; noreply@anthropic.com appears only in commit-attribution notes.
const ALLOWED_EMAIL_DOMAINS = /(@example\.(com|org|net)|^noreply@anthropic\.com)$/i;
const HOTLINK = /lh3\.googleusercontent\.com/i;
const BRAND = [/\blumina\b/i, /\blumi\b/i, /p4bpay/i];
const FORBIDDEN_PATH = [
  [/(^|\/)\.env(\.(?!example$)[^/]*)?$/, '.env file'],
  [/\.(zip|7z|rar|tar|gz)$/i, 'archive'],
  [/(^|\/)screen\.png$/i, 'original design screenshot'],
  [/\.(pem|key|p12|pfx)$/i, 'key or certificate'],
];

const files = trackedFiles();
for (const f of files) {
  for (const [rx, label] of FORBIDDEN_PATH) if (rx.test(f)) add(f, 'forbidden-file', label);
  let size = 0;
  try { size = statSync(f).size; } catch { continue; }
  if (size > MAX_BYTES) add(f, 'file-too-large', `${size} bytes`);
  if (BINARY.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  const lower = text.toLowerCase();
  terms.forEach((t, idx) => { if (lower.includes(t)) add(f, 'identifying-term', `term #${idx + 1}`); });
  for (const [label, rx] of PATTERNS) if (rx.test(text)) add(f, label);
  for (const m of text.match(EMAIL) || []) if (!ALLOWED_EMAIL_DOMAINS.test(m)) add(f, 'email-address', 'non-example domain');
  if (!f.startsWith('docs/') && HOTLINK.test(text)) add(f, 'hot-linked-image');
  if (f !== SELF && !f.startsWith('docs/') && !f.startsWith('design-reference/')) {
    for (const rx of BRAND) if (rx.test(text)) add(f, 'banned-brand-string', rx.source);
  }
}

console.log(`Checked ${files.length} files against ${terms.length} identifying terms.`);
if (findings.length) {
  console.error(`FAIL: ${findings.length} finding(s):`);
  for (const x of findings) console.error(`  - ${x}`);
  process.exit(1);
}
console.log('PASS: no findings.');
