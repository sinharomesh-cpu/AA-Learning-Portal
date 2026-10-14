/**
 * Time display helpers (FR-019, R-07): instants are stored as UTC ISO strings and shown
 * in the viewer's IANA time zone.
 */

export interface FormatOptions {
  timeZone: string;
  locale?: string;
}

function assertTimeZone(timeZone: string): void {
  // Throws RangeError for an unknown zone, which is what we want: never guess a zone.
  new Intl.DateTimeFormat('en', { timeZone }).format(0);
}

/** "4:30 pm" */
export function formatClockTime(isoUtc: string, { timeZone, locale = 'en-IN' }: FormatOptions): string {
  assertTimeZone(timeZone);
  return new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(isoUtc))
    .replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`)
    .replace(/ /g, ' ');
}

/** "Wed 14 Oct" */
export function formatDayLabel(isoUtc: string, { timeZone, locale = 'en-IN' }: FormatOptions): string {
  assertTimeZone(timeZone);
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(isoUtc),
  );
}

/** Short zone name for display, e.g. "IST" or "GMT+8". */
export function formatZoneName(isoUtc: string, { timeZone, locale = 'en-IN' }: FormatOptions): string {
  assertTimeZone(timeZone);
  const part = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(isoUtc))
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

/** Adds minutes to a UTC ISO instant and returns a UTC ISO string. */
export function addMinutes(isoUtc: string, minutes: number): string {
  return new Date(new Date(isoUtc).getTime() + minutes * 60_000).toISOString();
}

/** True when both instants fall on the same calendar day in the given zone. */
export function isSameLocalDay(aIsoUtc: string, bIsoUtc: string, timeZone: string): boolean {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date(aIsoUtc)) === fmt.format(new Date(bIsoUtc));
}
