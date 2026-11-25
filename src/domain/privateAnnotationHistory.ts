import {
  buildDrawingScopeKey,
  clearPrivateAnnotationsForScope,
  deletePrivateAnnotation,
  loadPrivateAnnotations,
  resolveScopeDeviceId,
  savePrivateAnnotation,
  savePrivateAnnotationsBatch,
  type DrawingLoadResult,
  type DrawingStorageMode,
  type DrawingWriteResult,
  type PersistedAnnotationTool,
  type PrivateDrawingScope,
  type PrivateSurfaceAnnotation,
} from '../utils/privateDrawingStore';

export type AnnotationHistoryEntry =
  | {
      kind: 'create';
      annotation: PrivateSurfaceAnnotation;
    }
  | {
      kind: 'delete';
      annotation: PrivateSurfaceAnnotation;
      index: number;
    }
  | {
      kind: 'clear';
      previousAnnotations: PrivateSurfaceAnnotation[];
    };

export interface AnnotationHistoryState {
  scopeKey: string;
  annotations: PrivateSurfaceAnnotation[];
  undoStack: AnnotationHistoryEntry[];
  redoStack: AnnotationHistoryEntry[];
  selectedAnnotationId: string | null;
}

export interface AnnotationPersistenceAdapter {
  load(scope: PrivateDrawingScope): Promise<DrawingLoadResult>;
  saveOne(annotation: PrivateSurfaceAnnotation): Promise<DrawingWriteResult>;
  saveBatch(
    scope: PrivateDrawingScope,
    annotations: PrivateSurfaceAnnotation[]
  ): Promise<DrawingWriteResult>;
  deleteOne(scope: PrivateDrawingScope, annotationId: string): Promise<DrawingWriteResult>;
  clearScope(scope: PrivateDrawingScope): Promise<DrawingWriteResult>;
}

export interface AnnotationStorageMeta {
  storageMode: DrawingStorageMode;
  warning: string | null;
  error: string | null;
}

export interface AnnotationControllerResult {
  ok: boolean;
  error?: string;
  state: AnnotationHistoryState;
}

export function cloneAnnotationRecord(
  ann: PrivateSurfaceAnnotation
): PrivateSurfaceAnnotation {
  return {
    ...ann,
    origin: { ...ann.origin },
    normal: { ...ann.normal },
    tangentU: { ...ann.tangentU },
    tangentV: { ...ann.tangentV },
    points2D: ann.points2D.map((p) => ({ u: p.u, v: p.v })),
  };
}

export function createInitialAnnotationHistoryState(scopeKey = ''): AnnotationHistoryState {
  return {
    scopeKey,
    annotations: [],
    undoStack: [],
    redoStack: [],
    selectedAnnotationId: null,
  };
}

export function resetHistoryForScope(
  scopeKey: string,
  loadedAnnotations: ReadonlyArray<PrivateSurfaceAnnotation> = []
): AnnotationHistoryState {
  return {
    scopeKey,
    annotations: loadedAnnotations.map(cloneAnnotationRecord),
    undoStack: [],
    redoStack: [],
    selectedAnnotationId: null,
  };
}

export function commitCreateAnnotation(
  state: AnnotationHistoryState,
  annotation: PrivateSurfaceAnnotation
): AnnotationHistoryState {
  const cloned = cloneAnnotationRecord(annotation);
  const filtered = state.annotations.filter((item) => item.id !== cloned.id);
  return {
    ...state,
    annotations: [...filtered, cloned],
    undoStack: [...state.undoStack, { kind: 'create', annotation: cloned }],
    redoStack: [],
  };
}

export function commitDeleteAnnotation(
  state: AnnotationHistoryState,
  annotationId: string
): { nextState: AnnotationHistoryState; deleted: PrivateSurfaceAnnotation; index: number } | null {
  const index = state.annotations.findIndex((item) => item.id === annotationId);
  if (index === -1) return null;
  const deleted = cloneAnnotationRecord(state.annotations[index]);
  const nextAnnotations = [
    ...state.annotations.slice(0, index),
    ...state.annotations.slice(index + 1),
  ];
  return {
    deleted,
    index,
    nextState: {
      ...state,
      annotations: nextAnnotations,
      undoStack: [...state.undoStack, { kind: 'delete', annotation: deleted, index }],
      redoStack: [],
      selectedAnnotationId:
        state.selectedAnnotationId === annotationId ? null : state.selectedAnnotationId,
    },
  };
}

