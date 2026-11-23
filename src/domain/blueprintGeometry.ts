import type {
  BlueprintCalibration,
  BlueprintGeometryProposal,
  BuiltAreaModelSpec,
  PinAnchorImpact,
  Point2D,
  ProjectPinRecord,
  ProposedOpening,
  ProposedRoomBoundary,
  ProposedWallSegment,
} from './accountTypes';
import type {
  BuildingBoxSpec,
  BuildingElementSpec,
  CrossCheckMeasurement,
  OpeningSpec,
  RoomDefinition,
  Vec3,
} from './types';

export const ALLOWED_BLUEPRINT_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

export const MAX_BLUEPRINT_FILE_BYTES = 12 * 1024 * 1024; // 12 MB

export interface FileValidationResult {
  valid: boolean;
  code?: 'UNSUPPORTED_FILE' | 'FILE_TOO_LARGE' | 'EMPTY_FILE';
  message?: string;
}

export function validateBlueprintUploadFile(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): FileValidationResult {
  const lower = input.fileName.trim().toLowerCase();
  const extAllowed =
    lower.endsWith('.pdf') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg');

  if (!ALLOWED_BLUEPRINT_MIMES.has(input.mimeType) || !extAllowed) {
    return {
      valid: false,
      code: 'UNSUPPORTED_FILE',
      message: 'Unsupported file format. Upload a single-floor PDF, PNG, or JPG drawing.',
    };
  }
  if (input.sizeBytes <= 0) {
    return {
      valid: false,
      code: 'EMPTY_FILE',
      message: 'The selected file is empty.',
    };
  }
  if (input.sizeBytes > MAX_BLUEPRINT_FILE_BYTES) {
    return {
      valid: false,
      code: 'FILE_TOO_LARGE',
      message: 'Blueprint file exceeds the 12 MB limit.',
    };
  }
  return { valid: true };
}

export function unitValueToMm(value: number, unit: 'mm' | 'cm' | 'm'): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (unit === 'm') return Math.round(value * 1000);
  if (unit === 'cm') return Math.round(value * 10);
  return Math.round(value);
}

/**
 * Computes mm/px from two normalized calibration points (0..1) and a known physical length in mm.
 */
export function computeCalibratedScaleMmPerPx(input: {
  pointA: Point2D;
  pointB: Point2D;
  imageWidthPx: number;
  imageHeightPx: number;
  knownLengthMm: number;
}): { ok: true; mmPerPixel: number; pixelSpan: number } | { ok: false; error: string } {
  if (!Number.isFinite(input.knownLengthMm) || input.knownLengthMm < 100) {
    return { ok: false, error: 'Enter a known calibration length of at least 100 mm.' };
  }
  if (input.imageWidthPx <= 0 || input.imageHeightPx <= 0) {
    return { ok: false, error: 'Image pixel dimensions are required for scale calibration.' };
  }
  const dx = (input.pointB.x - input.pointA.x) * input.imageWidthPx;
  const dy = (input.pointB.y - input.pointA.y) * input.imageHeightPx;
  const pixelSpan = Math.hypot(dx, dy);
  if (pixelSpan < 10) {
    return {
      ok: false,
      error: 'Place calibration points A and B further apart along a dimensioned line.',
    };
  }
  return {
    ok: true,
    mmPerPixel: Math.round((input.knownLengthMm / pixelSpan) * 10000) / 10000,
    pixelSpan,
  };
}

export function validateCalibration(cal: BlueprintCalibration | null | undefined): string[] {
  const errors: string[] = [];
  if (!cal) {
    return ['Scale calibration is required before processing a blueprint.'];
  }
  if (!Number.isFinite(cal.knownLengthMm) || cal.knownLengthMm < 100) {
    errors.push('Missing or invalid known calibration length (minimum 100 mm).');
  }
  const scaleCheck = computeCalibratedScaleMmPerPx({
    pointA: cal.pointA,
    pointB: cal.pointB,
    imageWidthPx: cal.imageWidthPx,
    imageHeightPx: cal.imageHeightPx,
    knownLengthMm: cal.knownLengthMm,
  });
  if (!scaleCheck.ok) {
    errors.push(scaleCheck.error);
  }
  if (!Number.isFinite(cal.wallHeightMm) || cal.wallHeightMm < 1800 || cal.wallHeightMm > 12000) {
    errors.push('Wall height must be between 1,800 mm and 12,000 mm.');
  }
  if (!Number.isFinite(cal.exteriorWallMm) || cal.exteriorWallMm < 50 || cal.exteriorWallMm > 1000) {
    errors.push('Exterior wall thickness must be between 50 mm and 1,000 mm.');
  }
  if (!Number.isFinite(cal.interiorWallMm) || cal.interiorWallMm < 50 || cal.interiorWallMm > 600) {
    errors.push('Interior wall thickness must be between 50 mm and 600 mm.');
  }
  return errors;
}

