import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDrawingScopeKey,
  PRIVATE_DRAWING_FORMAT_VERSION,
  type DrawingLoadResult,
  type DrawingWriteResult,
  type PrivateDrawingScope,
  type PrivateSurfaceAnnotation,
} from '../utils/privateDrawingStore';
import {
  createSerializedAnnotationController,
  formatAnnotationDisplaySummary,
  type AnnotationPersistenceAdapter,
} from './privateAnnotationHistory';
import {
  isPointOccludedByWall,
  isTextEntryTarget,
  pointToRectDistance2D,
  pointToSegmentDistance2D,
  resolveFrontmostAnnotationHit,
} from './workspaceMath';

function createInMemoryTestAdapter(options?: {
  failNextWriteMessage?: string | null;
  writeDelayMs?: number;
}) {
  const store = new Map<string, PrivateSurfaceAnnotation[]>();
  const opLog: string[] = [];
  let failNextMessage: string | null = options?.failNextWriteMessage ?? null;

  const wait = async () => {
    if (options?.writeDelayMs && options.writeDelayMs > 0) {
      await new Promise((r) => setTimeout(r, options.writeDelayMs));
    }
  };

  const adapter: AnnotationPersistenceAdapter = {
    async load(scope: PrivateDrawingScope): Promise<DrawingLoadResult> {
      await wait();
      const key = buildDrawingScopeKey(scope);
      opLog.push(`load:${key}`);
      const list = store.get(key) ?? [];
      return {
        data: list.map((a) => ({ ...a, points2D: a.points2D.map((p) => ({ ...p })) })),
        storageMode: 'indexeddb',
        warning: null,
      };
    },
    async saveOne(annotation: PrivateSurfaceAnnotation): Promise<DrawingWriteResult> {
      await wait();
      const key = buildDrawingScopeKey(annotation);
      opLog.push(`saveOne:${annotation.id}`);
      if (failNextMessage) {
        const msg = failNextMessage;
        failNextMessage = null;
        return { ok: false, storageMode: 'indexeddb', warning: null, error: msg };
      }
      const existing = store.get(key) ?? [];
      store.set(key, [...existing.filter((x) => x.id !== annotation.id), annotation]);
      return { ok: true, storageMode: 'indexeddb', warning: null };
    },
    async saveBatch(
      scope: PrivateDrawingScope,
      annotations: PrivateSurfaceAnnotation[]
    ): Promise<DrawingWriteResult> {
      await wait();
      const key = buildDrawingScopeKey(scope);
      opLog.push(`saveBatch:${annotations.map((a) => a.id).join(',')}`);
      if (failNextMessage) {
        const msg = failNextMessage;
        failNextMessage = null;
        return { ok: false, storageMode: 'indexeddb', warning: null, error: msg };
      }
      const existing = store.get(key) ?? [];
      const byId = new Map(existing.map((a) => [a.id, a]));
      for (const ann of annotations) byId.set(ann.id, ann);
      store.set(key, Array.from(byId.values()));
      return { ok: true, storageMode: 'indexeddb', warning: null };
    },
    async deleteOne(scope: PrivateDrawingScope, annotationId: string): Promise<DrawingWriteResult> {
      await wait();
      const key = buildDrawingScopeKey(scope);
      opLog.push(`deleteOne:${annotationId}`);
      if (failNextMessage) {
        const msg = failNextMessage;
        failNextMessage = null;
        return { ok: false, storageMode: 'indexeddb', warning: null, error: msg };
      }
      const existing = store.get(key) ?? [];
      store.set(
        key,
        existing.filter((x) => x.id !== annotationId)
      );
      return { ok: true, storageMode: 'indexeddb', warning: null };
    },
    async clearScope(scope: PrivateDrawingScope): Promise<DrawingWriteResult> {
      await wait();
      const key = buildDrawingScopeKey(scope);
      opLog.push(`clearScope:${key}`);
      if (failNextMessage) {
        const msg = failNextMessage;
        failNextMessage = null;
        return { ok: false, storageMode: 'indexeddb', warning: null, error: msg };
      }
      store.delete(key);
      return { ok: true, storageMode: 'indexeddb', warning: null };
    },
  };

  return {
    adapter,
    store,
    opLog,
    setFailNextWrite(msg: string | null) {
      failNextMessage = msg;
    },
  };
}