export function commitClearAnnotations(
  state: AnnotationHistoryState
): { nextState: AnnotationHistoryState; previousAnnotations: PrivateSurfaceAnnotation[] } | null {
  if (state.annotations.length === 0) return null;
  const previousAnnotations = state.annotations.map(cloneAnnotationRecord);
  return {
    previousAnnotations,
    nextState: {
      ...state,
      annotations: [],
      undoStack: [...state.undoStack, { kind: 'clear', previousAnnotations }],
      redoStack: [],
      selectedAnnotationId: null,
    },
  };
}

export function computeUndoTransition(
  state: AnnotationHistoryState
): { nextState: AnnotationHistoryState; entry: AnnotationHistoryEntry } | null {
  if (state.undoStack.length === 0) return null;
  const entry = state.undoStack[state.undoStack.length - 1];
  const nextUndo = state.undoStack.slice(0, -1);
  const nextRedo = [...state.redoStack, entry];

  let nextAnnotations: PrivateSurfaceAnnotation[];
  if (entry.kind === 'create') {
    nextAnnotations = state.annotations.filter((item) => item.id !== entry.annotation.id);
  } else if (entry.kind === 'delete') {
    const withoutDup = state.annotations.filter((item) => item.id !== entry.annotation.id);
    const insertAt = Math.max(0, Math.min(entry.index, withoutDup.length));
    nextAnnotations = [
      ...withoutDup.slice(0, insertAt),
      cloneAnnotationRecord(entry.annotation),
      ...withoutDup.slice(insertAt),
    ];
  } else {
    nextAnnotations = entry.previousAnnotations.map(cloneAnnotationRecord);
  }

  const nextSelectedId =
    state.selectedAnnotationId &&
    nextAnnotations.some((item) => item.id === state.selectedAnnotationId)
      ? state.selectedAnnotationId
      : null;

  return {
    entry,
    nextState: {
      ...state,
      annotations: nextAnnotations,
      undoStack: nextUndo,
      redoStack: nextRedo,
      selectedAnnotationId: nextSelectedId,
    },
  };
}

export function computeRedoTransition(
  state: AnnotationHistoryState
): { nextState: AnnotationHistoryState; entry: AnnotationHistoryEntry } | null {
  if (state.redoStack.length === 0) return null;
  const entry = state.redoStack[state.redoStack.length - 1];
  const nextRedo = state.redoStack.slice(0, -1);
  const nextUndo = [...state.undoStack, entry];

  let nextAnnotations: PrivateSurfaceAnnotation[];
  if (entry.kind === 'create') {
    const withoutDup = state.annotations.filter((item) => item.id !== entry.annotation.id);
    nextAnnotations = [...withoutDup, cloneAnnotationRecord(entry.annotation)];
  } else if (entry.kind === 'delete') {
    nextAnnotations = state.annotations.filter((item) => item.id !== entry.annotation.id);
  } else {
    nextAnnotations = [];
  }

  const nextSelectedId =
    state.selectedAnnotationId &&
    nextAnnotations.some((item) => item.id === state.selectedAnnotationId)
      ? state.selectedAnnotationId
      : null;

  return {
    entry,
    nextState: {
      ...state,
      annotations: nextAnnotations,
      undoStack: nextUndo,
      redoStack: nextRedo,
      selectedAnnotationId: nextSelectedId,
    },
  };
}

