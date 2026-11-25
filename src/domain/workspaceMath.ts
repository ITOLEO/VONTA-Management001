import type { Vec3 } from './types';

export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export const MIN_STROKE_WIDTH_PX = 1;
export const MAX_STROKE_WIDTH_PX = 32;
export const STROKE_WIDTH_PRESETS = [1, 2, 4, 8, 12] as const;

/**
 * Normalizes a hex color string (#RGB or #RRGGBB) to uppercase #RRGGBB.
 * Returns null if the input is not a valid hex color.
 */
export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split('')
      .map((ch) => ch + ch)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = normalizeHexColor(hex) ?? '#D4652F';
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = 60 * (((g - b) / delta) % 6);
        break;
      case g:
        h = 60 * ((b - r) / delta + 2);
        break;
      default:
        h = 60 * ((r - g) / delta + 4);
        break;
    }
  }
  if (h < 0) h += 360;
  return {
    h: Math.round(h) % 360,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hue < 60) {
    [r1, g1, b1] = [c, x, 0];
  } else if (hue < 120) {
    [r1, g1, b1] = [x, c, 0];
  } else if (hue < 180) {
    [r1, g1, b1] = [0, c, x];
  } else if (hue < 240) {
    [r1, g1, b1] = [0, x, c];
  } else if (hue < 300) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

export function clampStrokeWidthPx(value: number): number {
  if (!Number.isFinite(value)) return 4;
  return Math.max(MIN_STROKE_WIDTH_PX, Math.min(MAX_STROKE_WIDTH_PX, Math.round(value)));
}

export function strokeWidthPxToWorldMeters(widthPx: number, multiplier = 1): number {
  const clamped = clampStrokeWidthPx(widthPx);
  // Maps 1px..32px smoothly to ~0.008m..0.11m on building surfaces
  return (0.006 + clamped * 0.0032) * multiplier;
}

export function distanceVec3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Formats a physical measurement in meters into site mm/m notation.
 * Never fabricates physical distances when model calibration is not verified.
 */
export function formatPhysicalDistanceMm(distanceMeters: number, isCalibrated: boolean): string {
  if (!isCalibrated || !Number.isFinite(distanceMeters)) {
    return 'Scale not verified';
  }
  const mm = Math.round(distanceMeters * 1000);
  if (mm >= 1000) {
    return `${mm.toLocaleString('en-US')} mm (${(mm / 1000).toFixed(2)} m)`;
  }
  return `${mm.toLocaleString('en-US')} mm`;
}

/**
 * Computes the included angle in degrees (0..180) at `vertex` between rays `vertex -> rayA` and `vertex -> rayB`.
 */
export function computeIncludedAngleDeg(vertex: Vec3, rayA: Vec3, rayB: Vec3): number {
  const ax = rayA.x - vertex.x;
  const ay = rayA.y - vertex.y;
  const az = rayA.z - vertex.z;
  const bx = rayB.x - vertex.x;
  const by = rayB.y - vertex.y;
  const bz = rayB.z - vertex.z;
  const lenA = Math.sqrt(ax * ax + ay * ay + az * az);
  const lenB = Math.sqrt(bx * bx + by * by + bz * bz);
  if (lenA < 1e-6 || lenB < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (lenA * lenB)));
  return Math.round((Math.acos(cos) * 180) / Math.PI * 10) / 10;
}

/**
 * Projects `cursorPoint` onto a leg perpendicular to `(leg1End - origin)` within the surface plane defined by `surfaceNormal`.
 * Used for the surface-anchored Right-Angle Ruler.
 */
export function projectRightAnglePoint(
  origin: Vec3,
  leg1End: Vec3,
  cursorPoint: Vec3,
  surfaceNormal: Vec3
): Vec3 {
  const ux = leg1End.x - origin.x;
  const uy = leg1End.y - origin.y;
  const uz = leg1End.z - origin.z;
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  if (uLen < 1e-5) return cursorPoint;
  const u = { x: ux / uLen, y: uy / uLen, z: uz / uLen };

  // Normalize surface normal
  const nLen = Math.sqrt(
    surfaceNormal.x * surfaceNormal.x +
      surfaceNormal.y * surfaceNormal.y +
      surfaceNormal.z * surfaceNormal.z
  );
  const n =
    nLen > 1e-5
      ? { x: surfaceNormal.x / nLen, y: surfaceNormal.y / nLen, z: surfaceNormal.z / nLen }
      : { x: 0, y: 1, z: 0 };

  // v = n × u (in-plane perpendicular direction)
  const vx = n.y * u.z - n.z * u.y;
  const vy = n.z * u.x - n.x * u.z;
  const vz = n.x * u.y - n.y * u.x;
  const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (vLen < 1e-5) return cursorPoint;
  const v = { x: vx / vLen, y: vy / vLen, z: vz / vLen };

  // Signed projection of (cursorPoint - leg1End) onto v
  const dx = cursorPoint.x - leg1End.x;
  const dy = cursorPoint.y - leg1End.y;
  const dz = cursorPoint.z - leg1End.z;
  const proj = dx * v.x + dy * v.y + dz * v.z;

  return {
    x: leg1End.x + v.x * proj,
    y: leg1End.y + v.y * proj,
    z: leg1End.z + v.z * proj,
  };
}

