import React, { useMemo } from 'react';
import { Grid3X3 } from 'lucide-react';
import { computeCompassOrientation } from '../domain/workspaceMath';

interface WorkspaceCompassWidgetProps {
  cameraAzimuthDeg: number;
  northAngleDeg: number | null | undefined;
  showGroundCompass: boolean;
  onToggleGroundCompass: () => void;
}

const COMPASS_TICKS = Array.from({ length: 24 }, (_, idx) => {
  const angleDeg = idx * 15;
  const isCardinal = angleDeg % 90 === 0;
  const isMajor = angleDeg % 30 === 0;
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const outerR = 35;
  const innerR = isCardinal ? 28.5 : isMajor ? 30.5 : 32.5;
  return {
    angleDeg,
    isCardinal,
    isMajor,
    x1: 40 + innerR * Math.cos(rad),
    y1: 40 + innerR * Math.sin(rad),
    x2: 40 + outerR * Math.cos(rad),
    y2: 40 + outerR * Math.sin(rad),
  };
});

/**
 * Transparent round 3D Workspace orientation compass.
 * - No rectangular outer card: renders a clean circular dial with radial ticks,
 *   N/E/S/W cardinal labels, and rotating north/south needle synced to verified project north.
 * - Displays an honest unavailable state when project north is not set.
 * - Retains the ground-grid orientation rose toggle underneath.
 */
export const WorkspaceCompassWidget: React.FC<WorkspaceCompassWidgetProps> = ({
  cameraAzimuthDeg,
  northAngleDeg,
  showGroundCompass,
  onToggleGroundCompass,
}) => {
  const orientation = useMemo(
    () => computeCompassOrientation(cameraAzimuthDeg, northAngleDeg),
    [cameraAzimuthDeg, northAngleDeg]
  );

  const headingDeg = Math.round(((cameraAzimuthDeg % 360) + 360) % 360);

  return (
    <div
      data-testid="workspace-compass-widget"
      data-north-verified={orientation.isNorthVerified ? 'true' : 'false'}
      data-rotation-deg={String(orientation.needleRotationDeg)}
      data-ground-compass={showGroundCompass ? 'true' : 'false'}
      className="pointer-events-auto flex flex-col items-center gap-1 select-none"
      aria-label={`Compass: ${orientation.orientationLabel}, camera heading ${headingDeg} degrees`}
    >
      {/* Transparent round compass dial */}
      <div
        className="relative flex h-[78px] w-[78px] items-center justify-center rounded-full"
        title={orientation.orientationLabel}
      >
        <svg
          viewBox="0 0 80 80"
          className="h-full w-full overflow-visible drop-shadow-[0_1px_2px_rgba(255,255,255,0.85)]"
          role="img"
          aria-label={
            orientation.isNorthVerified
              ? `Compass pointing north at ${orientation.needleRotationDeg} degrees`
              : 'Model grid compass — project north not set'
          }
        >
          {/* Transparent dial perimeter ring */}
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="rgba(255, 255, 255, 0.22)"
            stroke={orientation.isNorthVerified ? 'rgba(27, 42, 74, 0.34)' : 'rgba(79, 92, 103, 0.45)'}
            strokeWidth="1.25"
            strokeDasharray={orientation.isNorthVerified ? undefined : '3 2.5'}
          />

          {/* Subtle inner reference ring */}
          <circle
            cx="40"
            cy="40"
            r="16.5"
            fill="none"
            stroke="rgba(27, 42, 74, 0.14)"
            strokeWidth="0.9"
          />

          {/* Rotating compass rose: ticks, N/E/S/W cardinals, and dual-tone needle */}
          <g
            data-testid="compass-rotating-group"
            style={{
              transform: `rotate(${orientation.needleRotationDeg}deg)`,
              transformOrigin: '40px 40px',
              transition: 'transform 60ms linear',
            }}
          >
            {/* 24 legible ticks */}
            {COMPASS_TICKS.map((tick) => (
              <line
                key={tick.angleDeg}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke={
                  tick.angleDeg === 0
                    ? orientation.isNorthVerified
                      ? '#C2410C'
                      : '#4F5C67'
                    : tick.isCardinal
                      ? '#1B2A4A'
                      : tick.isMajor
                        ? 'rgba(27, 42, 74, 0.65)'
                        : 'rgba(27, 42, 74, 0.35)'
                }
                strokeWidth={tick.isCardinal ? 1.5 : tick.isMajor ? 1.1 : 0.8}
                strokeLinecap="round"
              />
            ))}

            {/* Cardinal letters N, E, S, W — orbit with true north while staying upright & legible */}
            <text
              x="40"
              y="16.5"
              transform={`rotate(${-orientation.needleRotationDeg} 40 16.5)`}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9.5"
              fontWeight="800"
              fill={orientation.isNorthVerified ? '#C2410C' : '#4F5C67'}
              paintOrder="stroke"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2.2"
              strokeLinejoin="round"
            >
              N
            </text>
            <text
              x="63.5"
              y="40.5"
              transform={`rotate(${-orientation.needleRotationDeg} 63.5 40.5)`}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8"
              fontWeight="700"
              fill="#1B2A4A"
              paintOrder="stroke"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              E
            </text>
            <text
              x="40"
              y="64.5"
              transform={`rotate(${-orientation.needleRotationDeg} 40 64.5)`}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8"
              fontWeight="700"
              fill="#1B2A4A"
              paintOrder="stroke"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              S
            </text>
            <text
              x="16.5"
              y="40.5"
              transform={`rotate(${-orientation.needleRotationDeg} 16.5 40.5)`}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8"
              fontWeight="700"
              fill="#1B2A4A"
              paintOrder="stroke"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              W
            </text>

            {/* Dual-tone needle */}
            <polygon
              points="40,22 43.4,40 40,37.8 36.6,40"
              fill={orientation.isNorthVerified ? '#C2410C' : '#64748B'}
            />
            <polygon
              points="40,58 43.4,40 40,42.2 36.6,40"
              fill={orientation.isNorthVerified ? '#1B2A4A' : '#94A3B8'}
              fillOpacity={orientation.isNorthVerified ? 0.88 : 0.7}
            />
            <circle
              cx="40"
              cy="40"
              r="2.4"
              fill="#FFFFFF"
              stroke={orientation.isNorthVerified ? '#1B2A4A' : '#64748B'}
              strokeWidth="1.2"
            />
          </g>
        </svg>
      </div>

      {/* Truthful unavailable state when project north is unknown */}
      {!orientation.isNorthVerified && (
        <span
          data-testid="compass-north-status"
          className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold tracking-tight text-[#4F5C67] backdrop-blur-xs"
        >
          North not set
        </span>
      )}

      {/* Compact ground-grid toggle (no surrounding rectangular card) */}
      <button
        type="button"
        onClick={onToggleGroundCompass}
        aria-pressed={showGroundCompass}
        data-testid="ground-compass-toggle"
        title={
          showGroundCompass
            ? 'Hide 3D ground orientation grid'
            : 'Show 3D ground orientation grid'
        }
        className={`inline-flex min-h-[28px] items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors backdrop-blur-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
          showGroundCompass
            ? 'border-[#1B2A4A] bg-[#1B2A4A]/90 text-white'
            : 'border-[#1B2A4A]/20 bg-white/75 text-[#1B2A4A] hover:bg-white/95'
        }`}
      >
        <Grid3X3 className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Grid</span>
      </button>
    </div>
  );
};
