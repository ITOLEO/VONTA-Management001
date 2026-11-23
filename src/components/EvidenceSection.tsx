import React, { useRef, useState } from 'react';
import { Camera, Trash2, Upload } from 'lucide-react';
import type { EvidencePhoto, SpatialPin } from '../domain/types';
import { readFileAsDataUrl } from '../data/demoRepository';

interface EvidenceSectionProps {
  pin: SpatialPin;
  onAttachEvidence: (input: {
    slot: 'before' | 'after';
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
  }) => { ok: true } | { ok: false; error: string };
  onRemoveEvidence: (slot: 'before' | 'after') => void;
  compact?: boolean;
}

interface SlotCardProps {
  pinId: string;
  cycleNumber: number;
  slot: 'before' | 'after';
  photo: EvidencePhoto | null;
  onSelectFile: (slot: 'before' | 'after', file: File) => void;
  onRemove: (slot: 'before' | 'after') => void;
}

function EvidenceSlotCard({
  pinId,
  cycleNumber,
  slot,
  photo,
  onSelectFile,
  onRemove,
}: SlotCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const labelText = slot === 'before' ? 'Before' : 'After';
  const ctaText = slot === 'before' ? 'Add Before photo' : 'Add After photo';
  const inputId = `evidence-input-${pinId}-${slot}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(slot, file);
    }
    e.target.value = '';
  };

  return (
    <div className="rounded-xl border border-[#D9DEE2] bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
          {labelText} photo
        </div>
        <span className="text-[12px] leading-[16px] text-[#4F5C67] tabular-nums">
          Cycle {cycleNumber}
        </span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        aria-label={`${ctaText} for ${pinId}`}
        onChange={handleFileChange}
        className="sr-only"
      />

      {photo ? (
        <div className="mt-2.5">
          <div className="overflow-hidden rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]">
            <img
              src={photo.dataUrl}
              alt={`${labelText} evidence for ${pinId} (${photo.fileName})`}
              className="h-44 w-full object-cover"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[12px] leading-[16px] text-[#4F5C67]">
            <span className="truncate font-medium text-[#1B2A4A]" title={photo.fileName}>
              {photo.fileName}
            </span>
            <span className="shrink-0 tabular-nums">
              {Math.max(1, Math.round(photo.sizeBytes / 1024))} KB
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF]"
            >
              <Upload className="h-3.5 w-3.5 text-[#4F5C67]" aria-hidden="true" />
              Replace {labelText}
            </button>
            <button
              type="button"
              onClick={() => onRemove(slot)}
              aria-label={`Remove ${labelText} photo for ${pinId}`}
              className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[#4F5C67] transition-colors hover:bg-[#F4F3EF] hover:text-[#B42318]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-col items-center justify-center rounded-lg border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/50 px-3 py-6 text-center">
          <Camera className="h-5 w-5 text-[#4F5C67]" aria-hidden="true" />
          <p className="mt-2 text-[13px] leading-[18px] text-[#4F5C67]">
            No {labelText.toLowerCase()} photo uploaded for Cycle {cycleNumber}.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3.5 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF]"
          >
            <Upload className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
            {ctaText}
          </button>
        </div>
      )}
    </div>
  );
}

export function EvidenceSection({
  pin,
  onAttachEvidence,
  onRemoveEvidence,
  compact = false,
}: EvidenceSectionProps) {
  const [error, setError] = useState<string | null>(null);

  const handleSelectFile = async (slot: 'before' | 'after', file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Unsupported file type. Choose a PNG, JPG, or WebP image.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = onAttachEvidence({
        slot,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        dataUrl,
      });
      if (!res.ok) {
        setError(res.error);
      }
    } catch {
      setError('Failed to read the selected image file.');
    }
  };

  return (
    <section aria-labelledby={`evidence-heading-${pin.id}`}>
      <div>
        <h3
          id={`evidence-heading-${pin.id}`}
          className={
            compact
              ? 'text-[15px] leading-[22px] font-semibold text-[#1B2A4A]'
              : 'text-[18px] leading-[24px] font-semibold text-[#1B2A4A]'
          }
        >
          Before / After Evidence
        </h3>
        <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
          Evidence input simulation (demo only). Adding local photos verifies Pin-to-evidence binding and does not mark work Approved or increase progress.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-2.5 text-[13px] leading-[18px] font-medium text-[#B42318]">
          {error}
        </p>
      )}

      <div className={compact ? 'mt-3 grid grid-cols-1 gap-3' : 'mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2'}>
        <EvidenceSlotCard
          pinId={pin.id}
          cycleNumber={pin.cycleNumber}
          slot="before"
          photo={pin.evidence.before}
          onSelectFile={handleSelectFile}
          onRemove={onRemoveEvidence}
        />
        <EvidenceSlotCard
          pinId={pin.id}
          cycleNumber={pin.cycleNumber}
          slot="after"
          photo={pin.evidence.after}
          onSelectFile={handleSelectFile}
          onRemove={onRemoveEvidence}
        />
      </div>
    </section>
  );
}
