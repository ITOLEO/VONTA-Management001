import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileWarning,
  X,
} from 'lucide-react';
import {
  getSheetPreviewSrc,
  type BlueprintSheetRecord,
} from '../domain/blueprintRegister';

interface BlueprintLightboxModalProps {
  open: boolean;
  sheets: BlueprintSheetRecord[];
  initialSheetId?: string | null;
  filterSummary?: string | null;
  getSheetDetailPath: (sheetId: string) => string;
  onClose: () => void;
}

/**
 * Full-screen VONTA Blueprint Gallery Lightbox (ref image 18 layout):
 * - Large active drawing canvas with code, title, revision, floor/area, and Open drawing CTA
 * - Previous / Next buttons + keyboard Left / Right / Escape + touch swipe
 * - Progressive windowed thumbnail strip capable of 60+ sheets smoothly
 * - Preserves Overview cover selection when closed
 */
export function BlueprintLightboxModal({
  open,
  sheets,
  initialSheetId,
  filterSummary,
  getSheetDetailPath,
  onClose,
}: BlueprintLightboxModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const idx = initialSheetId ? sheets.findIndex((s) => s.id === initialSheetId) : 0;
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open, initialSheetId, sheets]);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex((prev) => (sheets.length === 0 ? 0 : (prev + 1) % sheets.length));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex((prev) =>
          sheets.length === 0 ? 0 : (prev - 1 + sheets.length) % sheets.length
        );
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, sheets.length, onClose]);

  // Keep active thumbnail visible in horizontal strip
  useEffect(() => {
    if (!open || !stripRef.current) return;
    const activeEl = stripRef.current.querySelector<HTMLElement>(
      `[data-thumb-index="${activeIndex}"]`
    );
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [open, activeIndex]);

  const activeSheet = sheets[activeIndex] ?? null;
  const activePreviewSrc = useMemo(
    () => (activeSheet ? getSheetPreviewSrc(activeSheet) : null),
    [activeSheet]
  );

  // Windowed thumbnail rendering window: render actual preview imgs within ±12 of activeIndex
  // while keeping all 60+ buttons accessible and lightweight.
  const thumbWindowStart = Math.max(0, activeIndex - 12);
  const thumbWindowEnd = Math.min(sheets.length - 1, activeIndex + 12);

  if (!open) return null;

  const goPrev = () => {
    if (sheets.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + sheets.length) % sheets.length);
  };

  const goNext = () => {
    if (sheets.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % sheets.length);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Blueprint gallery"
      data-testid="blueprint-lightbox-modal"
      className="fixed inset-0 z-50 flex flex-col bg-[#111B2E]/95 text-white"
    >
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold tracking-wide text-[#F39C6B] uppercase">
              VONTA Blueprints
            </span>
            {activeSheet && (
              <>
                <span className="text-white/40">·</span>
                <span
                  data-testid="lightbox-active-code"
                  className="text-[15px] font-semibold text-white"
                >
                  {activeSheet.sheetCode} {activeSheet.revision}
                </span>
                <span className="truncate text-[14px] text-white/80">{activeSheet.title}</span>
              </>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-white/70">
            {activeSheet && (
              <>
                <span>{activeSheet.areaName}</span>
                <span>·</span>
                <span>{activeSheet.floorLabel}</span>
                <span>·</span>
                <span>
                  {activeSheet.sourceFileName} (p.{activeSheet.pageNumber}/{activeSheet.totalPages})
                </span>
                <span>·</span>
                <span className="tabular-nums">
                  {activeIndex + 1} / {sheets.length}
                </span>
              </>
            )}
            {filterSummary && (
              <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white">
                Filter: {filterSummary}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeSheet && (
            <Link
              to={getSheetDetailPath(activeSheet.id)}
              onClick={onClose}
              data-testid="lightbox-open-drawing"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#A64011] px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Open drawing
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close blueprint gallery"
            data-testid="lightbox-close-btn"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Main Active Drawing Stage */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-12 py-4 sm:px-16"
        onTouchStart={(e) => {
          touchStartXRef.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const startX = touchStartXRef.current;
          const endX = e.changedTouches[0]?.clientX ?? null;
          touchStartXRef.current = null;
          if (startX !== null && endX !== null) {
            if (startX - endX > 48) goNext();
            else if (endX - startX > 48) goPrev();
          }
        }}
      >
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous blueprint"
          data-testid="lightbox-prev-btn"
          disabled={sheets.length <= 1}
          className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#1B2A4A]/90 text-white hover:bg-[#A64011] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        {activeSheet ? (
          <div className="flex max-h-full w-full max-w-[1080px] flex-col items-center justify-center">
            {activeSheet.isSuperseded && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-[#991B1B] px-3 py-1 text-[12px] font-semibold text-white">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Superseded revision — preserved for reference only
              </div>
            )}

            {activePreviewSrc ? (
              <div className="flex max-h-[calc(100dvh-230px)] w-full items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white p-2 shadow-2xl">
                <img
                  src={activePreviewSrc}
                  alt={`${activeSheet.sheetCode} ${activeSheet.title}`}
                  className="max-h-[calc(100dvh-250px)] w-auto max-w-full object-contain"
                />
              </div>
            ) : (
              <div
                data-testid="lightbox-missing-preview"
                className="flex h-[320px] w-full max-w-[640px] flex-col items-center justify-center rounded-xl border border-white/20 bg-[#1B2A4A] p-6 text-center"
              >
                <FileWarning className="h-9 w-9 text-[#F39C6B]" aria-hidden="true" />
                <p className="mt-3 text-[15px] font-semibold text-white">
                  Preview unavailable for {activeSheet.sheetCode}
                </p>
                <p className="mt-1 max-w-md text-[13px] text-white/75">
                  {activeSheet.previewMissingReason ??
                    'Thumbnail preview has not been rendered yet. Open the drawing page to inspect transcription and source metadata.'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[14px] text-white/80">No blueprints match the active filter.</p>
        )}

        <button
          type="button"
          onClick={goNext}
          aria-label="Next blueprint"
          data-testid="lightbox-next-btn"
          disabled={sheets.length <= 1}
          className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#1B2A4A]/90 text-white hover:bg-[#A64011] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Horizontal Thumbnail Strip */}
      <div className="border-t border-white/15 bg-[#0D1526] px-4 py-3">
        <div
          ref={stripRef}
          data-testid="lightbox-thumbnail-strip"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {sheets.map((sheet, idx) => {
            const isActive = idx === activeIndex;
            const inWindow = idx >= thumbWindowStart && idx <= thumbWindowEnd;
            const thumbSrc = inWindow ? getSheetPreviewSrc(sheet) : null;

            return (
              <button
                key={sheet.id}
                type="button"
                data-thumb-index={idx}
                aria-label={`${sheet.sheetCode} ${sheet.title}`}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => setActiveIndex(idx)}
                className={`group flex w-[112px] shrink-0 flex-col overflow-hidden rounded-lg border text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${
                  isActive
                    ? 'border-[#F39C6B] ring-2 ring-[#F39C6B]/60'
                    : 'border-white/15 hover:border-white/50'
                }`}
              >
                <div className="flex h-[56px] w-full items-center justify-center bg-white/95 p-1">
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt=""
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] font-semibold text-[#1B2A4A]">
                      {sheet.previewMissingReason ? 'No preview' : sheet.sheetCode}
                    </span>
                  )}
                </div>
                <div className="bg-[#1B2A4A] px-1.5 py-1">
                  <div className="flex items-center justify-between gap-1 text-[10px] font-semibold text-white">
                    <span className="truncate">{sheet.sheetCode}</span>
                    {sheet.isSuperseded && <span className="text-[#FCA5A5]">OLD</span>}
                  </div>
                  <div className="truncate text-[9px] text-white/65">{sheet.areaName}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
