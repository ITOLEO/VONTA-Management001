import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  Images,
  Layers,
  Maximize2,
} from 'lucide-react';
import type { BuildingSummarySlide } from '../domain/blueprintRegister';
import {
  resolveOverviewSlideTargetSheetId,
  resolveSlideVerificationBadge,
  type OverviewHubViewMode,
} from '../utils/overviewKpis';

interface OverviewBlueprintHubProps {
  wholeBuilding: BuildingSummarySlide;
  departmentStrip: BuildingSummarySlide[];
  totalSheetCount: number;
  blueprintManagementPath: string;
  getSheetDetailPath: (sheetId: string) => string;
  onOpenLightbox: (initialSheetId?: string, opener?: HTMLElement | null) => void;
  isDemo?: boolean;
}

/**
 * Stabilized Overview Blueprint Summary Hub (Stage 04):
 * - Reserves a common preview frame at each breakpoint sized for the largest supported layout
 *   (whole-building footprint plan + side elevation) so switching slides keeps the frame,
 *   discipline strip, and footer steady within <= 1 CSS pixel.
 * - Removes inline zoom controls (zoom remains in the dedicated BlueprintDetailPage viewer).
 * - Preserves Plan + Elev / Plan / Elevation toggles, lightbox inspection, full drawing link,
 *   provenance source links, verification status, and one shared Electrical + Plumbing slide.
 */
