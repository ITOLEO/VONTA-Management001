import type {
  BuildingBoxSpec,
  BuildingElementSpec,
  CrossCheckMeasurement,
  OpeningSpec,
  RoomDefinition,
  RoomId,
  Vec3,
} from './types';

/**
 * Deterministic architectural geometry specification for Paviliun Kerja (A-03 R00).
 * World units: meters (X = East+, Z = South+, Y = Up+).
 *
 * Grid Axes:
 * - Axis 1 (West):  X = -4.200 m
 * - Axis 2 (Mid):   X =  0.000 m  (4,200 mm from Axis 1)
 * - Axis 3 (East):  X = +4.200 m  (4,200 mm from Axis 2; 8,400 mm total)
 * - Axis A (North): Z = -3.000 m
 * - Axis B (Mid):   Z =  0.000 m  (3,000 mm from Axis A)
 * - Axis C (South): Z = +3.000 m  (3,000 mm from Axis B; 6,000 mm total)
 *
 * Wall thicknesses:
 * - Exterior walls: 0.150 m (150 mm), centered on exterior axes 1, 3, A, C.
 * - Interior partitions: 0.100 m (100 mm), centered on interior axes 2 and B (east bay).
 * - Finished floor: Y = 0.000 m. Top of all walls: Y = +3.200 m.
 */

export const A03_DIMENSIONS = {
  axisSpanXMm: 8400,
  bayWestMm: 4200,
  bayEastMm: 4200,
  axisSpanZMm: 6000,
  bayNorthMm: 3000,
  baySouthMm: 3000,
  exteriorWallMm: 150,
  interiorPartitionMm: 100,
  wallHeightMm: 3200,
  finishedFloorMm: 0,
  openingTopMm: 2100,
  windowSillMm: 900,
  crossCheckRefMm: 2875,
} as const;

const EXT_T = A03_DIMENSIONS.exteriorWallMm / 1000; // 0.150 m
const EXT_HALF = EXT_T / 2; // 0.075 m
const PART_T = A03_DIMENSIONS.interiorPartitionMm / 1000; // 0.100 m
const PART_HALF = PART_T / 2; // 0.050 m
const WALL_H = A03_DIMENSIONS.wallHeightMm / 1000; // 3.200 m
const OPEN_TOP = A03_DIMENSIONS.openingTopMm / 1000; // 2.100 m
const WIN_SILL = A03_DIMENSIONS.windowSillMm / 1000; // 0.900 m

const AXIS_1 = -4.2;
const AXIS_2 = 0.0;
const AXIS_3 = 4.2;
const AXIS_A = -3.0;
const AXIS_B = 0.0;
const AXIS_C = 3.0;

interface WallOpeningInterval {
  id: string;
  code: 'P1' | 'P2' | 'J1' | 'J2' | 'J3';
  kind: 'door' | 'window';
  start: number; // along wall primary axis (meters)
  end: number;
  sill: number;
  top: number;
}

