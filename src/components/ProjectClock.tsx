import React, { useEffect, useState } from 'react';
import { formatProjectClock, isValidIanaTimezone } from '../domain/attendanceEngine';

export interface ProjectClockProps {
  timezone: string;
  /** Optional synthetic demo offset in ms (only used in demo clock testing) */
  clockOffsetMs?: number;
  className?: string;
}

/**
 * Live project clock rendered directly on the header surface (Stage 03):
 * - No enclosing rectangle/box.
 * - Shows project date, live HH:MM:SS time, and time zone with larger text size.
 * - Uses tabular-nums and fixed time-slot width so a seconds rollover never moves adjacent controls.
 */
export const ProjectClock: React.FC<ProjectClockProps> = ({
  timezone,
  clockOffsetMs = 0,
  className = '',
}) => {
  const safeZone = isValidIanaTimezone(timezone) ? timezone : 'Asia/Makassar';
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const formatted = formatProjectClock(new Date(nowMs + clockOffsetMs), safeZone);

  return (
    <div
      data-testid="project-live-clock"
      data-timezone={safeZone}
      aria-label={`Project time (${safeZone}): ${formatted.weekday}, ${formatted.dateLabel} ${formatted.timeWithSeconds} (${formatted.offsetLabel})`}
      title={`Project time (${safeZone}): ${formatted.weekday}, ${formatted.dateLabel} ${formatted.timeWithSeconds} (${formatted.offsetLabel})`}
      className={`hidden md:inline-flex shrink-0 items-center gap-1.5 text-[13px] leading-[20px] text-[#1B2A4A] tabular-nums select-none ${className}`}
    >
      <span
        data-testid="project-live-clock-date"
        className="hidden xl:inline whitespace-nowrap font-medium text-[#4F5C67]"
      >
        {formatted.weekday}, {formatted.dateLabel}
      </span>
      <span className="hidden xl:inline text-[#D9DEE2]" aria-hidden="true">
        ·
      </span>
      <span
        data-testid="project-live-clock-time"
        className="inline-block min-w-[66px] text-center whitespace-nowrap text-[14px] leading-[20px] font-semibold tracking-tight text-[#1B2A4A] tabular-nums"
      >
        {formatted.timeWithSeconds}
      </span>
      <span
        data-testid="project-live-clock-zone"
        className="whitespace-nowrap text-[12.5px] leading-[18px] font-medium text-[#4F5C67]"
      >
        {formatted.offsetLabel}
      </span>
    </div>
  );
};
