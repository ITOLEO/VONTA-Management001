import type { ProjectDepartment } from './departmentCatalog';
import { DEFAULT_AREA_ID, DEFAULT_BLUEPRINT_SRC } from './demoStore';

export type BlueprintSheetClassification =
  | 'plan'
  | 'elevation'
  | 'section'
  | 'schedule'
  | 'detail'
  | 'coordination';

export type BlueprintModelPreviewState =
  | 'orbitable'
  | 'processing'
  | 'needs_review'
  | 'reference_only'
  | 'failed';

export type TranscriptionFieldStatus = 'verified' | 'needs_review' | 'not_specified';

export interface TranscriptionField {
  label: string;
  value: string;
  status: TranscriptionFieldStatus;
  sourceRef?: string;
}

export interface BlueprintTranscription {
  identity: TranscriptionField[];
  geometryAndCriteria: TranscriptionField[];
  constructionContent: TranscriptionField[];
  provenance: TranscriptionField[];
}

export interface BlueprintSheetRecord {
  id: string;
  projectId: string;
  sourceFileId: string;
  sourceFileName: string;
  pageNumber: number;
  totalPages: number;
  sheetCode: string;
  title: string;
  revision: string;
  issueDate: string;
  author: string;
  floorLabel: string;
  areaId: string;
  areaName: string;
  /** Many-to-many department bindings; combined Electrical + Plumbing stores both IDs on one record */
  departmentIds: string[];
  departmentNames: string[];
  isCombinedElectricalPlumbing: boolean;
  classification: BlueprintSheetClassification;
  isSuperseded: boolean;
  supersededBySheetId?: string | null;
  scaleLabel: string;
  hasVerifiedNorth: boolean;
  northAngleDeg: number | null;
  /** Optional explicit asset src; if undefined, synthetic architectural sheet SVG can be rendered lazily */
  previewSrc: string | null;
  previewMissingReason?: string | null;
  modelPreviewState: BlueprintModelPreviewState;
  modelPreviewReason?: string | null;
  modelVersionId?: string | null;
  processingJobId?: string | null;
  notes: string[];
  transcription: BlueprintTranscription;
  isDemoFixture?: boolean;
}

export interface SummaryProvenanceRef {
  sheetId: string;
  sheetCode: string;
  pageNumber: number;
  revision: string;
  sourceFileName: string;
}

export interface BuildingSummarySlide {
  id: string;
  kind: 'whole_building' | 'department' | 'combined_mep';
  title: string;
  subtitle: string;
  departmentIds: string[];
  departmentLabels: string[];
  sheetIds: string[];
  sheetCount: number;
  provenanceRefs: SummaryProvenanceRef[];
  hasSideElevation: boolean;
  sideElevationStatus: 'source' | 'derived' | 'missing';
  sideElevationNotice?: string;
  sideElevationSrc?: string | null;
  planSrc: string | null;
  scaleLabel: string;
  elevationScaleLabel?: string;
  floorLabels: string[];
  generationStatus: 'verified' | 'regenerating' | 'conflict' | 'empty';
  conflictWarning?: string | null;
  summaryNotes: string[];
}

export interface BlueprintFilterOptions {
  query?: string;
  departmentId?: string | 'all';
  areaId?: string | 'all';
  includeSuperseded?: boolean;
}

const NATURAL_TOKEN_RE = /(\d+|\D+)/g;

export function compareNaturalStrings(a: string, b: string): number {
  const ta = a.trim().toLowerCase().match(NATURAL_TOKEN_RE) ?? [a];
  const tb = b.trim().toLowerCase().match(NATURAL_TOKEN_RE) ?? [b];
  const len = Math.min(ta.length, tb.length);
  for (let i = 0; i < len; i += 1) {
    const x = ta[i];
    const y = tb[i];
    if (x === y) continue;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx - ny;
    } else {
      const cmp = x.localeCompare(y);
      if (cmp !== 0) return cmp;
    }
  }
  return ta.length - tb.length;
}

export function sortBlueprintSheets(
  sheets: BlueprintSheetRecord[],
  departments: ProjectDepartment[]
): BlueprintSheetRecord[] {
  const orderById = new Map<string, number>();
  departments.forEach((d, idx) => orderById.set(d.id, d.sortOrder || idx + 1));

  const getRank = (sheet: BlueprintSheetRecord): number => {
    if (sheet.isCombinedElectricalPlumbing) return 2.5;
    if (sheet.departmentIds.length === 0) return 99;
    return Math.min(...sheet.departmentIds.map((id) => orderById.get(id) ?? 50));
  };

  return [...sheets].sort((a, b) => {
    // Active revisions before superseded ones of same code
    const rankDiff = getRank(a) - getRank(b);
    if (rankDiff !== 0) return rankDiff;
    const codeDiff = compareNaturalStrings(a.sheetCode, b.sheetCode);
    if (codeDiff !== 0) return codeDiff;
    if (a.isSuperseded !== b.isSuperseded) return a.isSuperseded ? 1 : -1;
    return a.pageNumber - b.pageNumber;
  });
}