function buildSegmentedWallAlongX(params: {
  elementId: string;
  zCenter: number;
  thickness: number;
  xMin: number;
  xMax: number;
  height: number;
  openings: WallOpeningInterval[];
}): BuildingBoxSpec[] {
  const { elementId, zCenter, thickness, xMin, xMax, height, openings } = params;
  const sorted = [...openings].sort((a, b) => a.start - b.start);
  const boxes: BuildingBoxSpec[] = [];
  let cursor = xMin;
  let segIdx = 0;

  for (const op of sorted) {
    if (op.start > cursor + 1e-6) {
      const len = op.start - cursor;
      boxes.push({
        id: `${elementId}-seg-${segIdx++}`,
        elementId,
        kind: 'wall',
        center: { x: cursor + len / 2, y: height / 2, z: zCenter },
        size: { x: len, y: height, z: thickness },
      });
    }

    const opLen = op.end - op.start;
    const opMid = op.start + opLen / 2;

    // Lintel above opening
    if (height > op.top + 1e-6) {
      const lintelH = height - op.top;
      boxes.push({
        id: `${elementId}-lintel-${op.id}`,
        elementId,
        kind: 'wall',
        center: { x: opMid, y: op.top + lintelH / 2, z: zCenter },
        size: { x: opLen, y: lintelH, z: thickness },
      });
    }

    // Sill below window
    if (op.sill > 1e-6) {
      boxes.push({
        id: `${elementId}-sill-${op.id}`,
        elementId,
        kind: 'wall',
        center: { x: opMid, y: op.sill / 2, z: zCenter },
        size: { x: opLen, y: op.sill, z: thickness },
      });
    }

    // Glazing / frame visual cues
    const frameThick = 0.045;
    if (op.kind === 'window') {
      const winH = op.top - op.sill;
      boxes.push({
        id: `${elementId}-glass-${op.id}`,
        elementId,
        kind: 'glass',
        center: { x: opMid, y: op.sill + winH / 2, z: zCenter },
        size: { x: opLen - frameThick * 2, y: winH - frameThick * 2, z: 0.02 },
      });
      // Mullion + bottom/top frame bars
      boxes.push(
        {
          id: `${elementId}-frame-b-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: opMid, y: op.sill + frameThick / 2, z: zCenter },
          size: { x: opLen, y: frameThick, z: thickness * 0.72 },
        },
        {
          id: `${elementId}-frame-t-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: opMid, y: op.top - frameThick / 2, z: zCenter },
          size: { x: opLen, y: frameThick, z: thickness * 0.72 },
        },
        {
          id: `${elementId}-frame-m-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: opMid, y: op.sill + winH / 2, z: zCenter },
          size: { x: frameThick, y: winH, z: thickness * 0.6 },
        }
      );
    } else {
      // Door jambs + header frame
      boxes.push(
        {
          id: `${elementId}-jamb-l-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: op.start + frameThick / 2, y: op.top / 2, z: zCenter },
          size: { x: frameThick, y: op.top, z: thickness * 1.06 },
        },
        {
          id: `${elementId}-jamb-r-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: op.end - frameThick / 2, y: op.top / 2, z: zCenter },
          size: { x: frameThick, y: op.top, z: thickness * 1.06 },
        },
        {
          id: `${elementId}-head-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: opMid, y: op.top - frameThick / 2, z: zCenter },
          size: { x: opLen, y: frameThick, z: thickness * 1.06 },
        }
      );
    }

    cursor = op.end;
  }

  if (xMax > cursor + 1e-6) {
    const len = xMax - cursor;
    boxes.push({
      id: `${elementId}-seg-${segIdx++}`,
      elementId,
      kind: 'wall',
      center: { x: cursor + len / 2, y: height / 2, z: zCenter },
      size: { x: len, y: height, z: thickness },
    });
  }

  return boxes;
}

