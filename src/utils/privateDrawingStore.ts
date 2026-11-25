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
  deviceId?: string;
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
  deviceId?: string;
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

export interface DrawingWriteResult {
  ok: boolean;
  storageMode: DrawingStorageMode;
  warning: string | null;
  error?: string;
}

const DB_NAME = 'vonta_private_drawings_db_v1';
const STORE_NAME = 'surface_annotations';
const DB_VERSION = 1;
const DEVICE_ID_STORAGE_KEY = 'vonta_local_device_id_v1';
const FALLBACK_WARNING =
  'Temporary on this device. Browser storage is unavailable, so local marks clear when this tab closes.';

const memoryFallbackStore = new Map<string, PrivateSurfaceAnnotation[]>();
let cachedDeviceId: string | null = null;
let storeOperationQueue: Promise<unknown> = Promise.resolve();

function enqueueStoreOperation<T>(op: () => Promise<T>): Promise<T> {
  const next = storeOperationQueue.then(op, op);
  storeOperationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Returns a stable device-local identifier for this browser profile so private annotations
 * and history stay strictly scoped to device, environment, account, project, area, and model version.
 */
export function getLocalDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  if (typeof window !== 'undefined') {
    try {
      const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing && existing.trim().length > 0) {
        cachedDeviceId = existing.trim();
        return cachedDeviceId;
      }
      const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `dev-${crypto.randomUUID().slice(0, 12)}`
          : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
      cachedDeviceId = generated;
      return cachedDeviceId;
    } catch {
      // Ignore storage restrictions (incognito/sandbox)
    }
  }
  cachedDeviceId = 'device-local';
  return cachedDeviceId;
}

export function resolveScopeDeviceId(scope: { deviceId?: string }): string {
  const explicit = scope.deviceId?.trim();
  return explicit && explicit.length > 0 ? explicit : getLocalDeviceId();
}

export function buildLegacyDrawingScopeKey(scope: PrivateDrawingScope): string {
  return `${scope.environment}::${scope.accountId}::${scope.projectId}::${scope.modelVersionId}::${scope.areaId}`;
}

export function buildDrawingScopeKey(scope: PrivateDrawingScope): string {
  const deviceId = resolveScopeDeviceId(scope);
  return `${deviceId}::${scope.environment}::${scope.accountId}::${scope.projectId}::${scope.modelVersionId}::${scope.areaId}`;
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
    deviceId: typeof rec.deviceId === 'string' && rec.deviceId.trim() ? rec.deviceId.trim() : undefined,
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

function normalizeForPersistence(
  annotation: PrivateSurfaceAnnotation,
  scopeOverride?: PrivateDrawingScope
): { normalized: PrivateSurfaceAnnotation; scopeKey: string } {
  const effectiveScope: PrivateDrawingScope = scopeOverride ?? annotation;
  const deviceId = resolveScopeDeviceId(effectiveScope);
  const scopeKey = buildDrawingScopeKey({ ...effectiveScope, deviceId });
  const px = clampStrokeWidthPx(
    annotation.strokeWidthPx ?? strokeWidthKeyToPx(annotation.strokeWidth)
  );
  const normalized: PrivateSurfaceAnnotation = {
    ...annotation,
    deviceId,
    environment: effectiveScope.environment,
    accountId: effectiveScope.accountId,
    projectId: effectiveScope.projectId,
    modelVersionId: effectiveScope.modelVersionId,
    areaId: effectiveScope.areaId,
    formatVersion: PRIVATE_DRAWING_FORMAT_VERSION,
    strokeWidthPx: px,
    strokeWidth: pxToStrokeWidthKey(px),
    lineStyle: annotation.lineStyle ?? 'solid',
    colorHex: normalizeHexColor(annotation.colorHex) ?? '#E11D48',
  };
  return { normalized, scopeKey };
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

export function loadPrivateAnnotations(scope: PrivateDrawingScope): Promise<DrawingLoadResult> {
  return enqueueStoreOperation(async () => {
    const resolvedDeviceId = resolveScopeDeviceId(scope);
    const scopeKey = buildDrawingScopeKey({ ...scope, deviceId: resolvedDeviceId });
    const legacyKey = buildLegacyDrawingScopeKey(scope);
    const shouldCheckLegacy = !scope.deviceId || scope.deviceId === getLocalDeviceId();

    try {
      const db = await openDrawingDb();
      const rows = await new Promise<StoredRow[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('scopeKey');
        const reqCurrent = index.getAll(scopeKey);
        let currentRows: StoredRow[] = [];
        let legacyRows: StoredRow[] = [];

        reqCurrent.onsuccess = () => {
          currentRows = (reqCurrent.result as StoredRow[]) ?? [];
          if (!shouldCheckLegacy) {
            resolve(currentRows);
            return;
          }
          const reqLegacy = index.getAll(legacyKey);
          reqLegacy.onsuccess = () => {
            legacyRows = (reqLegacy.result as StoredRow[]) ?? [];
            const seen = new Set(currentRows.map((r) => r.id));
            const merged = [...currentRows];
            for (const row of legacyRows) {
              if (!seen.has(row.id)) merged.push(row);
            }
            resolve(merged);
          };
          reqLegacy.onerror = () =>
            reject(reqLegacy.error ?? new Error('Failed to read legacy private drawings'));
        };
        reqCurrent.onerror = () =>
          reject(reqCurrent.error ?? new Error('Failed to read private drawings'));
      });
      db.close();

      const migrated: PrivateSurfaceAnnotation[] = [];
      for (const row of rows) {
        const clean = migratePrivateAnnotationRecord(row);
        if (clean) {
          migrated.push({ ...clean, deviceId: clean.deviceId ?? resolvedDeviceId });
        }
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
        warning: FALLBACK_WARNING,
      };
    }
  });
}

export function savePrivateAnnotation(
  annotation: PrivateSurfaceAnnotation
): Promise<DrawingWriteResult> {
  return enqueueStoreOperation(async () => {
    const { normalized, scopeKey } = normalizeForPersistence(annotation);
    try {
      const db = await openDrawingDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const row: StoredRow = { ...normalized, scopeKey };
        store.put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to save private drawing'));
        tx.onabort = () => reject(tx.error ?? new Error('Aborted saving private drawing'));
      });
      db.close();
      return { ok: true, storageMode: 'indexeddb', warning: null };
    } catch {
      const existing = memoryFallbackStore.get(scopeKey) ?? [];
      memoryFallbackStore.set(scopeKey, [
        ...existing.filter((x) => x.id !== normalized.id),
        normalized,
      ]);
      return {
        ok: true,
        storageMode: 'memory-fallback',
        warning: FALLBACK_WARNING,
      };
    }
  });
}

