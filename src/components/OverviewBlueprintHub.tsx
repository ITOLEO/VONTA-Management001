import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  FolderKanban,
  Images,
  Layers,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { BuildingSummarySlide } from '../domain/blueprintRegister';

interface OverviewBlueprintHubProps {
  wholeBuilding: BuildingSummarySlide;
  departmentStrip: BuildingSummarySlide[];
  totalSheetCount: number;
  blueprintManagementPath: string;
  getSheetDetailPath: (sheetId: string) => string;
  onOpenLightbox: (initialSheetId?: string, opener?: HTMLElement | null) => void;
  isDemo?: boolean;
}

export function OverviewBlueprintHub({
  wholeBuilding,
  departmentStrip,
  totalSheetCount,
  blueprintManagementPath,
  getSheetDetailPath,
  onOpenLightbox,
  isDemo = false,
}: OverviewBlueprintHubProps) {
  // Keep cover selection independent of the gallery lightbox
  const [selectedSlideId, setSelectedSlideId] = useState<string>(wholeBuilding.id);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [viewMode, setViewMode] = useState<'both' | 'plan' | 'elevation'>('both');

  const activeSlide =
    selectedSlideId === wholeBuilding.id
      ? wholeBuilding
      : departmentStrip.find((s) => s.id === selectedSlideId) ?? wholeBuilding;

  const isWholeBuildingActive = activeSlide.id === wholeBuilding.id;
  const leadSheetId = activeSlide.provenanceRefs[0]?.sheetId;

  return (
    <section
      aria-label="Blueprint summary and discipline views"
      data-testid="overview-blueprint-hub"
      className="flex h-full flex-col rounded-xl border border-[#D9DEE2] bg-white"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#D9DEE2] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] leading-[20px] font-semibold text-[#1B2A4A]">
              {activeSlide.title}
            </h2>
            {activeSlide.kind === 'combined_mep' && (
              <span
                data-testid="combined-ep-badge"
                className="rounded bg-[#E6F7F5] px-2 py-0.5 text-[11px] font-semibold text-[#0F766E]"
              >
                Electrical + Plumbing
              </span>
            )}
            {isDemo && (
              <span className="rounded bg-[#FFF3EB] px-1.5 py-0.5 text-[10px] font-semibold text-[#A64011]">
                Demo fixture
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] leading-[16px] text-[#4F5C67]">
            {activeSlide.subtitle} · Scale {activeSlide.scaleLabel}
            {activeSlide.elevationScaleLabel ? ` · Elevation ${activeSlide.elevationScaleLabel}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isWholeBuildingActive && activeSlide.hasSideElevation && (
            <div className="inline-flex rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] p-0.5 text-[11px]">
              {(['both', 'plan', 'elevation'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-2 py-1 font-medium capitalize transition-colors ${
                    viewMode === mode
                      ? 'bg-white text-[#1B2A4A] shadow-xs'
                      : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  {mode === 'both' ? 'Plan + Elev' : mode}
                </button>
              ))}
            </div>
          )}

          <div className="inline-flex items-center rounded-lg border border-[#D9DEE2] bg-white">
            <button
              type="button"
              onClick={() => setZoomPercent((z) => Math.max(75, z - 25))}
              aria-label="Zoom out summary drawing"
              className="p-1.5 text-[#4F5C67] hover:text-[#1B2A4A]"
            >
              <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoomPercent(100)}
              aria-label="Fit summary drawing"
              className="border-x border-[#D9DEE2] px-2 py-1 text-[11px] font-medium text-[#1B2A4A] tabular-nums hover:bg-[#F4F3EF]"
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              onClick={() => setZoomPercent((z) => Math.min(200, z + 25))}
              aria-label="Zoom in summary drawing"
              className="p-1.5 text-[#4F5C67] hover:text-[#1B2A4A]"
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Conflict / elevation notice if any */}
      {activeSlide.conflictWarning && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-[#D9DEE2] bg-[#FFF3EB] px-4 py-2 text-[12px] text-[#A64011]"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{activeSlide.conflictWarning}</span>
        </div>
      )}

      {/* Main Drawing Canvas */}
      <div className="relative flex-1 overflow-auto bg-[#F8F9FA] p-3">
        {activeSlide.generationStatus === 'empty' ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-[#D9DEE2] bg-white p-6 text-center">
            <Building2 className="h-8 w-8 text-[#4F5C67]" aria-hidden="true" />
            <p className="mt-2 text-[14px] font-semibold text-[#1B2A4A]">
              No issued blueprints registered yet
            </p>
            <p className="mt-1 max-w-sm text-[12px] text-[#4F5C67]">
              Upload drawings in Blueprint management with a department mapping to assemble the
              building summary.
            </p>
          </div>
        ) : isWholeBuildingActive && (activeSlide.hasSideElevation || activeSlide.sideElevationNotice) ? (
          <div
            className={`grid gap-3 ${
              viewMode === 'both' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {(viewMode === 'both' || viewMode === 'plan') && (
              <figure className="overflow-hidden rounded-lg border border-[#D9DEE2] bg-white">
                <div className="flex items-center justify-between border-b border-[#D9DEE2] bg-[#F4F3EF]/60 px-2.5 py-1.5 text-[11px] font-semibold text-[#1B2A4A]">
                  <span>Building Footprint Plan</span>
                  <span className="font-normal text-[#4F5C67]">{activeSlide.scaleLabel}</span>
                </div>
                <div className="flex h-[220px] items-center justify-center overflow-auto p-2">
                  {activeSlide.planSrc ? (
                    <img
                      src={activeSlide.planSrc}
                      alt={`${activeSlide.title} footprint plan`}
                      style={{ width: `${zoomPercent}%`, maxWidth: 'none' }}
                      className="max-h-full object-contain transition-all"
                    />
                  ) : (
                    <span className="text-[12px] text-[#4F5C67]">Plan preview unavailable</span>
                  )}
                </div>
              </figure>
            )}

            {(viewMode === 'both' || viewMode === 'elevation') && (
              <figure
                data-testid="overview-side-elevation-panel"
                className="overflow-hidden rounded-lg border border-[#D9DEE2] bg-white"
              >
                <div className="flex items-center justify-between border-b border-[#D9DEE2] bg-[#F4F3EF]/60 px-2.5 py-1.5 text-[11px] font-semibold text-[#1B2A4A]">
                  <span>
                    Side Elevation{' '}
                    {activeSlide.sideElevationStatus === 'derived' ? '(Derived)' : '(Source)'}
                  </span>
                  <span className="font-normal text-[#4F5C67]">
                    {activeSlide.elevationScaleLabel ?? 'Multi-storey'}
                  </span>
                </div>
                <div className="flex h-[220px] flex-col items-center justify-center overflow-auto p-2">
                  {activeSlide.hasSideElevation && activeSlide.sideElevationSrc ? (
                    <img
                      src={activeSlide.sideElevationSrc}
                      alt={`${activeSlide.title} multi-storey side elevation`}
                      style={{ width: `${zoomPercent}%`, maxWidth: 'none' }}
                      className="max-h-full object-contain transition-all"
                    />
                  ) : (
                    <div className="px-4 text-center">
                      <AlertTriangle
                        className="mx-auto h-5 w-5 text-[#A64011]"
                        aria-hidden="true"
                      />
                      <p className="mt-1.5 text-[12px] font-semibold text-[#1B2A4A]">
                        {activeSlide.sideElevationNotice ??
                          'Side elevation needs a source or verified model.'}
                      </p>
                    </div>
                  )}
                </div>
                {activeSlide.floorLabels.length > 0 && (
                  <figcaption className="flex flex-wrap gap-1.5 border-t border-[#D9DEE2] bg-[#F4F3EF]/40 px-2.5 py-1 text-[10px] text-[#4F5C67]">
                    {activeSlide.floorLabels.slice(0, 4).map((lvl) => (
                      <span
                        key={lvl}
                        className="rounded bg-white px-1.5 py-0.5 font-medium text-[#1B2A4A]"
                      >
                        {lvl}
                      </span>
                    ))}
                  </figcaption>
                )}
              </figure>
            )}
          </div>
        ) : (
          <figure className="overflow-hidden rounded-lg border border-[#D9DEE2] bg-white">
            <div className="flex h-[240px] items-center justify-center overflow-auto p-2">
              {activeSlide.planSrc ? (
                <img
                  src={activeSlide.planSrc}
                  alt={activeSlide.title}
                  style={{ width: `${zoomPercent}%`, maxWidth: 'none' }}
                  className="max-h-full object-contain transition-all"
                />
              ) : (
                <span className="text-[12px] text-[#4F5C67]">Preview unavailable</span>
              )}
            </div>
          </figure>
        )}

        {/* Provenance Traceability Row */}
        {activeSlide.provenanceRefs.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#4F5C67]">
            <span className="font-semibold text-[#1B2A4A]">Sources:</span>
            {activeSlide.provenanceRefs.map((ref) => (
              <Link
                key={`${ref.sheetId}-${ref.pageNumber}`}
                to={getSheetDetailPath(ref.sheetId)}
                className="inline-flex items-center gap-1 rounded border border-[#D9DEE2] bg-white px-2 py-0.5 font-medium text-[#1B2A4A] hover:border-[#A64011] hover:text-[#A64011]"
              >
                <span>
                  {ref.sheetCode} {ref.revision} (p.{ref.pageNumber})
                </span>
                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Horizontal Department Summary Strip */}
      <div className="border-t border-[#D9DEE2] px-4 py-3">
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#4F5C67]">
          <span>Building &amp; discipline summaries</span>
          <span className="font-normal normal-case">
            {1 + departmentStrip.length} views · empty departments omitted
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Blueprint summary strip"
          data-testid="department-summary-strip"
          className="mt-2 flex gap-2 overflow-x-auto pb-1"
        >
          {/* Whole-building cover tab */}
          <button
            type="button"
            role="tab"
            aria-selected={selectedSlideId === wholeBuilding.id}
            data-testid="summary-slide-whole-building"
            onClick={() => {
              setSelectedSlideId(wholeBuilding.id);
              setZoomPercent(100);
            }}
            className={`flex w-[168px] shrink-0 flex-col rounded-lg border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE] ${
              selectedSlideId === wholeBuilding.id
                ? 'border-[#A64011] bg-[#FFF3EB]/60'
                : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1B2A4A]">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-[#A64011]" aria-hidden="true" />
              <span className="truncate">Whole building</span>
            </div>
            <span className="mt-0.5 truncate text-[11px] text-[#4F5C67]">
              {wholeBuilding.hasSideElevation ? 'Plan + Side elevation' : 'Footprint summary'}
            </span>
          </button>

          {/* Populated department slides (incl. ONE shared Electrical + Plumbing slide) */}
          {departmentStrip.map((slide) => {
            const active = selectedSlideId === slide.id;
            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`summary-slide-${slide.id}`}
                onClick={() => {
                  setSelectedSlideId(slide.id);
                  setZoomPercent(100);
                }}
                className={`flex w-[184px] shrink-0 flex-col rounded-lg border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE] ${
                  active
                    ? 'border-[#A64011] bg-[#FFF3EB]/60'
                    : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1B2A4A]">
                  <Layers className="h-3.5 w-3.5 shrink-0 text-[#4F5C67]" aria-hidden="true" />
                  <span className="truncate">{slide.title}</span>
                </div>
                <span className="mt-0.5 truncate text-[11px] text-[#4F5C67]">
                  {slide.sheetCount} sheet{slide.sheetCount === 1 ? '' : 's'}
                  {slide.kind === 'combined_mep' ? ' · Shared MEP' : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#D9DEE2] bg-[#F4F3EF]/40 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="view-all-blueprints-btn"
            onClick={(e) => onOpenLightbox(leadSheetId, e.currentTarget)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1B2A4A]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
          >
            <Images className="h-3.5 w-3.5" aria-hidden="true" />
            View all blueprints ({totalSheetCount})
          </button>

          {leadSheetId && (
            <Link
              to={getSheetDetailPath(leadSheetId)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              Open drawing
            </Link>
          )}
        </div>

        <Link
          to={blueprintManagementPath}
          data-testid="overview-blueprint-management-link"
          className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-medium text-[#A64011] underline-offset-4 hover:underline"
        >
          <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />
          Blueprint management
        </Link>
      </div>
    </section>
  );
}
