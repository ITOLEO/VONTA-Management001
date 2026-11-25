import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PrivateAnnotationDraft } from '../components/SpatialViewport3D';
import {
  createDefaultPrivateAnnotationAdapter,
  createInitialAnnotationHistoryState,
  createSerializedAnnotationController,
  type AnnotationHistoryState,
  type AnnotationStorageMeta,
  type SerializedAnnotationController,
} from '../domain/privateAnnotationHistory';
import { isTextEntryTarget } from '../domain/workspaceMath';
import {
  getLocalDeviceId,
  isCursorModeTool,
  PRIVATE_DRAWING_FORMAT_VERSION,
  type DrawingStorageMode,
  type DrawingToolType,
  type PrivateDrawingScope,
  type PrivateSurfaceAnnotation,
} from '../utils/privateDrawingStore';

const RULER_CYCLE: ReadonlyArray<DrawingToolType> = [
  'ruler_straight',
  'ruler_right_angle',
  'ruler_angle',
];

const SHAPE_CYCLE: ReadonlyArray<DrawingToolType> = [
  'line',
  'arrow',
  'circle',
  'ellipse',
  'square',
  'rectangle',
];

interface UsePrivateAnnotationsOptions {
  scope: PrivateDrawingScope | null;
  canDraw: boolean;
  activeTool: DrawingToolType;
  setActiveTool: (tool: DrawingToolType) => void;
  deleteMode: boolean;
  setDeleteMode: (value: boolean) => void;
  onToolActivated?: (tool: DrawingToolType) => void;
}

export interface UsePrivateAnnotationsReturn {
  annotations: PrivateSurfaceAnnotation[];
  selectedAnnotationId: string | null;
  selectedAnnotation: PrivateSurfaceAnnotation | null;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  storageMode: DrawingStorageMode;
  storageWarning: string | null;
  rejectedNotice: string | null;
  setRejectedNotice: (msg: string | null) => void;
  selectAnnotation: (annotationId: string | null) => void;
  createAnnotation: (draft: PrivateAnnotationDraft) => Promise<void>;
  deleteAnnotation: (annotationId: string) => Promise<void>;
  clearAllOwnAnnotations: () => Promise<void>;
  undoAnnotation: () => Promise<void>;
  redoAnnotation: () => Promise<void>;
}