export function savePrivateAnnotationsBatch(
  scope: PrivateDrawingScope,
  annotations: PrivateSurfaceAnnotation[]
): Promise<DrawingWriteResult> {
  return enqueueStoreOperation(async () => {
    const resolvedDeviceId = resolveScopeDeviceId(scope);
    const effectiveScope: PrivateDrawingScope = { ...scope, deviceId: resolvedDeviceId };
    const scopeKey = buildDrawingScopeKey(effectiveScope);
    const prepared = annotations.map((ann) => normalizeForPersistence(ann, effectiveScope));

    try {
      const db = await openDrawingDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const item of prepared) {
          const row: StoredRow = { ...item.normalized, scopeKey: item.scopeKey };
          store.put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to restore private drawings'));
        tx.onabort = () => reject(tx.error ?? new Error('Aborted restoring private drawings'));
      });
      db.close();
      return { ok: true, storageMode: 'indexeddb', warning: null };
    } catch {
      const existing = memoryFallbackStore.get(scopeKey) ?? [];
      const byId = new Map(existing.map((item) => [item.id, item]));
      for (const item of prepared) {
        byId.set(item.normalized.id, item.normalized);
      }
      memoryFallbackStore.set(scopeKey, Array.from(byId.values()));
      return {
        ok: true,
        storageMode: 'memory-fallback',
        warning: FALLBACK_WARNING,
      };
    }
  });
}

export function deletePrivateAnnotation(
  scope: PrivateDrawingScope,
  annotationId: string
): Promise<DrawingWriteResult> {
  return enqueueStoreOperation(async () => {
    const scopeKey = buildDrawingScopeKey(scope);
    try {
      const db = await openDrawingDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(annotationId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to delete private drawing'));
        tx.onabort = () => reject(tx.error ?? new Error('Aborted deleting private drawing'));
      });
      db.close();
      return { ok: true, storageMode: 'indexeddb', warning: null };
    } catch {
      const existing = memoryFallbackStore.get(scopeKey) ?? [];
      memoryFallbackStore.set(
        scopeKey,
        existing.filter((x) => x.id !== annotationId)
      );
      return {
        ok: true,
        storageMode: 'memory-fallback',
        warning: FALLBACK_WARNING,
      };
    }
  });
}

export function clearPrivateAnnotationsForScope(
  scope: PrivateDrawingScope
): Promise<DrawingWriteResult> {
  return enqueueStoreOperation(async () => {
    const scopeKey = buildDrawingScopeKey(scope);
    const legacyKey = buildLegacyDrawingScopeKey(scope);
    const shouldClearLegacy = !scope.deviceId || scope.deviceId === getLocalDeviceId();

    try {
      const db = await openDrawingDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('scopeKey');

        const deleteKeys = (keys: IDBValidKey[]) => {
          for (const k of keys) {
            store.delete(k);
          }
        };

        const req = index.getAllKeys(scopeKey);
        req.onsuccess = () => {
          deleteKeys(req.result ?? []);
          if (shouldClearLegacy) {
            const legacyReq = index.getAllKeys(legacyKey);
            legacyReq.onsuccess = () => deleteKeys(legacyReq.result ?? []);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to clear private drawings'));
        tx.onabort = () => reject(tx.error ?? new Error('Aborted clearing private drawings'));
      });
      db.close();
      return { ok: true, storageMode: 'indexeddb', warning: null };
    } catch {
      memoryFallbackStore.delete(scopeKey);
      return {
        ok: true,
        storageMode: 'memory-fallback',
        warning: FALLBACK_WARNING,
      };
    }
  });
}

export function clearTemporaryDrawingMemory(): void {
  memoryFallbackStore.clear();
}

export function isCursorModeTool(tool: DrawingToolType): boolean {
  return tool === 'cursor' || tool === 'pan';
}