export function formatAnnotationToolName(tool: PersistedAnnotationTool): string {
  switch (tool) {
    case 'pencil':
      return 'Pencil stroke';
    case 'marker':
      return 'Marker stroke';
    case 'brush':
      return 'Brush stroke';
    case 'line':
      return 'Line';
    case 'arrow':
      return 'Arrow';
    case 'circle':
      return 'Circle';
    case 'ellipse':
      return 'Ellipse';
    case 'square':
      return 'Square';
    case 'rectangle':
      return 'Rectangle';
    case 'ruler_straight':
      return 'Straight ruler';
    case 'ruler_right_angle':
      return 'Right-angle ruler';
    case 'ruler_angle':
      return 'Angle ruler';
    case 'wall_fill':
      return 'Wall fill';
  }
}

export function formatAnnotationDisplaySummary(annotation: PrivateSurfaceAnnotation): string {
  const base = formatAnnotationToolName(annotation.tool);
  if (annotation.measurementLabel) {
    return `${base} · ${annotation.measurementLabel}`;
  }
  if (annotation.tool === 'wall_fill' && annotation.elementId) {
    return `${base} · ${annotation.elementId}`;
  }
  return base;
}

export function createDefaultPrivateAnnotationAdapter(): AnnotationPersistenceAdapter {
  return {
    load: (scope) => loadPrivateAnnotations(scope),
    saveOne: (annotation) => savePrivateAnnotation(annotation),
    saveBatch: (scope, annotations) => savePrivateAnnotationsBatch(scope, annotations),
    deleteOne: (scope, annotationId) => deletePrivateAnnotation(scope, annotationId),
    clearScope: (scope) => clearPrivateAnnotationsForScope(scope),
  };
}

export interface SerializedAnnotationController {
  getState: () => AnnotationHistoryState;
  getStorageMeta: () => AnnotationStorageMeta;
  setScope: (scope: PrivateDrawingScope | null, canDraw: boolean) => Promise<AnnotationHistoryState>;
  selectAnnotation: (annotationId: string | null) => AnnotationHistoryState;
  create: (annotation: PrivateSurfaceAnnotation) => Promise<AnnotationControllerResult>;
  remove: (annotationId: string) => Promise<AnnotationControllerResult>;
  clearAll: () => Promise<AnnotationControllerResult>;
  undo: () => Promise<AnnotationControllerResult>;
  redo: () => Promise<AnnotationControllerResult>;
  flush: () => Promise<void>;
}

/**
 * Serialized local annotation controller with strict scope isolation, permission guards,
 * and storage-failure reconciliation before advancing undo/redo history.
 */
