import type { Vec3 } from '../domain/types';
import {
  clampStrokeWidthPx,
  normalizeHexColor,
  type DrawingLineStyle,
} from '../domain/workspaceMath';

export const PRIVATE_DRAWING_FORMAT_VERSION = 2;

export type DrawingToolType =
  | 'cursor'
  | 'pan'
  | 'pencil'
  | 'marker'
  | 'brush'
  | 'line'
  | 'arrow'
  | 'circle'
  | 'ellipse'
  | 'square'
  | 'rectangle'
  | 'ruler_straight'
  | 'ruler_right_angle'
  | 'ruler_angle'
  | 'eraser'
  | 'wall_fill';

export type DrawingStrokeWidthKey = 'thin' | 'medium' | 'thick';

export interface Point2DLocal {
  u: number;
  v: number;
}

export const DRAWING_STROKE_WIDTHS: ReadonlyArray<{
  key: DrawingStrokeWidthKey;
  label: string;
  px: number;
  radiusMeters: number;
}> = [
  { key: 'thin', label: 'Thin', px: 2, radiusMeters: 0.012 },
  { key: 'medium', label: 'Medium', px: 4, radiusMeters: 0.022 },
  { key: 'thick', label: 'Thick', px: 8, radiusMeters: 0.036 },
];

export const DRAWING_COLOR_SWATCHES: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Crimson Red', hex: '#E11D48' },
  { label: 'VONTA Orange', hex: '#D4652F' },
  { label: 'Amber Gold', hex: '#D97706' },
  { label: 'Emerald Green', hex: '#15803D' },
  { label: 'Cobalt Blue', hex: '#0B63CE' },
  { label: 'Site Navy', hex: '#1B2A4A' },
];

export type PersistedAnnotationTool = Exclude<DrawingToolType, 'cursor' | 'pan' | 'eraser'>;

export interface PrivateSurfaceAnnotation {
  id: string;
  formatVersion: number;
  environment: 'demo' | 'live';
  accountId: string;
  projectId: string;
  modelVersionId: string;
  areaId: string;
  elementId: string;
  tool: PersistedAnnotationTool;
  colorHex: string;
  /** Legacy key preserved for v1 compatibility. */
  strokeWidth: DrawingStrokeWidthKey;
  /** Numeric stroke width in px (1..32). */
  strokeWidthPx?: number;
  /** Stroke style (solid | dashed | dotted). */
  lineStyle?: DrawingLineStyle;
  /** World anchor point on the building surface. */
  origin: Vec3;
  /** World unit surface normal. */
  normal: Vec3;
  /** Surface tangent basis U. */
  tangentU: Vec3;
  /** Surface tangent basis V. */
  tangentV: Vec3;
  /** Surface-local 2D coordinates in meters relative to origin/tangentU/tangentV. */
  points2D: Point2DLocal[];
  /** Optional formatted ruler measurement readout. */
  measurementLabel?: string;
  /** Whether model calibration was verified when this ruler mark was created. */
  isCalibrated?: boolean;
  createdAt: string;
}

export interface PrivateDrawingScope {
  environment: 'demo' | 'live';
  accountId: string;
  projectId: string;
  modelVersionId: string;
  areaId: string;
}

export type DrawingStorageMode = 'indexeddb' | 'memory-fallback';

export interface DrawingLoadResult {
  data: PrivateSurfaceAnnotation[];
  storageMode: DrawingStorageMode;
  warning: string | null;
}

const DB_NAME = 'vonta_private_drawings_db_v1';
const STORE_NAME = 'surface_annotations';
const DB_VERSION = 1;

const memoryFallbackStore = new Map<string, PrivateSurfaceAnnotation[]>();

export function buildDrawingScopeKey(scope: PrivateDrawingScope): string {
  return `${scope.environment}::${scope.accountId}::${scope.projectId}::${scope.modelVersionId}::${scope.areaId}`;
}

export function strokeWidthKeyToPx(key?: DrawingStrokeWidthKey): number {
  const found = DRAWING_STROKE_WIDTHS.find((o) => o.key === key);
  return found ? found.px : 4;
}

