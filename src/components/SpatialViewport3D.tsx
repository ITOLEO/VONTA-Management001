import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AlertTriangle, MapPin, RefreshCw } from 'lucide-react';
import {
  classifySurfaceHit,
  type A03ModelBuild,
} from '../domain/a03Geometry';
import type { BuiltAreaModelSpec } from '../domain/accountTypes';
import { resolvePinColorHex } from '../domain/attendanceEngine';
import { classifyGenericSurfaceHit } from '../domain/blueprintGeometry';
import type {
  CrossCheckMeasurement,
  LayerKey,
  RoomId,
  SpatialPin,
  SurfaceHitCandidate,
  Vec3,
} from '../domain/types';
import {
  DRAWING_STROKE_WIDTHS,
  isCursorModeTool,
  strokeWidthKeyToPx,
  type DrawingStrokeWidthKey,
  type DrawingToolType,
  type PersistedAnnotationTool,
  type Point2DLocal,
  type PrivateSurfaceAnnotation,
} from '../utils/privateDrawingStore';
import {
  computeCompassOrientation,
  DEFAULT_ANNOTATION_SCREEN_TOLERANCE_PX,
  formatPhysicalDistanceMm,
  isPointOccludedByWall,
  pointToRectDistance2D,
  pointToSegmentDistance2D,
  resolveFrontmostAnnotationHit,
  strokeWidthPxToWorldMeters,
  type AnnotationPickCandidate,
  type AnnotationPickPieceKind,
  type DrawingLineStyle,
} from '../domain/workspaceMath';

export type ViewportModelSpec = A03ModelBuild | BuiltAreaModelSpec;

export interface CameraFocusCommand {
  id: number;
  kind: 'fit' | 'overall' | 'room' | 'pin';
  roomId?: RoomId;
  pin?: SpatialPin;
}

export interface SpatialViewportHandle {
  captureCleanPng: (options?: {
    provenanceBanner?: string;
  }) => Promise<{ blob: Blob; width: number; height: number }>;
  getCameraSnapshot: () => { position: Vec3; target: Vec3 } | null;
  applyCameraSnapshot: (cam: { position: Vec3; target: Vec3 }) => void;
}

export type PrivateAnnotationDraft = Omit<
  PrivateSurfaceAnnotation,
  'id' | 'formatVersion' | 'environment' | 'accountId' | 'projectId' | 'modelVersionId' | 'areaId' | 'createdAt'
>;

interface SpatialViewport3DProps {
  model: ViewportModelSpec;
  pins: SpatialPin[];
  selectedPinId: string | null;
  selectedElementId: string | null;
  activeRoomId?: RoomId | null;
  layers: Record<LayerKey, boolean>;
  createMode: boolean;
  pendingHit: SurfaceHitCandidate | null;
  cameraCommand: CameraFocusCommand | null;
  onSelectPin: (pinId: string) => void;
  onSelectElement: (elementId: string) => void;
  onClearSelection: () => void;
  onCreateSurfaceHit: (hit: SurfaceHitCandidate) => void;
  onCreateVoidClick: () => void;
  onMeshCrossCheckMeasured?: (measurement: CrossCheckMeasurement) => void;
  // Private device-local 3D drawings & tools
  annotations?: PrivateSurfaceAnnotation[];
  selectedAnnotationId?: string | null;
  activeDrawingTool?: DrawingToolType;
  drawingColorHex?: string;
  drawingStrokeWidth?: DrawingStrokeWidthKey;
  drawingStrokeWidthPx?: number;
  drawingLineStyle?: DrawingLineStyle;
  drawingDeleteMode?: boolean;
  hideLocalDrawings?: boolean;
  canDraw?: boolean;
  isModelCalibrated?: boolean;
  onSelectAnnotation?: (annotationId: string | null) => void;
  onCreateAnnotation?: (draft: PrivateAnnotationDraft) => void;
  onDeleteAnnotation?: (annotationId: string) => void;
  onDrawingRejected?: (reason: string) => void;
  // Dual compass & read-only shared viewer
  northAngleDeg?: number | null;
  showGroundCompass?: boolean;
  onCameraAzimuthChange?: (azimuthDeg: number) => void;
  readOnlyViewer?: boolean;
}

const OVERALL_CAM_POS = new THREE.Vector3(6.8, 9.2, -10.4);
const OVERALL_CAM_TARGET = new THREE.Vector3(0.0, 0.75, 0.15);
const FIT_CAM_POS = new THREE.Vector3(6.0, 8.2, -9.4);
const FIT_CAM_TARGET = new THREE.Vector3(0.0, 0.85, 0.1);

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createFloorPlanCanvasTexture(
  model: ViewportModelSpec,
  slabWidthM: number,
  slabDepthM: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;

  // Clean light warm floor fill
  ctx.fillStyle = '#E6E3DC';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle architectural tile grid
  ctx.strokeStyle = 'rgba(27, 42, 74, 0.06)';
  ctx.lineWidth = 1;
  const stepX = canvas.width / 17;
  const stepY = canvas.height / 12;
  for (let x = 0; x <= canvas.width; x += stepX) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += stepY) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw room labels rotated 180 deg so they read right-side-up from the default North architectural view
  const drawRoomLabel = (xFrac: number, yFrac: number, title: string, subtitle: string) => {
    ctx.save();
    ctx.translate(canvas.width * xFrac, canvas.height * yFrac);
    ctx.rotate(Math.PI);
    ctx.fillStyle = 'rgba(27, 42, 74, 0.46)';
    ctx.font = '600 28px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 0, -14);
    ctx.fillStyle = 'rgba(79, 92, 103, 0.58)';
    ctx.font = '500 17px Inter, system-ui, sans-serif';
    ctx.fillText(subtitle, 0, 18);
    ctx.restore();
  };

  if (model.versionId === 'a03-r00-demo-v1') {
    drawRoomLabel(0.25, 0.52, 'RUANG KERJA', '4,075 × 5,850 mm');
    drawRoomLabel(0.75, 0.25, 'RUANG RAPAT', '4,075 × 2,875 mm');
    drawRoomLabel(0.75, 0.76, 'RUANG ARSIP', '4,075 × 2,875 mm');
  } else {
    const safeW = Math.max(0.5, slabWidthM);
    const safeD = Math.max(0.5, slabDepthM);
    for (const room of model.rooms) {
      const cx = (room.bounds.minX + room.bounds.maxX) / 2;
      const cz = (room.bounds.minZ + room.bounds.maxZ) / 2;
      const xFrac = Math.min(0.92, Math.max(0.08, (cx + safeW / 2) / safeW));
      const yFrac = Math.min(0.92, Math.max(0.08, (cz + safeD / 2) / safeD));
      drawRoomLabel(xFrac, yFrac, room.name.toUpperCase().slice(0, 26), room.areaLabel);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function computePinCameraGoal(pin: SpatialPin): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const target = new THREE.Vector3(pin.position.x, pin.position.y * 0.9, pin.position.z);
  const normal = new THREE.Vector3(pin.normal.x, pin.normal.y, pin.normal.z);
  if (normal.lengthSq() < 0.01) {
    normal.set(0, 0, -1);
  } else {
    normal.normalize();
  }

  // Architectural 3/4 framing that keeps the Pin focal while preserving room walls and neighboring context
  const offset = normal.clone().multiplyScalar(3.4);
  offset.y += 2.25;
  if (Math.abs(normal.z) > 0.5) {
    offset.x += pin.position.x > 2.0 ? 1.15 : -1.15;
  } else if (Math.abs(normal.x) > 0.5) {
    offset.z += pin.position.z > 0 ? 1.15 : -1.15;
  } else {
    offset.z -= 2.8;
    offset.x += 1.6;
  }

  const pos = target.clone().add(offset);
  pos.y = Math.max(2.6, Math.min(5.6, pos.y));
  return { pos, target };
}

function createPinMarkerGroup(
  pin: SpatialPin,
  isSelected: boolean
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(pin.position.x, pin.position.y, pin.position.z);

  const normal = new THREE.Vector3(pin.normal.x, pin.normal.y, pin.normal.z);
  if (normal.lengthSq() < 0.01) normal.set(0, 1, 0);
  normal.normalize();

  // Align local +Y along surface normal
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.quaternion.copy(quat);

  const resolvedHex = resolvePinColorHex(pin.color);
  const primaryColor = new THREE.Color(resolvedHex);
  const accentNavy = 0x1b2a4a;

  // 1. Flush base contact ring on wall
  const baseGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.014, 20);
  const baseMat = new THREE.MeshStandardMaterial({
    color: accentNavy,
    roughness: 0.45,
    metalness: 0.25,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = 0.007;
  baseMesh.userData.pinId = pin.id;
  group.add(baseMesh);

  // 2. Stand-off stem
  const stemHeight = isSelected ? 0.22 : 0.17;
  const stemGeo = new THREE.CylinderGeometry(0.016, 0.022, stemHeight, 12);
  const stemMat = new THREE.MeshStandardMaterial({
    color: accentNavy,
    roughness: 0.35,
    metalness: 0.4,
  });
  const stemMesh = new THREE.Mesh(stemGeo, stemMat);
  stemMesh.position.y = stemHeight / 2 + 0.01;
  stemMesh.userData.pinId = pin.id;
  group.add(stemMesh);

  // 3. Pin head sphere
  const headRadius = isSelected ? 0.105 : 0.082;
  const headGeo = new THREE.SphereGeometry(headRadius, 20, 16);
  const headMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    emissive: primaryColor,
    emissiveIntensity: isSelected ? 0.45 : 0.16,
    roughness: 0.28,
    metalness: 0.1,
  });
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.y = stemHeight + headRadius * 0.72;
  headMesh.userData.pinId = pin.id;
  group.add(headMesh);

  // 4. Selection halo ring when active
  if (isSelected) {
    const ringGeo = new THREE.TorusGeometry(0.145, 0.014, 12, 28);
    const ringMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.5,
      roughness: 0.3,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.022;
    ringMesh.userData.pinId = pin.id;
    group.add(ringMesh);
  }

  // Invisible generous hit-sphere for easy pointer/touch clicking
  const hitGeo = new THREE.SphereGeometry(0.24, 12, 10);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.position.y = stemHeight * 0.75;
  hitMesh.userData.pinId = pin.id;
  hitMesh.userData.isPinHitTarget = true;
  group.add(hitMesh);

  group.userData.pinId = pin.id;
  return group;
}

function computeLocalSurfaceBasis(worldNormal: THREE.Vector3): {
  normal: THREE.Vector3;
  tangentU: THREE.Vector3;
  tangentV: THREE.Vector3;
} {
  const normal = worldNormal.clone().normalize();
  const ref = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const tangentU = new THREE.Vector3().crossVectors(ref, normal).normalize();
  const tangentV = new THREE.Vector3().crossVectors(normal, tangentU).normalize();
  return { normal, tangentU, tangentV };
}

