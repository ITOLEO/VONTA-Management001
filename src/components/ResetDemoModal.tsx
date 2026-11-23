import { useEffect, useRef } from 'react';
import { RotateCcw, X } from 'lucide-react';

interface ResetDemoModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetDemoModal({ open, onCancel, onConfirm }: ResetDemoModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-demo-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#D9DEE2] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <RotateCcw className="h-5 w-5 text-[#A64011]" aria-hidden="true" />
            <h2 id="reset-demo-title" className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
              Reset Contractor Demo?
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close reset dialog"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-[15px] leading-[22px] text-[#4F5C67]">
          This restores Paviliun Kerja (A-03 R00) back to the two initial demo Spatial Pins
          (A03-PIN-01 and A03-PIN-02), removing any added Pins, material lines, simulated Before/After
          photos, or locally loaded blueprint images.
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="min-h-[40px] rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[40px] rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-medium text-white transition-colors hover:bg-[#8C350E]"
          >
            Confirm Reset
          </button>
        </div>
      </div>
    </div>
  );
}
