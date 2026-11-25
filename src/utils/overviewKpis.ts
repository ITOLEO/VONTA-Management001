import type { BuildingSummarySlide } from '../domain/blueprintRegister';
import type { SpatialPin } from '../domain/types';

export interface OverviewKpiItem {
  id:
    | 'verified-progress'
    | 'stage-readiness'
    | 'pending-qc'
    | 'blocked-work'
    | 'material-exceptions';
  title: string;
  value: string;
  supportingText: string;
}

export interface DemoOverviewKpiInput {
  approvedCount: number;
  totalPins: number;
  verifiedProgressPercent: number;
  areaCount: number;
  pendingReviewCount: number;
  materialExceptionCount: number;
  totalIssuedLines: number;
  totalMaterialLines: number;
  pins: SpatialPin[];
}

export interface LiveOverviewKpiInput {
  pins: SpatialPin[];
  publishedModelCount: number;
  areaCount: number;
}

export type OverviewHubViewMode = 'both' | 'plan' | 'elevation';

export interface SlideVerificationBadge {
  label: string;
  tone: 'verified' | 'warning' | 'muted';
}

export function buildDemoOverviewKpis(input: DemoOverviewKpiInput): OverviewKpiItem[] {
  const missingEvidenceCount = input.pins.filter(
    (p) => !p.evidence.before || !p.evidence.after
  ).length;
  const blockedCount = input.pins.filter(
    (p) =>
      (p.status === 'open' || p.status === 'in_progress') &&
      (!p.evidence.before ||
        !p.evidence.after ||
        p.materials.some((m) => m.issuedQty < m.requiredQty))
  ).length;

  return [
    {
      id: 'verified-progress',
      title: 'Verified progress',
      value: `${input.approvedCount}/${input.totalPins}`,
      supportingText: `${input.verifiedProgressPercent}% approved`,
    },
    {
      id: 'stage-readiness',
      title: 'Stage readiness',
      value: `${input.areaCount}/${input.areaCount}`,
      supportingText: 'Area model calibrated',
    },
    {
      id: 'pending-qc',
      title: 'Pending QC',
      value: `${input.pendingReviewCount}`,
      supportingText: input.pendingReviewCount === 0 ? 'None waiting' : 'Awaiting review',
    },
    {
      id: 'blocked-work',
      title: 'Blocked work',
      value: `${blockedCount}`,
      supportingText: `${missingEvidenceCount} missing photos`,
    },
    {
      id: 'material-exceptions',
      title: 'Material exceptions',
      value: `${input.materialExceptionCount}`,
      supportingText: `${input.totalIssuedLines}/${input.totalMaterialLines} lines issued`,
    },
  ];
}

export function buildLiveOverviewKpis(input: LiveOverviewKpiInput): OverviewKpiItem[] {
  const approvedCount = input.pins.filter((p) => p.status === 'approved').length;
  const pendingQcCount = input.pins.filter((p) => p.status === 'pending_review').length;
  const materialExceptionCount = input.pins.filter((p) =>
    (p.materials ?? []).some((m) => m.issuedQty < m.requiredQty)
  ).length;
  const blockedCount = input.pins.filter(
    (p) =>
      (p.status === 'open' || p.status === 'in_progress') &&
      (!p.evidence?.before ||
        !p.evidence?.after ||
        (p.materials ?? []).some((m) => m.issuedQty < m.requiredQty))
  ).length;

  return [
    {
      id: 'verified-progress',
      title: 'Verified progress',
      value: `${approvedCount}/${input.pins.length}`,
      supportingText:
        input.pins.length > 0
          ? `${Math.round((approvedCount / input.pins.length) * 100)}% approved`
          : 'No Pins yet',
    },
    {
      id: 'stage-readiness',
      title: 'Stage readiness',
      value: `${input.publishedModelCount}/${input.areaCount}`,
      supportingText: 'Published areas',
    },
    {
      id: 'pending-qc',
      title: 'Pending QC',
      value: `${pendingQcCount}`,
      supportingText: 'Awaiting inspection',
    },
    {
      id: 'blocked-work',
      title: 'Blocked work',
      value: `${blockedCount}`,
      supportingText: 'Needs resolution',
    },
    {
      id: 'material-exceptions',
      title: 'Material exceptions',
      value: `${materialExceptionCount}`,
      supportingText: 'Open shortages',
    },
  ];
}

/**
 * Resolves the exact blueprint sheet ID to open in the lightbox or detail viewer
 * for the active Overview slide and Plan/Elevation view mode.
 */
export function resolveOverviewSlideTargetSheetId(
  slide: BuildingSummarySlide,
  viewMode: OverviewHubViewMode
): string | undefined {
  if (
    slide.kind === 'whole_building' &&
    viewMode === 'elevation' &&
    slide.sideElevationStatus === 'source' &&
    slide.provenanceRefs.length > 1
  ) {
    return slide.provenanceRefs[1]?.sheetId ?? slide.provenanceRefs[0]?.sheetId;
  }
  return slide.provenanceRefs[0]?.sheetId;
}

/**
 * Returns a concise truthful verification badge for an Overview blueprint summary slide.
 */
export function resolveSlideVerificationBadge(
  slide: BuildingSummarySlide
): SlideVerificationBadge {
  if (slide.generationStatus === 'empty') {
    return { label: 'No issued sheets', tone: 'muted' };
  }
  if (slide.generationStatus === 'conflict') {
    return { label: 'Needs review', tone: 'warning' };
  }
  if (slide.kind === 'whole_building' && slide.sideElevationNotice) {
    return { label: 'Elevation missing', tone: 'warning' };
  }
  if (slide.kind === 'whole_building' && slide.sideElevationStatus === 'derived') {
    return { label: 'Model-derived elevation', tone: 'verified' };
  }
  return { label: 'Source verified', tone: 'verified' };
}