export function OverviewBlueprintHub({
  wholeBuilding,
  departmentStrip,
  totalSheetCount,
  blueprintManagementPath,
  getSheetDetailPath,
  onOpenLightbox,
}: OverviewBlueprintHubProps) {
  const [selectedSlideId, setSelectedSlideId] = useState<string>(wholeBuilding.id);
  const [viewMode, setViewMode] = useState<OverviewHubViewMode>('both');

  const activeSlide =
    selectedSlideId === wholeBuilding.id
      ? wholeBuilding
      : departmentStrip.find((s) => s.id === selectedSlideId) ?? wholeBuilding;

  const isWholeBuildingActive = activeSlide.id === wholeBuilding.id;
  const showElevationSplit =
    isWholeBuildingActive && Boolean(activeSlide.hasSideElevation || activeSlide.sideElevationNotice);
  const leadSheetId = resolveOverviewSlideTargetSheetId(activeSlide, viewMode);
  const planSheetId = activeSlide.provenanceRefs[0]?.sheetId;
  const elevationSheetId =
    activeSlide.sideElevationStatus === 'source'
      ? activeSlide.provenanceRefs[1]?.sheetId ?? planSheetId
      : planSheetId;
  const verification = resolveSlideVerificationBadge(activeSlide);

  const verificationBadgeClass =
    verification.tone === 'verified'
      ? 'border-[#D9DEE2] bg-[#ECFDF3] text-[#166534]'
      : verification.tone === 'warning'
        ? 'border-[#D4652F]/40 bg-[#FFF3EB] text-[#A64011]'
        : 'border-[#D9DEE2] bg-[#F4F3EF] text-[#4F5C67]';

  return (
    <section
      aria-label="Blueprint summary and discipline views"
      data-testid="overview-blueprint-hub"
      className="flex h-full flex-col overflow-hidden rounded-xl border border-[#D9DEE2] bg-white"
    >
      {/* Fixed-height Header per breakpoint so switching slides never causes vertical shift */}
      <div className="flex h-[106px] shrink-0 flex-col justify-center gap-2 border-b border-[#D9DEE2] px-4 sm:h-[70px] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <div className="flex items-center gap-2">
            <h2 className="vonta-section-title truncate text-[#1B2A4A]">
              {activeSlide.title}
            </h2>
            {activeSlide.kind === 'combined_mep' && (
              <span
                data-testid="combined-ep-badge"
                className="shrink-0 rounded bg-[#E6F7F5] px-2 py-0.5 text-[12px] font-semibold text-[#0F766E]"
              >
                Electrical + Plumbing
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] leading-[18px] text-[#4F5C67]">
            {activeSlide.subtitle} · Scale {activeSlide.scaleLabel}
            {activeSlide.elevationScaleLabel ? ` · Elevation ${activeSlide.elevationScaleLabel}` : ''}
          </p>
        </div>

        <div className="flex h-[34px] shrink-0 items-center gap-2">
          {showElevationSplit ? (
            <div
              role="group"
              aria-label="Whole-building drawing view"
              data-testid="overview-view-mode-group"
              className="inline-flex h-[34px] items-center rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] p-0.5 text-[12px]"
            >
              {(
                [
                  { mode: 'both', label: 'Plan + Elev' },
                  { mode: 'plan', label: 'Plan' },
                  { mode: 'elevation', label: 'Elevation' },
                ] as const
              ).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  data-testid={`overview-view-mode-${mode}`}
                  onClick={() => setViewMode(mode)}
                  className={`h-[28px] rounded-md px-2.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE] ${
                    viewMode === mode
                      ? 'bg-white text-[#1B2A4A] shadow-xs'
                      : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <span
              data-testid="overview-slide-verification"
              className={`inline-flex h-[28px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium whitespace-nowrap ${verificationBadgeClass}`}
            >
              {verification.tone === 'verified' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{verification.label}</span>
            </span>
          )}
        </div>
      </div>

      {/* Common Reserved Preview Frame (fixed height per breakpoint; <= 1 px shift across all slides) */}
      <div
        data-testid="overview-preview-frame"
        className="relative flex h-[540px] shrink-0 flex-col bg-[#F8F9FA] p-3 md:h-[348px] xl:h-[368px]"
      >
        {activeSlide.conflictWarning && (
          <div
            role="alert"
            className="mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-[#D4652F]/40 bg-[#FFF3EB] px-3 py-1.5 text-[12px] leading-[16px] text-[#A64011]"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{activeSlide.conflictWarning}</span>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {activeSlide.generationStatus === 'empty' ? (
            <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-[#D9DEE2] bg-white p-6 text-center">
              <Building2 className="h-8 w-8 text-[#4F5C67]" aria-hidden="true" />
              <p className="mt-2 text-[14px] font-semibold text-[#1B2A4A]">
                No issued blueprints registered yet
              </p>
              <p className="mt-1 max-w-sm text-[12px] text-[#4F5C67]">
                Upload drawings in Blueprint management with a department mapping to assemble the
                building summary.
              </p>
            </div>
          ) : showElevationSplit ? (
            <div
              className={`grid h-full gap-3 ${
                viewMode === 'both' ? 'grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1' : 'grid-cols-1 grid-rows-1'
              }`}
            >
              {(viewMode === 'both' || viewMode === 'plan') && (
                <figure className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[#D9DEE2] bg-white">
                  <div className="flex h-[32px] shrink-0 items-center justify-between gap-2 border-b border-[#D9DEE2] bg-[#F4F3EF]/60 px-2.5 text-[12px] font-semibold text-[#1B2A4A]">
                    <span className="truncate">Building Footprint Plan</span>
                    <span className="shrink-0 font-normal text-[#4F5C67]">
                      {activeSlide.scaleLabel}
                    </span>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
                    {activeSlide.planSrc ? (
                      <button
                        type="button"
                        data-testid="overview-preview-plan-trigger"
                        aria-label={`Inspect ${activeSlide.title} footprint plan in lightbox`}
                        onClick={(e) => onOpenLightbox(planSheetId, e.currentTarget)}
                        className="flex h-full w-full items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                      >
                        <img
                          src={activeSlide.planSrc}
                          alt={`${activeSlide.title} footprint plan`}
                          className="h-full w-full object-contain"
                        />
                      </button>
                    ) : (
                      <span className="text-[12px] text-[#4F5C67]">Plan preview unavailable</span>
                    )}
                  </div>
                  <figcaption className="flex h-[30px] shrink-0 items-center justify-between gap-2 border-t border-[#D9DEE2] bg-[#F4F3EF]/40 px-2.5 text-[11px] text-[#4F5C67]">
                    <span className="truncate font-medium text-[#1B2A4A]">
                      {activeSlide.provenanceRefs[0]
                        ? `${activeSlide.provenanceRefs[0].sheetCode} ${activeSlide.provenanceRefs[0].revision}`
                        : 'Plan source'}
                    </span>
                    <span className="shrink-0">{verification.label}</span>
                  </figcaption>
                </figure>
              )}

              {(viewMode === 'both' || viewMode === 'elevation') && (
                <figure
                  data-testid="overview-side-elevation-panel"
                  className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[#D9DEE2] bg-white"
                >
                  <div className="flex h-[32px] shrink-0 items-center justify-between gap-2 border-b border-[#D9DEE2] bg-[#F4F3EF]/60 px-2.5 text-[12px] font-semibold text-[#1B2A4A]">
                    <span className="truncate">
                      Side Elevation{' '}
                      {activeSlide.sideElevationStatus === 'derived'
                        ? '(Model-derived)'
                        : activeSlide.sideElevationStatus === 'source'
                          ? '(Source)'
                          : '(Missing evidence)'}
                    </span>
                    <span className="shrink-0 font-normal text-[#4F5C67]">
                      {activeSlide.elevationScaleLabel ?? 'Multi-storey'}
                    </span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-2">
                    {activeSlide.hasSideElevation && activeSlide.sideElevationSrc ? (
                      <button
                        type="button"
                        data-testid="overview-preview-elevation-trigger"
                        aria-label={`Inspect ${activeSlide.title} side elevation in lightbox`}
                        onClick={(e) => onOpenLightbox(elevationSheetId, e.currentTarget)}
                        className="flex h-full w-full items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                      >
                        <img
                          src={activeSlide.sideElevationSrc}
                          alt={`${activeSlide.title} multi-storey side elevation`}
                          className="h-full w-full object-contain"
                        />
                      </button>
                    ) : (
                      <div className="px-4 text-center" data-testid="overview-missing-elevation-notice">
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
                  <figcaption className="flex h-[30px] shrink-0 items-center justify-between gap-1 overflow-x-auto border-t border-[#D9DEE2] bg-[#F4F3EF]/40 px-2 text-[11px] whitespace-nowrap text-[#4F5C67]">
                    {activeSlide.floorLabels.length > 0 ? (
                      activeSlide.floorLabels.slice(0, 4).map((lvl) => (
                        <span
                          key={lvl}
                          className="min-w-0 truncate rounded bg-white px-1.5 py-0.5 font-medium text-[#1B2A4A]"
                        >
                          {lvl}
                        </span>
                      ))
                    ) : (
                      <span>Multi-storey elevation reference</span>
                    )}
                  </figcaption>
                </figure>
              )}
            </div>
          ) : (
            <figure className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[#D9DEE2] bg-white">
              <div className="flex h-[32px] shrink-0 items-center justify-between gap-2 border-b border-[#D9DEE2] bg-[#F4F3EF]/60 px-2.5 text-[12px] font-semibold text-[#1B2A4A]">
                <span className="truncate">
                  {activeSlide.kind === 'combined_mep'
                    ? 'Coordinated Electrical + Plumbing Plan'
                    : `${activeSlide.title} Summary`}
                </span>
                <span className="shrink-0 font-normal text-[#4F5C67]">{activeSlide.scaleLabel}</span>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2.5">
                {activeSlide.planSrc ? (
                  <button
                    type="button"
                    data-testid="overview-preview-discipline-trigger"
                    aria-label={`Inspect ${activeSlide.title} drawing in lightbox`}
                    onClick={(e) => onOpenLightbox(leadSheetId, e.currentTarget)}
                    className="flex h-full w-full items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                  >
                    <img
                      src={activeSlide.planSrc}
                      alt={activeSlide.title}
                      className="h-full w-full object-contain"
                    />
                  </button>
                ) : (
                  <span className="text-[12px] text-[#4F5C67]">Preview unavailable</span>
                )}
              </div>
              <figcaption className="flex h-[30px] shrink-0 items-center justify-between gap-2 border-t border-[#D9DEE2] bg-[#F4F3EF]/40 px-2.5 text-[11px] text-[#4F5C67]">
                <span className="truncate font-medium text-[#1B2A4A]">
                  {activeSlide.provenanceRefs[0]
                    ? `${activeSlide.provenanceRefs[0].sheetCode} ${activeSlide.provenanceRefs[0].revision}`
                    : activeSlide.title}
                </span>
                <span className="shrink-0">
                  {activeSlide.sheetCount} active sheet{activeSlide.sheetCount === 1 ? '' : 's'}
                </span>
              </figcaption>
            </figure>
          )}
        </div>

        {/* Fixed-height single-row Provenance Traceability Bar */}
        <div
          data-testid="overview-preview-sources"
          className="mt-2.5 flex h-[32px] shrink-0 items-center gap-1.5 overflow-x-auto text-[12px] whitespace-nowrap text-[#4F5C67]"
        >
          <span className="shrink-0 font-semibold text-[#1B2A4A]">Sources:</span>
          {activeSlide.provenanceRefs.length > 0 ? (
            activeSlide.provenanceRefs.map((ref) => (
              <Link
                key={`${ref.sheetId}-${ref.pageNumber}`}
                to={getSheetDetailPath(ref.sheetId)}
                className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded border border-[#D9DEE2] bg-white px-2 font-medium text-[#1B2A4A] transition-colors hover:border-[#A64011] hover:text-[#A64011] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE]"
              >
                <span>
                  {ref.sheetCode} {ref.revision} (p.{ref.pageNumber})
                </span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              </Link>
            ))
          ) : (
            <span className="text-[#4F5C67]">No issued source sheets linked yet</span>
          )}
        </div>
      </div>

      {/* Horizontal Department Summary Strip */}
      <div
        data-testid="overview-discipline-strip-section"
        className="shrink-0 border-t border-[#D9DEE2] px-4 py-3"
      >
        <div className="flex items-center justify-between gap-2 text-[12px] font-semibold tracking-wider text-[#4F5C67] uppercase">
          <span>Building &amp; discipline summaries</span>
          <span className="font-normal normal-case tabular-nums">
            {1 + departmentStrip.length} views · empty departments omitted
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Blueprint summary strip"
          data-testid="department-summary-strip"
          className={`mt-2 gap-2 ${
            1 + departmentStrip.length <= 4
              ? 'grid grid-cols-2 sm:grid-cols-4'
              : 'flex overflow-x-auto pb-1'
          }`}
        >
          {/* Whole-building cover tab */}
          <button
            type="button"
            role="tab"
            aria-selected={selectedSlideId === wholeBuilding.id}
            data-testid="summary-slide-whole-building"
            onClick={() => setSelectedSlideId(wholeBuilding.id)}
            className={`flex min-w-0 flex-col rounded-lg border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE] ${
              1 + departmentStrip.length > 4 ? 'w-[168px] shrink-0' : ''
            } ${
              selectedSlideId === wholeBuilding.id
                ? 'border-[#A64011] bg-[#FFF3EB]/60'
                : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[12px] leading-[16px] font-semibold text-[#1B2A4A]">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-[#A64011]" aria-hidden="true" />
              <span className="truncate">Whole building</span>
            </div>
            <span className="mt-0.5 truncate text-[12px] leading-[16px] text-[#4F5C67]">
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
                onClick={() => setSelectedSlideId(slide.id)}
                className={`flex min-w-0 flex-col rounded-lg border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE] ${
                  1 + departmentStrip.length > 4 ? 'w-[184px] shrink-0' : ''
                } ${
                  active
                    ? 'border-[#A64011] bg-[#FFF3EB]/60'
                    : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[12px] leading-[16px] font-semibold text-[#1B2A4A]">
                  <Layers className="h-3.5 w-3.5 shrink-0 text-[#4F5C67]" aria-hidden="true" />
                  <span className="truncate">{slide.title}</span>
                </div>
                <span className="mt-0.5 truncate text-[12px] leading-[16px] text-[#4F5C67]">
                  {slide.sheetCount} sheet{slide.sheetCount === 1 ? '' : 's'}
                  {slide.kind === 'combined_mep' ? ' · Shared MEP' : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Actions */}
      <div
        data-testid="overview-blueprint-footer"
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#D9DEE2] bg-[#F4F3EF]/40 px-4 py-2.5"
      >
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
              data-testid="overview-open-drawing-link"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              Open drawing
            </Link>
          )}
        </div>

        <Link
          to={blueprintManagementPath}
          data-testid="overview-blueprint-management-link"
          className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-medium text-[#A64011] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
        >
          <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" />
          Blueprint management
        </Link>
      </div>
    </section>
  );
}