function makeMark(
  scope: PrivateDrawingScope,
  overrides: Partial<PrivateSurfaceAnnotation> & Pick<PrivateSurfaceAnnotation, 'id' | 'tool'>
): PrivateSurfaceAnnotation {
  return {
    formatVersion: PRIVATE_DRAWING_FORMAT_VERSION,
    deviceId: scope.deviceId,
    environment: scope.environment,
    accountId: scope.accountId,
    projectId: scope.projectId,
    modelVersionId: scope.modelVersionId,
    areaId: scope.areaId,
    elementId: 'W-EXT-NORTH',
    colorHex: '#E11D48',
    strokeWidth: 'medium',
    strokeWidthPx: 4,
    lineStyle: 'solid',
    origin: { x: 1.25, y: 1.4, z: -2.85 },
    normal: { x: 0, y: 0, z: 1 },
    tangentU: { x: 1, y: 0, z: 0 },
    tangentV: { x: 0, y: 1, z: 0 },
    points2D: [
      { u: 0, v: 0 },
      { u: 1.2, v: 0.35 },
    ],
    createdAt: '2026-04-10T08:00:00.000Z',
    ...overrides,
  };
}

describe('VONTA 09 — Private Annotation Selection, Occlusion & Reversible History', () => {
  const baseScope: PrivateDrawingScope = {
    deviceId: 'dev-field-tablet-1',
    environment: 'demo',
    accountId: 'acc-owner-demo',
    projectId: 'proj-paviliun-kerja',
    modelVersionId: 'a03-r00-demo-v1',
    areaId: 'area-main',
  };

  it('DRAW-1: marker + ruler -> select -> delete ruler -> undo restores exact ID/anchor -> redo -> reload preserves exact surviving records', async () => {
    const { adapter } = createInMemoryTestAdapter();
    const ctrl = createSerializedAnnotationController(adapter);
    await ctrl.setScope(baseScope, true);

    const marker = makeMark(baseScope, {
      id: 'mark-stroke-1',
      tool: 'marker',
      origin: { x: -1.1, y: 1.25, z: -2.82 },
      points2D: [
        { u: 0, v: 0 },
        { u: 0.4, v: 0.1 },
        { u: 0.85, v: 0.2 },
      ],
      createdAt: '2026-04-10T08:01:00.000Z',
    });
    const ruler = makeMark(baseScope, {
      id: 'mark-ruler-2',
      tool: 'ruler_straight',
      elementId: 'W-PART-RAPAT-ARSIP',
      origin: { x: 0.8, y: 1.5, z: 0.05 },
      points2D: [
        { u: 0, v: 0 },
        { u: 1.45, v: 0 },
      ],
      measurementLabel: '1,450 mm (1.45 m)',
      isCalibrated: true,
      createdAt: '2026-04-10T08:02:00.000Z',
    });

    await ctrl.create(marker);
    await ctrl.create(ruler);
    assert.equal(ctrl.getState().annotations.length, 2);

    // Select marker, then select ruler, then delete ruler
    ctrl.selectAnnotation(marker.id);
    assert.equal(ctrl.getState().selectedAnnotationId, marker.id);
    ctrl.selectAnnotation(ruler.id);
    assert.equal(ctrl.getState().selectedAnnotationId, ruler.id);
    assert.equal(formatAnnotationDisplaySummary(ruler), 'Straight ruler · 1,450 mm (1.45 m)');

    await ctrl.remove(ruler.id);
    assert.equal(ctrl.getState().annotations.length, 1);
    assert.equal(ctrl.getState().selectedAnnotationId, null);
    assert.equal(ctrl.getState().annotations[0].id, marker.id);

    // Undo restores exact ruler ID, elementId, origin anchor, and measurement label
    await ctrl.undo();
    assert.equal(ctrl.getState().annotations.length, 2);
    const restoredRuler = ctrl.getState().annotations.find((a) => a.id === ruler.id);
    assert.ok(restoredRuler);
    assert.equal(restoredRuler.id, 'mark-ruler-2');
    assert.equal(restoredRuler.elementId, 'W-PART-RAPAT-ARSIP');
    assert.deepEqual(restoredRuler.origin, { x: 0.8, y: 1.5, z: 0.05 });
    assert.equal(restoredRuler.measurementLabel, '1,450 mm (1.45 m)');

    // Redo removes the ruler again
    await ctrl.redo();
    assert.equal(ctrl.getState().annotations.length, 1);
    assert.equal(ctrl.getState().annotations[0].id, marker.id);

    // Simulate reload in a fresh controller instance
    const reloadedCtrl = createSerializedAnnotationController(adapter);
    await reloadedCtrl.setScope(baseScope, true);
    assert.equal(reloadedCtrl.getState().annotations.length, 1);
    assert.equal(reloadedCtrl.getState().annotations[0].id, marker.id);
    assert.deepEqual(reloadedCtrl.getState().annotations[0].origin, { x: -1.1, y: 1.25, z: -2.82 });
    assert.equal(reloadedCtrl.getState().undoStack.length, 0);
    assert.equal(reloadedCtrl.getState().redoStack.length, 0);
  });

  it('DRAW-2: wall fill undo -> redo -> undo -> draw new mark clears redo; clear-all undo restores exact records', async () => {
    const { adapter } = createInMemoryTestAdapter();
    const ctrl = createSerializedAnnotationController(adapter);
    await ctrl.setScope(baseScope, true);

    const wallFill = makeMark(baseScope, {
      id: 'mark-wall-fill-1',
      tool: 'wall_fill',
      elementId: 'W-EXT-WEST',
      colorHex: '#15803D',
      points2D: [{ u: 0, v: 0 }],
    });

    await ctrl.create(wallFill);
    assert.equal(ctrl.getState().annotations.length, 1);

    await ctrl.undo();
    assert.equal(ctrl.getState().annotations.length, 0);
    assert.equal(ctrl.getState().redoStack.length, 1);

    await ctrl.redo();
    assert.equal(ctrl.getState().annotations.length, 1);
    assert.equal(ctrl.getState().annotations[0].id, wallFill.id);

    await ctrl.undo();
    assert.equal(ctrl.getState().annotations.length, 0);
    assert.equal(ctrl.getState().redoStack.length, 1);

    // New edit MUST clear redo
    const freshBrush = makeMark(baseScope, {
      id: 'mark-brush-new',
      tool: 'brush',
    });
    await ctrl.create(freshBrush);
    assert.equal(ctrl.getState().redoStack.length, 0);
    assert.equal(ctrl.getState().annotations.length, 1);
    assert.equal(ctrl.getState().annotations[0].id, freshBrush.id);

    // Clear all -> undo restores exact mark -> redo clears again
    await ctrl.clearAll();
    assert.equal(ctrl.getState().annotations.length, 0);
    await ctrl.undo();
    assert.equal(ctrl.getState().annotations.length, 1);
    assert.equal(ctrl.getState().annotations[0].id, freshBrush.id);
    await ctrl.redo();
    assert.equal(ctrl.getState().annotations.length, 0);
  });

  it('DRAW-2: strict isolation across account, device, environment, area, and model version + history clears on scope change', async () => {
    const { adapter } = createInMemoryTestAdapter();
    const ctrl = createSerializedAnnotationController(adapter);
    await ctrl.setScope(baseScope, true);

    const ownerMark = makeMark(baseScope, { id: 'mark-owner-a', tool: 'pencil' });
    await ctrl.create(ownerMark);
    assert.equal(ctrl.getState().annotations.length, 1);
    assert.equal(ctrl.getState().undoStack.length, 1);

    // Switch account -> isolated and history cleared
    await ctrl.setScope({ ...baseScope, accountId: 'acc-contractor-demo' }, true);
    assert.equal(ctrl.getState().annotations.length, 0);
    assert.equal(ctrl.getState().undoStack.length, 0);
    assert.equal(ctrl.getState().redoStack.length, 0);

    // Switch device -> isolated
    await ctrl.setScope({ ...baseScope, deviceId: 'dev-other-phone-2' }, true);
    assert.equal(ctrl.getState().annotations.length, 0);

    // Switch model version -> isolated
    await ctrl.setScope({ ...baseScope, modelVersionId: 'a03-r01-live-v2' }, true);
    assert.equal(ctrl.getState().annotations.length, 0);

    // Switch back to original scope -> owner mark survives, session history starts empty
    await ctrl.setScope(baseScope, true);
    assert.equal(ctrl.getState().annotations.length, 1);
    assert.equal(ctrl.getState().annotations[0].id, ownerMark.id);
    assert.equal(ctrl.getState().undoStack.length, 0);
  });

  it('DRAW-2: Worker without drawing rights cannot create, delete, undo, redo, or clear marks', async () => {
    const { adapter } = createInMemoryTestAdapter();
    const ctrl = createSerializedAnnotationController(adapter);
    await ctrl.setScope(baseScope, true);

    const ownerMark = makeMark(baseScope, { id: 'mark-owner-protected', tool: 'marker' });
    await ctrl.create(ownerMark);

    // Switch to Worker (canDraw = false)
    await ctrl.setScope({ ...baseScope, accountId: 'acc-worker-demo' }, false);
    assert.equal(ctrl.getState().annotations.length, 0);

    const createRes = await ctrl.create(makeMark(baseScope, { id: 'worker-attempt', tool: 'brush' }));
    const deleteRes = await ctrl.remove(ownerMark.id);
    const clearRes = await ctrl.clearAll();
    const undoRes = await ctrl.undo();
    const redoRes = await ctrl.redo();

    assert.equal(createRes.ok, false);
    assert.equal(deleteRes.ok, false);
    assert.equal(clearRes.ok, false);
    assert.equal(undoRes.ok, false);
    assert.equal(redoRes.ok, false);

    // Owner's original mark remains untouched
    await ctrl.setScope(baseScope, true);
    assert.equal(ctrl.getState().annotations.length, 1);
    assert.equal(ctrl.getState().annotations[0].id, ownerMark.id);
  });

  it('serializes dependent writes and reconciles storage failures before updating history', async () => {
    const { adapter, opLog, setFailNextWrite } = createInMemoryTestAdapter({ writeDelayMs: 5 });
    const ctrl = createSerializedAnnotationController(adapter);
    await ctrl.setScope(baseScope, true);

    const m1 = makeMark(baseScope, { id: 'mark-seq-1', tool: 'pencil' });
    const m2 = makeMark(baseScope, { id: 'mark-seq-2', tool: 'marker' });

    // Fire dependent writes concurrently without awaiting in between
    const p1 = ctrl.create(m1);
    const p2 = ctrl.create(m2);
    const p3 = ctrl.undo();
    const p4 = ctrl.redo();
    await Promise.all([p1, p2, p3, p4]);

    assert.deepEqual(opLog.slice(-4), [
      'saveOne:mark-seq-1',
      'saveOne:mark-seq-2',
      'deleteOne:mark-seq-2',
      'saveOne:mark-seq-2',
    ]);
    assert.equal(ctrl.getState().annotations.length, 2);

    // Inject storage failure on next delete -> history and annotations must NOT advance
    setFailNextWrite('Simulated IndexedDB quota error');
    const failedDelete = await ctrl.remove(m2.id);
    assert.equal(failedDelete.ok, false);
    assert.equal(ctrl.getState().annotations.length, 2);
    assert.equal(ctrl.getState().undoStack.length, 2);
    assert.match(ctrl.getStorageMeta().error ?? '', /quota/i);
  });

  it('picking resolves frontmost visible mark across zoom tolerance and blocks occluded marks through walls', () => {
    // Wall at 4.0m: mark behind wall at 5.2m is occluded, mark in front at 3.98m is visible
    assert.equal(isPointOccludedByWall(5.2, 4.0), true);
    assert.equal(isPointOccludedByWall(3.98, 4.0), false);
    assert.equal(isPointOccludedByWall(3.84, 4.0), false); // ruler label proud of wall

    // Frontmost visible wins; occluded closer-in-screen-space mark is rejected
    const picked = resolveFrontmostAnnotationHit([
      {
        annotationId: 'occluded-behind-wall',
        distance: 6.1,
        screenDistancePx: 0,
        kind: 'label',
        occludedByWall: true,
      },
      {
        annotationId: 'visible-wall-fill',
        distance: 4.0,
        screenDistancePx: 0,
        kind: 'wall_fill',
        occludedByWall: false,
      },
      {
        annotationId: 'visible-ruler-label',
        distance: 3.88,
        screenDistancePx: 8,
        kind: 'label',
        occludedByWall: false,
      },
      {
        annotationId: 'visible-far-stroke',
        distance: 8.5,
        screenDistancePx: 1,
        kind: 'stroke',
        occludedByWall: false,
      },
    ]);
    assert.equal(picked?.annotationId, 'visible-ruler-label');

    // Beyond screen tolerance is rejected
    const missed = resolveFrontmostAnnotationHit(
      [
        {
          annotationId: 'too-far-px',
          distance: 3.5,
          screenDistancePx: 22,
          kind: 'stroke',
          occludedByWall: false,
        },
      ],
      14
    );
    assert.equal(missed, null);

    // 2D segment & rect helpers
    const seg = pointToSegmentDistance2D(50, 16, 0, 10, 100, 10);
    assert.equal(Math.round(seg.distance), 6);
    assert.equal(seg.t, 0.5);
    assert.equal(pointToRectDistance2D(25, 25, 10, 10, 40, 40), 0);
    assert.equal(pointToRectDistance2D(45, 25, 10, 10, 40, 40), 5);

    // Text-entry guard protects inputs/textareas/contentEditable from Delete/Backspace/Ctrl+Z hijacking
    assert.equal(isTextEntryTarget({ tagName: 'INPUT' } as unknown as EventTarget), true);
    assert.equal(isTextEntryTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget), true);
    assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true);
    assert.equal(isTextEntryTarget({ tagName: 'CANVAS' } as unknown as EventTarget), false);
  });
});
