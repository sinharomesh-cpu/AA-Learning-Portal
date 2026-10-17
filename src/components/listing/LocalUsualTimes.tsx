'use client';

import { useSyncExternalStore } from 'react';
import { convertUsualTimes, formatMinute, type UsualTime, WEEKDAYS } from '@/lib/usualTimes';

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const subscribe = () => () => {};

/**
 * Board D9: "Usually free (your time zone)". The server shows the teacher's own times; in the
 * browser they are converted to the visitor's time zone. A guide only.
 */
export function LocalUsualTimes({ times, teacherZone }: { times: UsualTime[]; teacherZone: string }) {
  const zone = useSyncExternalStore(subscribe, browserZone, () => null);
  const shown = zone ? convertUsualTimes(times, teacherZone, zone) : times;
  if (times.length === 0) return <p className="text-[15px] text-on-surface-variant">No usual times given.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
        {shown.map((t) => (
          <li key={`${t.weekday}-${t.start}`}>
            <span className="font-bold">{WEEKDAYS[t.weekday - 1]}</span> {formatMinute(t.start)}–
            {t.end === 1440 ? '12:00 am' : formatMinute(t.end)}
          </li>
        ))}
      </ul>
      <p className="text-sm text-on-surface-variant">
        {zone ? `In your time zone (${zone}).` : `In the teacher's time zone (${teacherZone}).`}
      </p>
    </div>
  );
}