function splitPolyline2DByStyle(
  polyline: Point2DLocal[],
  style: DrawingLineStyle,
  halfWidth: number
): Point2DLocal[][] {
  if (polyline.length < 2 || style === 'solid') return polyline.length >= 2 ? [polyline] : [];
  const dashLen = style === 'dashed' ? Math.max(0.08, halfWidth * 5.2) : Math.max(0.025, halfWidth * 1.4);
  const gapLen = style === 'dashed' ? Math.max(0.05, halfWidth * 3.1) : Math.max(0.05, halfWidth * 2.6);

  const out: Point2DLocal[][] = [];
  let drawing = true;
  let rem = dashLen;
  let cur: Point2DLocal[] = [polyline[0]];

  for (let i = 1; i < polyline.length; i += 1) {
    let p0 = polyline[i - 1];
    const p1 = polyline[i];
    let segLen = Math.hypot(p1.u - p0.u, p1.v - p0.v);
    if (segLen < 1e-5) continue;

    while (segLen > 1e-5) {
      if (segLen < rem) {
        if (drawing) cur.push(p1);
        rem -= segLen;
        segLen = 0;
      } else {
        const t = rem / segLen;
        const split: Point2DLocal = {
          u: p0.u + (p1.u - p0.u) * t,
          v: p0.v + (p1.v - p0.v) * t,
        };
        if (drawing) {
          cur.push(split);
          if (cur.length >= 2) out.push(cur);
          cur = [];
          drawing = false;
          rem = gapLen;
        } else {
          drawing = true;
          cur = [split];
          rem = dashLen;
        }
        p0 = split;
        segLen = Math.hypot(p1.u - p0.u, p1.v - p0.v);
      }
    }
  }
  if (drawing && cur.length >= 2) out.push(cur);
  return out;
}

function createTextLabelSprite(
  text: string,
  options?: {
    bg?: string;
    fg?: string;
    border?: string;
    scaleX?: number;
    scaleY?: number;
    depthTest?: boolean;
    selected?: boolean;
  }
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bg = options?.bg ?? 'rgba(27, 42, 74, 0.92)';
  const fg = options?.fg ?? '#FFFFFF';
  const border = options?.border ?? '#D4652F';

  if (options?.selected) {
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.roundRect(8, 12, canvas.width - 16, canvas.height - 24, 22);
    ctx.stroke();
  }

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(12, 16, canvas.width - 24, canvas.height - 32, 18);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = options?.selected ? 6 : 4;
  ctx.stroke();

  ctx.fillStyle = fg;
  ctx.font = '700 36px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: options?.depthTest ?? false,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(options?.scaleX ?? 1.28, options?.scaleY ?? 0.28, 1);
  if (options?.depthTest) {
    sprite.renderOrder = 4;
  }
  return sprite;
}

function createCompassCardinalSprite(letter: string, accent: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  ctx.fillStyle = accent ? '#D4652F' : '#1B2A4A';
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 60px Inter, system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 67);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const size = accent ? 0.62 : 0.5;
  sprite.scale.set(size, size, 1);
  return sprite;
}

function createGroundCompassGroup(radius = 5.4): THREE.Group {
  const group = new THREE.Group();
  group.position.y = -0.172;

  // Subtle compass ring on the site ground
  const ringPts: THREE.Vector3[] = [];
  const segs = 64;
  for (let i = 0; i <= segs; i += 1) {
    const theta = (i / segs) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.sin(theta) * radius, 0, -Math.cos(theta) * radius));
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const ringMat = new THREE.LineBasicMaterial({ color: 0x9aa6b4, transparent: true, opacity: 0.7 });
  group.add(new THREE.Line(ringGeo, ringMat));

  const cardinals: ReadonlyArray<{
    label: string;
    angleRad: number;
    color: number;
    accent: boolean;
  }> = [
    { label: 'N', angleRad: 0, color: 0xd4652f, accent: true },
    { label: 'E', angleRad: Math.PI / 2, color: 0x1b2a4a, accent: false },
    { label: 'S', angleRad: Math.PI, color: 0x1b2a4a, accent: false },
    { label: 'W', angleRad: (3 * Math.PI) / 2, color: 0x1b2a4a, accent: false },
  ];

  for (const c of cardinals) {
    const dirX = Math.sin(c.angleRad);
    const dirZ = -Math.cos(c.angleRad);
    const inner = radius - 0.55;
    const outer = radius + (c.accent ? 0.85 : 0.45);

    const shaftGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(dirX * inner, 0.005, dirZ * inner),
      new THREE.Vector3(dirX * outer, 0.005, dirZ * outer),
    ]);
    const shaftMat = new THREE.LineBasicMaterial({ color: c.color });
    group.add(new THREE.Line(shaftGeo, shaftMat));

    const arrowConeGeo = new THREE.ConeGeometry(c.accent ? 0.2 : 0.14, c.accent ? 0.46 : 0.32, 12);
    const arrowConeMat = new THREE.MeshBasicMaterial({ color: c.color });
    const cone = new THREE.Mesh(arrowConeGeo, arrowConeMat);
    cone.position.set(dirX * (outer + 0.16), 0.02, dirZ * (outer + 0.16));
    const dirVec = new THREE.Vector3(dirX, 0, dirZ).normalize();
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec);
    group.add(cone);

    const sprite = createCompassCardinalSprite(c.label, c.accent);
    sprite.position.set(dirX * (outer + 0.72), 0.16, dirZ * (outer + 0.72));
    group.add(sprite);
  }

  return group;
}

function sampleShapePolylines2D(
  tool: PersistedAnnotationTool,
  points2D: Point2DLocal[]
): Point2DLocal[][] {
  if (tool === 'wall_fill' || points2D.length < 2) return [];
  if (tool === 'brush' || tool === 'pencil' || tool === 'marker') {
    return [points2D];
  }
  const a = points2D[0];
  const b = points2D[points2D.length - 1];
  const du = b.u - a.u;
  const dv = b.v - a.v;

  if (tool === 'line') {
    return [[a, b]];
  }

  if (tool === 'ruler_straight') {
    const len = Math.hypot(du, dv);
    if (len < 0.01) return [[a, b]];
    const perpU = (-dv / len) * 0.08;
    const perpV = (du / len) * 0.08;
    return [
      [a, b],
      [
        { u: a.u - perpU, v: a.v - perpV },
        { u: a.u + perpU, v: a.v + perpV },
      ],
      [
        { u: b.u - perpU, v: b.v - perpV },
        { u: b.u + perpU, v: b.v + perpV },
      ],
    ];
  }

  if (tool === 'ruler_right_angle') {
    // 2 points (dragged rectangle diagonal -> L legs along U then V) OR 3 explicit points
    const corner: Point2DLocal =
      points2D.length >= 3 ? points2D[1] : { u: b.u, v: a.v };
    const end: Point2DLocal = points2D.length >= 3 ? points2D[2] : b;
    const tick = 0.1;
    const uSign = a.u <= corner.u ? -1 : 1;
    const vSign = end.v >= corner.v ? 1 : -1;
    return [
      [a, corner, end],
      [
        { u: corner.u + uSign * tick, v: corner.v },
        { u: corner.u + uSign * tick, v: corner.v + vSign * tick },
        { u: corner.u, v: corner.v + vSign * tick },
      ],
    ];
  }

  if (tool === 'ruler_angle') {
    // Vertex = a, Ray 1 = horizontal reference (or points2D[1]), Ray 2 = b (or points2D[2])
    const vertex = a;
    const ray1: Point2DLocal =
      points2D.length >= 3
        ? points2D[1]
        : { u: a.u + Math.max(0.35, Math.hypot(du, dv) * 0.85), v: a.v };
    const ray2: Point2DLocal = points2D.length >= 3 ? points2D[2] : b;
    const ang1 = Math.atan2(ray1.v - vertex.v, ray1.u - vertex.u);
    const ang2 = Math.atan2(ray2.v - vertex.v, ray2.u - vertex.u);
    let diff = ang2 - ang1;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const arcR = Math.min(0.28, Math.max(0.1, Math.hypot(du, dv) * 0.35));
    const arcPts: Point2DLocal[] = [];
    const steps = 16;
    for (let i = 0; i <= steps; i += 1) {
      const th = ang1 + (diff * i) / steps;
      arcPts.push({ u: vertex.u + Math.cos(th) * arcR, v: vertex.v + Math.sin(th) * arcR });
    }
    return [
      [ray1, vertex, ray2],
      arcPts,
    ];
  }

  if (tool === 'arrow') {
    const len = Math.hypot(du, dv);
    if (len < 0.01) return [[a, b]];
    const dirU = du / len;
    const dirV = dv / len;
    const perpU = -dirV;
    const perpV = dirU;
    const headLen = Math.min(0.24, Math.max(0.08, len * 0.24));
    const headWing = headLen * 0.55;
    const wing1: Point2DLocal = {
      u: b.u - dirU * headLen + perpU * headWing,
      v: b.v - dirV * headLen + perpV * headWing,
    };
    const wing2: Point2DLocal = {
      u: b.u - dirU * headLen - perpU * headWing,
      v: b.v - dirV * headLen - perpV * headWing,
    };
    return [
      [a, b],
      [wing1, b, wing2],
    ];
  }

  if (tool === 'circle') {
    const r = Math.max(0.03, Math.hypot(du, dv));
    const segs = 40;
    const ring: Point2DLocal[] = [];
    for (let i = 0; i <= segs; i += 1) {
      const theta = (i / segs) * Math.PI * 2;
      ring.push({ u: a.u + Math.cos(theta) * r, v: a.v + Math.sin(theta) * r });
    }
    return [ring];
  }

  if (tool === 'ellipse') {
    const cu = (a.u + b.u) / 2;
    const cv = (a.v + b.v) / 2;
    const ru = Math.max(0.025, Math.abs(du) / 2);
    const rv = Math.max(0.025, Math.abs(dv) / 2);
    const segs = 40;
    const ring: Point2DLocal[] = [];
    for (let i = 0; i <= segs; i += 1) {
      const theta = (i / segs) * Math.PI * 2;
      ring.push({ u: cu + Math.cos(theta) * ru, v: cv + Math.sin(theta) * rv });
    }
    return [ring];
  }

  if (tool === 'square') {
    const side = Math.max(0.04, Math.max(Math.abs(du), Math.abs(dv)));
    const su = du >= 0 ? 1 : -1;
    const sv = dv >= 0 ? 1 : -1;
    const u2 = a.u + su * side;
    const v2 = a.v + sv * side;
    return [
      [
        { u: a.u, v: a.v },
        { u: u2, v: a.v },
        { u: u2, v: v2 },
        { u: a.u, v: v2 },
        { u: a.u, v: a.v },
      ],
    ];
  }

  // rectangle
  return [
    [
      { u: a.u, v: a.v },
      { u: b.u, v: a.v },
      { u: b.u, v: b.v },
      { u: a.u, v: b.v },
      { u: a.u, v: a.v },
    ],
  ];
}

