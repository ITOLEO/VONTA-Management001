import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatProjectClock, isValidIanaTimezone } from '../domain/attendanceEngine';

export interface ProjectClockProps {
  timezone: string;
  /** Optional synthetic demo offset in ms (only used in demo clock testing) */
  clockOffsetMs?: number;
  className?: string;
}

/**
 * L05 Live project clock placed immediately before Profile in the top bar.
 * Displays weekday, date, HH:MM:SS (live to the second), and IANA zone.
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
      title={`Project time (${safeZone}): ${formatted.weekday}, ${formatted.dateLabel} ${formatted.timeWithSeconds} (${formatted.offsetLabel})`}
      className={`hidden md:inline-flex items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] px-2 py-1.5 text-[12px] text-[#1B2A4A] tabular-nums shrink-0 ${className}`}
    >
      <Clock className="w-3.5 h-3.5 text-[#D4652F] shrink-0" aria-hidden="true" />
      <span className="hidden lg:inline font-medium whitespace-nowrap">
        {formatted.weekday}, {formatted.dateLabel}
      </span>
      <span className="hidden lg:inline text-[#D9DEE2]" aria-hidden="true">
        ·
      </span>
      <span
        data-testid="project-live-clock-time"
        className="font-semibold tracking-tight text-[#1B2A4A] whitespace-nowrap"
      >
        {formatted.timeWithSeconds}
      </span>
      <span className="hidden 2xl:inline text-[#4F5C67] whitespace-nowrap">
        {formatted.timezone}
      </span>
    </div>
  );
};