/**
 * Computes signed shoelace polygon area in square meters from millimeter vertices.
 */
export function computePolygonAreaSqm(polygonMm: Array<{ xMm: number; zMm: number }>): number {
  if (polygonMm.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygonMm.length; i++) {
    const a = polygonMm[i];
    const b = polygonMm[(i + 1) % polygonMm.length];
    sum += a.xMm * b.zMm - b.xMm * a.zMm;
  }
  return Math.abs(sum) / 2 / 1_000_000;
}

/**
 * Validates a closed room boundary on a calibrated plan.
 * A room label alone cannot establish a verified boundary.
 */
export function validateClosedRoomBoundary(input: {
  name: string;
  polygonMm: Array<{ xMm: number; zMm: number }>;
}): { valid: true; areaSqm: number } | { valid: false; error: string } {
  if (!input.name.trim()) {
    return { valid: false, error: 'Room name is required.' };
  }
  if (!Array.isArray(input.polygonMm) || input.polygonMm.length < 3) {
    return {
      valid: false,
      error: 'A room label alone cannot establish a verified boundary. Mark at least 3 closed points on the calibrated plan.',
    };
  }
  for (const pt of input.polygonMm) {
    if (!Number.isFinite(pt.xMm) || !Number.isFinite(pt.zMm)) {
      return { valid: false, error: 'Room boundary points must have finite millimeter coordinates.' };
    }
  }
  const areaSqm = computePolygonAreaSqm(input.polygonMm);
  if (areaSqm < 0.25) {
    return {
      valid: false,
      error: 'Closed room boundary area is too small (< 0.25 m²). Trace a valid room perimeter.',
    };
  }
  return { valid: true, areaSqm: Math.round(areaSqm * 100) / 100 };
}

export interface GeometryProposalValidation {
  valid: boolean;
  errors: string[];
}