function computeRulerMeasurementLabel(
  tool: PersistedAnnotationTool,
  points2D: Point2DLocal[],
  isCalibrated: boolean
): string | undefined {
  if (points2D.length < 2) return undefined;
  const a = points2D[0];
  const b = points2D[points2D.length - 1];
  const du = b.u - a.u;
  const dv = b.v - a.v;

  if (tool === 'ruler_straight') {
    return formatPhysicalDistanceMm(Math.hypot(du, dv), isCalibrated);
  }
  if (tool === 'ruler_right_angle') {
    const leg1 = Math.abs(du);
    const leg2 = Math.abs(dv);
    if (!isCalibrated) return 'Scale not verified (90°)';
    return `${Math.round(leg1 * 1000).toLocaleString('en-US')} × ${Math.round(leg2 * 1000).toLocaleString('en-US')} mm · 90°`;
  }
  if (tool === 'ruler_angle') {
    const angDeg = Math.round((Math.abs(Math.atan2(dv, du)) * 180) / Math.PI * 10) / 10;
    return `${angDeg.toFixed(1)}°`;
  }
  return undefined;
}

function buildSurfaceRibbonGeometry(
  polyline: Point2DLocal[],
  origin: THREE.Vector3,
  normal: THREE.Vector3,
  tangentU: THREE.Vector3,
  tangentV: THREE.Vector3,
  halfWidth: number,
  surfaceLift: number
): THREE.BufferGeometry | null {
  if (polyline.length < 2) return null;
  const positions: number[] = [];
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const seg = new THREE.Vector3();
  const side = new THREE.Vector3();

  const toWorld = (pt: Point2DLocal, out: THREE.Vector3) =>
    out
      .copy(origin)
      .addScaledVector(tangentU, pt.u)
      .addScaledVector(tangentV, pt.v)
      .addScaledVector(normal, surfaceLift);

  for (let i = 0; i < polyline.length - 1; i += 1) {
    toWorld(polyline[i], p0);
    toWorld(polyline[i + 1], p1);
    seg.subVectors(p1, p0);
    const len = seg.length();
    if (len < 0.0005) continue;
    seg.divideScalar(len);
    side.crossVectors(normal, seg).normalize().multiplyScalar(halfWidth);

    const ext = seg.clone().multiplyScalar(halfWidth * 0.45);
    const a0 = p0.clone().sub(ext).add(side);
    const b0 = p0.clone().sub(ext).sub(side);
    const a1 = p1.clone().add(ext).add(side);
    const b1 = p1.clone().add(ext).sub(side);

    positions.push(
      a0.x, a0.y, a0.z,
      b0.x, b0.y, b0.z,
      a1.x, a1.y, a1.z,
      b0.x, b0.y, b0.z,
      b1.x, b1.y, b1.z,
      a1.x, a1.y, a1.z
    );
  }

  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

interface AnnotationPickMeta {
  annotationId: string;
  kind: AnnotationPickPieceKind;
  worldPolylines: THREE.Vector3[][];
  labelWorldPos: THREE.Vector3 | null;
  labelScaleX: number;
  labelScaleY: number;
  anchorWorldPos: THREE.Vector3;
}

function createWallFillOverlayGroup(
  elementId: string,
  colorHex: string,
  selectableMeshes: THREE.Mesh[],
  annotationId: string | null,
  isSelected = false
): THREE.Group {
  const group = new THREE.Group();
  const targetMeshes = selectableMeshes.filter((m) => m.userData.elementId === elementId);
  if (targetMeshes.length === 0) return group;

  const fillMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex || '#D4652F'),
    transparent: true,
    opacity: isSelected ? 0.64 : 0.52,
    roughness: 0.72,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    depthWrite: false,
  });

  const selectionEdgeMat = isSelected
    ? new THREE.LineBasicMaterial({ color: 0x10b981, depthTest: true })
    : null;

  const boxTmp = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const anchorSum = new THREE.Vector3();

  for (const srcMesh of targetMeshes) {
    boxTmp.setFromObject(srcMesh);
    boxTmp.getSize(size);
    boxTmp.getCenter(center);
    anchorSum.add(center);
    // Slightly inflate overlay so it tints ONLY this wall cleanly without z-fighting or modifying shared elementMaterials
    const geo = new THREE.BoxGeometry(size.x + 0.014, size.y + 0.014, size.z + 0.014);
    const overlay = new THREE.Mesh(geo, fillMat);
    overlay.position.copy(center);
    if (annotationId) {
      overlay.userData.annotationId = annotationId;
      overlay.userData.isAnnotationHitTarget = true;
      overlay.userData.annotationHitKind = 'wall_fill';
    }
    if (selectionEdgeMat) {
      const edges = new THREE.EdgesGeometry(geo);
      const wire = new THREE.LineSegments(edges, selectionEdgeMat);
      wire.scale.set(1.004, 1.004, 1.004);
      overlay.add(wire);
    }
    group.add(overlay);
  }

  if (annotationId) {
    group.userData.annotationId = annotationId;
    const anchorCenter = anchorSum.multiplyScalar(1 / targetMeshes.length);
    const pickMeta: AnnotationPickMeta = {
      annotationId,
      kind: 'wall_fill',
      worldPolylines: [],
      labelWorldPos: null,
      labelScaleX: 0,
      labelScaleY: 0,
      anchorWorldPos: anchorCenter,
    };
    group.userData.pickMeta = pickMeta;
  }
  return group;
}

function createAnnotationRenderGroup(
  annotation: Pick<
    PrivateSurfaceAnnotation,
    | 'elementId'
    | 'tool'
    | 'colorHex'
    | 'strokeWidth'
    | 'strokeWidthPx'
    | 'lineStyle'
    | 'origin'
    | 'normal'
    | 'tangentU'
    | 'tangentV'
    | 'points2D'
    | 'measurementLabel'
  >,
  annotationId: string | null,
  selectableMeshes: THREE.Mesh[],
  isPreview = false,
  isSelected = false
): THREE.Group {
  if (annotation.tool === 'wall_fill') {
    return createWallFillOverlayGroup(
      annotation.elementId,
      annotation.colorHex,
      selectableMeshes,
      annotationId,
      isSelected
    );
  }

  const group = new THREE.Group();
  const origin = new THREE.Vector3(annotation.origin.x, annotation.origin.y, annotation.origin.z);
  const normal = new THREE.Vector3(annotation.normal.x, annotation.normal.y, annotation.normal.z).normalize();
  const tangentU = new THREE.Vector3(
    annotation.tangentU.x,
    annotation.tangentU.y,
    annotation.tangentU.z
  ).normalize();
  const tangentV = new THREE.Vector3(
    annotation.tangentV.x,
    annotation.tangentV.y,
    annotation.tangentV.z
  ).normalize();

  const px = annotation.strokeWidthPx ?? strokeWidthKeyToPx(annotation.strokeWidth);
  const widthMultiplier =
    annotation.tool === 'pencil'
      ? 0.55
      : annotation.tool === 'marker'
      ? 2.15
      : 1.0;
  const halfWidth = strokeWidthPxToWorldMeters(px, widthMultiplier) * 0.5;
  const surfaceLift = isPreview ? 0.018 : annotation.tool === 'marker' ? 0.011 : 0.014;
  const lineStyle: DrawingLineStyle = annotation.lineStyle ?? 'solid';

  const rawPolylines = sampleShapePolylines2D(annotation.tool, annotation.points2D);
  const styledPolylines = rawPolylines.flatMap((poly) =>
    splitPolyline2DByStyle(poly, lineStyle, halfWidth)
  );
  const color = new THREE.Color(annotation.colorHex || '#E11D48');

  const isTranslucent = isPreview || annotation.tool === 'marker';
  const opacity = isPreview ? 0.78 : annotation.tool === 'marker' ? 0.42 : 1.0;

  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: isTranslucent,
    opacity,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    depthWrite: !isTranslucent,
  });

  const hitMat = new THREE.MeshBasicMaterial({
    visible: false,
    side: THREE.DoubleSide,
  });

  // Visible selection halo behind selected stroke/shape/ruler line
  if (isSelected && !isPreview) {
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (const poly of rawPolylines) {
      const haloGeo = buildSurfaceRibbonGeometry(
        poly,
        origin,
        normal,
        tangentU,
        tangentV,
        halfWidth + 0.028,
        surfaceLift - 0.0015
      );
      if (haloGeo) {
        const haloMesh = new THREE.Mesh(haloGeo, haloMat);
        haloMesh.renderOrder = 2;
        if (annotationId) {
          haloMesh.userData.annotationId = annotationId;
          haloMesh.userData.isAnnotationHitTarget = true;
          haloMesh.userData.annotationHitKind = 'stroke';
        }
        group.add(haloMesh);
      }
    }
  }

  for (const poly of styledPolylines) {
    const geo = buildSurfaceRibbonGeometry(
      poly,
      origin,
      normal,
      tangentU,
      tangentV,
      halfWidth,
      surfaceLift
    );
    if (geo) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      if (annotationId) {
        mesh.userData.annotationId = annotationId;
        mesh.userData.isAnnotationHitTarget = true;
        mesh.userData.annotationHitKind = 'stroke';
      }
      group.add(mesh);
    }
  }

  // Register wider invisible hit ribbons for dashed/dotted/thin strokes and build world polylines for screen-space picking
  const worldPolylines: THREE.Vector3[][] = [];
  for (const poly of rawPolylines) {
    const chain = poly.map((p) =>
      origin
        .clone()
        .addScaledVector(tangentU, p.u)
        .addScaledVector(tangentV, p.v)
        .addScaledVector(normal, surfaceLift)
    );
    if (chain.length >= 2) {
      worldPolylines.push(chain);
    }

    if (annotationId && !isPreview) {
      const hitGeo = buildSurfaceRibbonGeometry(
        poly,
        origin,
        normal,
        tangentU,
        tangentV,
        Math.max(0.065, halfWidth * 3),
        surfaceLift + 0.002
      );
      if (hitGeo) {
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.userData.annotationId = annotationId;
        hitMesh.userData.isAnnotationHitTarget = true;
        hitMesh.userData.annotationHitKind = 'stroke';
        group.add(hitMesh);
      }
    }
  }

  // Ruler measurement readout sprite (depth-tested against walls & registered in annotationHitTargets)
  let labelWorldPos: THREE.Vector3 | null = null;
  let labelScaleX = 0;
  let labelScaleY = 0;
  if (annotation.measurementLabel && annotation.points2D.length >= 2) {
    const a = annotation.points2D[0];
    const b = annotation.points2D[annotation.points2D.length - 1];
    const midU = (a.u + b.u) / 2;
    const midV = (a.v + b.v) / 2;
    labelScaleX = isSelected ? 0.92 : 0.86;
    labelScaleY = isSelected ? 0.22 : 0.2;
    const labelNormalClearance = Math.max(0.24, labelScaleX * 0.52);
    labelWorldPos = origin
      .clone()
      .addScaledVector(tangentU, midU)
      .addScaledVector(tangentV, midV)
      .addScaledVector(normal, surfaceLift + labelNormalClearance);
    const sprite = createTextLabelSprite(annotation.measurementLabel, {
      bg: isSelected ? 'rgba(6, 78, 59, 0.96)' : 'rgba(27, 42, 74, 0.94)',
      fg: '#FFFFFF',
      border: isSelected ? '#10B981' : annotation.colorHex || '#D4652F',
      scaleX: labelScaleX,
      scaleY: labelScaleY,
      depthTest: true,
      selected: isSelected,
    });
    sprite.position.copy(labelWorldPos);
    if (annotationId) {
      sprite.userData.annotationId = annotationId;
      sprite.userData.isAnnotationHitTarget = true;
      sprite.userData.annotationHitKind = 'label';
    }
    group.add(sprite);
  }

  if (annotationId) {
    group.userData.annotationId = annotationId;
    const primaryChain = worldPolylines[0];
    const anchorWorldPos =
      primaryChain && primaryChain.length > 0
        ? primaryChain[Math.floor(primaryChain.length / 2)].clone()
        : origin.clone().addScaledVector(normal, surfaceLift);
    const pickMeta: AnnotationPickMeta = {
      annotationId,
      kind: 'stroke',
      worldPolylines,
      labelWorldPos,
      labelScaleX,
      labelScaleY,
      anchorWorldPos,
    };
    group.userData.pickMeta = pickMeta;
  }
  return group;
}

