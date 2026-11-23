import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, DoorOpen, RotateCcw, X } from 'lucide-react';
import { ApiClientError, privateApi } from '../data/privateApi';
import type { AuthorizedProject, BuiltAreaModelSpec } from '../domain/accountTypes';
import { computePolygonAreaSqm, validateClosedRoomBoundary } from '../domain/blueprintGeometry';

interface AddRoomBoundaryModalProps {
  open: boolean;
  accessToken: string;
  projectId: string;
  areaId: string;
  areaName: string;
  model: BuiltAreaModelSpec;
  onClose: () => void;
  onSaved: (project: AuthorizedProject) => void;
}

export function AddRoomBoundaryModal({
  open,
  accessToken,
  projectId,
  areaId,
  areaName,
  model,
  onClose,
  onSaved,
}: AddRoomBoundaryModalProps) {
  const [roomName, setRoomName] = useState('');
  const [pointsMm, setPointsMm] = useState<Array<{ xMm: number; zMm: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areaSqm = useMemo(() => computePolygonAreaSqm(pointsMm), [pointsMm]);
  const validation = useMemo(
    () => validateClosedRoomBoundary({ name: roomName, polygonMm: pointsMm }),
    [roomName, pointsMm]
  );

  if (!open) return null;

  const widthMm = Math.max(2000, model.footprintWidthMm);
  const depthMm = Math.max(2000, model.footprintDepthMm);

  const handlePlanClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xFrac = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
    const zFrac = Math.min(0.98, Math.max(0.02, (e.clientY - rect.top) / rect.height));
    const xMm = Math.round((xFrac * widthMm) / 50) * 50;
    const zMm = Math.round((zFrac * depthMm) / 50) * 50;
    setPointsMm((prev) => [...prev, { xMm, zMm }]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await privateApi.addVerifiedRoom(accessToken, projectId, areaId, {
        name: roomName.trim(),
        polygonMm: pointsMm,
      });
      setRoomName('');
      setPointsMm([]);
      onSaved(res.project);
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save room boundary.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-room-modal-title"
      data-testid="add-room-boundary-modal"
    >
      <div className="w-full max-w-xl rounded-xl border border-[#D9DEE2] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <DoorOpen className="h-5 w-5 text-[#A64011]" aria-hidden="true" />
            <h2 id="add-room-modal-title" className="text-[18px] font-semibold text-[#1B2A4A]">
              Add verified room · {areaName}
            </h2>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close add room dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 text-[14px] leading-[20px] text-[#4F5C67]">
          Click at least 3 corners on the calibrated plan below to define a closed room boundary. A
          room label alone cannot create a verified room.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <div>
            <label htmlFor="new-room-name" className="block text-[14px] font-medium text-[#1B2A4A]">
              Room name <span className="text-[#B42318]">*</span>
            </label>
            <input
              id="new-room-name"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="e.g. Pantry / Storage Room"
              className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A]"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[13px] text-[#4F5C67]">
              <span>
                Calibrated floor plan ({widthMm.toLocaleString('en-US')} ×{' '}
                {depthMm.toLocaleString('en-US')} mm)
              </span>
              <button
                type="button"
                onClick={() => setPointsMm([])}
                className="inline-flex items-center gap-1 font-medium text-[#1B2A4A] hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset points ({pointsMm.length})
              </button>
            </div>

            <svg
              onClick={handlePlanClick}
              viewBox={`0 0 ${widthMm} ${depthMm}`}
              className="h-[260px] w-full cursor-crosshair rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]"
            >
              {/* Outer calibrated floor perimeter */}
              <rect
                x={0}
                y={0}
                width={widthMm}
                height={depthMm}
                fill="#FFFFFF"
                stroke="#1B2A4A"
                strokeWidth={Math.max(40, widthMm * 0.008)}
              />

              {/* Existing rooms */}
              {model.rooms.map((r) => (
                <rect
                  key={r.id}
                  x={(r.bounds.minX + widthMm / 2000) * 1000}
                  y={(r.bounds.minZ + depthMm / 2000) * 1000}
                  width={Math.max(100, (r.bounds.maxX - r.bounds.minX) * 1000)}
                  height={Math.max(100, (r.bounds.maxZ - r.bounds.minZ) * 1000)}
                  fill="rgba(27, 42, 74, 0.06)"
                  stroke="rgba(27, 42, 74, 0.35)"
                  strokeWidth={Math.max(20, widthMm * 0.004)}
                />
              ))}

              {/* New closed polygon boundary */}
              {pointsMm.length >= 2 && (
                <polygon
                  points={pointsMm.map((p) => `${p.xMm},${p.zMm}`).join(' ')}
                  fill="rgba(212, 101, 47, 0.18)"
                  stroke="#A64011"
                  strokeWidth={Math.max(30, widthMm * 0.006)}
                />
              )}
              {pointsMm.map((p, idx) => (
                <circle
                  key={`${p.xMm}-${p.zMm}-${idx}`}
                  cx={p.xMm}
                  cy={p.zMm}
                  r={Math.max(80, widthMm * 0.012)}
                  fill="#A64011"
                />
              ))}
            </svg>

            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="text-[#4F5C67] tabular-nums">
                Vertices: <strong className="text-[#1B2A4A]">{pointsMm.length}</strong> · Area:{' '}
                <strong className="text-[#1B2A4A]">{areaSqm.toFixed(2)} m²</strong>
              </span>
              {validation.valid && (
                <span className="inline-flex items-center gap-1 font-medium text-[#166534]">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Valid closed boundary
                </span>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-[#D9DEE2] pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !validation.valid}
              data-testid="save-verified-room-btn"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-[#A64011] px-4 text-[14px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-45"
            >
              {saving ? 'Saving…' : 'Save verified room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