export function createSerializedAnnotationController(
  adapter: AnnotationPersistenceAdapter,
  onChange?: (state: AnnotationHistoryState, meta: AnnotationStorageMeta) => void
): SerializedAnnotationController {
  let state: AnnotationHistoryState = createInitialAnnotationHistoryState('');
  let meta: AnnotationStorageMeta = {
    storageMode: 'indexeddb',
    warning: null,
    error: null,
  };
  let activeScope: PrivateDrawingScope | null = null;
  let activeCanDraw = false;
  let scopeEpoch = 0;
  let writeChain: Promise<unknown> = Promise.resolve();

  const notify = () => {
    onChange?.(state, meta);
  };

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = writeChain.then(task, task);
    writeChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const runPersist = async (
    op: () => Promise<DrawingWriteResult>
  ): Promise<DrawingWriteResult> => {
    try {
      const res = await op();
      return res;
    } catch (err) {
      return {
        ok: false,
        storageMode: meta.storageMode,
        warning: meta.warning,
        error: err instanceof Error ? err.message : 'Local annotation storage write failed.',
      };
    }
  };

  return {
    getState: () => state,
    getStorageMeta: () => meta,

    setScope(nextScope, nextCanDraw) {
      scopeEpoch += 1;
      const myEpoch = scopeEpoch;
      const normalizedScope: PrivateDrawingScope | null = nextScope
        ? { ...nextScope, deviceId: resolveScopeDeviceId(nextScope) }
        : null;
      const nextScopeKey = normalizedScope ? buildDrawingScopeKey(normalizedScope) : '';
      activeScope = normalizedScope;
      activeCanDraw = nextCanDraw;

      // Immediately clear in-memory marks, selection, and session undo/redo history on scope change
      state = createInitialAnnotationHistoryState(nextScopeKey);
      meta = {
        ...meta,
        warning: nextCanDraw ? meta.warning : null,
        error: null,
      };
      notify();

      if (!nextCanDraw || !normalizedScope) {
        return enqueue(async () => state);
      }

      return enqueue(async () => {
        if (myEpoch !== scopeEpoch) return state;
        try {
          const loaded = await adapter.load(normalizedScope);
          if (myEpoch !== scopeEpoch) return state;
          state = resetHistoryForScope(nextScopeKey, loaded.data);
          meta = {
            storageMode: loaded.storageMode,
            warning: loaded.warning,
            error: null,
          };
          notify();
          return state;
        } catch (err) {
          if (myEpoch !== scopeEpoch) return state;
          meta = {
            ...meta,
            error: err instanceof Error ? err.message : 'Could not load local annotations.',
          };
          notify();
          return state;
        }
      });
    },

    selectAnnotation(annotationId) {
      if (!activeCanDraw) {
        if (state.selectedAnnotationId !== null) {
          state = { ...state, selectedAnnotationId: null };
          notify();
        }
        return state;
      }
      const nextId =
        annotationId && state.annotations.some((item) => item.id === annotationId)
          ? annotationId
          : null;
      if (state.selectedAnnotationId !== nextId) {
        state = { ...state, selectedAnnotationId: nextId };
        notify();
      }
      return state;
    },

    create(annotation) {
      const targetEpoch = scopeEpoch;
      return enqueue(async () => {
        if (targetEpoch !== scopeEpoch || !activeCanDraw || !activeScope) {
          return {
            ok: false,
            error: 'Local drawing permission is required to create annotations.',
            state,
          };
        }
        const scopedRecord: PrivateSurfaceAnnotation = cloneAnnotationRecord({
          ...annotation,
          deviceId: resolveScopeDeviceId(activeScope),
          environment: activeScope.environment,
          accountId: activeScope.accountId,
          projectId: activeScope.projectId,
          modelVersionId: activeScope.modelVersionId,
          areaId: activeScope.areaId,
        });

        const persisted = await runPersist(() => adapter.saveOne(scopedRecord));
        if (targetEpoch !== scopeEpoch) {
          return { ok: false, error: 'Scope changed during save.', state };
        }
        if (!persisted.ok) {
          meta = {
            storageMode: persisted.storageMode,
            warning: persisted.warning,
            error: persisted.error ?? 'Failed to save local annotation.',
          };
          notify();
          return { ok: false, error: meta.error ?? undefined, state };
        }

        state = commitCreateAnnotation(state, scopedRecord);
        meta = {
          storageMode: persisted.storageMode,
          warning: persisted.warning,
          error: null,
        };
        notify();
        return { ok: true, state };
      });
    },

    remove(annotationId) {
      const targetEpoch = scopeEpoch;
      return enqueue(async () => {
        if (targetEpoch !== scopeEpoch || !activeCanDraw || !activeScope) {
          return {
            ok: false,
            error: 'Local drawing permission is required to delete annotations.',
            state,
          };
        }
        const transition = commitDeleteAnnotation(state, annotationId);
        if (!transition) {
          return { ok: false, error: 'Annotation not found in current scope.', state };
        }
        const scopeSnap = activeScope;
        const persisted = await runPersist(() => adapter.deleteOne(scopeSnap, annotationId));
        if (targetEpoch !== scopeEpoch) {
          return { ok: false, error: 'Scope changed during delete.', state };
        }
        if (!persisted.ok) {
          meta = {
            storageMode: persisted.storageMode,
            warning: persisted.warning,
            error: persisted.error ?? 'Failed to delete local annotation.',
          };
          notify();
          return { ok: false, error: meta.error ?? undefined, state };
        }

        state = transition.nextState;
        meta = {
          storageMode: persisted.storageMode,
          warning: persisted.warning,
          error: null,
        };
        notify();
        return { ok: true, state };
      });
    },

    clearAll() {
      const targetEpoch = scopeEpoch;
      return enqueue(async () => {
        if (targetEpoch !== scopeEpoch || !activeCanDraw || !activeScope) {
          return {
            ok: false,
            error: 'Local drawing permission is required to clear annotations.',
            state,
          };
        }
        const transition = commitClearAnnotations(state);
        if (!transition) {
          return { ok: true, state };
        }
        const scopeSnap = activeScope;
        const persisted = await runPersist(() => adapter.clearScope(scopeSnap));
        if (targetEpoch !== scopeEpoch) {
          return { ok: false, error: 'Scope changed during clear.', state };
        }
        if (!persisted.ok) {
          meta = {
            storageMode: persisted.storageMode,
            warning: persisted.warning,
            error: persisted.error ?? 'Failed to clear local annotations.',
          };
          notify();
          return { ok: false, error: meta.error ?? undefined, state };
        }

        state = transition.nextState;
        meta = {
          storageMode: persisted.storageMode,
          warning: persisted.warning,
          error: null,
        };
        notify();
        return { ok: true, state };
      });
    },

    undo() {
      const targetEpoch = scopeEpoch;
      return enqueue(async () => {
        if (targetEpoch !== scopeEpoch || !activeCanDraw || !activeScope) {
          return {
            ok: false,
            error: 'Local drawing permission is required to undo.',
            state,
          };
        }
        const transition = computeUndoTransition(state);
        if (!transition) {
          return { ok: false, error: 'Nothing to undo.', state };
        }
        const scopeSnap = activeScope;
        const { entry, nextState } = transition;
        const persisted = await runPersist(() => {
          if (entry.kind === 'create') {
            return adapter.deleteOne(scopeSnap, entry.annotation.id);
          }
          if (entry.kind === 'delete') {
            return adapter.saveOne(cloneAnnotationRecord(entry.annotation));
          }
          return adapter.saveBatch(
            scopeSnap,
            entry.previousAnnotations.map(cloneAnnotationRecord)
          );
        });

        if (targetEpoch !== scopeEpoch) {
          return { ok: false, error: 'Scope changed during undo.', state };
        }
        if (!persisted.ok) {
          meta = {
            storageMode: persisted.storageMode,
            warning: persisted.warning,
            error: persisted.error ?? 'Undo could not be persisted.',
          };
          notify();
          return { ok: false, error: meta.error ?? undefined, state };
        }

        state = nextState;
        meta = {
          storageMode: persisted.storageMode,
          warning: persisted.warning,
          error: null,
        };
        notify();
        return { ok: true, state };
      });
    },

    redo() {
      const targetEpoch = scopeEpoch;
      return enqueue(async () => {
        if (targetEpoch !== scopeEpoch || !activeCanDraw || !activeScope) {
          return {
            ok: false,
            error: 'Local drawing permission is required to redo.',
            state,
          };
        }
        const transition = computeRedoTransition(state);
        if (!transition) {
          return { ok: false, error: 'Nothing to redo.', state };
        }
        const scopeSnap = activeScope;
        const { entry, nextState } = transition;
        const persisted = await runPersist(() => {
          if (entry.kind === 'create') {
            return adapter.saveOne(cloneAnnotationRecord(entry.annotation));
          }
          if (entry.kind === 'delete') {
            return adapter.deleteOne(scopeSnap, entry.annotation.id);
          }
          return adapter.clearScope(scopeSnap);
        });

        if (targetEpoch !== scopeEpoch) {
          return { ok: false, error: 'Scope changed during redo.', state };
        }
        if (!persisted.ok) {
          meta = {
            storageMode: persisted.storageMode,
            warning: persisted.warning,
            error: persisted.error ?? 'Redo could not be persisted.',
          };
          notify();
          return { ok: false, error: meta.error ?? undefined, state };
        }

        state = nextState;
        meta = {
          storageMode: persisted.storageMode,
          warning: persisted.warning,
          error: null,
        };
        notify();
        return { ok: true, state };
      });
    },

    async flush() {
      await writeChain;
    },
  };
}
