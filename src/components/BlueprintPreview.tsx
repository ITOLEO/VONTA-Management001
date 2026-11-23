import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Expand,
  FileImage,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface BlueprintSourceItem {
  id: string;
  areaName: string;
  sheetCode: string;
  revision: string;
  pageLabel: string;
  caption: string;
  dimensionsSummary?: string;
  src: string | null;
  statusNote?: string;
}

interface BlueprintPreviewProps {
  sources: BlueprintSourceItem[];
  settingsPath: string;
  /** L03: When rendered inside Project Settings, hide the "Manage in Project settings" link and show original source + authorized file actions */
  hideManageLink?: boolean;
  settingsFooterSlot?: (activeSource: BlueprintSourceItem | null) => React.ReactNode;
}

/**
 * Read-only architectural blueprint preview with a downward-opening "Browse blueprints" selector.
 * Selecting another source updates the drawing, caption, page, and revision together
 * without publishing a version or modifying the active 3D model.
 */
export function BlueprintPreview({
  sources,
  settingsPath,
  hideManageLink = false,
  settingsFooterSlot,
}: BlueprintPreviewProps) {
  const [selectedId, setSelectedId] = useState<string>(() => sources[0]?.id ?? '');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const selectorContainerRef = useRef<HTMLDivElement | null>(null);
  const selectorTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Keep selected source valid if source list changes
  useEffect(() => {
    if (sources.length === 0) {
      setSelectedId('');
      return;
    }
    if (!sources.some((s) => s.id === selectedId)) {
      setSelectedId(sources[0].id);
    }
  }, [sources, selectedId]);

  const activeSource = sources.find((s) => s.id === selectedId) ?? sources[0] ?? null;

  useEffect(() => {
    setImgFailed(false);
    setZoom(1);
  }, [activeSource?.id, activeSource?.src]);

  useEffect(() => {
    if (!selectorOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectorOpen(false);
        window.requestAnimationFrame(() => selectorTriggerRef.current?.focus());
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (
        selectorContainerRef.current &&
        !selectorContainerRef.current.contains(e.target as Node)
      ) {
        setSelectorOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [selectorOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxOpen]);

  const previewDisabled = !activeSource || !activeSource.src || imgFailed;

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#D9DEE2] bg-white">
      {/* Top Bar: Downward-Opening Source Selector + Zoom / Enlarge Controls */}
      <div className="flex flex-col gap-3 border-b border-[#D9DEE2] px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-[18px] font-medium text-[#4F5C67]">
            Browse blueprints
          </div>

          {/* Downward-opening selector (always selectable even for a single source) */}
          <div ref={selectorContainerRef} className="relative mt-1.5 max-w-md">
            <button
              ref={selectorTriggerRef}
              type="button"
              disabled={sources.length === 0}
              onClick={() => setSelectorOpen((v) => !v)}
              aria-expanded={selectorOpen}
              aria-haspopup="listbox"
              data-testid="blueprint-source-selector"
              className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 px-3 py-2 text-left text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] disabled:opacity-50"
            >
              <span className="truncate">
                {activeSource
                  ? `${activeSource.areaName} · ${activeSource.sheetCode} ${activeSource.revision}`
                  : 'No blueprint sources'}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#4F5C67] transition-transform ${
                  selectorOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {selectorOpen && sources.length > 0 && (
              <div
                role="listbox"
                aria-label="Select blueprint source"
                data-testid="blueprint-source-menu"
                className="absolute left-0 top-full z-30 mt-1.5 w-full max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[#D9DEE2] bg-white p-1.5 shadow-lg"
              >
                {sources.map((item) => {
                  const selected = item.id === activeSource?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-testid={`blueprint-option-${item.id}`}
                      onClick={() => {
                        setSelectedId(item.id);
                        setSelectorOpen(false);
                      }}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'bg-[#D4652F]/10 text-[#1B2A4A]'
                          : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[14px] leading-[20px] font-semibold">
                          {item.areaName} · {item.sheetCode} {item.revision}
                        </div>
                        <div className="truncate text-[13px] leading-[18px] text-[#4F5C67]">
                          {item.pageLabel}
                        </div>
                      </div>
                      {selected && (
                        <Check className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {activeSource && (
            <p
              data-testid="blueprint-active-caption"
              className="mt-1.5 text-[13px] leading-[18px] text-[#4F5C67]"
            >
              {activeSource.caption} ·{' '}
              <span className="font-medium text-[#1B2A4A]">{activeSource.pageLabel}</span> ·{' '}
              <span className="font-medium text-[#1B2A4A]">{activeSource.revision}</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={previewDisabled}
            onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
            aria-label="Zoom out blueprint"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-45 sm:h-9 sm:w-9"
          >
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={previewDisabled}
            onClick={() => setZoom(1)}
            className="inline-flex h-11 items-center rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px] font-medium text-[#1B2A4A] tabular-nums hover:bg-[#F4F3EF] disabled:opacity-45 sm:h-9"
          >
            Fit ({Math.round(zoom * 100)}%)
          </button>
          <button
            type="button"
            disabled={previewDisabled}
            onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
            aria-label="Zoom in blueprint"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-45 sm:h-9 sm:w-9"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            disabled={previewDisabled}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-45 sm:h-9"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Enlarge
          </button>
        </div>
      </div>

      {/* Preview Canvas with Empty, Unavailable, and Failed-Preview States */}
      <div className="relative flex-1 overflow-auto bg-[#F4F3EF] p-3 min-h-[300px] lg:min-h-[380px]">
        {sources.length === 0 ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-[#D9DEE2] bg-white p-6 text-center">
            <FileImage className="h-7 w-7 text-[#4F5C67]" aria-hidden="true" />
            <p className="mt-2.5 text-[15px] leading-[22px] font-semibold text-[#1B2A4A]">
              No source blueprints attached
            </p>
            <p className="mt-1 max-w-md text-[13px] leading-[18px] text-[#4F5C67]">
              This project does not have an architectural sheet available to preview yet.
            </p>
          </div>
        ) : !activeSource?.src ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-[#D9DEE2] bg-white p-6 text-center">
            <FileImage className="h-7 w-7 text-[#4F5C67]" aria-hidden="true" />
            <p className="mt-2.5 text-[15px] leading-[22px] font-semibold text-[#1B2A4A]">
              Blueprint file unavailable
            </p>
            <p className="mt-1 max-w-md text-[13px] leading-[18px] text-[#4F5C67]">
              {activeSource?.statusNote ??
                'No preview image is attached to this drawing source. Browsing sources does not alter the active 3D model.'}
            </p>
          </div>
        ) : imgFailed ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-[#B42318]/40 bg-white p-6 text-center">
            <AlertTriangle className="h-7 w-7 text-[#B42318]" aria-hidden="true" />
            <p className="mt-2.5 text-[15px] leading-[22px] font-semibold text-[#1B2A4A]">
              Failed to load blueprint preview
            </p>
            <p className="mt-1 max-w-md text-[13px] leading-[18px] text-[#4F5C67]">
              The image for {activeSource.areaName} ({activeSource.sheetCode} {activeSource.revision}
              ) could not be rendered. The active 3D model remains unaffected.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center overflow-auto">
            <img
              src={activeSource.src}
              alt={`${activeSource.areaName} — ${activeSource.sheetCode} ${activeSource.revision} architectural drawing`}
              onError={() => setImgFailed(true)}
              style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : 'none' }}
              className="h-auto rounded-lg border border-[#D9DEE2] bg-white object-contain shadow-xs transition-[width] duration-150"
            />
          </div>
        )}
      </div>

      {/* Footer Caption & Authorized Actions (L03: no misplaced History shortcut here) */}
      <div
        data-testid="blueprint-preview-footer"
        className="flex flex-wrap items-center justify-between gap-2 border-t border-[#D9DEE2] px-4 py-2.5 text-[13px] leading-[18px] text-[#4F5C67]"
      >
        <span>
          {activeSource?.dimensionsSummary ??
            'Browsing source drawings here is read-only and does not publish a model version.'}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {settingsFooterSlot && settingsFooterSlot(activeSource)}
          {!hideManageLink && (
            <Link
              to={settingsPath}
              className="font-medium text-[#1B2A4A] underline-offset-4 hover:underline"
            >
              Manage in Project settings
            </Link>
          )}
        </div>
      </div>

      {lightboxOpen && activeSource?.src && !imgFailed && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#1B2A4A]/85 p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged ${activeSource.sheetCode} ${activeSource.revision} blueprint`}
        >
          <div className="mb-3 flex items-center justify-between gap-4 text-white">
            <div className="flex items-center gap-2">
              <Expand className="h-4 w-4 text-[#D4652F]" aria-hidden="true" />
              <span className="text-[15px] font-semibold">
                {activeSource.areaName} — {activeSource.sheetCode} {activeSource.revision} (
                {activeSource.pageLabel})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close enlarged blueprint"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 text-[14px] font-medium text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Close
            </button>
          </div>
          <div className="flex-1 overflow-auto rounded-xl bg-white p-3">
            <img
              src={activeSource.src}
              alt={`Enlarged ${activeSource.areaName} ${activeSource.sheetCode} ${activeSource.revision} sheet`}
              className="mx-auto h-auto max-w-none w-full lg:w-[1300px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
