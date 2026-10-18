/** Storage numbers and words shared by the server and the pages (OC-96). */

export const MB = 1024 * 1024;

/** "85 MB", "0.4 MB", "1.2 GB": one decimal below 10. */
export function formatMb(bytes: number): string {
  const mb = bytes / MB;
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb >= 10 * 1024 ? 0 : 1)} GB`;
  if (mb <= 0) return '0 MB';
  if (mb < 10) return `${Math.max(0.1, Math.round(mb * 10) / 10)} MB`;
  return `${Math.round(mb)} MB`;
}

export type UploadRefusal =
  | { reason: 'daily_limit'; limit: number; nextUploadAt: Date | null }
  | { reason: 'space_full'; usedBytes: number; limitBytes: number }
  | { reason: 'storage_full' };

/** Clear words for each limit (OC-96). Times are shown in the viewer's own time zone. */
export function uploadRefusalText(r: UploadRefusal, timeZone = 'Asia/Kolkata', now = new Date()): string {
  if (r.reason === 'daily_limit') {
    let when = 'tomorrow';
    if (r.nextUploadAt) {
      const sameDay =
        r.nextUploadAt.toLocaleDateString('en-GB', { timeZone }) === now.toLocaleDateString('en-GB', { timeZone });
      const time = r.nextUploadAt.toLocaleTimeString('en-GB', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      when = sameDay ? `after ${time}` : `after ${time} tomorrow`;
    }
    return `You have added ${r.limit} files in the last 24 hours, the most allowed while AA Pro is being tested. You can add more ${when}.`;
  }
  if (r.reason === 'space_full') {
    return `This file would take you past your ${formatMb(r.limitBytes)} of storage (you are using ${formatMb(r.usedBytes)}). Remove some files you no longer need, then try again.`;
  }
  return "New files can't be added right now because AA Pro's test storage is nearly full. Nothing you have already added is affected. The AA Pro team is shown a warning on their admin page.";
}