function buildSegmentedWallAlongZ(params: {
  elementId: string;
  xCenter: number;
  thickness: number;
  zMin: number;
  zMax: number;
  height: number;
  openings: WallOpeningInterval[];
}): BuildingBoxSpec[] {
  const { elementId, xCenter, thickness, zMin, zMax, height, openings } = params;
  const sorted = [...openings].sort((a, b) => a.start - b.start);
  const boxes: BuildingBoxSpec[] = [];
  let cursor = zMin;
  let segIdx = 0;

  for (const op of sorted) {
    if (op.start > cursor + 1e-6) {
      const len = op.start - cursor;
      boxes.push({
        id: `${elementId}-seg-${segIdx++}`,
        elementId,
        kind: 'wall',
        center: { x: xCenter, y: height / 2, z: cursor + len / 2 },
        size: { x: thickness, y: height, z: len },
      });
    }

    const opLen = op.end - op.start;
    const opMid = op.start + opLen / 2;

    if (height > op.top + 1e-6) {
      const lintelH = height - op.top;
      boxes.push({
        id: `${elementId}-lintel-${op.id}`,
        elementId,
        kind: 'wall',
        center: { x: xCenter, y: op.top + lintelH / 2, z: opMid },
        size: { x: thickness, y: lintelH, z: opLen },
      });
    }

    if (op.sill > 1e-6) {
      boxes.push({
        id: `${elementId}-sill-${op.id}`,
        elementId,
        kind: 'wall',
        center: { x: xCenter, y: op.sill / 2, z: opMid },
        size: { x: thickness, y: op.sill, z: opLen },
      });
    }

    const frameThick = 0.045;
    if (op.kind === 'window') {
      const winH = op.top - op.sill;
      boxes.push(
        {
          id: `${elementId}-glass-${op.id}`,
          elementId,
          kind: 'glass',
          center: { x: xCenter, y: op.sill + winH / 2, z: opMid },
          size: { x: 0.02, y: winH - frameThick * 2, z: opLen - frameThick * 2 },
        },
        {
          id: `${elementId}-frame-b-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: xCenter, y: op.sill + frameThick / 2, z: opMid },
          size: { x: thickness * 0.72, y: frameThick, z: opLen },
        },
        {
          id: `${elementId}-frame-t-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: xCenter, y: op.top - frameThick / 2, z: opMid },
          size: { x: thickness * 0.72, y: frameThick, z: opLen },
        }
      );
    } else {
      boxes.push(
        {
          id: `${elementId}-jamb-l-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: xCenter, y: op.top / 2, z: op.start + frameThick / 2 },
          size: { x: thickness * 1.06, y: op.top, z: frameThick },
        },
        {
          id: `${elementId}-jamb-r-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: xCenter, y: op.top / 2, z: op.end - frameThick / 2 },
          size: { x: thickness * 1.06, y: op.top, z: frameThick },
        },
        {
          id: `${elementId}-head-${op.id}`,
          elementId,
          kind: 'frame',
          center: { x: xCenter, y: op.top - frameThick / 2, z: opMid },
          size: { x: thickness * 1.06, y: frameThick, z: opLen },
        }
      );
    }

    cursor = op.end;
  }

  if (zMax > cursor + 1e-6) {
    const len = zMax - cursor;
    boxes.push({
      id: `${elementId}-seg-${segIdx++}`,
      elementId,
      kind: 'wall',
      center: { x: xCenter, y: height / 2, z: cursor + len / 2 },
      size: { x: thickness, y: height, z: len },
    });
  }

  return boxes;
}

export interface A03ModelBuild {
  versionId: string;
  elements: BuildingElementSpec[];
  openings: OpeningSpec[];
  rooms: RoomDefinition[];
  crossCheck: CrossCheckMeasurement;
}