export const SpatialViewport3D = forwardRef<SpatialViewportHandle, SpatialViewport3DProps>(
  function SpatialViewport3D(
    {
      model,
      pins,
      selectedPinId,
      selectedElementId,
      activeRoomId = null,
      layers,
      createMode,
      pendingHit,
      cameraCommand,
      onSelectPin,
      onSelectElement,
      onClearSelection,
      onCreateSurfaceHit,
      onCreateVoidClick,
      onMeshCrossCheckMeasured,
      annotations = [],
      selectedAnnotationId = null,
      activeDrawingTool = 'cursor',
      drawingColorHex = '#E11D48',
      drawingStrokeWidth = 'medium',
      drawingStrokeWidthPx,
      drawingLineStyle = 'solid',
      drawingDeleteMode = false,
      hideLocalDrawings = false,
      canDraw = false,
      isModelCalibrated = true,
      onSelectAnnotation,
      onCreateAnnotation,
      onDeleteAnnotation,
      onDrawingRejected,
      northAngleDeg = null,
      showGroundCompass = false,
      onCameraAzimuthChange,
      readOnlyViewer = false,
    },
    ref
  ) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [measuredMm, setMeasuredMm] = useState<number>(model.crossCheck.actualMm);

  // Refs holding latest React callbacks/props so the WebGL canvas mounts once
  const callbacksRef = useRef({
    onSelectPin,
    onSelectElement,
    onClearSelection,
    onCreateSurfaceHit,
    onCreateVoidClick,
    onMeshCrossCheckMeasured,
    onSelectAnnotation,
    onCreateAnnotation,
    onDeleteAnnotation,
    onDrawingRejected,
    onCameraAzimuthChange,
  });
  callbacksRef.current = {
    onSelectPin,
    onSelectElement,
    onClearSelection,
    onCreateSurfaceHit,
    onCreateVoidClick,
    onMeshCrossCheckMeasured,
    onSelectAnnotation,
    onCreateAnnotation,
    onDeleteAnnotation,
    onDrawingRejected,
    onCameraAzimuthChange,
  };

  const effectiveCanDraw = !readOnlyViewer && canDraw;
  const effectiveCreateMode = !readOnlyViewer && createMode;
  const effectiveStrokeWidthPx = drawingStrokeWidthPx ?? strokeWidthKeyToPx(drawingStrokeWidth);

  const stateRef = useRef({
    createMode: effectiveCreateMode,
    layers,
    selectedElementId,
    selectedPinId,
    selectedAnnotationId: effectiveCanDraw ? selectedAnnotationId : null,
    activeRoomId,
    pins,
    pendingHit,
    annotations,
    activeDrawingTool,
    drawingColorHex,
    drawingStrokeWidth,
    drawingStrokeWidthPx: effectiveStrokeWidthPx,
    drawingLineStyle,
    drawingDeleteMode: drawingDeleteMode || activeDrawingTool === 'eraser',
    hideLocalDrawings: readOnlyViewer ? true : hideLocalDrawings,
    canDraw: effectiveCanDraw,
    isModelCalibrated,
    northAngleDeg,
    showGroundCompass,
    readOnlyViewer,
  });
  stateRef.current = {
    createMode: effectiveCreateMode,
    layers,
    selectedElementId,
    selectedPinId,
    selectedAnnotationId: effectiveCanDraw ? selectedAnnotationId : null,
    activeRoomId,
    pins,
    pendingHit,
    annotations,
    activeDrawingTool,
    drawingColorHex,
    drawingStrokeWidth,
    drawingStrokeWidthPx: effectiveStrokeWidthPx,
    drawingLineStyle,
    drawingDeleteMode: drawingDeleteMode || activeDrawingTool === 'eraser',
    hideLocalDrawings: readOnlyViewer ? true : hideLocalDrawings,
    canDraw: effectiveCanDraw,
    isModelCalibrated,
    northAngleDeg,
    showGroundCompass,
    readOnlyViewer,
  };

  // Three.js scene references updated without tearing down WebGLRenderer
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    buildingGroup: THREE.Group;
    roomHighlightGroup: THREE.Group;
    pinGroup: THREE.Group;
    pendingGroup: THREE.Group;
    privateDrawingGroup: THREE.Group;
    drawingPreviewGroup: THREE.Group;
    groundCompassGroup: THREE.Group;
    selectableMeshes: THREE.Mesh[];
    pinHitTargets: THREE.Object3D[];
    annotationHitTargets: THREE.Object3D[];
    annotationPickMetas: AnnotationPickMeta[];
    elementMaterials: Map<string, THREE.MeshStandardMaterial>;
    overallPos: THREE.Vector3;
    overallTarget: THREE.Vector3;
    fitPos: THREE.Vector3;
    fitTarget: THREE.Vector3;
    requestRender: () => void;
    startCameraTransition: (pos: THREE.Vector3, target: THREE.Vector3) => void;
    syncCameraDataset: () => void;
    clearDrawingPreview: () => void;
  } | null>(null);

  const rebuildPrivateDrawings = useCallback(() => {
    const ctx = threeRef.current;
    if (!ctx) return;

    while (ctx.privateDrawingGroup.children.length > 0) {
      const child = ctx.privateDrawingGroup.children[0];
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        } else if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        }
      });
      ctx.privateDrawingGroup.remove(child);
    }

    ctx.annotationHitTargets.length = 0;
    ctx.annotationPickMetas.length = 0;

    if (!stateRef.current.readOnlyViewer) {
      const selectedId = stateRef.current.selectedAnnotationId;
      for (const ann of stateRef.current.annotations) {
        const isSelected = Boolean(selectedId && ann.id === selectedId);
        const grp = createAnnotationRenderGroup(
          ann,
          ann.id,
          ctx.selectableMeshes,
          false,
          isSelected
        );
        ctx.privateDrawingGroup.add(grp);
        const pickMeta = grp.userData.pickMeta as AnnotationPickMeta | undefined;
        if (pickMeta) {
          ctx.annotationPickMetas.push(pickMeta);
        }
        grp.traverse((obj) => {
          if (
            (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) &&
            obj.userData.isAnnotationHitTarget &&
            obj.userData.annotationId
          ) {
            ctx.annotationHitTargets.push(obj);
          }
        });
      }
    }

    ctx.privateDrawingGroup.visible =
      !stateRef.current.readOnlyViewer && !stateRef.current.hideLocalDrawings;
    ctx.syncCameraDataset();
    ctx.requestRender();
  }, []);

  // Expose Clean PNG capture and camera snapshot controls to parent Workspace
  useImperativeHandle(
    ref,
    () => ({
      async captureCleanPng(options) {
        const ctx = threeRef.current;
        if (!ctx) {
          throw new Error('3D viewport is not ready yet. Wait for the model to finish loading.');
        }

        const prevDrawingsVisible = ctx.privateDrawingGroup.visible;
        const prevPreviewVisible = ctx.drawingPreviewGroup.visible;
        const prevPendingVisible = ctx.pendingGroup.visible;

        // Strictly exclude private device-local drawings and pending edit markers from output
        ctx.privateDrawingGroup.visible = false;
        ctx.drawingPreviewGroup.visible = false;
        ctx.pendingGroup.visible = false;

        try {
          ctx.renderer.render(ctx.scene, ctx.camera);
          const glCanvas = ctx.renderer.domElement;
          const width = glCanvas.width;
          const height = glCanvas.height;
          if (width < 16 || height < 16) {
            throw new Error('Viewport dimensions are too small to capture a valid PNG.');
          }

          const bannerHeight = options?.provenanceBanner ? 34 : 0;
          const outCanvas = document.createElement('canvas');
          outCanvas.width = width;
          outCanvas.height = height + bannerHeight;
          const ctx2d = outCanvas.getContext('2d');
          if (!ctx2d) {
            throw new Error('Browser 2D canvas context unavailable for PNG export.');
          }

          ctx2d.fillStyle = '#EDECE7';
          ctx2d.fillRect(0, 0, outCanvas.width, outCanvas.height);
          ctx2d.drawImage(glCanvas, 0, 0, width, height);

          // Guard against blank or corrupted captures by verifying pixel variance on the 3D area
          const imgData = ctx2d.getImageData(0, 0, width, height).data;
          let minLuma = 255;
          let maxLuma = 0;
          let nonZeroAlpha = 0;
          const step = Math.max(4, Math.floor((width * height) / 4000)) * 4;
          for (let i = 0; i < imgData.length; i += step) {
            const a = imgData[i + 3];
            if (a > 10) {
              nonZeroAlpha += 1;
              const luma = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
              if (luma < minLuma) minLuma = luma;
              if (luma > maxLuma) maxLuma = luma;
            }
          }
          if (nonZeroAlpha === 0 || maxLuma - minLuma < 2) {
            throw new Error(
              'Captured frame appeared blank. Retry once the 3D scene has finished rendering.'
            );
          }

          if (options?.provenanceBanner) {
            ctx2d.fillStyle = '#1B2A4A';
            ctx2d.fillRect(0, height, width, bannerHeight);
            ctx2d.fillStyle = '#FFFFFF';
            ctx2d.font = '600 13px Inter, system-ui, sans-serif';
            ctx2d.textBaseline = 'middle';
            ctx2d.fillText(options.provenanceBanner, 14, height + bannerHeight / 2);
          }

          const blob = await new Promise<Blob>((resolve, reject) => {
            outCanvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG file.'))),
              'image/png'
            );
          });

          return { blob, width: outCanvas.width, height: outCanvas.height };
        } finally {
          ctx.privateDrawingGroup.visible = prevDrawingsVisible;
          ctx.drawingPreviewGroup.visible = prevPreviewVisible;
          ctx.pendingGroup.visible = prevPendingVisible;
          ctx.renderer.render(ctx.scene, ctx.camera);
        }
      },

      getCameraSnapshot() {
        const ctx = threeRef.current;
        if (!ctx) return null;
        return {
          position: {
            x: ctx.camera.position.x,
            y: ctx.camera.position.y,
            z: ctx.camera.position.z,
          },
          target: {
            x: ctx.controls.target.x,
            y: ctx.controls.target.y,
            z: ctx.controls.target.z,
          },
        };
      },

      applyCameraSnapshot(cam) {
        const ctx = threeRef.current;
        if (!ctx) return;
        ctx.startCameraTransition(
          new THREE.Vector3(cam.position.x, cam.position.y, cam.position.z),
          new THREE.Vector3(cam.target.x, cam.target.y, cam.target.z)
        );
      },
    }),
    []
  );

  const rebuildPinMarkers = useCallback(() => {
    const ctx = threeRef.current;
    if (!ctx) return;

    // Dispose old pin markers
    while (ctx.pinGroup.children.length > 0) {
      const child = ctx.pinGroup.children[0];
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      ctx.pinGroup.remove(child);
    }

    ctx.pinHitTargets.length = 0;

    for (const pin of stateRef.current.pins) {
      const isSelected = pin.id === stateRef.current.selectedPinId;
      const marker = createPinMarkerGroup(pin, isSelected);
      ctx.pinGroup.add(marker);
      marker.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData.pinId) {
          ctx.pinHitTargets.push(obj);
        }
      });
    }

    ctx.pinGroup.visible = stateRef.current.layers.pins;
    ctx.requestRender();
  }, []);

  const rebuildPendingMarker = useCallback(() => {
    const ctx = threeRef.current;
    if (!ctx) return;

    while (ctx.pendingGroup.children.length > 0) {
      const child = ctx.pendingGroup.children[0];
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      ctx.pendingGroup.remove(child);
    }

    const hit = stateRef.current.pendingHit;
    if (hit && stateRef.current.createMode) {
      const marker = new THREE.Group();
      marker.position.set(hit.point.x, hit.point.y, hit.point.z);
      const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

      const disc = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.11, 24),
        new THREE.MeshBasicMaterial({ color: 0x0b63ce, side: THREE.DoubleSide })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.015;
      marker.add(disc);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0x0b63ce,
          emissive: 0x0b63ce,
          emissiveIntensity: 0.4,
          roughness: 0.25,
        })
      );
      dot.position.y = 0.08;
      marker.add(dot);

      ctx.pendingGroup.add(marker);
    }

    ctx.requestRender();
  }, []);

  const updateElementHighlights = useCallback(() => {
    const ctx = threeRef.current;
    if (!ctx) return;

    const selectedEl = stateRef.current.selectedElementId;
    for (const [elId, mat] of ctx.elementMaterials.entries()) {
      const isSelected = elId === selectedEl;
      if (isSelected) {
        mat.emissive.setHex(0xd4652f);
        mat.emissiveIntensity = 0.24;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }

    ctx.buildingGroup.visible = stateRef.current.layers.civil;
    ctx.pinGroup.visible = stateRef.current.layers.pins;
    ctx.requestRender();
  }, []);

  const rebuildRoomHighlight = useCallback(() => {
    const ctx = threeRef.current;
    if (!ctx) return;

    while (ctx.roomHighlightGroup.children.length > 0) {
      const child = ctx.roomHighlightGroup.children[0];
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineLoop) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      ctx.roomHighlightGroup.remove(child);
    }

    const activeId = stateRef.current.activeRoomId;
    if (activeId) {
      const room = model.rooms.find((r) => r.id === activeId);
      if (room) {
        const fillMat = new THREE.MeshBasicMaterial({
          color: 0xd4652f,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });

        if (room.polygon && room.polygon.length >= 3) {
          const shape = new THREE.Shape();
          room.polygon.forEach((pt, i) => {
            if (i === 0) shape.moveTo(pt.x, -pt.z);
            else shape.lineTo(pt.x, -pt.z);
          });
          shape.closePath();
          const fillGeo = new THREE.ShapeGeometry(shape);
          const fillMesh = new THREE.Mesh(fillGeo, fillMat);
          fillMesh.rotation.x = -Math.PI / 2;
          fillMesh.position.set(0, 0.015, 0);
          ctx.roomHighlightGroup.add(fillMesh);

          const outlinePts = room.polygon.map((pt) => new THREE.Vector3(pt.x, 0.022, pt.z));
          const lineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts);
          const lineMat = new THREE.LineBasicMaterial({ color: 0xd4652f });
          ctx.roomHighlightGroup.add(new THREE.LineLoop(lineGeo, lineMat));
        } else {
          const w = Math.max(0.1, room.bounds.maxX - room.bounds.minX);
          const d = Math.max(0.1, room.bounds.maxZ - room.bounds.minZ);
          const cx = (room.bounds.minX + room.bounds.maxX) / 2;
          const cz = (room.bounds.minZ + room.bounds.maxZ) / 2;

          const fillGeo = new THREE.PlaneGeometry(w, d);
          const fillMesh = new THREE.Mesh(fillGeo, fillMat);
          fillMesh.rotation.x = -Math.PI / 2;
          fillMesh.position.set(cx, 0.012, cz);
          ctx.roomHighlightGroup.add(fillMesh);

          const outlinePts = [
            new THREE.Vector3(room.bounds.minX + 0.02, 0.02, room.bounds.minZ + 0.02),
            new THREE.Vector3(room.bounds.maxX - 0.02, 0.02, room.bounds.minZ + 0.02),
            new THREE.Vector3(room.bounds.maxX - 0.02, 0.02, room.bounds.maxZ - 0.02),
            new THREE.Vector3(room.bounds.minX + 0.02, 0.02, room.bounds.maxZ - 0.02),
          ];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts);
          const lineMat = new THREE.LineBasicMaterial({ color: 0xd4652f });
          const loop = new THREE.LineLoop(lineGeo, lineMat);
          ctx.roomHighlightGroup.add(loop);
        }
      }
    }

    ctx.requestRender();
  }, [model.rooms]);

  // Main WebGL mount lifecycle
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    setWebglError(null);
    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL could not be initialized on this browser or graphics context.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialW = Math.max(container.clientWidth, 320);
    const initialH = Math.max(container.clientHeight, 260);
    renderer.setSize(initialW, initialH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute(
      'aria-label',
      model.versionId === 'a03-r00-demo-v1'
        ? 'Paviliun Kerja A-03 3D Architectural Model'
        : `Calibrated 3D Architectural Model (${model.versionId})`
    );
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    if (containerRef.current) {
      const prev = Number(containerRef.current.dataset.rendererMountId || '0');
      containerRef.current.dataset.rendererMountId = String(prev + 1);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xedece7);
    scene.fog = new THREE.Fog(0xedece7, 26, 56);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, initialW / initialH, 0.1, 100);
    camera.position.copy(OVERALL_CAM_POS);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(OVERALL_CAM_TARGET);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.4;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.update();

    // Warm key + cool hemisphere fill + rim light
    const hemiLight = new THREE.HemisphereLight(0xf6f8fc, 0xc8c3b8, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.35);
    keyLight.position.set(8.5, 13, -7.5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -8;
      keyLight.shadow.camera.right = 8;
      keyLight.shadow.camera.top = 8;
      keyLight.shadow.camera.bottom = -8;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xd9e6f6, 0.45);
    rimLight.position.set(-9, 7, 8);
    scene.add(rimLight);

    // Subtle ground site grid below slab
    const gridHelper = new THREE.GridHelper(20, 20, 0xc2c8d0, 0xd8dce1);
    gridHelper.position.y = -0.185;
    scene.add(gridHelper);

    const buildingGroup = new THREE.Group();
    const roomHighlightGroup = new THREE.Group();
    const pinGroup = new THREE.Group();
    const pendingGroup = new THREE.Group();
    const privateDrawingGroup = new THREE.Group();
    const drawingPreviewGroup = new THREE.Group();
    const groundCompassGroup = createGroundCompassGroup(5.6);
    groundCompassGroup.visible = Boolean(stateRef.current.showGroundCompass);
    groundCompassGroup.rotation.y = computeCompassOrientation(
      0,
      stateRef.current.northAngleDeg
    ).groundRoseRotationRad;
    scene.add(buildingGroup);
    scene.add(roomHighlightGroup);
    scene.add(pinGroup);
    scene.add(pendingGroup);
    scene.add(privateDrawingGroup);
    scene.add(drawingPreviewGroup);
    scene.add(groundCompassGroup);

    const selectableMeshes: THREE.Mesh[] = [];
    const elementMaterials = new Map<string, THREE.MeshStandardMaterial>();

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b4858,
      roughness: 0.42,
      metalness: 0.35,
    });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x9cb8cc,
      roughness: 0.14,
      metalness: 0.08,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const edgeLineMat = new THREE.LineBasicMaterial({
      color: 0x808d9c,
      transparent: true,
      opacity: 0.55,
    });

    // Build deterministic A-03 R00 architectural meshes
    const northWallRapMeshes: THREE.Mesh[] = [];
    const sharedPartitionMeshes: THREE.Mesh[] = [];

    for (const element of model.elements) {
      const baseColor =
        element.category === 'floor_slab'
          ? 0xdad7cf
          : element.category === 'exterior_wall'
            ? 0xd4d8de
            : 0xe4e1da;

      const elMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: element.category === 'floor_slab' ? 0.88 : 0.78,
        metalness: 0.03,
      });
      elementMaterials.set(element.id, elMat);

      for (const box of element.boxes) {
        const geo = new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z);
        const mat =
          box.kind === 'frame'
            ? frameMaterial
            : box.kind === 'glass'
              ? glassMaterial
              : elMat;

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(box.center.x, box.center.y, box.center.z);
        mesh.userData.elementId = element.id;
        mesh.userData.boxKind = box.kind;

        if (!isSoftwareGl && box.kind !== 'glass') {
          mesh.castShadow = box.kind !== 'slab';
          mesh.receiveShadow = true;
        }

        if (box.kind === 'wall' || box.kind === 'slab') {
          const edges = new THREE.EdgesGeometry(geo);
          const line = new THREE.LineSegments(edges, edgeLineMat);
          mesh.add(line);
          selectableMeshes.push(mesh);

          if (element.id === 'W-EXT-NORTH' && box.center.x + box.size.x / 2 > 0.05) {
            northWallRapMeshes.push(mesh);
          }
          if (element.id === 'W-PART-RAPAT-ARSIP') {
            sharedPartitionMeshes.push(mesh);
          }
        }

        buildingGroup.add(mesh);
      }
    }

    // Compute slab dimensions for floor room-label overlay
    const slabEl = model.elements.find((e) => e.category === 'floor_slab');
    const slabBox = slabEl?.boxes[0];
    const slabW = slabBox ? slabBox.size.x : 8.25;
    const slabD = slabBox ? slabBox.size.z : 5.85;

    // Floor room-label decal plane slightly above finished floor (+0.004 m) with polygonOffset
    const floorTex = createFloorPlanCanvasTexture(model, slabW, slabD);
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorOverlayGeo = new THREE.PlaneGeometry(
      model.versionId === 'a03-r00-demo-v1' ? 8.25 : Math.max(0.5, slabW - 0.12),
      model.versionId === 'a03-r00-demo-v1' ? 5.85 : Math.max(0.5, slabD - 0.12)
    );
    const floorOverlayMat = new THREE.MeshBasicMaterial({
      map: floorTex,
      transparent: true,
      opacity: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const floorOverlayMesh = new THREE.Mesh(floorOverlayGeo, floorOverlayMat);
    floorOverlayMesh.rotation.x = -Math.PI / 2;
    floorOverlayMesh.position.set(0, 0.004, 0);
    buildingGroup.add(floorOverlayMesh);

    // Compute dynamic camera framing for custom models (preserving exact A-03 presets for demo fixture)
    buildingGroup.updateMatrixWorld(true);
    let overallPos = OVERALL_CAM_POS.clone();
    let overallTarget = OVERALL_CAM_TARGET.clone();
    let fitPos = FIT_CAM_POS.clone();
    let fitTarget = FIT_CAM_TARGET.clone();

    if (model.versionId !== 'a03-r00-demo-v1') {
      const bounds = new THREE.Box3().setFromObject(buildingGroup);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      bounds.getCenter(center);
      bounds.getSize(size);
      const radius = Math.max(3.5, Math.hypot(size.x, size.z) * 0.65);
      overallTarget = new THREE.Vector3(center.x, Math.max(0.7, size.y * 0.25), center.z);
      overallPos = new THREE.Vector3(
        center.x + radius * 1.1,
        Math.max(5.2, radius * 1.35),
        center.z - radius * 1.5
      );
      fitTarget = overallTarget.clone();
      fitPos = new THREE.Vector3(
        center.x + radius * 0.95,
        Math.max(4.6, radius * 1.18),
        center.z - radius * 1.32
      );
      camera.position.copy(overallPos);
      controls.target.copy(overallTarget);
      controls.maxDistance = Math.max(24, radius * 4.5);
      controls.update();
    }

    // Measure Ruang Rapat clear N–S directly from rendered Three.js Box3 bounds (A-03) or report built crossCheck
    if (northWallRapMeshes.length > 0 && sharedPartitionMeshes.length > 0) {
      const boxTmp = new THREE.Box3();
      let northInnerZ = -Infinity;
      for (const m of northWallRapMeshes) {
        boxTmp.setFromObject(m);
        if (boxTmp.max.z > northInnerZ) northInnerZ = boxTmp.max.z;
      }
      let partitionNorthZ = Infinity;
      for (const m of sharedPartitionMeshes) {
        boxTmp.setFromObject(m);
        if (boxTmp.min.z < partitionNorthZ) partitionNorthZ = boxTmp.min.z;
      }
      const actualMm = Math.round((partitionNorthZ - northInnerZ) * 1000 * 1000) / 1000;
      const referenceMm = model.crossCheck.referenceMm;
      const deltaMm = Math.round((actualMm - referenceMm) * 1000) / 1000;
      setMeasuredMm(actualMm);
      callbacksRef.current.onMeshCrossCheckMeasured?.({
        ...model.crossCheck,
        actualMm,
        deltaMm,
        northFaceZ: northInnerZ,
        southFaceZ: partitionNorthZ,
        method:
          'Live Three.js Box3 face measurement (W-EXT-NORTH inner south face to W-PART-RAPAT-ARSIP north face)',
      });
    } else {
      setMeasuredMm(model.crossCheck.actualMm);
      callbacksRef.current.onMeshCrossCheckMeasured?.(model.crossCheck);
    }

    // On-demand render pipeline with software WebGL fenceSync pacing
    let disposed = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let pendingSize: { w: number; h: number } | null = null;
    let lastTime = performance.now();

    let transition: {
      goalPos: THREE.Vector3;
      goalTarget: THREE.Vector3;
    } | null = null;

    const prefersReducedMotion = () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const afterDraw = (cb: () => void) => {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 50);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 45);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    let lastReportedAzimuthDeg = Number.NaN;
    const syncCameraDataset = (posVec = camera.position, targetVec = controls.target) => {
      const el = containerRef.current;
      if (!el) return;
      el.dataset.cameraPos = `${posVec.x.toFixed(2)},${posVec.y.toFixed(2)},${posVec.z.toFixed(2)}`;
      el.dataset.cameraTarget = `${targetVec.x.toFixed(2)},${targetVec.y.toFixed(2)},${targetVec.z.toFixed(2)}`;

      // Compute camera azimuth around Y (0 deg = camera on +Z looking toward -Z)
      const azRad = Math.atan2(posVec.x - targetVec.x, posVec.z - targetVec.z);
      const azDeg = Math.round((((azRad * 180) / Math.PI) % 360 + 360) % 360);
      el.dataset.cameraAzimuthDeg = String(azDeg);
      if (azDeg !== lastReportedAzimuthDeg) {
        lastReportedAzimuthDeg = azDeg;
        callbacksRef.current.onCameraAzimuthChange?.(azDeg);
      }

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        camera.updateMatrixWorld();
        if (pinGroup.children.length > 0) {
          const coords: Record<string, { x: number; y: number }> = {};
          const worldPos = new THREE.Vector3();
          for (const child of pinGroup.children) {
            const pid = child.userData?.pinId as string | undefined;
            if (!pid) continue;
            const hitMesh = child.children.find((c) => c.userData?.isPinHitTarget) ?? child;
            hitMesh.getWorldPosition(worldPos);
            worldPos.project(camera);
            coords[pid] = {
              x: Math.round(rect.left + ((worldPos.x + 1) / 2) * rect.width),
              y: Math.round(rect.top + ((-worldPos.y + 1) / 2) * rect.height),
            };
          }
          el.dataset.pinScreen = JSON.stringify(coords);
        }

        const metas = threeRef.current?.annotationPickMetas ?? [];
        if (metas.length > 0 && privateDrawingGroup.visible) {
          const annCoords: Record<
            string,
            { stroke: { x: number; y: number }; label?: { x: number; y: number } }
          > = {};
          const proj = new THREE.Vector3();
          for (const meta of metas) {
            proj.copy(meta.anchorWorldPos).project(camera);
            const entry: { stroke: { x: number; y: number }; label?: { x: number; y: number } } = {
              stroke: {
                x: Math.round(rect.left + ((proj.x + 1) / 2) * rect.width),
                y: Math.round(rect.top + ((-proj.y + 1) / 2) * rect.height),
              },
            };
            if (meta.labelWorldPos) {
              proj.copy(meta.labelWorldPos).project(camera);
              entry.label = {
                x: Math.round(rect.left + ((proj.x + 1) / 2) * rect.width),
                y: Math.round(rect.top + ((-proj.y + 1) / 2) * rect.height),
              };
            }
            annCoords[meta.annotationId] = entry;
          }
          el.dataset.annotationScreen = JSON.stringify(annCoords);
        } else {
          el.dataset.annotationScreen = '{}';
        }
      }
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        let needsAnotherFrame = false;

        if (transition) {
          if (prefersReducedMotion() || isSoftwareGl) {
            camera.position.copy(transition.goalPos);
            controls.target.copy(transition.goalTarget);
            transition = null;
          } else {
            const factor = 1 - Math.exp(-8.5 * dt);
            camera.position.lerp(transition.goalPos, factor);
            controls.target.lerp(transition.goalTarget, factor);
            if (
              camera.position.distanceTo(transition.goalPos) < 0.025 &&
              controls.target.distanceTo(transition.goalTarget) < 0.025
            ) {
              camera.position.copy(transition.goalPos);
              controls.target.copy(transition.goalTarget);
              transition = null;
            } else {
              needsAnotherFrame = true;
            }
          }
          syncCameraDataset();
        }

        const damped = controls.update();
        if (damped && !isSoftwareGl) {
          needsAnotherFrame = true;
        }

        if (pendingSize) {
          camera.aspect = pendingSize.w / pendingSize.h;
          camera.updateProjectionMatrix();
          renderer.setSize(pendingSize.w, pendingSize.h, false);
          pendingSize = null;
        }

        syncCameraDataset();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || needsAnotherFrame)) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    };

    const startCameraTransition = (pos: THREE.Vector3, target: THREE.Vector3) => {
      // Immediately replace any in-flight transition (cancels old focus on rapid A -> B click)
      transition = {
        goalPos: pos.clone(),
        goalTarget: target.clone(),
      };
      syncCameraDataset(pos, target);
      requestRender();
    };

    controls.addEventListener('start', () => {
      // User manual orbit/pan cancels any scripted camera move
      transition = null;
    });

    controls.addEventListener('change', () => {
      syncCameraDataset();
      requestRender();
    });

    // Raycasting pointer click & private surface-drawing handler
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const normalMatrix = new THREE.Matrix3();
    let pointerDownPos: { x: number; y: number } | null = null;

    let activeStroke: {
      elementId: string;
      tool: PersistedAnnotationTool;
      colorHex: string;
      strokeWidth: DrawingStrokeWidthKey;
      strokeWidthPx: number;
      lineStyle: DrawingLineStyle;
      origin: THREE.Vector3;
      normal: THREE.Vector3;
      tangentU: THREE.Vector3;
      tangentV: THREE.Vector3;
      plane: THREE.Plane;
      points2D: Point2DLocal[];
    } | null = null;

    const clearDrawingPreview = () => {
      activeStroke = null;
      while (drawingPreviewGroup.children.length > 0) {
        const child = drawingPreviewGroup.children[0];
        child.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          } else if (obj instanceof THREE.Sprite) {
            obj.material.map?.dispose();
            obj.material.dispose();
          }
        });
        drawingPreviewGroup.remove(child);
      }
      requestRender();
    };

    const renderStrokePreview = () => {
      while (drawingPreviewGroup.children.length > 0) {
        const child = drawingPreviewGroup.children[0];
        child.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          } else if (obj instanceof THREE.Sprite) {
            obj.material.map?.dispose();
            obj.material.dispose();
          }
        });
        drawingPreviewGroup.remove(child);
      }
      if (!activeStroke || activeStroke.points2D.length < 2) {
        requestRender();
        return;
      }
      const measurementLabel = computeRulerMeasurementLabel(
        activeStroke.tool,
        activeStroke.points2D,
        stateRef.current.isModelCalibrated
      );
      const preview = createAnnotationRenderGroup(
        {
          elementId: activeStroke.elementId,
          tool: activeStroke.tool,
          colorHex: activeStroke.colorHex,
          strokeWidth: activeStroke.strokeWidth,
          strokeWidthPx: activeStroke.strokeWidthPx,
          lineStyle: activeStroke.lineStyle,
          origin: { x: activeStroke.origin.x, y: activeStroke.origin.y, z: activeStroke.origin.z },
          normal: { x: activeStroke.normal.x, y: activeStroke.normal.y, z: activeStroke.normal.z },
          tangentU: {
            x: activeStroke.tangentU.x,
            y: activeStroke.tangentU.y,
            z: activeStroke.tangentU.z,
          },
          tangentV: {
            x: activeStroke.tangentV.x,
            y: activeStroke.tangentV.y,
            z: activeStroke.tangentV.z,
          },
          points2D: activeStroke.points2D,
          measurementLabel,
        },
        null,
        selectableMeshes,
        true
      );
      drawingPreviewGroup.add(preview);
      requestRender();
    };

    const setRayFromPointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerDownPos = { x: e.clientX, y: e.clientY };

      const cur = stateRef.current;
      const isDrawingActive =
        cur.canDraw &&
        !cur.createMode &&
        !cur.drawingDeleteMode &&
        !cur.hideLocalDrawings &&
        !isCursorModeTool(cur.activeDrawingTool) &&
        cur.activeDrawingTool !== 'eraser' &&
        cur.activeDrawingTool !== 'wall_fill';

      if (isDrawingActive) {
        setRayFromPointer(e);
        const hits = cur.layers.civil
          ? raycaster.intersectObjects(selectableMeshes, false)
          : [];
        if (hits.length === 0) {
          callbacksRef.current.onDrawingRejected?.(
            'Draw on a wall or floor surface — empty space cannot anchor a surface mark.'
          );
          return;
        }
        const hit = hits[0];
        const elementId = String(hit.object.userData.elementId ?? '');
        const worldNormal = new THREE.Vector3(0, 1, 0);
        if (hit.face) {
          normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          worldNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
        }
        const { normal, tangentU, tangentV } = computeLocalSurfaceBasis(worldNormal);
        const origin = hit.point.clone();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);

        activeStroke = {
          elementId,
          tool: cur.activeDrawingTool as PersistedAnnotationTool,
          colorHex: cur.drawingColorHex,
          strokeWidth: cur.drawingStrokeWidth,
          strokeWidthPx: cur.drawingStrokeWidthPx,
          lineStyle: cur.drawingLineStyle,
          origin,
          normal,
          tangentU,
          tangentV,
          plane,
          points2D: [{ u: 0, v: 0 }],
        };
        try {
          renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
          // Ignore pointer capture errors
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeStroke) return;
      setRayFromPointer(e);
      const planeHit = new THREE.Vector3();
      const intersected = raycaster.ray.intersectPlane(activeStroke.plane, planeHit);
      if (!intersected) return;

      const delta = planeHit.sub(activeStroke.origin);
      if (delta.length() > 10) return;

      const pt: Point2DLocal = {
        u: Math.round(delta.dot(activeStroke.tangentU) * 1000) / 1000,
        v: Math.round(delta.dot(activeStroke.tangentV) * 1000) / 1000,
      };

      const isFreehand =
        activeStroke.tool === 'brush' ||
        activeStroke.tool === 'pencil' ||
        activeStroke.tool === 'marker';
      if (isFreehand) {
        const last = activeStroke.points2D[activeStroke.points2D.length - 1];
        if (!last || Math.hypot(pt.u - last.u, pt.v - last.v) >= 0.025) {
          activeStroke.points2D.push(pt);
          renderStrokePreview();
        }
      } else {
        if (activeStroke.points2D.length === 1) {
          activeStroke.points2D.push(pt);
        } else {
          activeStroke.points2D[1] = pt;
        }
        renderStrokePreview();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;

      if (activeStroke) {
        const finished = activeStroke;
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore release errors
        }
        clearDrawingPreview();
        pointerDownPos = null;

        if (finished.points2D.length >= 2) {
          const first = finished.points2D[0];
          const last = finished.points2D[finished.points2D.length - 1];
          let maxDist = Math.hypot(last.u - first.u, last.v - first.v);
          const isFreehand =
            finished.tool === 'brush' ||
            finished.tool === 'pencil' ||
            finished.tool === 'marker';
          if (isFreehand) {
            for (const p of finished.points2D) {
              maxDist = Math.max(maxDist, Math.hypot(p.u - first.u, p.v - first.v));
            }
          }
          if (maxDist >= 0.03) {
            const measurementLabel = computeRulerMeasurementLabel(
              finished.tool,
              finished.points2D,
              stateRef.current.isModelCalibrated
            );
            callbacksRef.current.onCreateAnnotation?.({
              elementId: finished.elementId,
              tool: finished.tool,
              colorHex: finished.colorHex,
              strokeWidth: finished.strokeWidth,
              strokeWidthPx: finished.strokeWidthPx,
              lineStyle: finished.lineStyle,
              origin: {
                x: Math.round(finished.origin.x * 10000) / 10000,
                y: Math.round(finished.origin.y * 10000) / 10000,
                z: Math.round(finished.origin.z * 10000) / 10000,
              },
              normal: {
                x: Math.round(finished.normal.x * 10000) / 10000,
                y: Math.round(finished.normal.y * 10000) / 10000,
                z: Math.round(finished.normal.z * 10000) / 10000,
              },
              tangentU: {
                x: Math.round(finished.tangentU.x * 10000) / 10000,
                y: Math.round(finished.tangentU.y * 10000) / 10000,
                z: Math.round(finished.tangentU.z * 10000) / 10000,
              },
              tangentV: {
                x: Math.round(finished.tangentV.x * 10000) / 10000,
                y: Math.round(finished.tangentV.y * 10000) / 10000,
                z: Math.round(finished.tangentV.z * 10000) / 10000,
              },
              points2D: finished.points2D,
              measurementLabel,
              isCalibrated: stateRef.current.isModelCalibrated,
            });
          }
        }
        return;
      }

      if (!pointerDownPos) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (Math.hypot(dx, dy) > 6) return;

      setRayFromPointer(e);
      const cur = stateRef.current;

      // Private local Wall Fill tool: tint ONLY the clicked single wall element privately
      if (
        cur.canDraw &&
        !cur.createMode &&
        !cur.hideLocalDrawings &&
        cur.activeDrawingTool === 'wall_fill'
      ) {
        const hits = cur.layers.civil
          ? raycaster.intersectObjects(selectableMeshes, false)
          : [];
        if (hits.length === 0) {
          callbacksRef.current.onDrawingRejected?.(
            'Click directly on a wall or slab element to apply a private local fill.'
          );
          return;
        }
        const hit = hits[0];
        const elementId = String(hit.object.userData.elementId ?? '');
        const worldNormal = new THREE.Vector3(0, 1, 0);
        if (hit.face) {
          normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          worldNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
        }
        const { normal, tangentU, tangentV } = computeLocalSurfaceBasis(worldNormal);
        callbacksRef.current.onCreateAnnotation?.({
          elementId,
          tool: 'wall_fill',
          colorHex: cur.drawingColorHex,
          strokeWidth: cur.drawingStrokeWidth,
          strokeWidthPx: cur.drawingStrokeWidthPx,
          lineStyle: 'solid',
          origin: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          normal: { x: normal.x, y: normal.y, z: normal.z },
          tangentU: { x: tangentU.x, y: tangentU.y, z: tangentU.z },
          tangentV: { x: tangentV.x, y: tangentV.y, z: tangentV.z },
          points2D: [{ u: 0, v: 0 }],
        });
        return;
      }

      // Occlusion-safe frontmost annotation picker across zoom levels (covers strokes, shapes, wall fills & ruler labels)
      const pickVisibleAnnotation = (ev: PointerEvent): AnnotationPickCandidate | null => {
        const ctx = threeRef.current;
        if (!ctx || !cur.canDraw || cur.hideLocalDrawings || cur.readOnlyViewer) return null;
        if (ctx.annotationHitTargets.length === 0 && ctx.annotationPickMetas.length === 0) {
          return null;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const buildingHits = cur.layers.civil
          ? raycaster.intersectObjects(selectableMeshes, false)
          : [];
        const nearestWallDist = buildingHits.length > 0 ? buildingHits[0].distance : null;

        const candidates: AnnotationPickCandidate[] = [];

        // 1. Direct Three.js raycast hits (includes meshes, hit ribbons, wall fills, AND ruler label sprites)
        const directHits = raycaster.intersectObjects(ctx.annotationHitTargets, false);
        for (const hit of directHits) {
          const annotationId = String(hit.object.userData.annotationId ?? '');
          if (!annotationId) continue;
          const kind = (hit.object.userData.annotationHitKind ??
            'stroke') as AnnotationPickPieceKind;
          const occludedByWall = isPointOccludedByWall(hit.distance, nearestWallDist);
          candidates.push({
            annotationId,
            distance: hit.distance,
            screenDistancePx: 0,
            kind,
            occludedByWall,
          });
        }

        // 2. Screen-space tolerance fallback across zoom levels (strokes & ruler labels) with wall-occlusion ray test
        const clickX = ev.clientX - rect.left;
        const clickY = ev.clientY - rect.top;
        const occRaycaster = new THREE.Raycaster();
        const occDir = new THREE.Vector3();
        const projA = new THREE.Vector3();
        const projB = new THREE.Vector3();
        const interpPt = new THREE.Vector3();
        const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

        const isWorldPointOccluded = (pt: THREE.Vector3): { occluded: boolean; dist: number } => {
          occDir.subVectors(pt, camera.position);
          const dist = occDir.length();
          if (dist < 1e-4) return { occluded: true, dist: 0 };
          if (!cur.layers.civil) return { occluded: false, dist };
          occDir.divideScalar(dist);
          occRaycaster.set(camera.position, occDir);
          occRaycaster.far = dist + 0.05;
          const wallHits = occRaycaster.intersectObjects(selectableMeshes, false);
          const wallDist = wallHits.length > 0 ? wallHits[0].distance : null;
          return { occluded: isPointOccludedByWall(dist, wallDist), dist };
        };

        for (const meta of ctx.annotationPickMetas) {
          if (meta.labelWorldPos) {
            projA.copy(meta.labelWorldPos).project(camera);
            if (projA.z >= -1 && projA.z <= 1) {
              const cx = ((projA.x + 1) / 2) * rect.width;
              const cy = ((-projA.y + 1) / 2) * rect.height;
              const camDist = camera.position.distanceTo(meta.labelWorldPos);
              if (camDist > 0.05) {
                const pxPerMeter = rect.height / (2 * halfFovTan * camDist);
                const halfW = Math.max(18, (meta.labelScaleX * 0.5) * pxPerMeter);
                const halfH = Math.max(10, (meta.labelScaleY * 0.5) * pxPerMeter);
                const distPx = pointToRectDistance2D(
                  clickX,
                  clickY,
                  cx - halfW,
                  cy - halfH,
                  cx + halfW,
                  cy + halfH
                );
                if (distPx <= DEFAULT_ANNOTATION_SCREEN_TOLERANCE_PX) {
                  const occ = isWorldPointOccluded(meta.labelWorldPos);
                  candidates.push({
                    annotationId: meta.annotationId,
                    distance: occ.dist,
                    screenDistancePx: distPx,
                    kind: 'label',
                    occludedByWall: occ.occluded,
                  });
                }
              }
            }
          }

          let bestSegDistPx = Infinity;
          let bestSegPt: THREE.Vector3 | null = null;
          for (const chain of meta.worldPolylines) {
            for (let i = 0; i < chain.length - 1; i += 1) {
              projA.copy(chain[i]).project(camera);
              projB.copy(chain[i + 1]).project(camera);
              if (projA.z < -1 || projA.z > 1 || projB.z < -1 || projB.z > 1) continue;
              const ax = ((projA.x + 1) / 2) * rect.width;
              const ay = ((-projA.y + 1) / 2) * rect.height;
              const bx = ((projB.x + 1) / 2) * rect.width;
              const by = ((-projB.y + 1) / 2) * rect.height;
              const seg = pointToSegmentDistance2D(clickX, clickY, ax, ay, bx, by);
              if (seg.distance < bestSegDistPx) {
                bestSegDistPx = seg.distance;
                interpPt.copy(chain[i]).lerp(chain[i + 1], seg.t);
                bestSegPt = interpPt.clone();
              }
            }
          }

          if (bestSegPt && bestSegDistPx <= DEFAULT_ANNOTATION_SCREEN_TOLERANCE_PX) {
            const occ = isWorldPointOccluded(bestSegPt);
            candidates.push({
              annotationId: meta.annotationId,
              distance: occ.dist,
              screenDistancePx: bestSegDistPx,
              kind: 'stroke',
              occludedByWall: occ.occluded,
            });
          }
        }

        return resolveFrontmostAnnotationHit(candidates, DEFAULT_ANNOTATION_SCREEN_TOLERANCE_PX);
      };

      // Eraser mode: remove only the clicked visible owned annotation; on a miss, protect walls and Pins!
      if (cur.canDraw && cur.drawingDeleteMode && !cur.createMode) {
        const hit = pickVisibleAnnotation(e);
        if (hit) {
          callbacksRef.current.onDeleteAnnotation?.(hit.annotationId);
        }
        return;
      }

      if (cur.createMode) {
        const hits = cur.layers.civil
          ? raycaster.intersectObjects(selectableMeshes, false)
          : [];
        if (hits.length === 0) {
          callbacksRef.current.onCreateVoidClick();
          return;
        }
        const hit = hits[0];
        const elementId = String(hit.object.userData.elementId ?? '');
        const elementSpec = model.elements.find((el) => el.id === elementId);
        if (!elementSpec) {
          callbacksRef.current.onCreateVoidClick();
          return;
        }

        const worldNormal = new THREE.Vector3(0, 1, 0);
        if (hit.face) {
          normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          worldNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
        }

        const point: Vec3 = {
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
        };
        const normal: Vec3 = {
          x: worldNormal.x,
          y: worldNormal.y,
          z: worldNormal.z,
        };
        const classified =
          model.versionId === 'a03-r00-demo-v1'
            ? classifySurfaceHit(elementSpec, point, normal)
            : classifyGenericSurfaceHit(model.rooms, elementSpec, point, normal);

        callbacksRef.current.onCreateSurfaceHit({
          elementId: elementSpec.id,
          elementName: elementSpec.name,
          roomId: classified.roomId,
          roomName: classified.roomName,
          surfaceSide: classified.surfaceSide,
          point,
          normal,
        });
        return;
      }

      // Cursor mode: check Pins and visible owned private annotations, picking frontmost visible target
      const pinHits =
        cur.layers.pins && threeRef.current && threeRef.current.pinHitTargets.length > 0
          ? raycaster.intersectObjects(threeRef.current.pinHitTargets, false)
          : [];
      const nearestPinHit = pinHits.length > 0 ? pinHits[0] : null;
      const annotationHit = isCursorModeTool(cur.activeDrawingTool)
        ? pickVisibleAnnotation(e)
        : null;

      if (annotationHit && (!nearestPinHit || annotationHit.distance <= nearestPinHit.distance + 0.08)) {
        callbacksRef.current.onSelectAnnotation?.(annotationHit.annotationId);
        return;
      }

      if (nearestPinHit) {
        const pinId = String(nearestPinHit.object.userData.pinId ?? '');
        if (pinId) {
          callbacksRef.current.onSelectPin(pinId);
          return;
        }
      }

      // Next check architectural elements
      if (cur.layers.civil) {
        const elHits = raycaster.intersectObjects(selectableMeshes, false);
        if (elHits.length > 0) {
          const elementId = String(elHits[0].object.userData.elementId ?? '');
          if (elementId) {
            callbacksRef.current.onSelectElement(elementId);
            return;
          }
        }
      }

      callbacksRef.current.onClearSelection();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeStroke) {
        clearDrawingPreview();
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('The 3D graphics context was lost. Click Retry to reinitialize the viewer.');
    };

    const onContextRestored = () => {
      setWebglError(null);
      requestRender();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
    window.addEventListener('keydown', onKeyDown);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || disposed) return;
      const w = Math.max(Math.floor(entry.contentRect.width), 280);
      const h = Math.max(Math.floor(entry.contentRect.height), 240);
      pendingSize = { w, h };
      requestRender();
    });
    resizeObserver.observe(container);

    threeRef.current = {
      renderer,
      scene,
      camera,
      controls,
      buildingGroup,
      roomHighlightGroup,
      pinGroup,
      pendingGroup,
      privateDrawingGroup,
      drawingPreviewGroup,
      groundCompassGroup,
      selectableMeshes,
      pinHitTargets: [],
      annotationHitTargets: [],
      annotationPickMetas: [],
      elementMaterials,
      overallPos,
      overallTarget,
      fitPos,
      fitTarget,
      requestRender,
      startCameraTransition,
      syncCameraDataset,
      clearDrawingPreview,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Build initial pins, room highlight, element highlights & private drawings
    syncCameraDataset();
    rebuildPinMarkers();
    rebuildRoomHighlight();
    updateElementHighlights();
    rebuildPrivateDrawings();
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('keydown', onKeyDown);
      controls.dispose();
      envTexture.dispose();
      floorTex.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.LineLoop || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        } else if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        }
      });
      renderer.dispose();
      threeRef.current = null;
    };
  }, [model, retryToken, rebuildPinMarkers, rebuildRoomHighlight, updateElementHighlights, rebuildPrivateDrawings]);

  // Synchronize Pin markers when pins, selectedPinId, or pins layer visibility change
  useEffect(() => {
    rebuildPinMarkers();
  }, [pins, selectedPinId, layers.pins, rebuildPinMarkers]);

  // Synchronize active room highlight without recreating WebGLRenderer
  useEffect(() => {
    rebuildRoomHighlight();
  }, [activeRoomId, rebuildRoomHighlight]);

  // Synchronize pending create-mode anchor marker
  useEffect(() => {
    rebuildPendingMarker();
  }, [pendingHit, createMode, rebuildPendingMarker]);

  // Synchronize selected element highlight and Civil layer visibility
  useEffect(() => {
    updateElementHighlights();
  }, [selectedElementId, layers.civil, layers.pins, updateElementHighlights]);

  // Synchronize private device-local drawings & selection highlight
  useEffect(() => {
    rebuildPrivateDrawings();
  }, [annotations, selectedAnnotationId, hideLocalDrawings, readOnlyViewer, rebuildPrivateDrawings]);

  // Synchronize Ground Compass visibility and north angle rotation
  useEffect(() => {
    const ctx = threeRef.current;
    if (!ctx) return;
    ctx.groundCompassGroup.visible = Boolean(showGroundCompass);
    ctx.groundCompassGroup.rotation.y = computeCompassOrientation(
      0,
      northAngleDeg
    ).groundRoseRotationRad;
    ctx.requestRender();
  }, [showGroundCompass, northAngleDeg]);

  // Lock orbit controls only when an active drag-stroke drawing tool is selected
  useEffect(() => {
    const ctx = threeRef.current;
    if (!ctx) return;
    const drawingLocksOrbit =
      effectiveCanDraw &&
      !effectiveCreateMode &&
      !(drawingDeleteMode || activeDrawingTool === 'eraser') &&
      !hideLocalDrawings &&
      !isCursorModeTool(activeDrawingTool) &&
      activeDrawingTool !== 'wall_fill';
    ctx.controls.enabled = !drawingLocksOrbit;
    if (!drawingLocksOrbit) {
      ctx.clearDrawingPreview();
    }
  }, [effectiveCanDraw, effectiveCreateMode, drawingDeleteMode, hideLocalDrawings, activeDrawingTool]);

  // Handle explicit camera focus commands (Fit, Overall, Room Focus, Pin Focus)
  useEffect(() => {
    if (!cameraCommand || !threeRef.current) return;

    if (cameraCommand.kind === 'overall') {
      threeRef.current.startCameraTransition(
        threeRef.current.overallPos,
        threeRef.current.overallTarget
      );
      return;
    }

    if (cameraCommand.kind === 'fit') {
      threeRef.current.startCameraTransition(
        threeRef.current.fitPos,
        threeRef.current.fitTarget
      );
      return;
    }

    if (cameraCommand.kind === 'room' && cameraCommand.roomId) {
      const room = model.rooms.find((r) => r.id === cameraCommand.roomId);
      if (room) {
        threeRef.current.startCameraTransition(
          new THREE.Vector3(room.cameraPosition.x, room.cameraPosition.y, room.cameraPosition.z),
          new THREE.Vector3(room.cameraTarget.x, room.cameraTarget.y, room.cameraTarget.z)
        );
      }
      return;
    }

    if (cameraCommand.kind === 'pin' && cameraCommand.pin) {
      const goal = computePinCameraGoal(cameraCommand.pin);
      threeRef.current.startCameraTransition(goal.pos, goal.target);
    }
  }, [cameraCommand, model.rooms]);

  if (webglError) {
    return (
      <div
        data-testid="webgl-fallback"
        className="flex h-full w-full flex-col items-center justify-center bg-[#F4F3EF] p-6"
      >
        <div className="w-full max-w-lg rounded-xl border border-[#D9DEE2] bg-white p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#A64011]" aria-hidden="true" />
            <div>
              <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                3D Viewport Unavailable
              </h2>
              <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">{webglError}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRetryToken((t) => t + 1)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#8C350E]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </button>
          </div>

          <div className="mt-6 border-t border-[#D9DEE2] pt-4">
            <h3 className="text-[14px] font-semibold text-[#1B2A4A]">
              Available Spatial Pins ({pins.length})
            </h3>
            <ul className="mt-2 divide-y divide-[#D9DEE2] rounded-lg border border-[#D9DEE2]">
              {pins.map((pin) => (
                <li key={pin.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPin(pin.id)}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-[#F4F3EF]"
                  >
                    <div>
                      <div className="text-[14px] font-medium text-[#1B2A4A]">{pin.title}</div>
                      <div className="text-[12px] text-[#4F5C67]">
                        {pin.roomName} · {pin.id}
                      </div>
                    </div>
                    <MapPin className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const isSurfaceDrawingCursor =
    effectiveCanDraw &&
    !effectiveCreateMode &&
    !hideLocalDrawings &&
    (!isCursorModeTool(activeDrawingTool) || drawingDeleteMode);

  return (
    <div
      ref={containerRef}
      data-testid="spatial-viewport-container"
      data-active-pin={selectedPinId ?? ''}
      data-selected-element={selectedElementId ?? ''}
      data-active-room={activeRoomId ?? ''}
      data-mesh-check-mm={String(measuredMm)}
      data-create-mode={effectiveCreateMode ? 'true' : 'false'}
      data-drawing-tool={activeDrawingTool}
      data-local-annotation-count={String(annotations.length)}
      data-local-annotation-ids={annotations.map((a) => a.id).join(',')}
      data-selected-annotation={effectiveCanDraw ? selectedAnnotationId ?? '' : ''}
      data-local-drawings-hidden={hideLocalDrawings ? 'true' : 'false'}
      data-ground-compass={showGroundCompass ? 'true' : 'false'}
      data-read-only-viewer={readOnlyViewer ? 'true' : 'false'}
      className={`relative h-full w-full overflow-hidden bg-[#EDECE7] ${
        effectiveCreateMode || isSurfaceDrawingCursor
          ? 'cursor-crosshair'
          : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
});