export function usePrivateAnnotations({
  scope,
  canDraw,
  activeTool,
  setActiveTool,
  deleteMode,
  setDeleteMode,
  onToolActivated,
}: UsePrivateAnnotationsOptions): UsePrivateAnnotationsReturn {
  const [historyState, setHistoryState] = useState<AnnotationHistoryState>(() =>
    createInitialAnnotationHistoryState('')
  );
  const [storageMeta, setStorageMeta] = useState<AnnotationStorageMeta>({
    storageMode: 'indexeddb',
    warning: null,
    error: null,
  });
  const [rejectedNotice, setRejectedNotice] = useState<string | null>(null);

  const controllerRef = useRef<SerializedAnnotationController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createSerializedAnnotationController(
      createDefaultPrivateAnnotationAdapter(),
      (nextState, nextMeta) => {
        setHistoryState(nextState);
        setStorageMeta(nextMeta);
      }
    );
  }

  const deviceId = scope?.deviceId ?? getLocalDeviceId();
  const environment = scope?.environment ?? null;
  const accountId = scope?.accountId ?? null;
  const projectId = scope?.projectId ?? null;
  const modelVersionId = scope?.modelVersionId ?? null;
  const areaId = scope?.areaId ?? null;

  const stableScope = useMemo<PrivateDrawingScope | null>(
    () =>
      environment && accountId && projectId && modelVersionId && areaId
        ? {
            deviceId,
            environment,
            accountId,
            projectId,
            modelVersionId,
            areaId,
          }
        : null,
    [deviceId, environment, accountId, projectId, modelVersionId, areaId]
  );

  // Immediately clear marks, selection, and session undo/redo history on any scope or permission change
  useEffect(() => {
    setActiveTool('cursor');
    setDeleteMode(false);
    setRejectedNotice(null);
    void controllerRef.current?.setScope(stableScope, canDraw);
  }, [stableScope, canDraw, setActiveTool, setDeleteMode]);

  const selectAnnotation = useCallback((annotationId: string | null) => {
    controllerRef.current?.selectAnnotation(annotationId);
  }, []);

  const createAnnotation = useCallback(
    async (draft: PrivateAnnotationDraft) => {
      if (!canDraw || !stableScope || !controllerRef.current) return;
      const annotation: PrivateSurfaceAnnotation = {
        ...draft,
        id: `mark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        formatVersion: PRIVATE_DRAWING_FORMAT_VERSION,
        ...stableScope,
        createdAt: new Date().toISOString(),
      };
      setRejectedNotice(null);
      const res = await controllerRef.current.create(annotation);
      if (!res.ok && res.error) {
        setRejectedNotice(res.error);
      }
    },
    [canDraw, stableScope]
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!canDraw || !stableScope || !controllerRef.current) return;
      setRejectedNotice(null);
      const res = await controllerRef.current.remove(annotationId);
      if (!res.ok && res.error) {
        setRejectedNotice(res.error);
      }
    },
    [canDraw, stableScope]
  );

  const clearAllOwnAnnotations = useCallback(async () => {
    if (!canDraw || !stableScope || !controllerRef.current) return;
    setDeleteMode(false);
    setRejectedNotice(null);
    const res = await controllerRef.current.clearAll();
    if (!res.ok && res.error) {
      setRejectedNotice(res.error);
    }
  }, [canDraw, stableScope, setDeleteMode]);

  const undoAnnotation = useCallback(async () => {
    if (!canDraw || !stableScope || !controllerRef.current) return;
    setRejectedNotice(null);
    const res = await controllerRef.current.undo();
    if (!res.ok && res.error && res.error !== 'Nothing to undo.') {
      setRejectedNotice(res.error);
    }
  }, [canDraw, stableScope]);

  const redoAnnotation = useCallback(async () => {
    if (!canDraw || !stableScope || !controllerRef.current) return;
    setRejectedNotice(null);
    const res = await controllerRef.current.redo();
    if (!res.ok && res.error && res.error !== 'Nothing to redo.') {
      setRejectedNotice(res.error);
    }
  }, [canDraw, stableScope]);

  const selectedAnnotation = useMemo(
    () =>
      historyState.selectedAnnotationId
        ? historyState.annotations.find((item) => item.id === historyState.selectedAnnotationId) ??
          null
        : null,
    [historyState.annotations, historyState.selectedAnnotationId]
  );

  // Keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Delete/Backspace, and compact tool keys
  useEffect(() => {
    if (!canDraw || !stableScope) return;

    const activateToolFromKey = (tool: DrawingToolType, isEraser = false) => {
      setDeleteMode(isEraser);
      setActiveTool(tool);
      setRejectedNotice(null);
      if (!isCursorModeTool(tool)) {
        controllerRef.current?.selectAnnotation(null);
      }
      onToolActivated?.(tool);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      const keyLower = e.key.toLowerCase();

      // Undo / Redo: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (keyLower === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            void redoAnnotation();
          } else {
            void undoAnnotation();
          }
          return;
        }
        if (keyLower === 'y' && !e.shiftKey) {
          e.preventDefault();
          void redoAnnotation();
          return;
        }
        return;
      }

      if (e.altKey) return;

      // Delete / Backspace deletes the currently selected owned annotation
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const currentSelected = controllerRef.current?.getState().selectedAnnotationId;
        if (currentSelected && isCursorModeTool(activeTool) && !deleteMode) {
          e.preventDefault();
          void deleteAnnotation(currentSelected);
        }
        return;
      }

      // Escape clears selected annotation if active
      if (e.key === 'Escape') {
        if (controllerRef.current?.getState().selectedAnnotationId) {
          controllerRef.current.selectAnnotation(null);
        }
        return;
      }

      // Single-key Photoshop-style tool rail shortcuts
      if (keyLower === 'v') {
        e.preventDefault();
        activateToolFromKey('cursor', false);
      } else if (keyLower === 'p') {
        e.preventDefault();
        activateToolFromKey('pencil', false);
      } else if (keyLower === 'm') {
        e.preventDefault();
        activateToolFromKey('marker', false);
      } else if (keyLower === 'b') {
        e.preventDefault();
        activateToolFromKey('brush', false);
      } else if (keyLower === 'r') {
        e.preventDefault();
        const idx = RULER_CYCLE.indexOf(activeTool);
        const nextRuler = RULER_CYCLE[(idx + 1) % RULER_CYCLE.length];
        activateToolFromKey(idx >= 0 ? nextRuler : 'ruler_straight', false);
      } else if (keyLower === 'u') {
        e.preventDefault();
        const idx = SHAPE_CYCLE.indexOf(activeTool);
        const nextShape = SHAPE_CYCLE[(idx + 1) % SHAPE_CYCLE.length];
        activateToolFromKey(idx >= 0 ? nextShape : 'line', false);
      } else if (keyLower === 'e') {
        e.preventDefault();
        activateToolFromKey('eraser', true);
      } else if (keyLower === 'g') {
        e.preventDefault();
        activateToolFromKey('wall_fill', false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canDraw,
    stableScope,
    activeTool,
    deleteMode,
    setActiveTool,
    setDeleteMode,
    onToolActivated,
    undoAnnotation,
    redoAnnotation,
    deleteAnnotation,
  ]);

  const combinedWarning = storageMeta.error ?? storageMeta.warning;

  return {
    annotations: historyState.annotations,
    selectedAnnotationId: historyState.selectedAnnotationId,
    selectedAnnotation,
    canUndo: historyState.undoStack.length > 0,
    canRedo: historyState.redoStack.length > 0,
    undoCount: historyState.undoStack.length,
    redoCount: historyState.redoStack.length,
    storageMode: storageMeta.storageMode,
    storageWarning: combinedWarning,
    rejectedNotice,
    setRejectedNotice,
    selectAnnotation,
    createAnnotation,
    deleteAnnotation,
    clearAllOwnAnnotations,
    undoAnnotation,
    redoAnnotation,
  };
}