export function buildA03PaviliunKerjaModel(): A03ModelBuild {
  const outerMinX = AXIS_1 - EXT_HALF; // -4.275
  const outerMaxX = AXIS_3 + EXT_HALF; // +4.275
  const innerMinX = AXIS_1 + EXT_HALF; // -4.125
  const innerMaxX = AXIS_3 - EXT_HALF; // +4.125
  const innerMinZ = AXIS_A + EXT_HALF; // -2.925
  const innerMaxZ = AXIS_C - EXT_HALF; // +2.925

  const openings: OpeningSpec[] = [
    {
      id: 'OP-P1',
      code: 'P1',
      kind: 'door',
      elementId: 'W-EXT-SOUTH',
      roomLabel: 'Ruang Kerja (South exterior)',
      widthMm: 1000,
      sillMm: 0,
      topMm: 2100,
      positionNote: 'Width & elevation from A-03 schedule; horizontal offset visually estimated from plan.',
      isEstimatedPosition: true,
    },
    {
      id: 'OP-P2-RAPAT',
      code: 'P2',
      kind: 'door',
      elementId: 'W-PART-CENTRAL',
      roomLabel: 'Ruang Kerja ↔ Ruang Rapat',
      widthMm: 850,
      sillMm: 0,
      topMm: 2100,
      positionNote: 'Width & elevation from A-03 schedule; along-wall offset visually estimated from plan.',
      isEstimatedPosition: true,
    },
    {
      id: 'OP-P2-ARSIP',
      code: 'P2',
      kind: 'door',
      elementId: 'W-PART-CENTRAL',
      roomLabel: 'Ruang Kerja ↔ Ruang Arsip',
      widthMm: 850,
      sillMm: 0,
      topMm: 2100,
      positionNote: 'Width & elevation from A-03 schedule; along-wall offset visually estimated from plan.',
      isEstimatedPosition: true,
    },
    {
      id: 'OP-J1-KERJA',
      code: 'J1',
      kind: 'window',
      elementId: 'W-EXT-NORTH',
      roomLabel: 'Ruang Kerja (North exterior)',
      widthMm: 1800,
      sillMm: 900,
      topMm: 2100,
      positionNote: 'Width & sill/head from A-03 schedule; horizontal offset visually estimated from plan.',
      isEstimatedPosition: true,
    },
    {
      id: 'OP-J1-RAPAT',
      code: 'J1',
      kind: 'window',
      elementId: 'W-EXT-NORTH',
      roomLabel: 'Ruang Rapat (North exterior)',
      widthMm: 1800,
      sillMm: 900,
      topMm: 2100,
      positionNote: 'Width & sill/head from A-03 schedule; horizontal offset visually estimated from plan.',
      isEstimatedPosition: true,
    },
    {
      id: 'OP-J2-ARSIP',
      code: 'J2',
      kind: 'window',
      elementId: 'W-EXT-SOUTH',
      roomLabel: 'Ruang Arsip (South exterior)',
      widthMm: 1500,
      sillMm: 900,
      topMm: 2100,
      positionNote: 'Width & sill/head from A-03 schedule; horizontal offset visually estimated from plan.',
      isEstimatedPosition: true,
    },
    {
      id: 'OP-J3-KERJA',
      code: 'J3',
      kind: 'window',
      elementId: 'W-EXT-WEST',
      roomLabel: 'Ruang Kerja (West exterior)',
      widthMm: 1200,
      sillMm: 900,
      topMm: 2100,
      positionNote: 'Width & sill/head from A-03 schedule; along-wall offset visually estimated from plan.',
      isEstimatedPosition: true,
    },
  ];

  const elements: BuildingElementSpec[] = [
    {
      id: 'SLAB-FLOOR-01',
      name: 'Ground Floor Slab (Finished Floor 0 mm)',
      category: 'floor_slab',
      thicknessMm: 180,
      heightMm: 180,
      lengthMm: 8550,
      gridAxis: 'Axes 1–3 × A–C',
      rooms: ['Ruang Kerja', 'Ruang Rapat', 'Ruang Arsip'],
      description: 'Finished floor datum at Y = 0.000 m spanning outer wall footprint (8,550 × 6,150 mm).',
      boxes: [
        {
          id: 'SLAB-FLOOR-01-main',
          elementId: 'SLAB-FLOOR-01',
          kind: 'slab',
          center: { x: 0, y: -0.09, z: 0 },
          size: { x: outerMaxX - outerMinX, y: 0.18, z: (AXIS_C + EXT_HALF) - (AXIS_A - EXT_HALF) },
        },
      ],
    },
    {
      id: 'W-EXT-NORTH',
      name: 'North Exterior Wall (Axis A)',
      category: 'exterior_wall',
      thicknessMm: 150,
      heightMm: 3200,
      lengthMm: 8550,
      gridAxis: 'Axis A (1–3)',
      rooms: ['Ruang Kerja', 'Ruang Rapat'],
      description: '150 mm masonry exterior wall along Axis A containing J1 windows for Ruang Kerja and Ruang Rapat.',
      boxes: buildSegmentedWallAlongX({
        elementId: 'W-EXT-NORTH',
        zCenter: AXIS_A,
        thickness: EXT_T,
        xMin: outerMinX,
        xMax: outerMaxX,
        height: WALL_H,
        openings: [
          { id: 'J1-W', code: 'J1', kind: 'window', start: -3.0, end: -1.2, sill: WIN_SILL, top: OPEN_TOP },
          { id: 'J1-E', code: 'J1', kind: 'window', start: 1.2, end: 3.0, sill: WIN_SILL, top: OPEN_TOP },
        ],
      }),
    },
    {
      id: 'W-EXT-SOUTH',
      name: 'South Exterior Wall (Axis C)',
      category: 'exterior_wall',
      thicknessMm: 150,
      heightMm: 3200,
      lengthMm: 8550,
      gridAxis: 'Axis C (1–3)',
      rooms: ['Ruang Kerja', 'Ruang Arsip'],
      description: '150 mm masonry exterior wall along Axis C containing main entry door P1 and window J2.',
      boxes: buildSegmentedWallAlongX({
        elementId: 'W-EXT-SOUTH',
        zCenter: AXIS_C,
        thickness: EXT_T,
        xMin: outerMinX,
        xMax: outerMaxX,
        height: WALL_H,
        openings: [
          { id: 'P1', code: 'P1', kind: 'door', start: -2.95, end: -1.95, sill: 0, top: OPEN_TOP },
          { id: 'J2', code: 'J2', kind: 'window', start: 1.35, end: 2.85, sill: WIN_SILL, top: OPEN_TOP },
        ],
      }),
    },
    {
      id: 'W-EXT-WEST',
      name: 'West Exterior Wall (Axis 1)',
      category: 'exterior_wall',
      thicknessMm: 150,
      heightMm: 3200,
      lengthMm: 5850,
      gridAxis: 'Axis 1 (A–C)',
      rooms: ['Ruang Kerja'],
      description: '150 mm masonry exterior wall along Axis 1 containing window J3.',
      boxes: buildSegmentedWallAlongZ({
        elementId: 'W-EXT-WEST',
        xCenter: AXIS_1,
        thickness: EXT_T,
        zMin: innerMinZ,
        zMax: innerMaxZ,
        height: WALL_H,
        openings: [
          { id: 'J3', code: 'J3', kind: 'window', start: -2.1, end: -0.9, sill: WIN_SILL, top: OPEN_TOP },
        ],
      }),
    },
    {
      id: 'W-EXT-EAST',
      name: 'East Exterior Wall (Axis 3)',
      category: 'exterior_wall',
      thicknessMm: 150,
      heightMm: 3200,
      lengthMm: 5850,
      gridAxis: 'Axis 3 (A–C)',
      rooms: ['Ruang Rapat', 'Ruang Arsip'],
      description: '150 mm solid masonry exterior wall along Axis 3 bordering Ruang Rapat and Ruang Arsip.',
      boxes: buildSegmentedWallAlongZ({
        elementId: 'W-EXT-EAST',
        xCenter: AXIS_3,
        thickness: EXT_T,
        zMin: innerMinZ,
        zMax: innerMaxZ,
        height: WALL_H,
        openings: [],
      }),
    },
    {
      id: 'W-PART-CENTRAL',
      name: 'Central Partition Wall (Axis 2)',
      category: 'interior_partition',
      thicknessMm: 100,
      heightMm: 3200,
      lengthMm: 5850,
      gridAxis: 'Axis 2 (A–C)',
      rooms: ['Ruang Kerja', 'Ruang Rapat', 'Ruang Arsip'],
      description: '100 mm interior partition along Axis 2 separating Ruang Kerja from Ruang Rapat and Ruang Arsip, with two P2 doorways.',
      boxes: buildSegmentedWallAlongZ({
        elementId: 'W-PART-CENTRAL',
        xCenter: AXIS_2,
        thickness: PART_T,
        zMin: innerMinZ,
        zMax: innerMaxZ,
        height: WALL_H,
        openings: [
          { id: 'P2-RAPAT', code: 'P2', kind: 'door', start: -1.05, end: -0.20, sill: 0, top: OPEN_TOP },
          { id: 'P2-ARSIP', code: 'P2', kind: 'door', start: 1.90, end: 2.75, sill: 0, top: OPEN_TOP },
        ],
      }),
    },
    {
      id: 'W-PART-RAPAT-ARSIP',
      name: 'Shared Partition Wall (Ruang Rapat / Ruang Arsip)',
      category: 'interior_partition',
      thicknessMm: 100,
      heightMm: 3200,
      lengthMm: 4075,
      gridAxis: 'Axis B (2–3)',
      rooms: ['Ruang Rapat', 'Ruang Arsip'],
      description: '100 mm interior partition along Axis B separating Ruang Rapat (North face) and Ruang Arsip (South face). Hosts demo Spatial Pins A03-PIN-01 and A03-PIN-02.',
      boxes: buildSegmentedWallAlongX({
        elementId: 'W-PART-RAPAT-ARSIP',
        zCenter: AXIS_B,
        thickness: PART_T,
        xMin: AXIS_2 + PART_HALF, // +0.050
        xMax: innerMaxX, // +4.125
        height: WALL_H,
        openings: [],
      }),
    },
  ];

  const rooms: RoomDefinition[] = [
    {
      id: 'ruang-kerja',
      areaId: 'area-a03-ground',
      name: 'Ruang Kerja',
      areaLabel: '4,075 × 5,850 mm clear',
      verificationStatus: 'verified',
      bounds: { minX: innerMinX, maxX: AXIS_2 - PART_HALF, minZ: innerMinZ, maxZ: innerMaxZ },
      center: { x: -2.0875, y: 1.2, z: 0.0 },
      cameraPosition: { x: -7.4, y: 6.2, z: 5.2 },
      cameraTarget: { x: -2.05, y: 1.1, z: 0.0 },
    },
    {
      id: 'ruang-rapat',
      areaId: 'area-a03-ground',
      name: 'Ruang Rapat',
      areaLabel: '4,075 × 2,875 mm clear',
      verificationStatus: 'verified',
      bounds: { minX: AXIS_2 + PART_HALF, maxX: innerMaxX, minZ: innerMinZ, maxZ: AXIS_B - PART_HALF },
      center: { x: 2.0875, y: 1.2, z: -1.4875 },
      cameraPosition: { x: 2.1, y: 4.5, z: -5.4 },
      cameraTarget: { x: 2.08, y: 1.25, z: -0.6 },
    },
    {
      id: 'ruang-arsip',
      areaId: 'area-a03-ground',
      name: 'Ruang Arsip',
      areaLabel: '4,075 × 2,875 mm clear',
      verificationStatus: 'verified',
      bounds: { minX: AXIS_2 + PART_HALF, maxX: innerMaxX, minZ: AXIS_B + PART_HALF, maxZ: innerMaxZ },
      center: { x: 2.0875, y: 1.2, z: 1.4875 },
      cameraPosition: { x: 6.4, y: 5.2, z: 5.5 },
      cameraTarget: { x: 2.08, y: 1.1, z: 1.48 },
    },
  ];

  const crossCheck = measureRuangRapatClearNorthSouth(elements);

  return {
    versionId: 'a03-r00-demo-v1',
    elements,
    openings,
    rooms,
    crossCheck,
  };
}