/**
 * Splits a 3D polyline along arc length into sub-segments for dashed or dotted rendering in WebGL.
 * Solid returns [points].
 */
export function splitPolylineByLineStyle(
  points: Vec3[],
  style: DrawingLineStyle,
  widthPx: number
): Vec3[][] {
  if (points.length < 2 || style === 'solid') {
    return points.length >= 2 ? [points] : [];
  }

  const baseUnit = Math.max(0.03, strokeWidthPxToWorldMeters(widthPx) * 2.2);
  const dashLen = style === 'dashed' ? baseUnit * 2.4 : baseUnit * 0.55;
  const gapLen = style === 'dashed' ? baseUnit * 1.35 : baseUnit * 1.15;

  const segments: Vec3[][] = [];
  let drawing = true;
  let remaining = dashLen;
  let currentRun: Vec3[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    let p0 = points[i - 1];
    const p1 = points[i];
    let segLen = distanceVec3(p0, p1);
    if (segLen < 1e-6) continue;

    while (segLen > 1e-6) {
      if (segLen < remaining) {
        if (drawing) {
          currentRun.push(p1);
        }
        remaining -= segLen;
        segLen = 0;
      } else {
        const t = remaining / segLen;
        const splitPt: Vec3 = {
          x: p0.x + (p1.x - p0.x) * t,
          y: p0.y + (p1.y - p0.y) * t,
          z: p0.z + (p1.z - p0.z) * t,
        };
        if (drawing) {
          currentRun.push(splitPt);
          if (currentRun.length >= 2) {
            segments.push(currentRun);
          }
          currentRun = [];
          drawing = false;
          remaining = gapLen;
        } else {
          drawing = true;
          currentRun = [splitPt];
          remaining = dashLen;
        }
        p0 = splitPt;
        segLen = distanceVec3(p0, p1);
      }
    }
  }

  if (drawing && currentRun.length >= 2) {
    segments.push(currentRun);
  }
  return segments;
}

export interface CompassOrientationState {
  /** Clockwise CSS rotation (degrees) for the corner compass north arrow. 0° = pointing straight up. */
  needleRotationDeg: number;
  /** World-space Y rotation (radians) applied to the ground compass rose on the XZ plane. */
  groundRoseRotationRad: number;
  /** True when the project has a verified geographic north angle. */
  isNorthVerified: boolean;
  /** Truthful label displayed in the compass widget. */
  orientationLabel: string;
}

/**
 * Computes synchronized corner compass needle rotation and ground compass world rotation.
 * - cameraAzimuthDeg: camera orbit azimuth around Y (0° = camera looking from +Z toward -Z, i.e., -Z is "up").
 * - northAngleDeg: verified project north angle clockwise from model -Z (null when unverified).
 * Rotating northAngleDeg by +90° rotates BOTH ground compass arrows and corner needle by +90° identically.
 */
export function computeCompassOrientation(
  cameraAzimuthDeg: number,
  northAngleDeg: number | null | undefined
): CompassOrientationState {
  const isNorthVerified = typeof northAngleDeg === 'number' && Number.isFinite(northAngleDeg);
  const effectiveNorthDeg = isNorthVerified ? ((northAngleDeg % 360) + 360) % 360 : 0;
  // When camera orbits clockwise (+cameraAzimuthDeg), world north rotates counter-clockwise on screen
  const rawNeedle = (effectiveNorthDeg - cameraAzimuthDeg) % 360;
  const needleRotationDeg = ((rawNeedle + 360) % 360);
  // Three.js Y rotation is counter-clockwise when looking down +Y, so clockwise north uses -effectiveNorthDeg
  const groundRoseRotationRad = ((-effectiveNorthDeg * Math.PI) / 180) + 0;

  return {
    needleRotationDeg: Math.round(needleRotationDeg * 10) / 10,
    groundRoseRotationRad,
    isNorthVerified,
    orientationLabel: isNorthVerified
      ? `Verified North (${Math.round(effectiveNorthDeg)}°)`
      : 'Grid orientation · North not set',
  };
}

