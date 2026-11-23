import React, { useEffect, useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import { hexToHsl, hslToHex, normalizeHexColor } from '../domain/workspaceMath';

export interface ColorPresetOption {
  id: string;
  label: string;
  hex: string;
}

export const DEFAULT_COLOR_PICKER_PRESETS: ReadonlyArray<ColorPresetOption> = [
  { id: 'vonta-orange', label: 'VONTA Orange', hex: '#D4652F' },
  { id: 'burnt-ochre', label: 'Burnt Ochre', hex: '#A64011' },
  { id: 'site-navy', label: 'Site Navy', hex: '#1B2A4A' },
  { id: 'cobalt-blue', label: 'Cobalt Blue', hex: '#0B63CE' },
  { id: 'sage-emerald', label: 'Sage Emerald', hex: '#15803D' },
  { id: 'amber-gold', label: 'Amber Gold', hex: '#B45309' },
  { id: 'crimson-alert', label: 'Crimson Alert', hex: '#B42318' },
  { id: 'slate-violet', label: 'Slate Violet', hex: '#6D28D9' },
  { id: 'teal-pipe', label: 'Teal Pipe', hex: '#0F766E' },
  { id: 'charcoal', label: 'Charcoal', hex: '#334155' },
];

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperConstructor {
  new (): {
    open: () => Promise<EyeDropperResult>;
  };
}

interface ColorPickerControlProps {
  value: string;
  onChange: (hex: string) => void;
  presets?: ReadonlyArray<ColorPresetOption>;
  label?: string;
  compact?: boolean;
  disabled?: boolean;
  testIdPrefix?: string;
}

/**
 * Shared VONTA color picker control (Doc 05):
 * - Synchronized presets, validated #RRGGBB hex input, interactive 2D color wheel + lightness bar,
 *   keyboard Hue/Saturation/Lightness inputs, and user-triggered native EyeDropper with local fallback.
 * - Incomplete or invalid hex edits never corrupt the committed color state.
 */
export function ColorPickerControl({
  value,
  onChange,
  presets = DEFAULT_COLOR_PICKER_PRESETS,
  label = 'Color',
  compact = false,
  disabled = false,
  testIdPrefix = 'color-picker',
}: ColorPickerControlProps) {
  const committedHex = normalizeHexColor(value) ?? '#D4652F';
  const [hexDraft, setHexDraft] = useState(committedHex);
  const [hexError, setHexError] = useState<string | null>(null);
  const [hsl, setHsl] = useState(() => hexToHsl(committedHex));
  const [eyedropperNotice, setEyedropperNotice] = useState<string | null>(null);
  const [fallbackSamplerOpen, setFallbackSamplerOpen] = useState(false);

  const wheelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingWheelRef = useRef(false);
  const wheelSize = compact ? 112 : 136;

  // Keep draft and HSL synced when parent updates committed color
  useEffect(() => {
    setHexDraft(committedHex);
    setHexError(null);
    setHsl(hexToHsl(committedHex));
  }, [committedHex]);

  // Draw color wheel on canvas
  useEffect(() => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = wheelSize;
    const radius = size / 2;
    const img = ctx.createImageData(size, size);
    const data = img.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - radius;
        const dy = y - radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist <= radius) {
          const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
          const sat = Math.min(100, (dist / radius) * 100);
          const hex = hslToHex(angle, sat, hsl.l);
          data[idx] = parseInt(hex.slice(1, 3), 16);
          data[idx + 1] = parseInt(hex.slice(3, 5), 16);
          data[idx + 2] = parseInt(hex.slice(5, 7), 16);
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [wheelSize, hsl.l]);

  const commitHex = (nextHex: string) => {
    const normalized = normalizeHexColor(nextHex);
    if (!normalized) return;
    setHexDraft(normalized);
    setHexError(null);
    setHsl(hexToHsl(normalized));
    onChange(normalized);
  };

  const commitHsl = (nextH: number, nextS: number, nextL: number) => {
    const clampedH = ((Math.round(nextH) % 360) + 360) % 360;
    const clampedS = Math.max(0, Math.min(100, Math.round(nextS)));
    const clampedL = Math.max(5, Math.min(95, Math.round(nextL)));
    const nextHex = hslToHex(clampedH, clampedS, clampedL);
    setHsl({ h: clampedH, s: clampedS, l: clampedL });
    setHexDraft(nextHex);
    setHexError(null);
    onChange(nextHex);
  };

  const pickFromWheelPoint = (clientX: number, clientY: number) => {
    if (disabled) return;
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = clientX - rect.left - cx;
    const dy = clientY - rect.top - cy;
    const dist = Math.min(cx, Math.sqrt(dx * dx + dy * dy));
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const sat = (dist / cx) * 100;
    commitHsl(angle, sat, hsl.l);
  };

  const handleHexInputChange = (raw: string) => {
    setHexDraft(raw);
    const normalized = normalizeHexColor(raw);
    if (normalized) {
      setHexError(null);
      setHsl(hexToHsl(normalized));
      onChange(normalized);
    } else {
      setHexError('Enter a valid #RRGGBB hex code.');
    }
  };

  const handleHexBlur = () => {
    const normalized = normalizeHexColor(hexDraft);
    if (normalized) {
      setHexDraft(normalized);
      setHexError(null);
    }
  };

  const handleEyeDropper = async () => {
    if (disabled) return;
    setEyedropperNotice(null);
    const win = window as unknown as { EyeDropper?: EyeDropperConstructor };
    if (typeof win.EyeDropper === 'function') {
      try {
        const dropper = new win.EyeDropper();
        const result = await dropper.open();
        const normalized = normalizeHexColor(result?.sRGBHex ?? '');
        if (normalized) {
          commitHex(normalized);
        }
      } catch {
        // User pressed Escape or canceled native EyeDropper — leave existing color untouched
        setEyedropperNotice('Eyedropper canceled.');
      }
      return;
    }
    // Fallback when native EyeDropper API is unavailable
    setFallbackSamplerOpen((v) => !v);
    setEyedropperNotice(
      'Native browser eyedropper is unavailable here. Pick a swatch below or use the color wheel.'
    );
  };

  // Indicator dot position on the wheel
  const angleRad = (hsl.h * Math.PI) / 180;
  const markerDist = (hsl.s / 100) * (wheelSize / 2 - 4);
  const markerX = wheelSize / 2 + Math.cos(angleRad) * markerDist;
  const markerY = wheelSize / 2 + Math.sin(angleRad) * markerDist;

  return (
    <div
      data-testid={testIdPrefix}
      className="space-y-2.5 text-[12px] text-[#1B2A4A]"
      aria-label={label}
    >
      {/* Preset swatches */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${label} presets`}>
        {presets.map((preset) => {
          const active = committedHex.toLowerCase() === preset.hex.toLowerCase();
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              data-testid={`${testIdPrefix}-preset-${preset.id}`}
              aria-label={preset.label}
              title={`${preset.label} (${preset.hex})`}
              aria-pressed={active}
              onClick={() => commitHex(preset.hex)}
              className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] disabled:opacity-50 ${
                active ? 'border-[#1B2A4A] ring-2 ring-[#D4652F]/45' : 'border-white shadow-sm'
              }`}
              style={{ backgroundColor: preset.hex }}
            />
          );
        })}
      </div>

      {/* Interactive Wheel + Hex & Eyedropper */}
      <div className="flex flex-wrap items-start gap-3">
        <div
          className="relative shrink-0 select-none"
          style={{ width: wheelSize, height: wheelSize }}
        >
          <canvas
            ref={wheelCanvasRef}
            width={wheelSize}
            height={wheelSize}
            data-testid={`${testIdPrefix}-wheel`}
            onPointerDown={(e) => {
              if (disabled) return;
              draggingWheelRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              pickFromWheelPoint(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!draggingWheelRef.current) return;
              pickFromWheelPoint(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              draggingWheelRef.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            className={`rounded-full border border-[#D9DEE2] ${
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
            }`}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{
              left: markerX,
              top: markerY,
              backgroundColor: committedHex,
            }}
          />
        </div>

        <div className="min-w-[140px] flex-1 space-y-2">
          {/* Hex input + preview + Eyedropper */}
          <div>
            <label
              htmlFor={`${testIdPrefix}-hex-input`}
              className="block text-[11px] font-semibold uppercase tracking-wide text-[#4F5C67]"
            >
              Hex (#RRGGBB)
            </label>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className="h-8 w-8 shrink-0 rounded-md border border-[#D9DEE2]"
                style={{ backgroundColor: committedHex }}
                aria-hidden="true"
              />
              <input
                id={`${testIdPrefix}-hex-input`}
                data-testid={`${testIdPrefix}-hex-input`}
                type="text"
                disabled={disabled}
                value={hexDraft}
                onChange={(e) => handleHexInputChange(e.target.value)}
                onBlur={handleHexBlur}
                maxLength={7}
                spellCheck={false}
                aria-invalid={Boolean(hexError)}
                className="h-8 w-full min-w-[84px] rounded-md border border-[#D9DEE2] bg-white px-2 font-mono text-[12px] uppercase text-[#1B2A4A] disabled:bg-[#F4F3EF]"
              />
              <button
                type="button"
                disabled={disabled}
                data-testid={`${testIdPrefix}-eyedropper`}
                onClick={() => void handleEyeDropper()}
                title="Pick color from screen or palette"
                aria-label="Eyedropper color picker"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-50"
              >
                <Pipette className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {hexError && (
              <p
                role="alert"
                data-testid={`${testIdPrefix}-hex-error`}
                className="mt-1 text-[11px] font-medium text-[#B42318]"
              >
                {hexError}
              </p>
            )}
          </div>

          {/* Keyboard-accessible Hue & Lightness controls */}
          <div className="space-y-1">
            <label className="flex items-center justify-between text-[11px] text-[#4F5C67]">
              <span>Hue</span>
              <span className="tabular-nums font-medium text-[#1B2A4A]">{hsl.h}°</span>
            </label>
            <input
              type="range"
              min={0}
              max={359}
              disabled={disabled}
              value={hsl.h}
              aria-label="Hue angle"
              onChange={(e) => commitHsl(Number(e.target.value), hsl.s, hsl.l)}
              className="h-1.5 w-full cursor-pointer accent-[#1B2A4A]"
            />

            <label className="flex items-center justify-between text-[11px] text-[#4F5C67]">
              <span>Lightness</span>
              <span className="tabular-nums font-medium text-[#1B2A4A]">{hsl.l}%</span>
            </label>
            <input
              type="range"
              min={10}
              max={90}
              disabled={disabled}
              value={hsl.l}
              aria-label="Color lightness"
              onChange={(e) => commitHsl(hsl.h, hsl.s, Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer accent-[#1B2A4A]"
            />
          </div>
        </div>
      </div>

      {eyedropperNotice && (
        <p className="rounded-md border border-[#D9DEE2] bg-[#F4F3EF]/70 px-2 py-1 text-[11px] text-[#4F5C67]">
          {eyedropperNotice}
        </p>
      )}

      {fallbackSamplerOpen && (
        <div
          data-testid={`${testIdPrefix}-fallback-sampler`}
          className="rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 p-2"
        >
          <div className="mb-1 text-[11px] font-medium text-[#4F5C67]">
            Local palette sampler
          </div>
          <div className="grid grid-cols-8 gap-1">
            {[
              '#EF4444',
              '#F97316',
              '#F59E0B',
              '#84CC16',
              '#10B981',
              '#06B6D4',
              '#3B82F6',
              '#8B5CF6',
              '#EC4899',
              '#78716C',
              '#0F172A',
              '#1E3A8A',
              '#14532D',
              '#7C2D12',
              '#4C1D95',
              '#FFFFFF',
            ].map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Sample ${hex}`}
                onClick={() => {
                  commitHex(hex);
                  setFallbackSamplerOpen(false);
                }}
                className="h-5 w-full rounded border border-[#D9DEE2]"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