/**
 * Independent geometric cross-check computed strictly from the built wall bounding boxes.
 * Measures the clear interior North–South distance of Ruang Rapat between:
 * - the interior (south) face of W-EXT-NORTH in the Ruang Rapat X span
 * - the interior (north) face of W-PART-RAPAT-ARSIP
 */
export function measureRuangRapatClearNorthSouth(
  elements: BuildingElementSpec[]
): CrossCheckMeasurement {
  const northWall = elements.find((el) => el.id === 'W-EXT-NORTH');
  const sharedPartition = elements.find((el) => el.id === 'W-PART-RAPAT-ARSIP');

  if (!northWall || !sharedPartition) {
    throw new Error('Required walls for Ruang Rapat cross-check are missing.');
  }

  // Filter solid wall boxes overlapping Ruang Rapat (x > 0.05)
  const northWallBoxes = northWall.boxes.filter(
    (b) => b.kind === 'wall' && b.center.x + b.size.x / 2 > 0.05
  );
  const partitionBoxes = sharedPartition.boxes.filter((b) => b.kind === 'wall');

  // Inner face of North wall is its maximum Z edge
  const northWallInnerFaceZ = Math.max(
    ...northWallBoxes.map((b) => b.center.z + b.size.z / 2)
  );
  // Inner (Ruang Rapat) face of Axis B partition is its minimum Z edge
  const partitionNorthFaceZ = Math.min(
    ...partitionBoxes.map((b) => b.center.z - b.size.z / 2)
  );

  const clearMeters = partitionNorthFaceZ - northWallInnerFaceZ;
  const actualMm = Math.round(clearMeters * 1000 * 1000) / 1000;
  const referenceMm = A03_DIMENSIONS.crossCheckRefMm;
  const deltaMm = Math.round((actualMm - referenceMm) * 1000) / 1000;

  return {
    label: 'Ruang Rapat clear interior N–S',
    method: 'Computed from built mesh faces (W-EXT-NORTH inner south face to W-PART-RAPAT-ARSIP north face)',
    referenceMm,
    actualMm,
    deltaMm,
    northFaceZ: northWallInnerFaceZ,
    southFaceZ: partitionNorthFaceZ,
    sourceElements: ['W-EXT-NORTH', 'W-PART-RAPAT-ARSIP'],
  };
}

