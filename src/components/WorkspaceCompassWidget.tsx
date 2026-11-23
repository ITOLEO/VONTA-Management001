import { Compass } from 'lucide-react';
import { computeCompassOrientation } from '../domain/workspaceMath';

interface WorkspaceCompassWidgetProps {
  cameraAzimuthDeg: number;
  northAngleDeg: number | null | undefined;
  showGroundCompass: boolean;
  onToggleGroundCompass: () => void;
}

/**
 * Dual-mode Workspace compass widget positioned directly below Download / Share at top-right.
 * - Live rotating corner north indicator synced with camera orbit and project northAngleDeg.
 * - Toggleable Ground compass overlay anchored to the 3D scene ground plane.
 * - Truthfully shows "Grid orientation · North not set" when northAngleDeg is null.
 */
export function WorkspaceCompassWidget({
  cameraAzimuthDeg,
  northAngleDeg,
  showGroundCompass,
  onToggleGroundCompass,
}: WorkspaceCompassWidgetProps) {
  const orientation = computeCompassOrientation(cameraAzimuthDeg, northAngleDeg);

  return (
    <div
      data-testid="workspace-compass-widget"
      className="pointer-events-auto flex flex-col items-end gap-1.5"
    >
      <div className="flex items-center gap-2 rounded-xl border border-[#D9DEE2] bg-white/95 px-2.5 py-2 shadow-sm backdrop-blur">
        {/* Live rotating corner compass dial */}
        <div
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#D9DEE2] bg-[#F4F3EF]/70"
          aria-label={orientation.orientationLabel}
          title={orientation.orientationLabel}
        >
          <svg
            viewBox="0 0 44 44"
            className="h-10 w-10"
            style={{
              transform: `rotate(${orientation.needleRotationDeg}deg)`,
              transition: 'transform 60ms linear',
            }}
            data-testid="compass-needle-svg"
            data-rotation-deg={orientation.needleRotationDeg}
            aria-hidden="true"
          >
            {/* Outer subtle ring & cardinal ticks */}
            <circle cx="22" cy="22" r="18" fill="none" stroke="#D9DEE2" strokeWidth="1" />
            <line x1="22" y1="4" x2="22" y2="7" stroke="#A64011" strokeWidth="1.5" />
            <line x1="40" y1="22" x2="37" y2="22" stroke="#94A3B8" strokeWidth="1.2" />
            <line x1="22" y1="40" x2="22" y2="37" stroke="#94A3B8" strokeWidth="1.2" />
            <line x1="4" y1="22" x2="7" y2="22" stroke="#94A3B8" strokeWidth="1.2" />

            {/* North pointer (warm orange) */}
            <polygon points="22,8 25.5,22 18.5,22" fill="#D4652F" />
            {/* South pointer (navy slate) */}
            <polygon points="22,36 25.5,22 18.5,22" fill="#1B2A4A" opacity="0.45" />
            <circle cx="22" cy="22" r="2.2" fill="#1B2A4A" />

            {/* N indicator */}
            <text
              x="22"
              y="14"
              textAnchor="middle"
              fontSize="6.5"
              fontWeight="700"
              fill="#FFFFFF"
            >
              N
            </text>
          </svg>
        </div>

        {/* Status label + Ground compass toggle */}
        <div className="flex flex-col items-start gap-1">
          <div
            data-testid="compass-orientation-label"
            className="max-w-[138px] text-[11px] leading-[14px] font-semibold text-[#1B2A4A]"
          >
            {orientation.isNorthVerified ? 'North verified' : 'Grid orientation'}
          </div>
          <div className="max-w-[138px] text-[10px] leading-[13px] text-[#4F5C67]">
            {orientation.isNorthVerified
              ? `Heading ${Math.round(northAngleDeg ?? 0)}°`
              : 'North not set'}
          </div>
          <button
            type="button"
            data-testid="ground-compass-toggle"
            aria-pressed={showGroundCompass}
            onClick={onToggleGroundCompass}
            className={`mt-0.5 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              showGroundCompass
                ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
            }`}
          >
            <Compass className="h-3 w-3" aria-hidden="true" />
            <span>Ground compass</span>
          </button>
        </div>
      </div>
    </div>
  );
}