export function filterBlueprintSheets(
  sheets: BlueprintSheetRecord[],
  options: BlueprintFilterOptions,
  departments: ProjectDepartment[] = []
): BlueprintSheetRecord[] {
  const query = (options.query ?? '').trim().toLowerCase();
  const deptFilter = options.departmentId && options.departmentId !== 'all' ? options.departmentId : null;
  const areaFilter = options.areaId && options.areaId !== 'all' ? options.areaId : null;
  const includeSuperseded = options.includeSuperseded ?? true;

  const matched = sheets.filter((sheet) => {
    if (!includeSuperseded && sheet.isSuperseded) return false;
    if (areaFilter && sheet.areaId !== areaFilter) return false;
    if (deptFilter) {
      const matchesId = sheet.departmentIds.includes(deptFilter);
      const matchesName = sheet.departmentNames.some(
        (n) => n.trim().toLowerCase() === deptFilter.trim().toLowerCase()
      );
      if (!matchesId && !matchesName) return false;
    }
    if (query) {
      const hay = [
        sheet.sheetCode,
        sheet.title,
        sheet.areaName,
        sheet.floorLabel,
        sheet.revision,
        sheet.sourceFileName,
        ...sheet.departmentNames,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  return sortBlueprintSheets(matched, departments);
}

/**
 * Generates a crisp, lightweight architectural sheet SVG data URL lazily on demand
 * so 60+ sheets render instantaneously without storing large raster payloads.
 */
export function renderArchitecturalSheetSvg(sheet: Pick<
  BlueprintSheetRecord,
  | 'sheetCode'
  | 'title'
  | 'revision'
  | 'floorLabel'
  | 'areaName'
  | 'departmentNames'
  | 'classification'
  | 'scaleLabel'
  | 'isCombinedElectricalPlumbing'
  | 'isSuperseded'
  | 'isDemoFixture'
>): string {
  const deptBadge = sheet.isCombinedElectricalPlumbing
    ? 'ELECTRICAL + PLUMBING'
    : (sheet.departmentNames.join(' · ') || 'COORDINATION').toUpperCase();
  const accent = sheet.isCombinedElectricalPlumbing
    ? '#0D9488'
    : sheet.departmentNames.includes('Electrical')
      ? '#D4652F'
      : sheet.departmentNames.includes('Plumbing')
        ? '#0D9488'
        : sheet.departmentNames.includes('Finishing')
          ? '#7C3AED'
          : '#1B2A4A';

  const isElevation = sheet.classification === 'elevation';
  const isSection = sheet.classification === 'section';
  const isSchedule = sheet.classification === 'schedule';

  let bodySvg = '';
  if (isElevation) {
    bodySvg = `
      <rect x="70" y="130" width="760" height="330" fill="#F8F9FA" stroke="#D9DEE2" stroke-width="1"/>
      <line x1="50" y1="430" x2="860" y2="430" stroke="#1B2A4A" stroke-width="3"/>
      <rect x="140" y="280" width="560" height="150" fill="#FFFFFF" stroke="#1B2A4A" stroke-width="2.5"/>
      <rect x="140" y="160" width="560" height="120" fill="#FFFFFF" stroke="#1B2A4A" stroke-width="2.5"/>
      <polygon points="120,160 420,118 720,160" fill="#F4F3EF" stroke="#1B2A4A" stroke-width="2.5"/>
      <rect x="200" y="320" width="110" height="65" fill="#F4F3EF" stroke="#4F5C67" stroke-width="1.5"/>
      <rect x="370" y="345" width="75" height="85" fill="#FFF3EB" stroke="#A64011" stroke-width="1.5"/>
      <rect x="510" y="320" width="110" height="65" fill="#F4F3EF" stroke="#4F5C67" stroke-width="1.5"/>
      <rect x="200" y="195" width="110" height="55" fill="#F4F3EF" stroke="#4F5C67" stroke-width="1.5"/>
      <rect x="510" y="195" width="110" height="55" fill="#F4F3EF" stroke="#4F5C67" stroke-width="1.5"/>
      <line x1="710" y1="430" x2="825" y2="430" stroke="#A64011" stroke-dasharray="4 3"/>
      <line x1="710" y1="280" x2="825" y2="280" stroke="#A64011" stroke-dasharray="4 3"/>
      <line x1="710" y1="160" x2="825" y2="160" stroke="#A64011" stroke-dasharray="4 3"/>
      <text x="725" y="424" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#1B2A4A">GL 0.00 m (Ground)</text>
      <text x="725" y="274" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#1B2A4A">+3.20 m (Level 2)</text>
      <text x="725" y="154" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#1B2A4A">+6.40 m (Roof Eave)</text>
      <text x="420" y="454" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#4F5C67">SOUTH SIDE ELEVATION · 8,400 MM SPAN (AXES 1–2–3)</text>
    `;
  } else if (isSection) {
    bodySvg = `
      <rect x="70" y="130" width="760" height="330" fill="#F8F9FA" stroke="#D9DEE2"/>
      <rect x="120" y="185" width="320" height="215" fill="#FFFFFF" stroke="#1B2A4A" stroke-width="2.5"/>
      <rect x="440" y="185" width="320" height="215" fill="#FFFFFF" stroke="#1B2A4A" stroke-width="2.5"/>
      <line x1="120" y1="295" x2="760" y2="295" stroke="#1B2A4A" stroke-width="2"/>
      <text x="280" y="365" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#1B2A4A">RUANG KERJA · 4,200 MM</text>
      <text x="600" y="365" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#1B2A4A">RUANG RAPAT · 4,200 MM</text>
      <text x="280" y="255" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#4F5C67">LEVEL 2 STUDIO</text>
      <text x="600" y="255" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#4F5C67">LEVEL 2 TERRACE</text>
    `;
  } else if (isSchedule) {
    bodySvg = `
      <rect x="70" y="130" width="760" height="330" fill="#FFFFFF" stroke="#D9DEE2"/>
      <rect x="70" y="130" width="760" height="38" fill="#1B2A4A"/>
      <text x="90" y="154" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">ITEM CODE</text>
      <text x="240" y="154" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">SPECIFICATION</text>
      <text x="560" y="154" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">AREA / FLOOR</text>
      <text x="730" y="154" font-family="Inter, sans-serif" font-size="12" font-weight="700" fill="#FFFFFF">STATUS</text>
      <line x1="70" y1="215" x2="830" y2="215" stroke="#D9DEE2"/>
      <line x1="70" y1="265" x2="830" y2="265" stroke="#D9DEE2"/>
      <line x1="70" y1="315" x2="830" y2="315" stroke="#D9DEE2"/>
      <line x1="70" y1="365" x2="830" y2="365" stroke="#D9DEE2"/>
      <text x="90" y="198" font-family="Inter, sans-serif" font-size="12" fill="#1B2A4A">SCH-01</text>
      <text x="240" y="198" font-family="Inter, sans-serif" font-size="12" fill="#4F5C67">Primary assembly per issued spec</text>
      <text x="560" y="198" font-family="Inter, sans-serif" font-size="12" fill="#4F5C67">${escapeXml(sheet.areaName)}</text>
      <text x="730" y="198" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="${accent}">ISSUED</text>
      <text x="90" y="248" font-family="Inter, sans-serif" font-size="12" fill="#1B2A4A">SCH-02</text>
      <text x="240" y="248" font-family="Inter, sans-serif" font-size="12" fill="#4F5C67">Reference schedule (non-geometric)</text>
      <text x="560" y="248" font-family="Inter, sans-serif" font-size="12" fill="#4F5C67">${escapeXml(sheet.floorLabel)}</text>
      <text x="730" y="248" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#4F5C67">REF ONLY</text>
    `;
  } else {
    // Floor plan or coordinated MEP layout
    const mepOverlay = sheet.isCombinedElectricalPlumbing
      ? `
        <polyline points="170,210 420,210 420,375 690,375" fill="none" stroke="#D4652F" stroke-width="3" stroke-dasharray="8 4"/>
        <polyline points="195,390 465,390 465,245 720,245" fill="none" stroke="#0D9488" stroke-width="3"/>
        <circle cx="420" cy="210" r="7" fill="#D4652F"/>
        <circle cx="465" cy="245" r="7" fill="#0D9488"/>
        <text x="175" y="196" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#D4652F">ELEC CONDUIT TRUNK (PANEL MDP-1)</text>
        <text x="480" y="236" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#0D9488">CW / HW SUPPLY &amp; VENT RISER</text>
      `
      : `
        <line x1="150" y1="295" x2="750" y2="295" stroke="${accent}" stroke-width="1.5" stroke-dasharray="6 4"/>
        <line x1="450" y1="155" x2="450" y2="435" stroke="${accent}" stroke-width="1.5" stroke-dasharray="6 4"/>
      `;
    bodySvg = `
      <rect x="70" y="130" width="760" height="330" fill="#F8F9FA" stroke="#D9DEE2"/>
      <rect x="130" y="160" width="640" height="270" fill="#FFFFFF" stroke="#1B2A4A" stroke-width="3"/>
      <line x1="450" y1="160" x2="450" y2="430" stroke="#1B2A4A" stroke-width="2"/>
      <line x1="450" y1="295" x2="770" y2="295" stroke="#1B2A4A" stroke-width="2"/>
      ${mepOverlay}
      <text x="290" y="298" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#1B2A4A">RUANG KERJA</text>
      <text x="610" y="228" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#1B2A4A">RUANG RAPAT (2,875 MM)</text>
      <text x="610" y="368" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="#1B2A4A">RUANG ARSIP</text>
      <circle cx="804" cy="166" r="18" fill="#FFFFFF" stroke="#1B2A4A" stroke-width="1.5"/>
      <polygon points="804,151 809,169 804,165 799,169" fill="#A64011"/>
      <text x="804" y="144" text-anchor="middle" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="#1B2A4A">N</text>
    `;
  }

  const supersededBanner = sheet.isSuperseded
    ? `<rect x="640" y="26" width="190" height="24" rx="4" fill="#FEE2E2"/><text x="735" y="42" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#991B1B">SUPERSEDED REVISION</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 540">
    <rect width="900" height="540" fill="#FFFFFF"/>
    <rect x="16" y="16" width="868" height="508" fill="none" stroke="#1B2A4A" stroke-width="2"/>
    <text x="36" y="46" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="#1B2A4A">VONTA | ${escapeXml(sheet.sheetCode)} · ${escapeXml(sheet.revision)}</text>
    <text x="36" y="68" font-family="Inter, sans-serif" font-size="12" fill="#4F5C67">${escapeXml(sheet.title)} — ${escapeXml(sheet.areaName)} (${escapeXml(sheet.floorLabel)})</text>
    <rect x="36" y="80" width="210" height="22" rx="4" fill="#F4F3EF" stroke="${accent}" stroke-width="1"/>
    <text x="46" y="95" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="${accent}">${escapeXml(deptBadge)}</text>
    <text x="864" y="95" text-anchor="end" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#4F5C67">SCALE ${escapeXml(sheet.scaleLabel)}${sheet.isDemoFixture ? ' · DEMO FIXTURE' : ''}</text>
    ${supersededBanner}
    <line x1="16" y1="112" x2="884" y2="112" stroke="#D9DEE2" stroke-width="1.5"/>
    ${bodySvg}
    <line x1="16" y1="478" x2="884" y2="478" stroke="#D9DEE2" stroke-width="1.5"/>
    <text x="36" y="505" font-family="Inter, sans-serif" font-size="11" fill="#4F5C67">CLASSIFICATION: ${escapeXml(sheet.classification.toUpperCase())} · SOURCE-BACKED NAVIGATIONAL SHEET</text>
    <text x="864" y="505" text-anchor="end" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#1B2A4A">VONTA FIELD OPERATIONS</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getSheetPreviewSrc(sheet: BlueprintSheetRecord): string | null {
  if (sheet.previewMissingReason) return null;
  if (sheet.previewSrc) return sheet.previewSrc;
  return renderArchitecturalSheetSvg(sheet);
}

/**
 * Generates the VONTA whole-building summary + populated department summary strip
 * per doc 02 rules:
 * - First slide: whole-building summary; for 2+ stories shows side elevation with floor labels
 *   when a source elevation or verified model exists, else explicitly shows
 *   "Side elevation needs a source or verified model."
 * - Horizontal strip: one summary per populated department, combining coordinated
 *   Electrical + Plumbing drawings into ONE shared "Electrical + Plumbing" slide.
 * - Omits empty departments. Flags inconsistent scales/north references rather than blending.
 */
export function buildBuildingSummarySlides(
  sheets: BlueprintSheetRecord[],
  departments: ProjectDepartment[],
  options: {
    projectName: string;
    storyCount: number;
    hasVerifiedElevationModel?: boolean;
    floorLabels?: string[];
  }
): {
  wholeBuilding: BuildingSummarySlide;
  departmentStrip: BuildingSummarySlide[];
} {
  const activeSheets = sheets.filter((s) => !s.isSuperseded);
  const floorLabels =
    options.floorLabels && options.floorLabels.length > 0
      ? options.floorLabels
      : Array.from(new Set(activeSheets.map((s) => s.floorLabel).filter(Boolean)));

  const elevationSheet = activeSheets.find((s) => s.classification === 'elevation');
  const primaryPlanSheet =
    activeSheets.find((s) => s.classification === 'plan' && s.sheetCode === 'A-03') ??
    activeSheets.find((s) => s.classification === 'plan') ??
    activeSheets[0] ??
    null;

  // Detect conflicting north angles across active sheets that specify north
  const distinctNorths = Array.from(
    new Set(
      activeSheets
        .filter((s) => s.hasVerifiedNorth && typeof s.northAngleDeg === 'number')
        .map((s) => Math.round(s.northAngleDeg as number))
    )
  );
  const distinctPlanScales = Array.from(
    new Set(activeSheets.filter((s) => s.classification === 'plan').map((s) => s.scaleLabel))
  );

  const conflictMessages: string[] = [];
  if (distinctNorths.length > 1) {
    conflictMessages.push(
      `North orientation conflict across sheets (${distinctNorths.map((n) => `${n}°`).join(' vs ')}) — review required before merging.`
    );
  }
  if (distinctPlanScales.length > 2) {
    conflictMessages.push(
      `Multiple plan scales present (${distinctPlanScales.join(', ')}) — each sheet retains its own scale label.`
    );
  }

  let hasSideElevation = false;
  let sideElevationStatus: 'source' | 'derived' | 'missing' = 'missing';
  let sideElevationNotice: string | undefined;
  let sideElevationSrc: string | null = null;
  let elevationScaleLabel: string | undefined;

  if (options.storyCount >= 2) {
    if (elevationSheet) {
      hasSideElevation = true;
      sideElevationStatus = 'source';
      sideElevationSrc = getSheetPreviewSrc(elevationSheet);
      elevationScaleLabel = elevationSheet.scaleLabel;
    } else if (options.hasVerifiedElevationModel) {
      hasSideElevation = true;
      sideElevationStatus = 'derived';
      elevationScaleLabel = 'Derived orthographic 1:100';
      sideElevationSrc = renderArchitecturalSheetSvg({
        sheetCode: 'ELEV-DERIVED',
        title: `${options.projectName} Derived Side Elevation`,
        revision: 'Model-derived',
        floorLabel: floorLabels.join(' / ') || 'Multi-storey',
        areaName: options.projectName,
        departmentNames: ['Civil'],
        classification: 'elevation',
        scaleLabel: '1:100 (Derived)',
        isCombinedElectricalPlumbing: false,
        isSuperseded: false,
        isDemoFixture: true,
      });
    } else {
      hasSideElevation = false;
      sideElevationStatus = 'missing';
      sideElevationNotice = 'Side elevation needs a source or verified model.';
    }
  }

  const keySummarySheets = [primaryPlanSheet, elevationSheet].filter(
    (s): s is BlueprintSheetRecord => Boolean(s)
  );
  const wholeProvenance: SummaryProvenanceRef[] = (
    keySummarySheets.length > 0 ? keySummarySheets : activeSheets.slice(0, 4)
  ).map((s) => ({
    sheetId: s.id,
    sheetCode: s.sheetCode,
    pageNumber: s.pageNumber,
    revision: s.revision,
    sourceFileName: s.sourceFileName,
  }));

  const wholeBuilding: BuildingSummarySlide = {
    id: 'summary-whole-building',
    kind: 'whole_building',
    title: `${options.projectName} — Whole-Building Summary`,
    subtitle:
      options.storyCount >= 2
        ? `${options.storyCount}-storey summary · ${activeSheets.length} active sheet${activeSheets.length === 1 ? '' : 's'}`
        : `Building footprint summary · ${activeSheets.length} active sheet${activeSheets.length === 1 ? '' : 's'}`,
    departmentIds: departments.map((d) => d.id),
    departmentLabels: departments.map((d) => d.name),
    sheetIds: activeSheets.map((s) => s.id),
    sheetCount: activeSheets.length,
    provenanceRefs: wholeProvenance,
    hasSideElevation,
    sideElevationStatus,
    sideElevationNotice,
    sideElevationSrc,
    planSrc: primaryPlanSheet ? getSheetPreviewSrc(primaryPlanSheet) : null,
    scaleLabel: primaryPlanSheet?.scaleLabel ?? 'Not specified',
    elevationScaleLabel,
    floorLabels,
    generationStatus:
      activeSheets.length === 0
        ? 'empty'
        : conflictMessages.length > 0
          ? 'conflict'
          : 'verified',
    conflictWarning: conflictMessages.length > 0 ? conflictMessages.join(' ') : null,
    summaryNotes: [
      'Navigational summary with source provenance — does not publish construction geometry without Contractor review.',
      ...(elevationSheet
        ? [`Side elevation sourced from ${elevationSheet.sheetCode} (${elevationSheet.revision}, ${elevationSheet.scaleLabel}).`]
        : []),
    ],
  };

  // Horizontal strip: populated departments, with ONE shared Electrical + Plumbing slide for coordinated drawings
  const departmentStrip: BuildingSummarySlide[] = [];
  const electricalDept = departments.find((d) => d.slug === 'electrical' || d.name.toLowerCase() === 'electrical');
  const plumbingDept = departments.find((d) => d.slug === 'plumbing' || d.name.toLowerCase() === 'plumbing');

  const combinedMepSheets = activeSheets.filter(
    (s) =>
      s.isCombinedElectricalPlumbing ||
      (electricalDept &&
        plumbingDept &&
        s.departmentIds.includes(electricalDept.id) &&
        s.departmentIds.includes(plumbingDept.id))
  );

  let emittedCombinedMep = false;

  for (const dept of departments) {
    const isElectrical = electricalDept && dept.id === electricalDept.id;
    const isPlumbing = plumbingDept && dept.id === plumbingDept.id;

    if ((isElectrical || isPlumbing) && combinedMepSheets.length > 0 && electricalDept && plumbingDept) {
      if (!emittedCombinedMep) {
        emittedCombinedMep = true;
        // Gather coordinated E+P sheets plus supplemental Electrical / Plumbing sheets referenced in provenance
        const allMepSheets = activeSheets.filter(
          (s) =>
            s.departmentIds.includes(electricalDept.id) ||
            s.departmentIds.includes(plumbingDept.id)
        );
        const leadSheet = combinedMepSheets[0] ?? allMepSheets[0];
        departmentStrip.push({
          id: 'summary-dept-electrical-plumbing',
          kind: 'combined_mep',
          title: 'Electrical + Plumbing',
          subtitle: `${combinedMepSheets.length} coordinated sheet${combinedMepSheets.length === 1 ? '' : 's'} · ${allMepSheets.length} total MEP sheets`,
          departmentIds: [electricalDept.id, plumbingDept.id],
          departmentLabels: [electricalDept.name, plumbingDept.name],
          sheetIds: allMepSheets.map((s) => s.id),
          sheetCount: allMepSheets.length,
          provenanceRefs: [leadSheet, ...allMepSheets.filter((s) => s.id !== leadSheet.id).slice(0, 3)].map((s) => ({
            sheetId: s.id,
            sheetCode: s.sheetCode,
            pageNumber: s.pageNumber,
            revision: s.revision,
            sourceFileName: s.sourceFileName,
          })),
          hasSideElevation: false,
          sideElevationStatus: 'missing',
          planSrc: leadSheet ? getSheetPreviewSrc(leadSheet) : null,
          scaleLabel: leadSheet?.scaleLabel ?? '1:100',
          floorLabels: Array.from(new Set(allMepSheets.map((s) => s.floorLabel))),
          generationStatus: 'verified',
          summaryNotes: [
            'Coordinated Electrical + Plumbing drawings stored once and indexed under both discipline filters. Teams, Pin filters, and budgets remain independent.',
          ],
        });
      }
      continue;
    }

    const deptSheets = activeSheets.filter(
      (s) =>
        s.departmentIds.includes(dept.id) ||
        s.departmentNames.some((n) => n.toLowerCase() === dept.name.toLowerCase())
    );
    if (deptSheets.length === 0) {
      // Omit empty departments
      continue;
    }
    const leadSheet =
      deptSheets.find((s) => s.classification === 'plan') ?? deptSheets[0];
    departmentStrip.push({
      id: `summary-${dept.id}`,
      kind: 'department',
      title: dept.name,
      subtitle: `${deptSheets.length} active sheet${deptSheets.length === 1 ? '' : 's'} · ${leadSheet.sheetCode} ${leadSheet.revision}`,
      departmentIds: [dept.id],
      departmentLabels: [dept.name],
      sheetIds: deptSheets.map((s) => s.id),
      sheetCount: deptSheets.length,
      provenanceRefs: deptSheets.slice(0, 4).map((s) => ({
        sheetId: s.id,
        sheetCode: s.sheetCode,
        pageNumber: s.pageNumber,
        revision: s.revision,
        sourceFileName: s.sourceFileName,
      })),
      hasSideElevation: false,
      sideElevationStatus: 'missing',
      planSrc: getSheetPreviewSrc(leadSheet),
      scaleLabel: leadSheet.scaleLabel,
      floorLabels: Array.from(new Set(deptSheets.map((s) => s.floorLabel))),
      generationStatus: 'verified',
      summaryNotes: [
        `Department summary assembled from ${deptSheets.length} issued ${dept.name} sheet${deptSheets.length === 1 ? '' : 's'}.`,
      ],
    });
  }

  return { wholeBuilding, departmentStrip };
}

function makeTranscription(params: {
  sheetCode: string;
  title: string;
  pageNumber: number;
  totalPages: number;
  revision: string;
  issueDate: string;
  author: string;
  disciplineLabel: string;
  projectName: string;
  floorLabel: string;
  purpose: string;
  scaleLabel: string;
  gridAxes: string;
  levelsDatum: string;
  northRef: string;
  dimensions: string;
  sectionsRef: string;
  namedElements: string;
  symbolsNote: string;
  scheduleNote: string;
  materialSpecs: string;
  mepRoutingNote?: string;
  sourceFileName: string;
  reviewStatus: string;
  needsReviewNote?: string;
}): BlueprintTranscription {
  return {
    identity: [
      { label: 'Drawing code', value: params.sheetCode, status: 'verified', sourceRef: `Title block p.${params.pageNumber}` },
      { label: 'Title', value: params.title, status: 'verified', sourceRef: `Title block p.${params.pageNumber}` },
      { label: 'Sheet / page', value: `Page ${params.pageNumber} of ${params.totalPages}`, status: 'verified' },
      { label: 'Revision', value: params.revision, status: 'verified' },
      { label: 'Issue date', value: params.issueDate, status: 'verified' },
      { label: 'Author / issuer', value: params.author, status: 'verified' },
      { label: 'Discipline', value: params.disciplineLabel, status: 'verified' },
      { label: 'Project', value: params.projectName, status: 'verified' },
      { label: 'Floor / area', value: params.floorLabel, status: 'verified' },
      { label: 'Drawing purpose', value: params.purpose, status: 'verified' },
    ],
    geometryAndCriteria: [
      { label: 'Scale and units', value: params.scaleLabel, status: 'verified', sourceRef: 'Drawing border' },
      { label: 'Grid axes', value: params.gridAxes, status: params.gridAxes.includes('Not specified') ? 'not_specified' : 'verified' },
      { label: 'Levels and datums', value: params.levelsDatum, status: params.levelsDatum.includes('Not specified') ? 'not_specified' : 'verified' },
      { label: 'North reference', value: params.northRef, status: params.northRef.includes('Not specified') ? 'not_specified' : 'verified' },
      { label: 'Dimension strings', value: params.dimensions, status: params.dimensions.includes('Needs review') ? 'needs_review' : 'verified' },
      { label: 'Sections & elevation refs', value: params.sectionsRef, status: params.sectionsRef.includes('Not specified') ? 'not_specified' : 'verified' },
    ],
    constructionContent: [
      { label: 'Named elements', value: params.namedElements, status: 'verified' },
      { label: 'Structural / service symbols', value: params.symbolsNote, status: params.symbolsNote.includes('Not specified') ? 'not_specified' : 'verified' },
      { label: 'Schedules & notes', value: params.scheduleNote, status: params.scheduleNote.includes('Not specified') ? 'not_specified' : 'verified' },
      { label: 'Material specifications', value: params.materialSpecs, status: params.materialSpecs.includes('Needs review') ? 'needs_review' : 'verified' },
      ...(params.mepRoutingNote
        ? [{ label: 'MEP route classification', value: params.mepRoutingNote, status: 'needs_review' as const }]
        : []),
    ],
    provenance: [
      { label: 'Source file', value: `${params.sourceFileName} (page ${params.pageNumber})`, status: 'verified' },
      { label: 'Revision state', value: `${params.revision} · ${params.reviewStatus}`, status: 'verified' },
      {
        label: 'Extraction review',
        value: params.needsReviewNote ?? 'Verified against issued sheet; critical annotations preserved verbatim.',
        status: params.needsReviewNote ? 'needs_review' : 'verified',
      },
      {
        label: 'Missing values',
        value: 'Unlisted wall thicknesses, elevations, or pipe routes are marked "Not specified on this sheet." and never invented.',
        status: 'verified',
      },
    ],
  };
}

/**
 * Seeds a 62-sheet Paviliun Kerja 2-storey demo blueprint register covering:
 * - Calibrated Ground Floor A-03 R00 + Level 2 A-04 R00 + Verified 2-storey Side Elevation A-05 R00
 * - One combined Electrical + Plumbing coordination sheet (MEP-101) mapped to BOTH departments
 * - Multi-page structural PDF (6 pages sharing one sourceFileId)
 * - Duplicate room titles across Ground Floor and Level 2
 * - Superseded revision (A-03 R00-PREV)
 * - Missing preview fixture + Processing + Failed retry fixture for Blueprint management
 */
export function createDemoBlueprintRegister(
  projectId: string,
  departments: ProjectDepartment[]
): BlueprintSheetRecord[] {
  const civilId = departments.find((d) => d.slug === 'civil')?.id ?? 'dept-civil';
  const elecId = departments.find((d) => d.slug === 'electrical')?.id ?? 'dept-electrical';
  const plumbId = departments.find((d) => d.slug === 'plumbing')?.id ?? 'dept-plumbing';
  const finishId = departments.find((d) => d.slug === 'finishing')?.id ?? 'dept-finishing';

  const sheets: BlueprintSheetRecord[] = [];

  // 1. Primary calibrated Ground Floor A-03 R00
  sheets.push({
    id: 'bp-a03-r00',
    projectId,
    sourceFileId: 'src-a03-r00',
    sourceFileName: 'Paviliun-Kerja-A03-R00.png',
    pageNumber: 1,
    totalPages: 1,
    sheetCode: 'A-03',
    title: 'Ground Floor Plan (Calibrated)',
    revision: 'R00',
    issueDate: '17 Nov 2026',
    author: 'Studio Arsitektur Nusantara (Demo)',
    floorLabel: 'Ground Floor (0.00 m)',
    areaId: DEFAULT_AREA_ID,
    areaName: 'Ground Floor',
    departmentIds: [civilId],
    departmentNames: ['Civil'],
    isCombinedElectricalPlumbing: false,
    classification: 'plan',
    isSuperseded: false,
    scaleLabel: '1:50 (mm)',
    hasVerifiedNorth: true,
    northAngleDeg: 0,
    previewSrc: DEFAULT_BLUEPRINT_SRC,
    modelPreviewState: 'orbitable',
    modelVersionId: 'a03-r00-demo-v1',
    notes: [
      'Primary calibrated floor plan: Axes 1–3 (8,400 mm) × Axes A–C (6,000 mm).',
      'Cross-check Ruang Rapat clear interior N–S = 2,875 mm.',
    ],
    transcription: makeTranscription({
      sheetCode: 'A-03',
      title: 'Ground Floor Plan (Calibrated)',
      pageNumber: 1,
      totalPages: 1,
      revision: 'R00',
      issueDate: '17 Nov 2026',
      author: 'Studio Arsitektur Nusantara (Demo)',
      disciplineLabel: 'Civil / Architectural',
      projectName: 'Paviliun Kerja',
      floorLabel: 'Ground Floor (0.00 m)',
      purpose: 'Issued for construction & 3D spatial calibration',
      scaleLabel: '1:50 · millimeters (mm)',
      gridAxes: 'X: Axes 1–2–3 (4,200 + 4,200 = 8,400 mm) · Y: Axes A–B–C (3,000 + 3,000 = 6,000 mm)',
      levelsDatum: 'FFL ±0.00 m · Wall top +3,200 mm',
      northRef: 'True North 0° (Up on sheet)',
      dimensions: 'Exterior walls 150 mm, interior partitions 100 mm, Ruang Rapat N–S 2,875 mm',
      sectionsRef: 'Sections A–A, B–B (see A-03-S) · South Elevation (see A-05)',
      namedElements: 'Ruang Kerja, Ruang Rapat, Ruang Arsip; Openings P1, P2, J1, J2, J3',
      symbolsNote: 'Door swings, window sill callouts (+900 mm), column grid bubbles',
      scheduleNote: 'Opening schedule cross-referenced on sheet A-03-S',
      materialSpecs: 'Plastered masonry exterior 150 mm, lightweight brick partition 100 mm',
      sourceFileName: 'Paviliun-Kerja-A03-R00.png',
      reviewStatus: 'Verified demo fixture',
    }),
    isDemoFixture: true,
  });

  // 2. Superseded historical A-03 revision (for B04 superseded test)
  sheets.push({
    id: 'bp-a03-prev',
    projectId,
    sourceFileId: 'src-a03-prev',
    sourceFileName: 'Paviliun-Kerja-A03-R00-Prelim.pdf',
    pageNumber: 1,
    totalPages: 1,
    sheetCode: 'A-03',
    title: 'Ground Floor Plan (Preliminary Issue)',
    revision: 'P01',
    issueDate: '04 Nov 2026',
    author: 'Studio Arsitektur Nusantara (Demo)',
    floorLabel: 'Ground Floor (0.00 m)',
    areaId: DEFAULT_AREA_ID,
    areaName: 'Ground Floor',
    departmentIds: [civilId],
    departmentNames: ['Civil'],
    isCombinedElectricalPlumbing: false,
    classification: 'plan',
    isSuperseded: true,
    supersededBySheetId: 'bp-a03-r00',
    scaleLabel: '1:50 (mm)',
    hasVerifiedNorth: true,
    northAngleDeg: 0,
    previewSrc: null,
    modelPreviewState: 'reference_only',
    modelPreviewReason: 'Superseded by A-03 R00; retained for audit traceability.',
    notes: ['Superseded preliminary issue preserved in audit history.'],
    transcription: makeTranscription({
      sheetCode: 'A-03',
      title: 'Ground Floor Plan (Preliminary Issue)',
      pageNumber: 1,
      totalPages: 1,
      revision: 'P01',
      issueDate: '04 Nov 2026',
      author: 'Studio Arsitektur Nusantara (Demo)',
      disciplineLabel: 'Civil / Architectural',
      projectName: 'Paviliun Kerja',
      floorLabel: 'Ground Floor (0.00 m)',
      purpose: 'Preliminary coordination — SUPERSEDED by R00',
      scaleLabel: '1:50 · millimeters (mm)',
      gridAxes: 'Axes 1–3, A–C',
      levelsDatum: 'FFL ±0.00 m',
      northRef: '0° (Up)',
      dimensions: 'Needs review — superseded before final calibration',
      sectionsRef: 'Not specified on this sheet.',
      namedElements: 'Ruang Kerja, Ruang Rapat, Ruang Arsip',
      symbolsNote: 'Preliminary room tags',
      scheduleNote: 'Not specified on this sheet.',
      materialSpecs: 'Not specified on this sheet.',
      sourceFileName: 'Paviliun-Kerja-A03-R00-Prelim.pdf',
      reviewStatus: 'Superseded by A-03 R00',
      needsReviewNote: 'Superseded revision — do not use for site layout.',
    }),
    isDemoFixture: true,
  });

  // 3. A-03-S Sections & Openings (reference-only)
  sheets.push({
    id: 'bp-a03-s',
    projectId,
    sourceFileId: 'src-a03-s',
    sourceFileName: 'Paviliun-Kerja-A03-Sections.pdf',
    pageNumber: 1,
    totalPages: 1,
    sheetCode: 'A-03-S',
    title: 'Wall Sections A–A, B–B & Opening Schedule',
    revision: 'R00',
    issueDate: '17 Nov 2026',
    author: 'Studio Arsitektur Nusantara (Demo)',
    floorLabel: 'Ground Floor (0.00 m)',
    areaId: DEFAULT_AREA_ID,
    areaName: 'Ground Floor',
    departmentIds: [civilId],
    departmentNames: ['Civil'],
    isCombinedElectricalPlumbing: false,
    classification: 'section',
    isSuperseded: false,
    scaleLabel: '1:50 (mm)',
    hasVerifiedNorth: false,
    northAngleDeg: null,
    previewSrc: null,
    modelPreviewState: 'reference_only',
    modelPreviewReason: 'Section & opening schedule supports Ground Floor A-03 calibration (no standalone 3D model).',
    notes: ['Door P1 1,000 mm, P2 850 mm; Windows J1 1,800 mm, J2 1,500 mm, J3 1,200 mm.'],
    transcription: makeTranscription({
      sheetCode: 'A-03-S',
      title: 'Wall Sections A–A, B–B & Opening Schedule',
      pageNumber: 1,
      totalPages: 1,
      revision: 'R00',
      issueDate: '17 Nov 2026',
      author: 'Studio Arsitektur Nusantara (Demo)',
      disciplineLabel: 'Civil / Architectural',
      projectName: 'Paviliun Kerja',
      floorLabel: 'Ground Floor (0.00 m)',
      purpose: 'Vertical datum & opening schedule reference',
      scaleLabel: '1:50 · millimeters (mm)',
      gridAxes: 'Axes 1–2–3',
      levelsDatum: '0.00 m FFL · +900 mm sill · +2,100 mm head · +3,200 mm top',
      northRef: 'Not specified on this sheet.',
      dimensions: 'Total span 8,400 mm; Ruang Kerja 4,200 mm; Ruang Rapat 4,200 mm',
      sectionsRef: 'Section A–A and Section B–B cut from A-03',
      namedElements: 'P1, P2, J1, J2, J3 openings',
      symbolsNote: 'Level datum triangles',
      scheduleNote: 'Opening width/sill/head table included',
      materialSpecs: 'Exterior wall 150 mm, interior partition 100 mm',
      sourceFileName: 'Paviliun-Kerja-A03-Sections.pdf',
      reviewStatus: 'Verified reference sheet',
    }),
    isDemoFixture: true,
  });

  // 4. Level 2 Plan A-04 (2nd storey so Paviliun Kerja is multi-storey for side elevation rule!)
  sheets.push({
    id: 'bp-a04-r00',
    projectId,
    sourceFileId: 'src-a04-r00',
    sourceFileName: 'Paviliun-Kerja-A04-Level2.pdf',
    pageNumber: 1,
    totalPages: 1,
    sheetCode: 'A-04',
    title: 'Level 2 Studio & Roof Terrace Plan',
    revision: 'R00',
    issueDate: '18 Nov 2026',
    author: 'Studio Arsitektur Nusantara (Demo)',
    floorLabel: 'Level 2 (+3.20 m)',
    areaId: 'area-a04-level2',
    areaName: 'Level 2 Studio',
    departmentIds: [civilId],
    departmentNames: ['Civil'],
    isCombinedElectricalPlumbing: false,
    classification: 'plan',
    isSuperseded: false,
    scaleLabel: '1:50 (mm)',
    hasVerifiedNorth: true,
    northAngleDeg: 0,
    previewSrc: null,
    modelPreviewState: 'needs_review',
    modelPreviewReason: 'Draft upper-level geometry extracted — awaiting Contractor review before publication.',
    processingJobId: 'job-demo-a04-01',
    notes: ['Level 2 sits directly over Axes 1–3 / A–C at +3.20 m datum.'],
    transcription: makeTranscription({
      sheetCode: 'A-04',
      title: 'Level 2 Studio & Roof Terrace Plan',
      pageNumber: 1,
      totalPages: 1,
      revision: 'R00',
      issueDate: '18 Nov 2026',
      author: 'Studio Arsitektur Nusantara (Demo)',
      disciplineLabel: 'Civil / Architectural',
      projectName: 'Paviliun Kerja',
      floorLabel: 'Level 2 (+3.20 m)',
      purpose: 'Upper level construction plan',
      scaleLabel: '1:50 · millimeters (mm)',
      gridAxes: 'Axes 1–2–3, A–B–C (aligned with A-03)',
      levelsDatum: 'FFL +3.20 m · Roof eave +6.40 m',
      northRef: 'True North 0° (Up on sheet)',
      dimensions: '8,400 × 6,000 mm main bay; terrace guardrail +1,100 mm',
      sectionsRef: 'South Elevation A-05',
      namedElements: 'Level 2 Studio, North Terrace, Stairwell Landing',
      symbolsNote: 'Guardrail linework, stair up/down arrows',
      scheduleNote: 'Not specified on this sheet.',
      materialSpecs: 'Waterproofed concrete slab 120 mm; lightweight partition 100 mm',
      sourceFileName: 'Paviliun-Kerja-A04-Level2.pdf',
      reviewStatus: 'Draft awaiting Contractor verification',
      needsReviewNote: 'Needs review — confirm Level 2 stair opening clearance before publishing 3D version.',
    }),
    isDemoFixture: true,
  });

  // 5. Verified 2-Storey Side Elevation A-05
  sheets.push({
    id: 'bp-a05-r00',
    projectId,
    sourceFileId: 'src-a05-r00',
    sourceFileName: 'Paviliun-Kerja-A05-Elevations.pdf',
    pageNumber: 1,
    totalPages: 1,
    sheetCode: 'A-05',
    title: 'South & East Side Elevations',
    revision: 'R00',
    issueDate: '18 Nov 2026',
    author: 'Studio Arsitektur Nusantara (Demo)',
    floorLabel: 'All Levels (0.00 m – +6.40 m)',
    areaId: DEFAULT_AREA_ID,
    areaName: 'Whole Building',
    departmentIds: [civilId],
    departmentNames: ['Civil'],
    isCombinedElectricalPlumbing: false,
    classification: 'elevation',
    isSuperseded: false,
    scaleLabel: '1:100 (mm)',
    hasVerifiedNorth: true,
    northAngleDeg: 0,
    previewSrc: null,
    modelPreviewState: 'reference_only',
    modelPreviewReason: 'Issued elevation sheet backs the whole-building side elevation summary.',
    notes: ['Floor datums: Ground Floor 0.00 m, Level 2 +3.20 m, Roof Eave +6.40 m.'],
    transcription: makeTranscription({
      sheetCode: 'A-05',
      title: 'South & East Side Elevations',
      pageNumber: 1,
      totalPages: 1,
      revision: 'R00',
      issueDate: '18 Nov 2026',
      author: 'Studio Arsitektur Nusantara (Demo)',
      disciplineLabel: 'Civil / Architectural',
      projectName: 'Paviliun Kerja',
      floorLabel: 'Ground Floor / Level 2 / Roof',
      purpose: 'Multi-storey facade & datum verification',
      scaleLabel: '1:100 · millimeters (mm)',
      gridAxes: 'Axes 1–2–3 (South elevation)',
      levelsDatum: 'GL 0.00 m · Level 2 +3.20 m · Roof Eave +6.40 m',
      northRef: 'South facade view (looking North 0°)',
      dimensions: 'Floor-to-floor height 3,200 mm per storey',
      sectionsRef: 'Cross-referenced with A-03 and A-04',
      namedElements: 'South Facade, P1 Entry, J2 Windows, Pitched Roof Overhang',
      symbolsNote: 'Elevation datum markers, roof slope 18°',
      scheduleNote: 'Not specified on this sheet.',
      materialSpecs: 'Weather-shield exterior acrylic finish over plastered masonry',
      sourceFileName: 'Paviliun-Kerja-A05-Elevations.pdf',
      reviewStatus: 'Verified source elevation',
    }),
    isDemoFixture: true,
  });

  // 6. Combined Electrical + Plumbing Coordination Sheet (stored ONCE, mapped to BOTH departments!)
  sheets.push({
    id: 'bp-mep-101',
    projectId,
    sourceFileId: 'src-mep-101',
    sourceFileName: 'Paviliun-MEP-101-Coordinated.pdf',
    pageNumber: 1,
    totalPages: 2,
    sheetCode: 'MEP-101',
    title: 'Ground Floor Electrical & Plumbing Coordination',
    revision: 'R01',
    issueDate: '19 Nov 2026',
    author: 'CV Mekanikal Terpadu (Demo)',
    floorLabel: 'Ground Floor (0.00 m)',
    areaId: DEFAULT_AREA_ID,
    areaName: 'Ground Floor',
    departmentIds: [elecId, plumbId],
    departmentNames: ['Electrical', 'Plumbing'],
    isCombinedElectricalPlumbing: true,
    classification: 'coordination',
    isSuperseded: false,
    scaleLabel: '1:50 (mm)',
    hasVerifiedNorth: true,
    northAngleDeg: 0,
    previewSrc: null,
    modelPreviewState: 'orbitable',
    modelVersionId: 'a03-r00-demo-v1',
    notes: [
      'Assigned to both Electrical and Plumbing in one operation (single stored source file).',
      'Schematic conduit & supply risers — verify physical clearance on site before chasing walls.',
    ],
    transcription: makeTranscription({
      sheetCode: 'MEP-101',
      title: 'Ground Floor Electrical & Plumbing Coordination',
      pageNumber: 1,
      totalPages: 2,
      revision: 'R01',
      issueDate: '19 Nov 2026',
      author: 'CV Mekanikal Terpadu (Demo)',
      disciplineLabel: 'Electrical + Plumbing (Coordinated)',
      projectName: 'Paviliun Kerja',
      floorLabel: 'Ground Floor (0.00 m)',
      purpose: 'Combined service coordination (Electrical conduit + CW/HW risers)',
      scaleLabel: '1:50 · millimeters (mm)',
      gridAxes: 'Axes 1–3, A–C',
      levelsDatum: 'Switch box elevation +1,250 mm · Wet riser chase at Axis B/2',
      northRef: 'True North 0° (matches A-03)',
      dimensions: 'Minimum 300 mm separation between power trunking and cold-water riser',
      sectionsRef: 'See MEP-102 (Page 2 of same PDF) for Level 2 coordination',
      namedElements: 'Panel MDP-1, Lighting Circuit L1–L2, CW/HW Riser R-01, Floor Drain FD-01',
      symbolsNote: 'IEC switch/socket symbols, PVC-AW 25 mm water line legend',
      scheduleNote: 'Panel load summary on E-101; Valve schedule on P-101',
      materialSpecs: 'PVC conduit 20 mm; PPR PN-16 cold water piping',
      mepRoutingNote: 'Needs review — schematic routing shown; physical wall chases must be verified on site.',
      sourceFileName: 'Paviliun-MEP-101-Coordinated.pdf',
      reviewStatus: 'Verified coordination sheet',
      needsReviewNote: 'MEP routing is schematic — verify exact chase depth against 100 mm partition on site.',
    }),
    isDemoFixture: true,
  });

  // Page 2 of the same MEP PDF (multi-page PDF example, also combined E+P)
  sheets.push({
    id: 'bp-mep-102',
    projectId,
    sourceFileId: 'src-mep-101',
    sourceFileName: 'Paviliun-MEP-101-Coordinated.pdf',
    pageNumber: 2,
    totalPages: 2,
    sheetCode: 'MEP-102',
    title: 'Level 2 Electrical & Plumbing Coordination',
    revision: 'R01',
    issueDate: '19 Nov 2026',
    author: 'CV Mekanikal Terpadu (Demo)',
    floorLabel: 'Level 2 (+3.20 m)',
    areaId: 'area-a04-level2',
    areaName: 'Level 2 Studio',
    departmentIds: [elecId, plumbId],
    departmentNames: ['Electrical', 'Plumbing'],
    isCombinedElectricalPlumbing: true,
    classification: 'coordination',
    isSuperseded: false,
    scaleLabel: '1:50 (mm)',
    hasVerifiedNorth: true,
    northAngleDeg: 0,
    previewSrc: null,
    modelPreviewState: 'processing',
    modelPreviewReason: 'Extracting Level 2 coordinated riser locations (queued behind A-04 verification).',
    processingJobId: 'job-demo-mep-102',
    notes: ['Page 2 of Paviliun-MEP-101-Coordinated.pdf linked to Level 2 Studio.'],
    transcription: makeTranscription({
      sheetCode: 'MEP-102',
      title: 'Level 2 Electrical & Plumbing Coordination',
      pageNumber: 2,
      totalPages: 2,
      revision: 'R01',
      issueDate: '19 Nov 2026',
      author: 'CV Mekanikal Terpadu (Demo)',
      disciplineLabel: 'Electrical + Plumbing (Coordinated)',
      projectName: 'Paviliun Kerja',
      floorLabel: 'Level 2 (+3.20 m)',
      purpose: 'Upper level combined service coordination',
      scaleLabel: '1:50 · millimeters (mm)',
      gridAxes: 'Axes 1–3, A–C',
      levelsDatum: 'FFL +3.20 m',
      northRef: 'True North 0°',
      dimensions: 'Not specified on this sheet.',
      sectionsRef: 'Linked to MEP-101',
      namedElements: 'Sub-panel SDP-2, Roof Drain RD-01',
      symbolsNote: 'Standard MEP legend',
      scheduleNote: 'Not specified on this sheet.',
      materialSpecs: 'Not specified on this sheet.',
      mepRoutingNote: 'Needs review — schematic upper-level branches.',
      sourceFileName: 'Paviliun-MEP-101-Coordinated.pdf',
      reviewStatus: 'Processing',
    }),
    isDemoFixture: true,
  });

  // 7. Multi-page Structural PDF (6 pages sharing src-struct-set) + additional Civil sheets (14 total)
  const civilSpecs: Array<{ code: string; title: string; floor: string; areaId: string; areaName: string; cls: BlueprintSheetClassification; file: string; page: number; pages: number; previewState: BlueprintModelPreviewState; reason?: string }> = [
    { code: 'S-101', title: 'Foundation & Tie-Beam Layout', floor: 'Ground Floor (0.00 m)', areaId: DEFAULT_AREA_ID, areaName: 'Ground Floor', cls: 'plan', file: 'Paviliun-Structural-Set.pdf', page: 1, pages: 6, previewState: 'reference_only', reason: 'Substructure reference sheet supporting Ground Floor.' },
    { code: 'S-102', title: 'Ground Column & Shear Grid', floor: 'Ground Floor (0.00 m)', areaId: DEFAULT_AREA_ID, areaName: 'Ground Floor', cls: 'plan', file: 'Paviliun-Structural-Set.pdf', page: 2, pages: 6, previewState: 'orbitable' },
    { code: 'S-103', title: 'Level 2 Slab Framing Plan', floor: 'Level 2 (+3.20 m)', areaId: 'area-a04-level2', areaName: 'Level 2 Studio', cls: 'plan', file: 'Paviliun-Structural-Set.pdf', page: 3, pages: 6, previewState: 'needs_review', reason: 'Awaiting slab thickness sign-off before 3D update.' },
    { code: 'S-104', title: 'Roof Truss & Ring Beam Layout', floor: 'Roof (+6.40 m)', areaId: 'area-a04-level2', areaName: 'Level 2 Studio', cls: 'plan', file: 'Paviliun-Structural-Set.pdf', page: 4, pages: 6, previewState: 'reference_only', reason: 'Roof framing reference sheet.' },
    { code: 'S-105', title: 'Column & Beam Reinforcement Schedule', floor: 'All Levels', areaId: DEFAULT_AREA_ID, areaName: 'Whole Building', cls: 'schedule', file: 'Paviliun-Structural-Set.pdf', page: 5, pages: 6, previewState: 'reference_only', reason: 'Schedule sheet (no standalone 3D geometry).' },
    { code: 'S-106', title: 'Typical Beam-Column Joint Details', floor: 'All Levels', areaId: DEFAULT_AREA_ID, areaName: 'Whole Building', cls: 'detail', file: 'Paviliun-Structural-Set.pdf', page: 6, pages: 6, previewState: 'reference_only', reason: '2D construction detail sheet.' },
    { code: 'S-107', title: 'Ruang Rapat Partition Anchorage', floor: 'Ground Floor (0.00 m)', areaId: DEFAULT_AREA_ID, areaName: 'Ground Floor', cls: 'detail', file: 'Paviliun-S107-Partition.pdf', page: 1, pages: 1, previewState: 'reference_only', reason: 'Detail sheet.' },
    { code: 'S-108', title: 'Ruang Rapat Partition Anchorage', floor: 'Level 2 (+3.20 m)', areaId: 'area-a04-level2', areaName: 'Level 2 Studio', cls: 'detail', file: 'Paviliun-S108-Partition-L2.pdf', page: 1, pages: 1, previewState: 'failed', reason: 'Source scan DPI too low for automated axis detection. Upload a clearer scan or retry.' },
    { code: 'S-109', title: 'Staircase Stringer & Landing Section', floor: 'Ground Floor / Level 2', areaId: DEFAULT_AREA_ID, areaName: 'Ground Floor', cls: 'section', file: 'Paviliun-S109-Stair.pdf', page: 1, pages: 1, previewState: 'reference_only', reason: 'Section drawing.' },
    { code: 'S-110', title: 'Perimeter Drainage Apron Detail', floor: 'Ground Floor (0.00 m)', areaId: DEFAULT_AREA_ID, areaName: 'Ground Floor', cls: 'detail', file: 'Paviliun-S110-Apron.pdf', page: 1, pages: 1, previewState: 'reference_only', reason: 'Site edge detail.' },
    { code: 'S-111', title: 'Lintel Beam Schedule (P1–J3)', floor: 'Ground Floor (0.00 m)', areaId: DEFAULT_AREA_ID, areaName: 'Ground Floor', cls: 'schedule', file: 'Paviliun-S111-Lintels.pdf', page: 1, pages: 1, previewState: 'reference_only', reason: 'Schedule sheet.' },
    { code: 'S-112', title: 'Waterproofing Curb & Parapet Detail', floor: 'Level 2 (+3.20 m)', areaId: 'area-a04-level2', areaName: 'Level 2 Studio', cls: 'detail', file: 'Paviliun-S112-Parapet.pdf', page: 1, pages: 1, previewState: 'reference_only', reason: 'Detail sheet.' },
    { code: 'S-113', title: 'Expansion Joint Section', floor: 'Ground Floor (0.00 m)', areaId: DEFAULT_AREA_ID, areaName: 'Ground Floor', cls: 'section', file: 'Paviliun-S113-Joint.pdf', page: 1, pages: 1, previewState: 'reference_only', reason: 'Section drawing.' },
    { code: 'S-114', title: 'Site Setting-Out & Benchmark Plan', floor: 'Ground Floor (0.00 m)', areaId: DEFAULT_AREA_ID, areaName: 'Ground Floor', cls: 'plan', file: 'Paviliun-S114-SettingOut.pdf', page: 1, pages: 1, previewState: 'reference_only', reason: 'Survey benchmark sheet.' },
  ];

  for (const s of civilSpecs) {
    sheets.push({
      id: `bp-${s.code.toLowerCase()}`,
      projectId,
      sourceFileId: `src-${s.file.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      sourceFileName: s.file,
      pageNumber: s.page,
      totalPages: s.pages,
      sheetCode: s.code,
      title: s.title,
      revision: 'R00',
      issueDate: '18 Nov 2026',
      author: 'PT Struktur Mandiri (Demo)',
      floorLabel: s.floor,
      areaId: s.areaId,
      areaName: s.areaName,
      departmentIds: [civilId],
      departmentNames: ['Civil'],
      isCombinedElectricalPlumbing: false,
      classification: s.cls,
      isSuperseded: false,
      scaleLabel: s.cls === 'detail' ? '1:20 (mm)' : s.cls === 'schedule' ? 'NTS' : '1:50 (mm)',
      hasVerifiedNorth: s.cls === 'plan',
      northAngleDeg: s.cls === 'plan' ? 0 : null,
      previewSrc: null,
      modelPreviewState: s.previewState,
      modelPreviewReason: s.reason,
      modelVersionId: s.previewState === 'orbitable' ? 'a03-r00-demo-v1' : null,
      notes: [`Civil/Structural ${s.cls} sheet (${s.file}, p.${s.page}/${s.pages}).`],
      transcription: makeTranscription({
        sheetCode: s.code,
        title: s.title,
        pageNumber: s.page,
        totalPages: s.pages,
        revision: 'R00',
        issueDate: '18 Nov 2026',
        author: 'PT Struktur Mandiri (Demo)',
        disciplineLabel: 'Civil',
        projectName: 'Paviliun Kerja',
        floorLabel: s.floor,
        purpose: `${s.cls.charAt(0).toUpperCase() + s.cls.slice(1)} issue`,
        scaleLabel: s.cls === 'detail' ? '1:20 (mm)' : s.cls === 'schedule' ? 'Not to scale (NTS)' : '1:50 (mm)',
        gridAxes: 'Axes 1–3, A–C',
        levelsDatum: s.floor,
        northRef: s.cls === 'plan' ? 'True North 0°' : 'Not specified on this sheet.',
        dimensions: s.cls === 'schedule' ? 'Not specified on this sheet.' : 'Per structural grid 8,400 × 6,000 mm',
        sectionsRef: 'Cross-referenced with A-03',
        namedElements: s.title,
        symbolsNote: 'Standard structural notation',
        scheduleNote: s.cls === 'schedule' ? 'Included on sheet' : 'Not specified on this sheet.',
        materialSpecs: 'Concrete K-250 / Rebar BJTS 420B',
        sourceFileName: s.file,
        reviewStatus: s.previewState === 'failed' ? 'Extraction failed — retry available' : 'Issued',
      }),
      isDemoFixture: true,
    });
  }

  // 8. Supplemental Electrical sheets (14 sheets: E-101..E-114)
  const elecTitles = [
    'Main Distribution Panel Single-Line Diagram',
    'Ground Floor Lighting Plan',
    'Ground Floor Power Socket Layout',
    'Level 2 Lighting Plan',
    'Level 2 Power Socket Layout',
    'Data & LAN Trunking Plan',
    'CCTV & Access Control Points',
    'Emergency Exit & Backup Lighting',
    'Earthing & Lightning Protection Grid',
    'Air Conditioning Power Isolators',
    'Panel Schedule MDP-1',
    'Panel Schedule SDP-2',
    'Conduit Wall Chase Typical Detail',
    'External Bollard & Facade Lighting',
  ];
  elecTitles.forEach((title, idx) => {
    const num = 101 + idx;
    const isLevel2 = title.includes('Level 2') || title.includes('SDP-2');
    const cls: BlueprintSheetClassification = title.includes('Schedule') || title.includes('Diagram')
      ? 'schedule'
      : title.includes('Detail')
        ? 'detail'
        : 'plan';
    sheets.push({
      id: `bp-e-${num}`,
      projectId,
      sourceFileId: 'src-elec-supplemental',
      sourceFileName: 'Paviliun-Electrical-Supplemental.pdf',
      pageNumber: idx + 1,
      totalPages: elecTitles.length,
      sheetCode: `E-${num}`,
      title,
      revision: 'R00',
      issueDate: '19 Nov 2026',
      author: 'CV Mekanikal Terpadu (Demo)',
      floorLabel: isLevel2 ? 'Level 2 (+3.20 m)' : 'Ground Floor (0.00 m)',
      areaId: isLevel2 ? 'area-a04-level2' : DEFAULT_AREA_ID,
      areaName: isLevel2 ? 'Level 2 Studio' : 'Ground Floor',
      departmentIds: [elecId],
      departmentNames: ['Electrical'],
      isCombinedElectricalPlumbing: false,
      classification: cls,
      isSuperseded: false,
      scaleLabel: cls === 'schedule' ? 'NTS' : '1:50 (mm)',
      hasVerifiedNorth: cls === 'plan',
      northAngleDeg: cls === 'plan' ? 0 : null,
      previewSrc: null,
      modelPreviewState: 'reference_only',
      modelPreviewReason: 'Supplemental electrical drawing — references coordinated area model.',
      notes: [`Supplemental Electrical sheet (page ${idx + 1} of ${elecTitles.length}).`],
      transcription: makeTranscription({
        sheetCode: `E-${num}`,
        title,
        pageNumber: idx + 1,
        totalPages: elecTitles.length,
        revision: 'R00',
        issueDate: '19 Nov 2026',
        author: 'CV Mekanikal Terpadu (Demo)',
        disciplineLabel: 'Electrical',
        projectName: 'Paviliun Kerja',
        floorLabel: isLevel2 ? 'Level 2 (+3.20 m)' : 'Ground Floor (0.00 m)',
        purpose: 'Supplemental electrical distribution',
        scaleLabel: cls === 'schedule' ? 'Not to scale (NTS)' : '1:50 (mm)',
        gridAxes: cls === 'plan' ? 'Axes 1–3, A–C' : 'Not specified on this sheet.',
        levelsDatum: 'Switch height +1,250 mm; Socket height +350 mm',
        northRef: cls === 'plan' ? 'True North 0°' : 'Not specified on this sheet.',
        dimensions: 'Not specified on this sheet.',
        sectionsRef: 'Coordinate with MEP-101',
        namedElements: title,
        symbolsNote: 'IEC 60617 electrical symbols',
        scheduleNote: cls === 'schedule' ? 'Circuit breaker load table' : 'See E-111 / E-112',
        materialSpecs: 'NYM 3×2.5 mm² in 20 mm PVC conduit',
        mepRoutingNote: 'Schematic circuit linework — physical tray/conduit routing confirmed on site.',
        sourceFileName: 'Paviliun-Electrical-Supplemental.pdf',
        reviewStatus: 'Issued supplemental sheet',
      }),
      isDemoFixture: true,
    });
  });

  // 9. Supplemental Plumbing sheets (12 sheets: P-101..P-112)
  const plumbTitles = [
    'Cold Water Supply Schematic & Valve Schedule',
    'Ground Floor Domestic Water Layout',
    'Ground Floor Waste & Vent Piping',
    'Level 2 Domestic Water Layout',
    'Level 2 Waste & Stormwater Drainage',
    'Roof Gutter & Downpipe Plan',
    'Septic Tank & Grease Trap Details',
    'Booster Pump & Roof Tank Piping',
    'Pantry Sink & Floor Drain Detail',
    'Sanitary Riser Isometric Diagram',
    'Stormwater Soakpit Section',
    'Fire Extinguisher & Hydrant Cabinet Plan',
  ];
  plumbTitles.forEach((title, idx) => {
    const num = 101 + idx;
    const isLevel2 = title.includes('Level 2') || title.includes('Roof');
    const cls: BlueprintSheetClassification = title.includes('Schedule') || title.includes('Isometric')
      ? 'schedule'
      : title.includes('Section')
        ? 'section'
        : title.includes('Detail')
          ? 'detail'
          : 'plan';
    sheets.push({
      id: `bp-p-${num}`,
      projectId,
      sourceFileId: 'src-plumb-supplemental',
      sourceFileName: 'Paviliun-Plumbing-Supplemental.pdf',
      pageNumber: idx + 1,
      totalPages: plumbTitles.length,
      sheetCode: `P-${num}`,
      title,
      revision: 'R00',
      issueDate: '19 Nov 2026',
      author: 'CV Mekanikal Terpadu (Demo)',
      floorLabel: isLevel2 ? 'Level 2 (+3.20 m)' : 'Ground Floor (0.00 m)',
      areaId: isLevel2 ? 'area-a04-level2' : DEFAULT_AREA_ID,
      areaName: isLevel2 ? 'Level 2 Studio' : 'Ground Floor',
      departmentIds: [plumbId],
      departmentNames: ['Plumbing'],
      isCombinedElectricalPlumbing: false,
      classification: cls,
      isSuperseded: false,
      scaleLabel: cls === 'schedule' ? 'NTS' : '1:50 (mm)',
      hasVerifiedNorth: cls === 'plan',
      northAngleDeg: cls === 'plan' ? 0 : null,
      previewSrc: null,
      modelPreviewState: 'reference_only',
      modelPreviewReason: 'Supplemental plumbing drawing — references coordinated area model.',
      notes: [`Supplemental Plumbing sheet (page ${idx + 1} of ${plumbTitles.length}).`],
      transcription: makeTranscription({
        sheetCode: `P-${num}`,
        title,
        pageNumber: idx + 1,
        totalPages: plumbTitles.length,
        revision: 'R00',
        issueDate: '19 Nov 2026',
        author: 'CV Mekanikal Terpadu (Demo)',
        disciplineLabel: 'Plumbing',
        projectName: 'Paviliun Kerja',
        floorLabel: isLevel2 ? 'Level 2 (+3.20 m)' : 'Ground Floor (0.00 m)',
        purpose: 'Supplemental plumbing layout',
        scaleLabel: cls === 'schedule' ? 'Not to scale (NTS)' : '1:50 (mm)',
        gridAxes: cls === 'plan' ? 'Axes 1–3, A–C' : 'Not specified on this sheet.',
        levelsDatum: 'Minimum gravity slope 1.5%',
        northRef: cls === 'plan' ? 'True North 0°' : 'Not specified on this sheet.',
        dimensions: 'Not specified on this sheet.',
        sectionsRef: 'Coordinate with MEP-101',
        namedElements: title,
        symbolsNote: 'CW/HW/Waste/Vent flow arrows',
        scheduleNote: cls === 'schedule' ? 'Valve & pipe diameter table' : 'See P-101',
        materialSpecs: 'PPR PN-16 supply; uPVC AW 100 mm soil & waste',
        mepRoutingNote: 'Schematic piping route — verify invert slope prior to slab pour.',
        sourceFileName: 'Paviliun-Plumbing-Supplemental.pdf',
        reviewStatus: 'Issued supplemental sheet',
      }),
      isDemoFixture: true,
    });
  });

  // 10. Finishing sheets (15 sheets: F-101..F-115 -> total 7 + 14 + 14 + 12 + 15 = 62 sheets!)
  const finishingTitles = [
    'Ground Floor Finish & Skim-Coat Schedule',
    'Ground Floor Reflected Ceiling Plan',
    'Ground Floor Tile Setting-Out Plan',
    'Ruang Rapat Acoustic Wall Elevation',
    'Ruang Kerja Built-In Desk Joinery',
    'Ruang Arsip Shelving Elevation',
    'Level 2 Finish & Skim-Coat Schedule',
    'Level 2 Reflected Ceiling Plan',
    'Level 2 Timber Decking Layout',
    'Interior Door Leaf & Hardware Schedule',
    'Aluminum Window Frame Jamb Details',
    'Skirting & Wall-Floor Junction Detail',
    'Exterior Paint Color & Texture Key',
    'Signage & Wayfinding Placement',
    'Final Handover Punch-List Zones',
  ];
  finishingTitles.forEach((title, idx) => {
    const num = 101 + idx;
    const isLevel2 = title.includes('Level 2');
    const cls: BlueprintSheetClassification = title.includes('Schedule')
      ? 'schedule'
      : title.includes('Detail')
        ? 'detail'
        : title.includes('Elevation')
          ? 'elevation'
          : 'plan';
    // Make F-114 demonstrate graceful missing preview handling in the 62-sheet lightbox!
    const missingPreview = num === 114;
    sheets.push({
      id: `bp-f-${num}`,
      projectId,
      sourceFileId: 'src-finishing-set',
      sourceFileName: 'Paviliun-Finishing-Set.pdf',
      pageNumber: idx + 1,
      totalPages: finishingTitles.length,
      sheetCode: `F-${num}`,
      title,
      revision: 'R00',
      issueDate: '20 Nov 2026',
      author: 'Studio Interior Lokal (Demo)',
      floorLabel: isLevel2 ? 'Level 2 (+3.20 m)' : 'Ground Floor (0.00 m)',
      areaId: isLevel2 ? 'area-a04-level2' : DEFAULT_AREA_ID,
      areaName: isLevel2 ? 'Level 2 Studio' : 'Ground Floor',
      departmentIds: [finishId],
      departmentNames: ['Finishing'],
      isCombinedElectricalPlumbing: false,
      classification: cls,
      isSuperseded: false,
      scaleLabel: cls === 'schedule' ? 'NTS' : cls === 'detail' ? '1:10 (mm)' : '1:50 (mm)',
      hasVerifiedNorth: cls === 'plan',
      northAngleDeg: cls === 'plan' ? 0 : null,
      previewSrc: null,
      previewMissingReason: missingPreview
        ? 'Preview thumbnail not yet rendered for F-114 — original PDF source remains accessible.'
        : null,
      modelPreviewState: 'reference_only',
      modelPreviewReason: 'Finishing specification sheet — anchors to verified architectural wall surfaces.',
      notes: [`Finishing ${cls} sheet (page ${idx + 1} of ${finishingTitles.length}).`],
      transcription: makeTranscription({
        sheetCode: `F-${num}`,
        title,
        pageNumber: idx + 1,
        totalPages: finishingTitles.length,
        revision: 'R00',
        issueDate: '20 Nov 2026',
        author: 'Studio Interior Lokal (Demo)',
        disciplineLabel: 'Finishing',
        projectName: 'Paviliun Kerja',
        floorLabel: isLevel2 ? 'Level 2 (+3.20 m)' : 'Ground Floor (0.00 m)',
        purpose: 'Interior & exterior finishing specification',
        scaleLabel: cls === 'schedule' ? 'Not to scale (NTS)' : '1:50 (mm)',
        gridAxes: cls === 'plan' ? 'Axes 1–3, A–C' : 'Not specified on this sheet.',
        levelsDatum: 'Ceiling +2,850 mm clear',
        northRef: cls === 'plan' ? 'True North 0°' : 'Not specified on this sheet.',
        dimensions: '600 × 600 mm porcelain tile module',
        sectionsRef: 'Cross-referenced with A-03 / A-04',
        namedElements: title,
        symbolsNote: 'Finish tag hexagons (FL-01, WL-02, CL-01)',
        scheduleNote: cls === 'schedule' ? 'Room-by-room finish matrix' : 'See F-101 / F-107',
        materialSpecs: 'Skim coat 3 mm + 2 coats low-VOC matte emulsion',
        sourceFileName: 'Paviliun-Finishing-Set.pdf',
        reviewStatus: missingPreview ? 'Preview pending' : 'Issued',
      }),
      isDemoFixture: true,
    });
  });

  return sheets;
}