/**
 * Resolves room and readable surface side for any hit point + world normal on a model element.
 */
export function classifySurfaceHit(
  element: BuildingElementSpec,
  point: Vec3,
  normal: Vec3
): { roomId: RoomId; roomName: string; surfaceSide: string } {
  // Check shared partition wall specifically
  if (element.id === 'W-PART-RAPAT-ARSIP') {
    if (normal.z < -0.5) {
      return {
        roomId: 'ruang-rapat',
        roomName: 'Ruang Rapat',
        surfaceSide: 'Ruang Rapat side (North face)',
      };
    }
    if (normal.z > 0.5) {
      return {
        roomId: 'ruang-arsip',
        roomName: 'Ruang Arsip',
        surfaceSide: 'Ruang Arsip side (South face)',
      };
    }
    return {
      roomId: 'ruang-rapat',
      roomName: 'Ruang Rapat',
      surfaceSide: 'Partition top edge',
    };
  }

  if (element.id === 'W-PART-CENTRAL') {
    if (normal.x < -0.5) {
      return {
        roomId: 'ruang-kerja',
        roomName: 'Ruang Kerja',
        surfaceSide: 'Ruang Kerja side (West face)',
      };
    }
    if (point.z < 0) {
      return {
        roomId: 'ruang-rapat',
        roomName: 'Ruang Rapat',
        surfaceSide: 'Ruang Rapat side (East face)',
      };
    }
    return {
      roomId: 'ruang-arsip',
      roomName: 'Ruang Arsip',
      surfaceSide: 'Ruang Arsip side (East face)',
    };
  }

  // Classify room by point coordinates
  let roomId: RoomId = 'ruang-kerja';
  let roomName = 'Ruang Kerja';
  if (point.x >= 0) {
    if (point.z <= 0) {
      roomId = 'ruang-rapat';
      roomName = 'Ruang Rapat';
    } else {
      roomId = 'ruang-arsip';
      roomName = 'Ruang Arsip';
    }
  }

  if (element.category === 'floor_slab') {
    return { roomId, roomName, surfaceSide: 'Finished floor surface (+0 mm)' };
  }

  if (Math.abs(normal.z) > 0.5) {
    const face = normal.z > 0 ? 'South face' : 'North face';
    return { roomId, roomName, surfaceSide: `${roomName} (${face})` };
  }
  if (Math.abs(normal.x) > 0.5) {
    const face = normal.x > 0 ? 'East face' : 'West face';
    return { roomId, roomName, surfaceSide: `${roomName} (${face})` };
  }

  return { roomId, roomName, surfaceSide: 'Top wall face' };
}