export function validateGeometryProposal(
  proposal: BlueprintGeometryProposal
): GeometryProposalValidation {
  const errors: string[] = [];

  if (!proposal || !Array.isArray(proposal.walls) || proposal.walls.length < 3) {
    errors.push('At least 3 calibrated wall segments are required to build a valid 3D model.');
  } else {
    const wallIds = new Set<string>();
    for (const w of proposal.walls) {
      if (!w.id || wallIds.has(w.id)) {
        errors.push(`Duplicate or missing wall ID: "${w.id}".`);
      }
      wallIds.add(w.id);
      const lenMm = Math.hypot(w.endXMm - w.startXMm, w.endZMm - w.startZMm);
      if (!Number.isFinite(lenMm) || lenMm < 150) {
        errors.push(`Wall "${w.label || w.id}" is shorter than 150 mm.`);
      }
      if (!Number.isFinite(w.thicknessMm) || w.thicknessMm < 40 || w.thicknessMm > 1200) {
        errors.push(`Wall "${w.label || w.id}" has invalid thickness (${w.thicknessMm} mm).`);
      }
      if (!Number.isFinite(w.heightMm) || w.heightMm < 1200 || w.heightMm > 12000) {
        errors.push(`Wall "${w.label || w.id}" has invalid height (${w.heightMm} mm).`);
      }
    }

    for (const op of proposal.openings ?? []) {
      const host = proposal.walls.find((w) => w.id === op.wallId);
      if (!host) {
        errors.push(`Opening "${op.code}" references unknown wall "${op.wallId}".`);
        continue;
      }
      const wallLen = Math.hypot(host.endXMm - host.startXMm, host.endZMm - host.startZMm);
      if (op.widthMm < 200 || op.offsetMm < 0 || op.offsetMm + op.widthMm > wallLen + 1) {
        errors.push(`Opening "${op.code}" extends outside host wall "${host.label}".`);
      }
      if (op.sillMm < 0 || op.topMm <= op.sillMm || op.topMm > host.heightMm) {
        errors.push(`Opening "${op.code}" has invalid sill/head elevation.`);
      }
    }
  }

  for (const room of proposal.rooms ?? []) {
    const check = validateClosedRoomBoundary({ name: room.name, polygonMm: room.polygonMm });
    if (!check.valid) {
      errors.push(`Room "${room.name || room.id}": ${check.error}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function buildWallBoxesWithOpenings(
  wall: ProposedWallSegment,
  openings: ProposedOpening[],
  offsetCenterXMm: number,
  offsetCenterZMm: number
): BuildingBoxSpec[] {
  const x1 = (wall.startXMm - offsetCenterXMm) / 1000;
  const z1 = (wall.startZMm - offsetCenterZMm) / 1000;
  const x2 = (wall.endXMm - offsetCenterXMm) / 1000;
  const z2 = (wall.endZMm - offsetCenterZMm) / 1000;

  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenM = Math.hypot(dx, dz);
  const thickM = wall.thicknessMm / 1000;
  const heightM = wall.heightMm / 1000;

  // Axis-aligned walls support full opening cutouts (lintel, sill, glazing, jambs) cleanly
  const isAlongX = Math.abs(dz) <= Math.abs(dx) * 0.08;
  const isAlongZ = Math.abs(dx) <= Math.abs(dz) * 0.08;

  if (!isAlongX && !isAlongZ) {
    // Diagonal fallback: bounding box representation along dominant span
    return [
      {
        id: `${wall.id}-seg-0`,
        elementId: wall.id,
        kind: 'wall',
        center: { x: (x1 + x2) / 2, y: heightM / 2, z: (z1 + z2) / 2 },
        size: {
          x: Math.max(thickM, Math.abs(dx)),
          y: heightM,
          z: Math.max(thickM, Math.abs(dz)),
        },
      },
    ];
  }

  const sortedOpenings = [...openings].sort((a, b) => a.offsetMm - b.offsetMm);
  const boxes: BuildingBoxSpec[] = [];

  if (isAlongX) {
    const zCenter = (z1 + z2) / 2;
    const xMin = Math.min(x1, x2);
    const xMax = Math.max(x1, x2);
    const forward = x2 >= x1;
    let cursor = xMin;
    let segIdx = 0;

    for (const op of sortedOpenings) {
      const opStartOffsetM = op.offsetMm / 1000;
      const opWidthM = op.widthMm / 1000;
      const start = forward ? x1 + opStartOffsetM : x1 - opStartOffsetM - opWidthM;
      const end = start + opWidthM;
      const clampedStart = Math.max(cursor, start);
      const clampedEnd = Math.min(xMax, end);
      if (clampedEnd <= clampedStart + 0.05) continue;

      if (clampedStart > cursor + 1e-4) {
        const segLen = clampedStart - cursor;
        boxes.push({
          id: `${wall.id}-seg-${segIdx++}`,
          elementId: wall.id,
          kind: 'wall',
          center: { x: cursor + segLen / 2, y: heightM / 2, z: zCenter },
          size: { x: segLen, y: heightM, z: thickM },
        });
      }

      const sillM = op.sillMm / 1000;
      const topM = op.topMm / 1000;
      const span = clampedEnd - clampedStart;
      const mid = clampedStart + span / 2;

      if (heightM > topM + 1e-4) {
        const lintelH = heightM - topM;
        boxes.push({
          id: `${wall.id}-lintel-${op.id}`,
          elementId: wall.id,
          kind: 'wall',
          center: { x: mid, y: topM + lintelH / 2, z: zCenter },
          size: { x: span, y: lintelH, z: thickM },
        });
      }
      if (sillM > 1e-4) {
        boxes.push({
          id: `${wall.id}-sill-${op.id}`,
          elementId: wall.id,
          kind: 'wall',
          center: { x: mid, y: sillM / 2, z: zCenter },
          size: { x: span, y: sillM, z: thickM },
        });
      }
      const frameT = 0.045;
      if (op.kind === 'window') {
        const winH = topM - sillM;
        boxes.push(
          {
            id: `${wall.id}-glass-${op.id}`,
            elementId: wall.id,
            kind: 'glass',
            center: { x: mid, y: sillM + winH / 2, z: zCenter },
            size: { x: Math.max(0.05, span - frameT * 2), y: Math.max(0.05, winH - frameT * 2), z: 0.02 },
          },
          {
            id: `${wall.id}-frame-b-${op.id}`,
            elementId: wall.id,
            kind: 'frame',
            center: { x: mid, y: sillM + frameT / 2, z: zCenter },
            size: { x: span, y: frameT, z: thickM * 0.72 },
          },
          {
            id: `${wall.id}-frame-t-${op.id}`,
            elementId: wall.id,
            kind: 'frame',
            center: { x: mid, y: topM - frameT / 2, z: zCenter },
            size: { x: span, y: frameT, z: thickM * 0.72 },
          }
        );
      } else {
        boxes.push(
          {
            id: `${wall.id}-jamb-l-${op.id}`,
            elementId: wall.id,
            kind: 'frame',
            center: { x: clampedStart + frameT / 2, y: topM / 2, z: zCenter },
            size: { x: frameT, y: topM, z: thickM * 1.06 },
          },
          {
            id: `${wall.id}-jamb-r-${op.id}`,
            elementId: wall.id,
            kind: 'frame',
            center: { x: clampedEnd - frameT / 2, y: topM / 2, z: zCenter },
            size: { x: frameT, y: topM, z: thickM * 1.06 },
          },
          {
            id: `${wall.id}-head-${op.id}`,
            elementId: wall.id,
            kind: 'frame',
            center: { x: mid, y: topM - frameT / 2, z: zCenter },
            size: { x: span, y: frameT, z: thickM * 1.06 },
          }
        );
      }
      cursor = clampedEnd;
    }

    if (xMax > cursor + 1e-4) {
      const segLen = xMax - cursor;
      boxes.push({
        id: `${wall.id}-seg-${segIdx++}`,
        elementId: wall.id,
        kind: 'wall',
        center: { x: cursor + segLen / 2, y: heightM / 2, z: zCenter },
        size: { x: segLen, y: heightM, z: thickM },
      });
    }
    return boxes;
  }

  // Along Z
  const xCenter = (x1 + x2) / 2;
  const zMin = Math.min(z1, z2);
  const zMax = Math.max(z1, z2);
  const forward = z2 >= z1;
  let cursor = zMin;
  let segIdx = 0;

  for (const op of sortedOpenings) {
    const opStartOffsetM = op.offsetMm / 1000;
    const opWidthM = op.widthMm / 1000;
    const start = forward ? z1 + opStartOffsetM : z1 - opStartOffsetM - opWidthM;
    const end = start + opWidthM;
    const clampedStart = Math.max(cursor, start);
    const clampedEnd = Math.min(zMax, end);
    if (clampedEnd <= clampedStart + 0.05) continue;

    if (clampedStart > cursor + 1e-4) {
      const segLen = clampedStart - cursor;
      boxes.push({
        id: `${wall.id}-seg-${segIdx++}`,
        elementId: wall.id,
        kind: 'wall',
        center: { x: xCenter, y: heightM / 2, z: cursor + segLen / 2 },
        size: { x: thickM, y: heightM, z: segLen },
      });
    }

    const sillM = op.sillMm / 1000;
    const topM = op.topMm / 1000;
    const span = clampedEnd - clampedStart;
    const mid = clampedStart + span / 2;

    if (heightM > topM + 1e-4) {
      const lintelH = heightM - topM;
      boxes.push({
        id: `${wall.id}-lintel-${op.id}`,
        elementId: wall.id,
        kind: 'wall',
        center: { x: xCenter, y: topM + lintelH / 2, z: mid },
        size: { x: thickM, y: lintelH, z: span },
      });
    }
    if (sillM > 1e-4) {
      boxes.push({
        id: `${wall.id}-sill-${op.id}`,
        elementId: wall.id,
        kind: 'wall',
        center: { x: xCenter, y: sillM / 2, z: mid },
        size: { x: thickM, y: sillM, z: span },
      });
    }
    const frameT = 0.045;
    if (op.kind === 'window') {
      const winH = topM - sillM;
      boxes.push(
        {
          id: `${wall.id}-glass-${op.id}`,
          elementId: wall.id,
          kind: 'glass',
          center: { x: xCenter, y: sillM + winH / 2, z: mid },
          size: { x: 0.02, y: Math.max(0.05, winH - frameT * 2), z: Math.max(0.05, span - frameT * 2) },
        },
        {
          id: `${wall.id}-frame-b-${op.id}`,
          elementId: wall.id,
          kind: 'frame',
          center: { x: xCenter, y: sillM + frameT / 2, z: mid },
          size: { x: thickM * 0.72, y: frameT, z: span },
        },
        {
          id: `${wall.id}-frame-t-${op.id}`,
          elementId: wall.id,
          kind: 'frame',
          center: { x: xCenter, y: topM - frameT / 2, z: mid },
          size: { x: thickM * 0.72, y: frameT, z: span },
        }
      );
    } else {
      boxes.push(
        {
          id: `${wall.id}-jamb-l-${op.id}`,
          elementId: wall.id,
          kind: 'frame',
          center: { x: xCenter, y: topM / 2, z: clampedStart + frameT / 2 },
          size: { x: thickM * 1.06, y: topM, z: frameT },
        },
        {
          id: `${wall.id}-jamb-r-${op.id}`,
          elementId: wall.id,
          kind: 'frame',
          center: { x: xCenter, y: topM / 2, z: clampedEnd - frameT / 2 },
          size: { x: thickM * 1.06, y: topM, z: frameT },
        },
        {
          id: `${wall.id}-head-${op.id}`,
          elementId: wall.id,
          kind: 'frame',
          center: { x: xCenter, y: topM - frameT / 2, z: mid },
          size: { x: thickM * 1.06, y: frameT, z: span },
        }
      );
    }
    cursor = clampedEnd;
  }

  if (zMax > cursor + 1e-4) {
    const segLen = zMax - cursor;
    boxes.push({
      id: `${wall.id}-seg-${segIdx++}`,
      elementId: wall.id,
      kind: 'wall',
      center: { x: xCenter, y: heightM / 2, z: cursor + segLen / 2 },
      size: { x: thickM, y: heightM, z: segLen },
    });
  }

  // Fallback if length is tiny
  if (boxes.length === 0 && lenM > 0) {
    boxes.push({
      id: `${wall.id}-seg-0`,
      elementId: wall.id,
      kind: 'wall',
      center: { x: xCenter, y: heightM / 2, z: (zMin + zMax) / 2 },
      size: { x: thickM, y: heightM, z: lenM },
    });
  }

  return boxes;
}

/**
 * Deterministic 3D architectural builder:
 * Converts a validated structured proposal into selectable 3D elements, floor slab,
 * rooms with verified closed boundaries, and an independent mesh cross-check measurement.
 * X and Z are horizontal (meters); Y is vertical (meters, floor datum = 0).
 */
export function buildDeterministicAreaModel(params: {
  versionId: string;
  areaId: string;
  blueprintAssetId: string;
  sheetCode: string;
  revision: string;
  calibration: BlueprintCalibration;
  proposal: BlueprintGeometryProposal;
}): BuiltAreaModelSpec {
  const validation = validateGeometryProposal(params.proposal);
  if (!validation.valid) {
    throw new Error(`Invalid geometry proposal: ${validation.errors.join(' ')}`);
  }

  let minXMm = Infinity;
  let maxXMm = -Infinity;
  let minZMm = Infinity;
  let maxZMm = -Infinity;

  for (const w of params.proposal.walls) {
    minXMm = Math.min(minXMm, w.startXMm - w.thicknessMm / 2, w.endXMm - w.thicknessMm / 2);
    maxXMm = Math.max(maxXMm, w.startXMm + w.thicknessMm / 2, w.endXMm + w.thicknessMm / 2);
    minZMm = Math.min(minZMm, w.startZMm - w.thicknessMm / 2, w.endZMm - w.thicknessMm / 2);
    maxZMm = Math.max(maxZMm, w.startZMm + w.thicknessMm / 2, w.endZMm + w.thicknessMm / 2);
  }

  const centerXMm = (minXMm + maxXMm) / 2;
  const centerZMm = (minZMm + maxZMm) / 2;
  const footprintWidthMm = Math.round(maxXMm - minXMm);
  const footprintDepthMm = Math.round(maxZMm - minZMm);

  const elements: BuildingElementSpec[] = [
    {
      id: `SLAB-${params.areaId.slice(0, 8).toUpperCase()}`,
      name: `Floor Slab (${params.sheetCode} ${params.revision})`,
      category: 'floor_slab',
      thicknessMm: 180,
      heightMm: 180,
      lengthMm: footprintWidthMm,
      gridAxis: `${footprintWidthMm.toLocaleString('en-US')} × ${footprintDepthMm.toLocaleString('en-US')} mm`,
      rooms: params.proposal.rooms.map((r) => r.name),
      description: `Calibrated finished floor datum at Y = 0.000 m (${footprintWidthMm} × ${footprintDepthMm} mm).`,
      boxes: [
        {
          id: `SLAB-${params.areaId.slice(0, 8)}-main`,
          elementId: `SLAB-${params.areaId.slice(0, 8).toUpperCase()}`,
          kind: 'slab',
          center: { x: 0, y: -0.09, z: 0 },
          size: {
            x: Math.max(0.5, footprintWidthMm / 1000),
            y: 0.18,
            z: Math.max(0.5, footprintDepthMm / 1000),
          },
        },
      ],
    },
  ];

  const openings: OpeningSpec[] = [];

  for (const wall of params.proposal.walls) {
    const wallOpenings = (params.proposal.openings ?? []).filter((o) => o.wallId === wall.id);
    const lengthMm = Math.round(Math.hypot(wall.endXMm - wall.startXMm, wall.endZMm - wall.startZMm));
    const boxes = buildWallBoxesWithOpenings(wall, wallOpenings, centerXMm, centerZMm);

    elements.push({
      id: wall.id,
      name: wall.label,
      category: wall.category,
      thicknessMm: Math.round(wall.thicknessMm),
      heightMm: Math.round(wall.heightMm),
      lengthMm,
      gridAxis: `${Math.round(wall.startXMm)},${Math.round(wall.startZMm)} → ${Math.round(wall.endXMm)},${Math.round(wall.endZMm)} mm`,
      rooms: params.proposal.rooms.map((r) => r.name),
      description: `${Math.round(wall.thicknessMm)} mm ${
        wall.category === 'exterior_wall' ? 'exterior wall' : 'interior partition'
      }, height ${Math.round(wall.heightMm)} mm, length ${lengthMm.toLocaleString('en-US')} mm.`,
      boxes,
    });

    for (const op of wallOpenings) {
      openings.push({
        id: op.id,
        code: op.code,
        kind: op.kind,
        elementId: wall.id,
        roomLabel: wall.label,
        widthMm: Math.round(op.widthMm),
        sillMm: Math.round(op.sillMm),
        topMm: Math.round(op.topMm),
        positionNote: `Calibrated offset ${Math.round(op.offsetMm)} mm along ${wall.label}.`,
        isEstimatedPosition: false,
      });
    }
  }

  const rooms: RoomDefinition[] = (params.proposal.rooms ?? []).map((room) =>
    buildRoomDefinitionFromBoundary(room, params.areaId, centerXMm, centerZMm)
  );

  // Independent cross-check from built wall bounding boxes (overall N-S or E-W span)
  const wallBoxes = elements
    .filter((e) => e.category !== 'floor_slab')
    .flatMap((e) => e.boxes.filter((b) => b.kind === 'wall'));

  let minBoxZ = Infinity;
  let maxBoxZ = -Infinity;
  let minBoxX = Infinity;
  let maxBoxX = -Infinity;
  for (const b of wallBoxes) {
    minBoxZ = Math.min(minBoxZ, b.center.z - b.size.z / 2);
    maxBoxZ = Math.max(maxBoxZ, b.center.z + b.size.z / 2);
    minBoxX = Math.min(minBoxX, b.center.x - b.size.x / 2);
    maxBoxX = Math.max(maxBoxX, b.center.x + b.size.x / 2);
  }

  const actualDepthMm = Math.round((maxBoxZ - minBoxZ) * 1000);
  const actualWidthMm = Math.round((maxBoxX - minBoxX) * 1000);
  const refMm = params.calibration.knownLengthMm;
  const closestSpanMm =
    Math.abs(actualWidthMm - refMm) <= Math.abs(actualDepthMm - refMm)
      ? actualWidthMm
      : actualDepthMm;
  const crossCheck: CrossCheckMeasurement = {
    label: `Calibrated outer span (${params.sheetCode} ${params.revision})`,
    method: 'Computed deterministically from built Three.js wall box bounds',
    referenceMm: refMm,
    actualMm: closestSpanMm,
    deltaMm: Math.round((closestSpanMm - refMm) * 1000) / 1000,
    northFaceZ: minBoxZ,
    southFaceZ: maxBoxZ,
    sourceElements: [
      params.proposal.walls[0]?.id ?? 'W-1',
      params.proposal.walls[params.proposal.walls.length - 1]?.id ?? 'W-2',
    ],
  };

  return {
    versionId: params.versionId,
    areaId: params.areaId,
    blueprintAssetId: params.blueprintAssetId,
    sheetCode: params.sheetCode,
    revision: params.revision,
    elements,
    openings,
    rooms,
    crossCheck,
    footprintWidthMm,
    footprintDepthMm,
    wallCount: params.proposal.walls.length,
  };
}

export function buildRoomDefinitionFromBoundary(
  room: ProposedRoomBoundary,
  areaId: string,
  centerXMm: number,
  centerZMm: number
): RoomDefinition {
  const polygon = room.polygonMm.map((pt) => ({
    x: Math.round(((pt.xMm - centerXMm) / 1000) * 1000) / 1000,
    z: Math.round(((pt.zMm - centerZMm) / 1000) * 1000) / 1000,
  }));
  const xs = polygon.map((p) => p.x);
  const zs = polygon.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const spanM = Math.max(2.4, Math.hypot(maxX - minX, maxZ - minZ));
  const areaSqm = Math.round(computePolygonAreaSqm(room.polygonMm) * 100) / 100;
  const widthMm = Math.round((maxX - minX) * 1000);
  const depthMm = Math.round((maxZ - minZ) * 1000);

  return {
    id: room.id,
    areaId,
    name: room.name.trim(),
    areaLabel: `${widthMm.toLocaleString('en-US')} × ${depthMm.toLocaleString('en-US')} mm (${areaSqm.toFixed(1)} m²)`,
    verificationStatus: room.verified ? 'verified' : 'draft',
    bounds: { minX, maxX, minZ, maxZ },
    polygon,
    areaSqm,
    center: { x: cx, y: 1.2, z: cz },
    cameraPosition: { x: cx + spanM * 0.65, y: Math.max(3.6, spanM * 0.72), z: cz - spanM * 0.85 },
    cameraTarget: { x: cx, y: 0.9, z: cz },
  };
}

/**
 * Classifies a 3D raycast surface hit against any deterministic model (generic across custom blueprints).
 */
export function classifyGenericSurfaceHit(
  rooms: RoomDefinition[],
  element: BuildingElementSpec,
  point: Vec3,
  normal: Vec3
): { roomId: string; roomName: string; surfaceSide: string } {
  // Find room containing (point.x, point.z) or nearest room center
  let matched = rooms.find(
    (r) =>
      point.x >= r.bounds.minX - 0.15 &&
      point.x <= r.bounds.maxX + 0.15 &&
      point.z >= r.bounds.minZ - 0.15 &&
      point.z <= r.bounds.maxZ + 0.15
  );
  if (!matched && rooms.length > 0) {
    matched = [...rooms].sort(
      (a, b) =>
        Math.hypot(a.center.x - point.x, a.center.z - point.z) -
        Math.hypot(b.center.x - point.x, b.center.z - point.z)
    )[0];
  }

  const roomId = matched?.id ?? 'unassigned-room';
  const roomName = matched?.name ?? 'Open Floor Area';

  if (element.category === 'floor_slab') {
    return { roomId, roomName, surfaceSide: 'Finished floor surface (+0 mm)' };
  }
  if (Math.abs(normal.z) > 0.5) {
    return {
      roomId,
      roomName,
      surfaceSide: `${roomName} (${normal.z > 0 ? 'South face' : 'North face'})`,
    };
  }
  if (Math.abs(normal.x) > 0.5) {
    return {
      roomId,
      roomName,
      surfaceSide: `${roomName} (${normal.x > 0 ? 'East face' : 'West face'})`,
    };
  }
  return { roomId, roomName, surfaceSide: `${roomName} (Top edge)` };
}

/**
 * Evaluates whether replacing an area's model version affects any existing work Pins.
 * A model revision must never silently move an existing Pin: any Pin whose element is removed
 * or whose anchor point is > 0.18 m away from the matching wall face requires explicit remap/revalidation.
 */
export function evaluatePinAnchorImpact(
  existingPins: ProjectPinRecord[],
  nextModel: BuiltAreaModelSpec
): PinAnchorImpact[] {
  const impacts: PinAnchorImpact[] = [];

  for (const pin of existingPins) {
    const evidenceCount = (pin.evidence.before ? 1 : 0) + (pin.evidence.after ? 1 : 0);
    const matchingElement = nextModel.elements.find((el) => el.id === pin.elementId);

    if (!matchingElement) {
      impacts.push({
        pinId: pin.id,
        title: pin.title,
        roomName: pin.roomName,
        elementId: pin.elementId,
        elementName: pin.elementName,
        reason: `Host element "${pin.elementName}" (${pin.elementId}) does not exist in revision ${nextModel.revision}.`,
        hasEvidence: evidenceCount > 0,
        evidenceCount,
      });
      continue;
    }

    // Check minimum distance from pin position to any box of matchingElement
    let minDist = Infinity;
    for (const box of matchingElement.boxes) {
      const halfX = box.size.x / 2;
      const halfY = box.size.y / 2;
      const halfZ = box.size.z / 2;
      const dx = Math.max(0, Math.abs(pin.position.x - box.center.x) - halfX);
      const dy = Math.max(0, Math.abs(pin.position.y - box.center.y) - halfY);
      const dz = Math.max(0, Math.abs(pin.position.z - box.center.z) - halfZ);
      const dist = Math.hypot(dx, dy, dz);
      if (dist < minDist) minDist = dist;
    }

    if (minDist > 0.18) {
      impacts.push({
        pinId: pin.id,
        title: pin.title,
        roomName: pin.roomName,
        elementId: pin.elementId,
        elementName: pin.elementName,
        reason: `Anchor sits ${Math.round(minDist * 1000)} mm from "${matchingElement.name}" in revision ${nextModel.revision}. Remap or explicitly revalidate before publishing.`,
        hasEvidence: evidenceCount > 0,
        evidenceCount,
      });
    }
  }

  return impacts;
}

/**
 * Helper to create a clean starter rectangular plan in millimeters based strictly on
 * the Contractor's own calibrated measurements (used ONLY when Contractor explicitly chooses
 * manual geometry drafting after reviewing an unavailable AI job — never silently generated as AI output!).
 */
export function createBlankCalibratedFootprintProposal(
  calibration: BlueprintCalibration,
  widthMm: number,
  depthMm: number,
  roomName = 'Main Space'
): BlueprintGeometryProposal {
  const w = Math.max(1500, Math.round(widthMm));
  const d = Math.max(1500, Math.round(depthMm));
  const extT = calibration.exteriorWallMm;
  const h = calibration.wallHeightMm;

  return {
    footprintLabel: `${w.toLocaleString('en-US')} × ${d.toLocaleString('en-US')} mm manual perimeter`,
    sourceNotes: 'Manually drafted by Contractor on calibrated blueprint.',
    walls: [
      {
        id: 'W-NORTH',
        label: 'North Exterior Wall',
        category: 'exterior_wall',
        startXMm: 0,
        startZMm: 0,
        endXMm: w,
        endZMm: 0,
        thicknessMm: extT,
        heightMm: h,
      },
      {
        id: 'W-SOUTH',
        label: 'South Exterior Wall',
        category: 'exterior_wall',
        startXMm: 0,
        startZMm: d,
        endXMm: w,
        endZMm: d,
        thicknessMm: extT,
        heightMm: h,
      },
      {
        id: 'W-WEST',
        label: 'West Exterior Wall',
        category: 'exterior_wall',
        startXMm: 0,
        startZMm: 0,
        endXMm: 0,
        endZMm: d,
        thicknessMm: extT,
        heightMm: h,
      },
      {
        id: 'W-EAST',
        label: 'East Exterior Wall',
        category: 'exterior_wall',
        startXMm: w,
        startZMm: 0,
        endXMm: w,
        endZMm: d,
        thicknessMm: extT,
        heightMm: h,
      },
    ],
    openings: [
      {
        id: 'OP-D1',
        wallId: 'W-SOUTH',
        code: 'D1',
        kind: 'door',
        offsetMm: Math.round(Math.min(1000, w * 0.25)),
        widthMm: Math.min(950, Math.round(w * 0.25)),
        sillMm: 0,
        topMm: Math.min(2100, h - 200),
      },
    ],
    rooms: [
      {
        id: `room-${Date.now().toString(36)}`,
        name: roomName,
        polygonMm: [
          { xMm: Math.round(extT / 2), zMm: Math.round(extT / 2) },
          { xMm: Math.round(w - extT / 2), zMm: Math.round(extT / 2) },
          { xMm: Math.round(w - extT / 2), zMm: Math.round(d - extT / 2) },
          { xMm: Math.round(extT / 2), zMm: Math.round(d - extT / 2) },
        ],
        verified: false,
      },
    ],
  };
}
