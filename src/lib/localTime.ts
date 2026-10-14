/**
 * Builds a UTC instant for a wall-clock time on the viewer's current local day.
 * Used only by synthetic fixtures so demo lessons always appear "today".
 */
export function todayAt(hour: number, minute: number, timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const [y, m, d] = [get('year'), get('month'), get('day')];
  // First guess treats the wall time as UTC, then corrects by the zone's offset at that instant.
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const offsetMinutes = zoneOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offsetMinutes * 60_000).toISOString();
}

/** Offset of the zone from UTC in minutes at the given instant, e.g. +330 for Asia/Kolkata. */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** "Good morning" / "Good afternoon" / "Good evening" for the viewer's local time. */
export function greeting(timeZone: string, now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