export type AnnotationPickPieceKind = 'label' | 'stroke' | 'wall_fill';

export interface AnnotationPickCandidate {
  annotationId: string;
  /** Distance from camera ray origin to the hit point in meters. */
  distance: number;
  /** Distance from click coordinates to candidate in CSS pixels (0 for direct hit). */
  screenDistancePx: number;
  /** Which selectable piece of the annotation produced this candidate. */
  kind: AnnotationPickPieceKind;
  /** True when an opaque building wall or slab lies closer than the candidate along the view ray. */
  occludedByWall: boolean;
}

export const DEFAULT_ANNOTATION_SCREEN_TOLERANCE_PX = 14;
export const DEFAULT_WALL_OCCLUSION_CLEARANCE_M = 0.045;
const SAME_SURFACE_DEPTH_TIE_M = 0.18;

const PIECE_KIND_PRIORITY: Record<AnnotationPickPieceKind, number> = {
  label: 0,
  stroke: 1,
  wall_fill: 2,
};

/**
 * Returns true when an opaque building surface lies strictly in front of a candidate mark point,
 * preventing occluded marks from being selected or erased through walls.
 */
export function isPointOccludedByWall(
  pointDistanceMeters: number,
  nearestWallDistanceMeters: number | null,
  surfaceClearanceMeters = DEFAULT_WALL_OCCLUSION_CLEARANCE_M
): boolean {
  if (!Number.isFinite(pointDistanceMeters) || pointDistanceMeters <= 0) {
    return true;
  }
  if (nearestWallDistanceMeters === null || !Number.isFinite(nearestWallDistanceMeters)) {
    return false;
  }
  return nearestWallDistanceMeters + surfaceClearanceMeters < pointDistanceMeters;
}

/**
 * Shortest Euclidean distance in 2D (CSS pixels) from point (px, py) to segment (ax, ay)-(bx, by).
 */
export function pointToSegmentDistance2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { distance: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) {
    return { distance: Math.hypot(px - ax, py - ay), t: 0 };
  }
  const rawT = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const projX = ax + dx * t;
  const projY = ay + dy * t;
  return { distance: Math.hypot(px - projX, py - projY), t };
}

/**
 * Shortest Euclidean distance in 2D (CSS pixels) from point (px, py) to an axis-aligned rectangle.
 * Returns 0 when inside the rectangle.
 */
export function pointToRectDistance2D(
  px: number,
  py: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): number {
  const dx = px < minX ? minX - px : px > maxX ? px - maxX : 0;
  const dy = py < minY ? minY - py : py > maxY ? py - maxY : 0;
  return Math.hypot(dx, dy);
}

/**
 * Resolves the frontmost visible annotation candidate within screen-space tolerance.
 * Rejects any candidate occluded behind a wall or outside maxScreenTolerancePx.
 * When two visible marks sit on the same wall surface (within SAME_SURFACE_DEPTH_TIE_M),
 * prioritizes ruler label > stroke/shape > wall_fill and tighter screen proximity.
 */
export function resolveFrontmostAnnotationHit(
  candidates: ReadonlyArray<AnnotationPickCandidate>,
  maxScreenTolerancePx = DEFAULT_ANNOTATION_SCREEN_TOLERANCE_PX
): AnnotationPickCandidate | null {
  const visible = candidates.filter(
    (c) =>
      Boolean(c.annotationId) &&
      !c.occludedByWall &&
      Number.isFinite(c.distance) &&
      c.distance > 0 &&
      Number.isFinite(c.screenDistancePx) &&
      c.screenDistancePx <= maxScreenTolerancePx
  );
  if (visible.length === 0) return null;

  const sorted = [...visible].sort((a, b) => {
    const depthDiff = Math.abs(a.distance - b.distance);
    if (depthDiff <= SAME_SURFACE_DEPTH_TIE_M) {
      const kindDiff = PIECE_KIND_PRIORITY[a.kind] - PIECE_KIND_PRIORITY[b.kind];
      if (kindDiff !== 0) return kindDiff;
      const screenDiff = a.screenDistancePx - b.screenDistancePx;
      if (Math.abs(screenDiff) > 1.5) return screenDiff;
    }
    return a.distance - b.distance;
  });

  return sorted[0] ?? null;
}

/**
 * Returns true if the event target is a text-entry control where editing/shortcut keys
 * (Delete, Backspace, Ctrl/Cmd+Z, single-key tool shortcuts) should NOT hijack typing.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  const role = el.getAttribute?.('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
    return true;
  }
  return false;
}