export function pxToStrokeWidthKey(px: number): DrawingStrokeWidthKey {
  if (px <= 2) return 'thin';
  if (px <= 5) return 'medium';
  return 'thick';
}

function sanitizeVec3(raw: unknown, fallback: Vec3): Vec3 {
  if (!raw || typeof raw !== 'object') return fallback;
  const v = raw as Record<string, unknown>;
  const x = typeof v.x === 'number' && Number.isFinite(v.x) ? v.x : fallback.x;
  const y = typeof v.y === 'number' && Number.isFinite(v.y) ? v.y : fallback.y;
  const z = typeof v.z === 'number' && Number.isFinite(v.z) ? v.z : fallback.z;
  return { x, y, z };
}

/**
 * Safely migrates a persisted v1 or v2 annotation record into the current v2 schema.
 * Preserves legacy v1 marks (brush/line/arrow/circle/ellipse/square/rectangle) without crashing.
 */
export function migratePrivateAnnotationRecord(
  raw: unknown
): PrivateSurfaceAnnotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== 'string' || typeof rec.elementId !== 'string') return null;

  const validTools: ReadonlySet<string> = new Set([
    'pencil',
    'marker',
    'brush',
    'line',
    'arrow',
    'circle',
    'ellipse',
    'square',
    'rectangle',
    'ruler_straight',
    'ruler_right_angle',
    'ruler_angle',
    'wall_fill',
  ]);
  const toolRaw = typeof rec.tool === 'string' ? rec.tool : 'brush';
  const tool = (validTools.has(toolRaw) ? toolRaw : 'brush') as PersistedAnnotationTool;

  const legacyWidthKey: DrawingStrokeWidthKey =
    rec.strokeWidth === 'thin' || rec.strokeWidth === 'medium' || rec.strokeWidth === 'thick'
      ? rec.strokeWidth
      : 'medium';
  const strokeWidthPx =
    typeof rec.strokeWidthPx === 'number' && Number.isFinite(rec.strokeWidthPx)
      ? clampStrokeWidthPx(rec.strokeWidthPx)
      : strokeWidthKeyToPx(legacyWidthKey);

  const lineStyle: DrawingLineStyle =
    rec.lineStyle === 'solid' || rec.lineStyle === 'dashed' || rec.lineStyle === 'dotted'
      ? rec.lineStyle
      : 'solid';

  const colorHex = normalizeHexColor(String(rec.colorHex ?? '')) ?? '#E11D48';

  const points2D: Point2DLocal[] = Array.isArray(rec.points2D)
    ? rec.points2D
        .filter(
          (p): p is Point2DLocal =>
            Boolean(p) &&
            typeof p === 'object' &&
            typeof (p as Point2DLocal).u === 'number' &&
            typeof (p as Point2DLocal).v === 'number'
        )
        .map((p) => ({ u: p.u, v: p.v }))
    : [];

  if (tool !== 'wall_fill' && points2D.length < 2) {
    return null;
  }

  return {
    id: rec.id,
    formatVersion: PRIVATE_DRAWING_FORMAT_VERSION,
    environment: rec.environment === 'live' ? 'live' : 'demo',
    accountId: String(rec.accountId ?? ''),
    projectId: String(rec.projectId ?? ''),
    modelVersionId: String(rec.modelVersionId ?? ''),
    areaId: String(rec.areaId ?? ''),
    elementId: rec.elementId,
    tool,
    colorHex,
    strokeWidth: pxToStrokeWidthKey(strokeWidthPx),
    strokeWidthPx,
    lineStyle,
    origin: sanitizeVec3(rec.origin, { x: 0, y: 0, z: 0 }),
    normal: sanitizeVec3(rec.normal, { x: 0, y: 1, z: 0 }),
    tangentU: sanitizeVec3(rec.tangentU, { x: 1, y: 0, z: 0 }),
    tangentV: sanitizeVec3(rec.tangentV, { x: 0, y: 0, z: 1 }),
    points2D,
    measurementLabel:
      typeof rec.measurementLabel === 'string' ? rec.measurementLabel : undefined,
    isCalibrated: typeof rec.isCalibrated === 'boolean' ? rec.isCalibrated : undefined,
    createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : new Date().toISOString(),
  };
}

function openDrawingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('scopeKey', 'scopeKey', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open private drawing database'));
  });
}

interface StoredRow extends PrivateSurfaceAnnotation {
  scopeKey: string;
}

export async function loadPrivateAnnotations(
  scope: PrivateDrawingScope
): Promise<DrawingLoadResult> {
  const scopeKey = buildDrawingScopeKey(scope);
  try {
    const db = await openDrawingDb();
    const rows = await new Promise<StoredRow[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('scopeKey');
      const req = index.getAll(scopeKey);
      req.onsuccess = () => resolve((req.result as StoredRow[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error('Failed to read private drawings'));
    });
    db.close();
    const migrated: PrivateSurfaceAnnotation[] = [];
    for (const row of rows) {
      const clean = migratePrivateAnnotationRecord(row);
      if (clean) migrated.push(clean);
    }
    migrated.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      data: migrated,
      storageMode: 'indexeddb',
      warning: null,
    };
  } catch {
    const list = memoryFallbackStore.get(scopeKey) ?? [];
    return {
      data: [...list],
      storageMode: 'memory-fallback',
      warning:
        'Temporary on this device. Browser storage is unavailable, so local marks clear when this tab closes.',
    };
  }
}

export async function savePrivateAnnotation(
  annotation: PrivateSurfaceAnnotation
): Promise<{ storageMode: DrawingStorageMode; warning: string | null }> {
  const scopeKey = buildDrawingScopeKey(annotation);
  const px = clampStrokeWidthPx(
    annotation.strokeWidthPx ?? strokeWidthKeyToPx(annotation.strokeWidth)
  );
  const normalized: PrivateSurfaceAnnotation = {
    ...annotation,
    formatVersion: PRIVATE_DRAWING_FORMAT_VERSION,
    strokeWidthPx: px,
    strokeWidth: pxToStrokeWidthKey(px),
    lineStyle: annotation.lineStyle ?? 'solid',
    colorHex: normalizeHexColor(annotation.colorHex) ?? '#E11D48',
  };
  try {
    const db = await openDrawingDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const row: StoredRow = { ...normalized, scopeKey };
      const req = store.put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to save private drawing'));
    });
    db.close();
    return { storageMode: 'indexeddb', warning: null };
  } catch {
    const existing = memoryFallbackStore.get(scopeKey) ?? [];
    memoryFallbackStore.set(scopeKey, [
      ...existing.filter((x) => x.id !== normalized.id),
      normalized,
    ]);
    return {
      storageMode: 'memory-fallback',
      warning:
        'Temporary on this device. Browser storage is unavailable, so local marks clear when this tab closes.',
    };
  }
}

export async function deletePrivateAnnotation(
  scope: PrivateDrawingScope,
  annotationId: string
): Promise<void> {
  const scopeKey = buildDrawingScopeKey(scope);
  try {
    const db = await openDrawingDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(annotationId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to delete private drawing'));
    });
    db.close();
  } catch {
    const existing = memoryFallbackStore.get(scopeKey) ?? [];
    memoryFallbackStore.set(
      scopeKey,
      existing.filter((x) => x.id !== annotationId)
    );
  }
}

export async function clearPrivateAnnotationsForScope(
  scope: PrivateDrawingScope
): Promise<void> {
  const scopeKey = buildDrawingScopeKey(scope);
  try {
    const db = await openDrawingDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('scopeKey');
      const req = index.getAllKeys(scopeKey);
      req.onsuccess = () => {
        const keys = req.result ?? [];
        for (const k of keys) {
          store.delete(k);
        }
        resolve();
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to clear private drawings'));
    });
    db.close();
  } catch {
    memoryFallbackStore.delete(scopeKey);
  }
}

export function clearTemporaryDrawingMemory(): void {
  memoryFallbackStore.clear();
}

export function isCursorModeTool(tool: DrawingToolType): boolean {
  return tool === 'cursor' || tool === 'pan';
}
