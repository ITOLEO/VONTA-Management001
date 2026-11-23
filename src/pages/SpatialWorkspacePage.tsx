import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  Focus,
  Info,
  Layers,
  MapPin,
  Plus,
  X,
} from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { useDemoAddendum } from '../context/DemoAddendumContext';
import { useLayoutShell } from '../context/LayoutShellContext';
import {
  DEFAULT_AREA_ID,
  DEMO_WORKERS,
  formatCoordsMeters,
  formatStatusLabel,
  resolveAllAreasDisplayMode,
} from '../domain/demoStore';
import {
  NAMED_PIN_COLOR_SWATCHES,
  resolvePinColorHex,
} from '../domain/attendanceEngine';
import type {
  CrossCheckMeasurement,
  Department,
  LayerKey,
  RoomId,
  SpatialPin,
  SurfaceHitCandidate,
} from '../domain/types';
import {
  SpatialViewport3D,
  type CameraFocusCommand,
  type PrivateAnnotationDraft,
  type SpatialViewportHandle,
} from '../components/SpatialViewport3D';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { ContextualRail, type RailNavItem } from '../components/ContextualRail';
import { WorkspaceBuildingAreasSlot } from '../components/WorkspaceBuildingAreasSlot';
import { WorkspaceDrawingToolbar } from '../components/WorkspaceDrawingToolbar';
import { WorkspaceOutputActions } from '../components/WorkspaceOutputActions';
import { WorkspaceCompassWidget } from '../components/WorkspaceCompassWidget';
import { RoomsPicker } from '../components/RoomsPicker';
import { DepartmentPicker } from '../components/DepartmentPicker';
import { ColorPickerControl } from '../components/ColorPickerControl';
import { InviteMemberModal } from '../components/InviteMemberModal';
import { MaterialsSection } from '../components/MaterialsSection';
import { EvidenceSection } from '../components/EvidenceSection';
import { getProjectRoutes } from '../utils/projectRoutes';
import type { DrawingLineStyle } from '../domain/workspaceMath';
import {
  PRIVATE_DRAWING_FORMAT_VERSION,
  clearPrivateAnnotationsForScope,
  deletePrivateAnnotation,
  isCursorModeTool,
  loadPrivateAnnotations,
  savePrivateAnnotation,
  type DrawingStorageMode,
  type DrawingStrokeWidthKey,
  type DrawingToolType,
  type PrivateSurfaceAnnotation,
} from '../utils/privateDrawingStore';

export function SpatialWorkspacePage() {
  const { project: projectParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    state,
    isHydrated,
    model,
    departments,
    addMaterial,
    attachEvidence,
    removeEvidence,
    createPin,
    updatePinColor,
  } = useDemo();
  const addendum = useDemoAddendum();
  const { setMobileRailOpen } = useLayoutShell();

  const routes = getProjectRoutes(location.pathname, state.project.slug);
  const viewportRef = useRef<SpatialViewportHandle | null>(null);

  const [selectedPinId, setSelectedPinId] = useState<string | null>(() =>
    searchParams.get('pin')
  );
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeAreaId, setActiveAreaId] = useState<string>(
    () => state.areas[0]?.id ?? DEFAULT_AREA_ID
  );
  const [activeRoomId, setActiveRoomId] = useState<RoomId | null>(null);
  const [activeDepartmentFilter, setActiveDepartmentFilter] = useState<string | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraFocusCommand | null>(null);
  const camSeqRef = useRef(0);

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    civil: true,
    electrical: false,
    plumbing: false,
    pins: true,
  });
  const [layerNotice, setLayerNotice] = useState<string | null>(null);

  // Overlay & docked rail states
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [pinDrawerOpen, setPinDrawerOpen] = useState(false);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [dockExpanded, setDockExpanded] = useState(true);
  const [liveCrossCheck, setLiveCrossCheck] = useState<CrossCheckMeasurement>(model.crossCheck);

  // Dual compass state (syncs corner needle & ground rose with camera azimuth and verified north)
  const [cameraAzimuthDeg, setCameraAzimuthDeg] = useState(0);
  const [showGroundCompass, setShowGroundCompass] = useState(false);

  // Private device-local 3D drawings (v2)
  const [annotations, setAnnotations] = useState<PrivateSurfaceAnnotation[]>([]);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingToolType>('cursor');
  const [drawingColorHex, setDrawingColorHex] = useState<string>('#E11D48');
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState<DrawingStrokeWidthKey>('medium');
  const [drawingStrokeWidthPx, setDrawingStrokeWidthPx] = useState<number>(4);
  const [drawingLineStyle, setDrawingLineStyle] = useState<DrawingLineStyle>('solid');
  const [drawingDeleteMode, setDrawingDeleteMode] = useState<boolean>(false);
  const [hideLocalDrawings, setHideLocalDrawings] = useState<boolean>(
    () => searchParams.get('hideLocalDrawings') === '1'
  );
  const [drawingStorageMode, setDrawingStorageMode] = useState<DrawingStorageMode>('indexeddb');
  const [drawingStorageWarning, setDrawingStorageWarning] = useState<string | null>(null);
  const [drawingRejectedNotice, setDrawingRejectedNotice] = useState<string | null>(null);

  // Create Pin state
  const [createMode, setCreateMode] = useState(false);
  const [pendingHit, setPendingHit] = useState<SurfaceHitCandidate | null>(null);
  const [voidClickError, setVoidClickError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDepartment, setNewDepartment] = useState<Department>('Civil');
  const [newAssignee, setNewAssignee] = useState<string>(DEMO_WORKERS[2].name);
  const [newDescription, setNewDescription] = useState('');
  const [newPinColor, setNewPinColor] = useState<string>(NAMED_PIN_COLOR_SWATCHES[0].hex);
  const [newPinColorManualOverride, setNewPinColorManualOverride] = useState(false);
  const [showNewPinManualColor, setShowNewPinManualColor] = useState(false);
  const [showInspectorManualColor, setShowInspectorManualColor] = useState(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  const issueCameraCommand = useCallback(
    (cmd: Omit<CameraFocusCommand, 'id'>) => {
      camSeqRef.current += 1;
      setCameraCommand({ ...cmd, id: camSeqRef.current });
    },
    []
  );

  // Scope key for account-isolated IndexedDB drawings (D05, D06, D07)
  const drawingScope = useMemo(
    () => ({
      environment: 'demo' as const,
      accountId: addendum.activePersona.accountId,
      projectId: state.project.id,
      modelVersionId: state.project.modelVersionId,
      areaId: activeAreaId,
    }),
    [
      addendum.activePersona.accountId,
      state.project.id,
      state.project.modelVersionId,
      activeAreaId,
    ]
  );

  // Immediately clear in-memory marks on account/project/area/permission change, then hydrate scoped IndexedDB marks
  useEffect(() => {
    setAnnotations([]);
    setActiveDrawingTool('cursor');
    setDrawingDeleteMode(false);
    setDrawingRejectedNotice(null);

    if (!addendum.capabilities.canDrawLocally) {
      setDrawingStorageWarning(null);
      return;
    }

    let cancelled = false;
    void loadPrivateAnnotations(drawingScope).then((res) => {
      if (cancelled) return;
      setAnnotations(res.data);
      setDrawingStorageMode(res.storageMode);
      setDrawingStorageWarning(res.warning);
    });
    return () => {
      cancelled = true;
    };
  }, [drawingScope, addendum.capabilities.canDrawLocally]);

  // Apply shared view hydration (E04–E06): restores camera & layers and keeps local drawings hidden on open
  const sharedStateAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    const shareParam = searchParams.get('share');
    const hideParam = searchParams.get('hideLocalDrawings') === '1';
    const navShared = (
      location.state as {
        sharedView?: {
          shareId?: string;
          areaId?: string;
          roomId?: string | null;
          selectedPinId?: string | null;
          camera?: {
            position: { x: number; y: number; z: number };
            target: { x: number; y: number; z: number };
          };
          layers?: Record<LayerKey, boolean>;
          hideLocalDrawings?: boolean;
        };
      } | null
    )?.sharedView;

    if (hideParam || navShared?.hideLocalDrawings) {
      setHideLocalDrawings(true);
    }

    const token = shareParam ?? navShared?.shareId ?? null;
    if (!token || sharedStateAppliedRef.current === token) return;

    const resolved =
      navShared ??
      (() => {
        const lookup = addendum.resolveDemoShare(token);
        return lookup.ok && lookup.share
          ? { ...lookup.share, hideLocalDrawings: true }
          : null;
      })();

    if (!resolved) return;
    sharedStateAppliedRef.current = token;
    setHideLocalDrawings(true);
    if (resolved.areaId) setActiveAreaId(resolved.areaId);
    if (resolved.roomId !== undefined) setActiveRoomId((resolved.roomId as RoomId) ?? null);
    if (resolved.selectedPinId !== undefined) setSelectedPinId(resolved.selectedPinId);
    if (resolved.layers) setLayers(resolved.layers);
    if (resolved.camera) {
      const cam = resolved.camera;
      window.setTimeout(() => {
        viewportRef.current?.applyCameraSnapshot(cam);
      }, 120);
    }
  }, [searchParams, location.state, addendum]);

  const handleCreateAnnotation = useCallback(
    (draft: PrivateAnnotationDraft) => {
      if (!addendum.capabilities.canDrawLocally) return;
      const annotation: PrivateSurfaceAnnotation = {
        ...draft,
        id: `mark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        formatVersion: PRIVATE_DRAWING_FORMAT_VERSION,
        ...drawingScope,
        createdAt: new Date().toISOString(),
      };
      setAnnotations((prev) => [...prev, annotation]);
      setDrawingRejectedNotice(null);
      void savePrivateAnnotation(annotation).then((res) => {
        setDrawingStorageMode(res.storageMode);
        setDrawingStorageWarning(res.warning);
      });
    },
    [addendum.capabilities.canDrawLocally, drawingScope]
  );

  const handleDeleteAnnotation = useCallback(
    (annotationId: string) => {
      if (!addendum.capabilities.canDrawLocally) return;
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      void deletePrivateAnnotation(drawingScope, annotationId);
    },
    [addendum.capabilities.canDrawLocally, drawingScope]
  );

  const handleClearAllOwnAnnotations = useCallback(() => {
    if (!addendum.capabilities.canDrawLocally) return;
    setAnnotations([]);
    setDrawingDeleteMode(false);
    void clearPrivateAnnotationsForScope(drawingScope);
  }, [addendum.capabilities.canDrawLocally, drawingScope]);

  // Replace legacy /spatial?overview=1 bookmarks with full Overview in the same namespace
  const requestedOverviewParam = searchParams.get('overview');
  useEffect(() => {
    if (requestedOverviewParam === '1') {
      navigate(routes.overviewPath, { replace: true });
    }
  }, [requestedOverviewParam, navigate, routes.overviewPath]);

  // Sync deep-link ?pin=... when arriving via Locate in 3D or initial page load
  const requestedPinParam = searchParams.get('pin');
  const deepLinkAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedPinParam) {
      deepLinkAppliedRef.current = null;
      return;
    }
    if (deepLinkAppliedRef.current === requestedPinParam) {
      return;
    }
    const found = state.pins.find(
      (p) => p.id === requestedPinParam || p.slug === requestedPinParam
    );
    if (found) {
      deepLinkAppliedRef.current = found.id;
      setCreateMode(false);
      setPendingHit(null);
      setVoidClickError(null);
      setSelectedElementId(found.elementId);
      setSelectedPinId(found.id);
      issueCameraCommand({ kind: 'pin', pin: found });
    }
  }, [requestedPinParam, state.pins, isHydrated, issueCameraCommand]);

  const visibleRooms = useMemo(() => {
    if (activeAreaId === 'all') return model.rooms;
    return model.rooms.filter((r) => r.areaId === activeAreaId);
  }, [model.rooms, activeAreaId]);

  const areaPins = useMemo(() => {
    if (activeAreaId === 'all') return state.pins;
    return state.pins.filter((p) => p.areaId === activeAreaId);
  }, [state.pins, activeAreaId]);

  const visiblePins = useMemo(() => {
    let list = areaPins;
    if (activeRoomId) {
      list = list.filter((p) => p.roomId === activeRoomId);
    }
    if (activeDepartmentFilter) {
      list = list.filter(
        (p) => p.department.toLowerCase() === activeDepartmentFilter.toLowerCase()
      );
    }
    return list;
  }, [areaPins, activeRoomId, activeDepartmentFilter]);

  const roomCountByArea = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of model.rooms) {
      map[r.areaId] = (map[r.areaId] ?? 0) + 1;
    }
    return map;
  }, [model.rooms]);

  const allAreasDisplay = useMemo(
    () => resolveAllAreasDisplayMode(state.areas),
    [state.areas]
  );

  const selectedPin: SpatialPin | null = useMemo(
    () => state.pins.find((p) => p.id === selectedPinId) ?? null,
    [state.pins, selectedPinId]
  );

  const selectedElement = useMemo(
    () => model.elements.find((e) => e.id === selectedElementId) ?? null,
    [model.elements, selectedElementId]
  );

  const pinsOnSelectedElement = useMemo(() => {
    if (!selectedElementId) return [];
    return visiblePins.filter((p) => p.elementId === selectedElementId);
  }, [visiblePins, selectedElementId]);

  // Pin drawer exposes all authorized project Pins across areas (filtered by room/dept when active)
  const pinsForDrawer = useMemo(() => {
    let list = state.pins;
    if (activeRoomId) {
      list = list.filter((p) => p.roomId === activeRoomId);
    }
    if (activeDepartmentFilter) {
      list = list.filter(
        (p) => p.department.toLowerCase() === activeDepartmentFilter.toLowerCase()
      );
    }
    return list;
  }, [state.pins, activeRoomId, activeDepartmentFilter]);

  const isAllPinFilterClear =
    !activeRoomId && !activeDepartmentFilter && !selectedPinId && layers.pins;

  const handleResetAllPinFilters = useCallback(() => {
    setActiveRoomId(null);
    setActiveDepartmentFilter(null);
    setSelectedPinId(null);
    setSelectedElementId(null);
    setLayers((prev) => ({ ...prev, pins: true }));
    deepLinkAppliedRef.current = null;
    setSearchParams({}, { replace: true });
    issueCameraCommand({ kind: 'overall' });
  }, [setSearchParams, issueCameraCommand]);

  // L02: Workspace sidebar footer order: Pin list | divider | Model info | divider | Project settings
  const workspaceFooterItems = useMemo<RailNavItem[]>(
    () => [
      {
        id: 'pin-list',
        label: 'Pin list',
        icon: MapPin,
        active: pinDrawerOpen,
        badge: activeRoomId ? pinsForDrawer.length : visiblePins.length,
        testId: 'rail-item-pin-list',
        onClick: () => {
          setPinDrawerOpen((v) => !v);
          setModelInfoOpen(false);
        },
      },
      {
        id: 'model-info',
        label: 'Model info',
        icon: Info,
        active: modelInfoOpen,
        testId: 'rail-item-model-info',
        onClick: () => {
          setModelInfoOpen((v) => !v);
          setPinDrawerOpen(false);
        },
      },
    ],
    [activeRoomId, pinsForDrawer.length, visiblePins.length, pinDrawerOpen, modelInfoOpen]
  );

  const handleSelectPin = useCallback(
    (pinId: string) => {
      const target = state.pins.find((p) => p.id === pinId);
      if (!target) return;
      setCreateMode(false);
      setPendingHit(null);
      setVoidClickError(null);
      setCreateFormError(null);
      setSelectedPinId(target.id);
      setSelectedElementId(target.elementId);
      deepLinkAppliedRef.current = target.id;
      setSearchParams({ pin: target.id }, { replace: true });
      issueCameraCommand({ kind: 'pin', pin: target });
    },
    [state.pins, setSearchParams, issueCameraCommand]
  );

  const handleSelectElement = useCallback(
    (elementId: string) => {
      setCreateMode(false);
      setPendingHit(null);
      setVoidClickError(null);
      setSelectedPinId(null);
      setSelectedElementId(elementId);
      deepLinkAppliedRef.current = null;
      setSearchParams({}, { replace: true });
    },
    [setSearchParams]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedPinId(null);
    setSelectedElementId(null);
    deepLinkAppliedRef.current = null;
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const handleSelectArea = useCallback(
    (nextAreaId: string) => {
      if (nextAreaId === activeAreaId) return;
      setActiveAreaId(nextAreaId);
      setActiveRoomId(null);
      issueCameraCommand({ kind: 'overall' });
    },
    [activeAreaId, issueCameraCommand]
  );

  const handleSelectRoom = useCallback(
    (roomId: RoomId | null) => {
      setActiveRoomId(roomId);
      if (roomId === null) {
        issueCameraCommand({ kind: 'overall' });
      } else {
        issueCameraCommand({ kind: 'room', roomId });
      }
    },
    [issueCameraCommand]
  );

  const handleToggleLayer = (key: LayerKey) => {
    setLayers((prev) => {
      const nextVal = !prev[key];
      if (key === 'electrical') {
        setLayerNotice(
          nextVal
            ? 'Electrical layer: No electrical routing source on sheet A-03 R00. Conduit paths are not drawn.'
            : null
        );
      } else if (key === 'plumbing') {
        setLayerNotice(
          nextVal
            ? 'Plumbing layer: No plumbing routing source on sheet A-03 R00. Pipe paths are not drawn.'
            : null
        );
      } else {
        setLayerNotice(null);
      }
      return { ...prev, [key]: nextVal };
    });
  };

  // Clear stale selection if a Pin is removed (for example after Reset Demo)
  useEffect(() => {
    if (selectedPinId && !state.pins.some((p) => p.id === selectedPinId)) {
      setSelectedPinId(null);
      setSelectedElementId(null);
      deepLinkAppliedRef.current = null;
      setSearchParams({}, { replace: true });
    }
  }, [state.pins, selectedPinId, setSearchParams]);

  const handleStartCreateMode = () => {
    if (createMode) {
      setCreateMode(false);
      setPendingHit(null);
      setVoidClickError(null);
      setCreateFormError(null);
      return;
    }
    setSelectedPinId(null);
    setSelectedElementId(null);
    setPendingHit(null);
    setVoidClickError(null);
    setCreateFormError(null);
    setNewTitle('');
    setNewDescription('');
    setPinDrawerOpen(false);
    setModelInfoOpen(false);
    setRoomsOpen(false);
    setDepartmentPickerOpen(false);
    setActiveDrawingTool('cursor');
    setDrawingDeleteMode(false);
    setNewPinColorManualOverride(false);
    setShowNewPinManualColor(false);
    const defaultDept = departments.find(
      (d) => d.name.toLowerCase() === newDepartment.toLowerCase()
    );
    if (defaultDept) {
      setNewPinColor(defaultDept.defaultPinColor);
    }
    setCreateMode(true);
    setSearchParams({}, { replace: true });
    issueCameraCommand({ kind: 'overall' });
  };

  const handleCreateSurfaceHit = useCallback((hit: SurfaceHitCandidate) => {
    setVoidClickError(null);
    setCreateFormError(null);
    setPendingHit(hit);
  }, []);

  const handleCreateVoidClick = useCallback(() => {
    setPendingHit(null);
    setVoidClickError(
      'Invalid placement: clicked empty space. Select a wall or floor surface on the 3D model. No Pin was created.'
    );
  }, []);

  const handleSubmitNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createPin({
      hit: pendingHit,
      title: newTitle,
      department: newDepartment,
      assigneeName: newAssignee,
      description: newDescription,
      color: newPinColor,
      pinColorOverride: newPinColorManualOverride,
    });

    if (!res.ok) {
      setCreateFormError(res.error);
      return;
    }

    setCreateMode(false);
    setPendingHit(null);
    setVoidClickError(null);
    setCreateFormError(null);
    setNewTitle('');
    setNewDescription('');
    setNewPinColorManualOverride(false);
    setShowNewPinManualColor(false);
    setSelectedPinId(res.createdPin.id);
    setSelectedElementId(res.createdPin.elementId);
    deepLinkAppliedRef.current = res.createdPin.id;
    setSearchParams({ pin: res.createdPin.id }, { replace: true });
    issueCameraCommand({ kind: 'pin', pin: res.createdPin });
  };

  if (requestedOverviewParam === '1') {
    return null;
  }

  if (projectParam && projectParam !== state.project.slug) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <ProjectNavbar inProjectContext={false} />
        <main className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <h1 className="text-[26px] leading-[32px] font-bold">Project not found</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
            Return to the project directory to open Paviliun Kerja (A-03 R00).
          </p>
          <Link
            to={routes.directoryPath}
            className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All projects
          </Link>
        </main>
      </div>
    );
  }

  const inspectorOpen = Boolean(selectedPin || selectedElement || createMode);
  const showUnverifiedSplitView =
    activeAreaId === 'all' && allAreasDisplay.mode === 'separate_unverified_previews';
  const addPinActionLabel = routes.isDemoPrefix ? 'Add demo pin' : 'Add pin';

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-[#F4F3EF] text-[#1B2A4A]">
      {/* Shared Top Navigation */}
      <ProjectNavbar />

      {/* Full-Height Body Below Top Header: Shared Contextual Left Rail + Dominant 3D Workspace */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* L02: Building areas at top of Workspace sidebar; footer order Pin list | Model info | Project settings */}
        <ContextualRail
          moduleLabel="Workspace"
          groups={[]}
          topSlot={(expanded, closeMobileOnClick) => (
            <WorkspaceBuildingAreasSlot
              expanded={expanded}
              closeMobileOnClick={closeMobileOnClick}
              onCloseMobile={() => setMobileRailOpen(false)}
              areas={state.areas}
              pins={state.pins}
              roomCountByArea={roomCountByArea}
              activeAreaId={activeAreaId}
              onSelectArea={handleSelectArea}
            />
          )}
          footerItems={workspaceFooterItems}
          projectSettingsPath={routes.settingsPath}
        />

        {/* Workspace Column (resizes smoothly via ResizeObserver without remounting WebGLRenderer) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Center 3D Viewport + Contextual Right Inspector */}
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <main className="relative flex-1 overflow-hidden">
          {showUnverifiedSplitView ? (
            <div className="flex h-full flex-col overflow-y-auto bg-[#F4F3EF] p-6 pt-20">
              <div className="text-[13px] leading-[18px] font-semibold text-[#A64011]">
                Placement not verified
              </div>
              <h2 className="mt-1 text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                Separate area previews
              </h2>
              <p className="mt-1 max-w-xl text-[15px] leading-[22px] text-[#4F5C67]">
                These areas do not share a common coordinate transform, so they are displayed
                separately rather than superimposed at the origin.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {state.areas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => handleSelectArea(area.id)}
                    className="rounded-xl border border-[#D9DEE2] bg-white p-5 text-left hover:border-[#D4652F]"
                  >
                    <div className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                      {area.name}
                    </div>
                    <div className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                      {area.sheetLabel} · {area.modelStatus}
                    </div>
                    {!area.isRegisteredInCommonFrame && (
                      <div className="mt-1.5 text-[13px] font-medium text-[#A64011]">
                        Placement not verified
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <SpatialViewport3D
              ref={viewportRef}
              model={model}
              pins={visiblePins}
              selectedPinId={selectedPinId}
              selectedElementId={selectedElementId}
              activeRoomId={activeRoomId}
              layers={layers}
              createMode={createMode}
              pendingHit={pendingHit}
              cameraCommand={cameraCommand}
              onSelectPin={handleSelectPin}
              onSelectElement={handleSelectElement}
              onClearSelection={handleClearSelection}
              onCreateSurfaceHit={handleCreateSurfaceHit}
              onCreateVoidClick={handleCreateVoidClick}
              onMeshCrossCheckMeasured={setLiveCrossCheck}
              annotations={annotations}
              activeDrawingTool={activeDrawingTool}
              drawingColorHex={drawingColorHex}
              drawingStrokeWidth={drawingStrokeWidth}
              drawingStrokeWidthPx={drawingStrokeWidthPx}
              drawingLineStyle={drawingLineStyle}
              drawingDeleteMode={drawingDeleteMode}
              hideLocalDrawings={hideLocalDrawings}
              canDraw={addendum.capabilities.canDrawLocally}
              isModelCalibrated={true}
              northAngleDeg={0}
              showGroundCompass={showGroundCompass}
              onCameraAzimuthChange={setCameraAzimuthDeg}
              onCreateAnnotation={handleCreateAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              onDrawingRejected={(reason) => setDrawingRejectedNotice(reason)}
            />
          )}

          {/* Upper-Left: Compact Vertical Grouped Private Device Drawing Tools */}
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
            <WorkspaceDrawingToolbar
              canDraw={addendum.capabilities.canDrawLocally}
              activeTool={activeDrawingTool}
              onSelectTool={(tool) => {
                setActiveDrawingTool(tool);
                setDrawingRejectedNotice(null);
                if (!isCursorModeTool(tool)) {
                  setCreateMode(false);
                  setPendingHit(null);
                  setHideLocalDrawings(false);
                }
              }}
              colorHex={drawingColorHex}
              onSelectColor={setDrawingColorHex}
              strokeWidth={drawingStrokeWidth}
              onSelectStrokeWidth={setDrawingStrokeWidth}
              strokeWidthPx={drawingStrokeWidthPx}
              onSelectStrokeWidthPx={setDrawingStrokeWidthPx}
              lineStyle={drawingLineStyle}
              onSelectLineStyle={setDrawingLineStyle}
              deleteMode={drawingDeleteMode}
              onToggleDeleteMode={() => setDrawingDeleteMode((v) => !v)}
              annotationCount={annotations.length}
              onClearAllOwn={handleClearAllOwnAnnotations}
              hideLocalDrawings={hideLocalDrawings}
              onToggleHideLocalDrawings={() => setHideLocalDrawings((v) => !v)}
              storageMode={drawingStorageMode}
              storageWarning={drawingStorageWarning}
              rejectedNotice={drawingRejectedNotice}
              isModelCalibrated={true}
            />
          </div>

          {/* Upper-Right: Authorized Download View / Share View + Dual Compass directly below */}
          <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
            <WorkspaceOutputActions
              canDownload={addendum.capabilities.canDownloadWorkspaceView}
              canShare={addendum.capabilities.canShareWorkspaceView}
              canInvite={addendum.capabilities.canManageGrants}
              onOpenInviteModal={() => setInviteModalOpen(true)}
              projectName={state.project.name}
              projectId={state.project.id}
              accountId={addendum.activePersona.accountId}
              modelVersionId={state.project.modelVersionId}
              areaId={activeAreaId}
              viewportRef={viewportRef}
              onAuthorizeDownload={async () => {
                if (!addendum.capabilities.canDownloadWorkspaceView) {
                  throw new Error('You are not authorized to download Workspace views.');
                }
                return {
                  suggestedFileName: `${state.project.slug}-${activeAreaId}-view.png`,
                };
              }}
              onCreateShareLink={async (camera, accessMode) => {
                if (!addendum.capabilities.canShareWorkspaceView) {
                  throw new Error('You are not authorized to share Workspace views.');
                }
                const share = addendum.createDemoShare({
                  projectId: state.project.slug,
                  modelVersionId: state.project.modelVersionId,
                  areaId: activeAreaId,
                  roomId: activeRoomId,
                  selectedPinId,
                  camera,
                  layers,
                  accessMode,
                });
                const refToken =
                  share.accessMode === 'anyone_with_link' && share.publicToken
                    ? share.publicToken
                    : share.id;
                return {
                  shareId: share.id,
                  shareUrl: `${window.location.origin}/demo/share/${refToken}`,
                  accessMode: share.accessMode,
                  publicToken: share.publicToken,
                };
              }}
              onUpdateShareAccess={async (shareId, accessMode) => {
                const updated = addendum.updateDemoShareAccess(shareId, accessMode);
                if (!updated) throw new Error('Shared link not found.');
                const refToken =
                  updated.accessMode === 'anyone_with_link' && updated.publicToken
                    ? updated.publicToken
                    : updated.id;
                return {
                  shareId: updated.id,
                  shareUrl: `${window.location.origin}/demo/share/${refToken}`,
                  accessMode: updated.accessMode,
                  publicToken: updated.publicToken,
                };
              }}
              onRevokeShareLink={async (shareId) => {
                addendum.revokeDemoShare(shareId);
              }}
            />

            <WorkspaceCompassWidget
              cameraAzimuthDeg={cameraAzimuthDeg}
              northAngleDeg={0}
              showGroundCompass={showGroundCompass}
              onToggleGroundCompass={() => setShowGroundCompass((v) => !v)}
            />
          </div>

          {/* Create Mode Banner */}
          {createMode && (
            <div
              role="status"
              className="absolute left-1/2 top-3 z-20 w-[min(460px,calc(100%-24px))] -translate-x-1/2 rounded-xl border border-[#D4652F] bg-white px-4 py-2.5 shadow-md"
            >
              <div className="flex items-start gap-2.5">
                <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]" aria-hidden="true" />
                <div className="text-[13px] leading-[18px]">
                  <div className="font-semibold text-[#1B2A4A]">
                    Select a wall or floor surface
                  </div>
                  <p className="mt-0.5 text-[#4F5C67]">
                    {pendingHit
                      ? `Anchored on ${pendingHit.elementName} (${pendingHit.surfaceSide}).`
                      : 'Click any building surface on the 3D model. Clicking empty space will not place a Pin.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pin List & Building Elements Overlay Drawer */}
          {pinDrawerOpen && (
            <section
              aria-label="Spatial Pins list"
              className="absolute bottom-20 left-3 top-[64px] z-40 flex w-[min(340px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-[#D9DEE2] bg-white shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-[#D9DEE2] px-4 py-3">
                <div>
                  <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                    Pins ({pinsForDrawer.length})
                  </h2>
                  {activeRoomId && (
                    <div className="text-[13px] leading-[18px] text-[#4F5C67]">
                      Filtered to {model.rooms.find((r) => r.id === activeRoomId)?.name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* L02: Explicit All option restores full permitted project Pin list */}
                  <button
                    type="button"
                    data-testid="pin-list-filter-all"
                    aria-pressed={isAllPinFilterClear}
                    onClick={handleResetAllPinFilters}
                    className={`inline-flex min-h-[34px] items-center rounded-lg border px-2.5 text-[12px] font-semibold transition-colors ${
                      isAllPinFilterClear
                        ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                        : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                    }`}
                  >
                    All ({state.pins.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPinDrawerOpen(false)}
                    aria-label="Close Pins list"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {pinsForDrawer.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#D9DEE2] p-4 text-center text-[14px] leading-[20px] text-[#4F5C67]">
                    No Spatial Pins match the active filter.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {pinsForDrawer.map((pin) => {
                      const active = pin.id === selectedPinId;
                      const isOtherArea = activeAreaId !== 'all' && pin.areaId !== activeAreaId;
                      return (
                        <li key={pin.id}>
                          <div
                            className={`w-full rounded-lg border p-3 transition-colors ${
                              active
                                ? 'border-[#D4652F] bg-[#D4652F]/8'
                                : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (isOtherArea) setActiveAreaId(pin.areaId);
                                handleSelectPin(pin.id);
                                setPinDrawerOpen(false);
                              }}
                              aria-pressed={active}
                              className="w-full text-left"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="inline-flex items-center gap-2 text-[15px] leading-[22px] font-semibold text-[#1B2A4A]">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: resolvePinColorHex(pin.color) }}
                                  />
                                  <span>{pin.title}</span>
                                </span>
                                <MapPin
                                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                                    active ? 'text-[#D4652F]' : 'text-[#4F5C67]'
                                  }`}
                                  aria-hidden="true"
                                />
                              </div>
                              <div className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                                <span className="font-medium text-[#D4652F]">
                                  {formatStatusLabel(pin.status)}
                                </span>
                                <span aria-hidden="true"> · </span>
                                <span>{pin.department}</span>
                                <span aria-hidden="true"> · </span>
                                <span>{pin.roomName}</span>
                              </div>
                            </button>
                            {isOtherArea && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveAreaId(pin.areaId);
                                  handleSelectPin(pin.id);
                                  setPinDrawerOpen(false);
                                }}
                                className="mt-2 inline-flex items-center gap-1 rounded-md border border-[#D4652F]/40 bg-[#FFF3EB] px-2.5 py-1 text-[12px] font-semibold text-[#A64011] hover:bg-[#FFE5D3]"
                              >
                                <Focus className="h-3.5 w-3.5" aria-hidden="true" />
                                Locate in 3D
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="mt-4 border-t border-[#D9DEE2] pt-3">
                  <div className="text-[13px] leading-[18px] font-semibold text-[#4F5C67]">
                    Building elements
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {model.elements
                      .filter((el) => el.category !== 'floor_slab')
                      .map((el) => {
                        const attachedCount = visiblePins.filter(
                          (p) => p.elementId === el.id
                        ).length;
                        const active = selectedElementId === el.id && !selectedPinId;
                        return (
                          <button
                            key={el.id}
                            type="button"
                            onClick={() => {
                              handleSelectElement(el.id);
                              setPinDrawerOpen(false);
                            }}
                            className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[14px] leading-[20px] transition-colors ${
                              active
                                ? 'border-[#D4652F] bg-[#D4652F]/8 font-semibold text-[#1B2A4A]'
                                : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                            }`}
                          >
                            <span className="truncate">{el.name}</span>
                            <span className="shrink-0 text-[13px] text-[#4F5C67] tabular-nums">
                              {attachedCount}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Model Info Popover (Coordinates, Source Revision & Measurement Details) */}
          {modelInfoOpen && (
            <section
              aria-label="Model info"
              className="absolute right-3 top-3 z-40 max-h-[calc(100%-96px)] w-[min(420px,calc(100%-24px))] overflow-y-auto rounded-xl border border-[#D9DEE2] bg-white p-5 shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                    Model info
                  </h2>
                  <p className="mt-0.5 text-[13px] leading-[18px] font-semibold text-[#A64011]">
                    {state.project.geometryNotice}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModelInfoOpen(false)}
                  aria-label="Close Model info"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <dl className="mt-3 divide-y divide-[#D9DEE2] border-y border-[#D9DEE2] text-[13px] leading-[18px]">
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-[#4F5C67]">Source drawing</dt>
                  <dd className="font-medium text-[#1B2A4A]">
                    {state.project.sheetCode} {state.project.sheetRevision} ({state.project.sheetDate})
                  </dd>
                </div>
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-[#4F5C67]">Model version</dt>
                  <dd className="font-medium text-[#1B2A4A] tabular-nums">
                    {state.project.modelVersionId}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-[#4F5C67]">Grid span</dt>
                  <dd className="font-medium text-[#1B2A4A] tabular-nums">8,400 × 6,000 mm</dd>
                </div>
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-[#4F5C67]">Walls (Ext / Part / Height)</dt>
                  <dd className="font-medium text-[#1B2A4A] tabular-nums">150 / 100 / 3,200 mm</dd>
                </div>
              </dl>

              <div className="mt-4 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/60 p-3.5">
                <div className="text-[13px] leading-[18px] font-semibold text-[#1B2A4A]">
                  Ruang Rapat clear N–S cross-check
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[13px] leading-[18px] tabular-nums">
                  <div>
                    <dt className="text-[#4F5C67]">Measured</dt>
                    <dd className="font-semibold text-[#1B2A4A]">
                      {liveCrossCheck.actualMm.toLocaleString('en-US')} mm
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#4F5C67]">Reference</dt>
                    <dd className="font-semibold text-[#1B2A4A]">
                      {liveCrossCheck.referenceMm.toLocaleString('en-US')} mm
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#4F5C67]">Delta</dt>
                    <dd className="font-semibold text-[#1B2A4A]">{liveCrossCheck.deltaMm} mm</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[13px] leading-[18px] text-[#4F5C67]">
                  {liveCrossCheck.method}
                </p>
              </div>

              <div className="mt-4">
                <h3 className="text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                  Opening schedule
                </h3>
                <ul className="mt-2 divide-y divide-[#D9DEE2] rounded-lg border border-[#D9DEE2] text-[13px] leading-[18px]">
                  {model.openings.map((op) => (
                    <li key={op.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div>
                        <span className="font-semibold text-[#1B2A4A]">{op.code}</span>
                        <span className="text-[#4F5C67]"> · {op.roomLabel}</span>
                        {op.isEstimatedPosition && (
                          <div className="text-[12px] text-[#A64011]">
                            Position estimated visually from A-03
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 font-medium text-[#1B2A4A] tabular-nums">
                        {op.widthMm} mm ({op.sillMm}–{op.topMm})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Compact Bottom-Center Camera, Rooms Picker & Layers Dock */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-col items-center">
            {layerNotice && (
              <div
                role="status"
                className="pointer-events-auto mb-2 max-w-xl rounded-lg border border-[#D9DEE2] bg-white px-3.5 py-2 text-[13px] leading-[18px] text-[#1B2A4A] shadow-sm"
              >
                {layerNotice}
              </div>
            )}

            <button
              type="button"
              onClick={() => setDockExpanded((v) => !v)}
              aria-expanded={dockExpanded}
              className="pointer-events-auto mb-1 inline-flex min-h-[44px] items-center gap-1 rounded-t-lg border border-b-0 border-[#D9DEE2] bg-white px-3 text-[13px] leading-[18px] font-medium text-[#4F5C67] hover:text-[#1B2A4A] md:h-7 md:min-h-0"
            >
              {dockExpanded ? (
                <>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  Hide tools
                </>
              ) : (
                <>
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  Camera & rooms
                </>
              )}
            </button>

            {dockExpanded && (
              <div
                role="toolbar"
                aria-label="Camera, rooms, and layer controls"
                className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-[#D9DEE2] bg-white px-3 py-2 shadow-sm"
              >
                {/* Camera & Upward Rooms Picker (L02: Fit Model button removed from bottom dock) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRoomId(null);
                      issueCameraCommand({ kind: 'overall' });
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] md:min-h-[38px]"
                  >
                    <Eye className="h-3.5 w-3.5 text-[#4F5C67]" aria-hidden="true" />
                    Overall View
                  </button>

                  {/* Single upward Rooms picker */}
                  <div className="border-l border-[#D9DEE2] pl-1.5">
                    <RoomsPicker
                      rooms={visibleRooms}
                      pins={areaPins}
                      activeRoomId={activeRoomId}
                      open={roomsOpen}
                      onOpenChange={(next) => {
                        setRoomsOpen(next);
                        if (next) {
                          setDepartmentPickerOpen(false);
                          setModelInfoOpen(false);
                        }
                      }}
                      onSelectRoom={handleSelectRoom}
                    />
                  </div>

                  {/* Single upward Department picker (styled like Rooms) */}
                  <div className="border-l border-[#D9DEE2] pl-1.5">
                    <DepartmentPicker
                      departments={departments}
                      pins={areaPins}
                      activeDepartmentName={activeDepartmentFilter}
                      open={departmentPickerOpen}
                      onOpenChange={(next) => {
                        setDepartmentPickerOpen(next);
                        if (next) {
                          setRoomsOpen(false);
                          setModelInfoOpen(false);
                        }
                      }}
                      onSelectDepartment={(deptName) => {
                        setActiveDepartmentFilter(deptName);
                        setLayers((prev) => ({ ...prev, pins: true }));
                      }}
                    />
                  </div>

                  {/* Pin Focus */}
                  <button
                    type="button"
                    disabled={!selectedPin}
                    onClick={() => {
                      if (selectedPin) {
                        issueCameraCommand({ kind: 'pin', pin: selectedPin });
                      }
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DEE2] px-2.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-45 md:min-h-[38px]"
                  >
                    <Focus className="h-3.5 w-3.5 text-[#D4652F]" aria-hidden="true" />
                    Pin Focus
                  </button>
                </div>

                {/* Technical Layers + All (clear Pin filters) + Primary Add Pin Action */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-[#D9DEE2] pt-1.5 lg:border-l lg:border-t-0 lg:pl-2.5 lg:pt-0">
                  <Layers className="mr-0.5 hidden h-3.5 w-3.5 text-[#4F5C67] sm:inline" aria-hidden="true" />
                  {(
                    [
                      ['civil', 'Civil'],
                      ['electrical', 'Electrical'],
                      ['plumbing', 'Plumbing'],
                    ] as Array<[LayerKey, string]>
                  ).map(([key, label]) => {
                    const active = layers[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => handleToggleLayer(key)}
                        className={`inline-flex min-h-[44px] items-center whitespace-nowrap rounded-md px-2.5 text-[13px] leading-[18px] font-medium transition-colors md:min-h-[34px] ${
                          active
                            ? 'bg-[#1B2A4A] text-white'
                            : 'bg-[#F4F3EF] text-[#4F5C67] hover:text-[#1B2A4A]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}

                  {/* Renamed Pins -> All: clears all active Pin filters; active ONLY when filter set is empty */}
                  <button
                    type="button"
                    data-testid="dock-pin-filter-all"
                    aria-pressed={isAllPinFilterClear}
                    onClick={handleResetAllPinFilters}
                    className={`inline-flex min-h-[44px] items-center whitespace-nowrap rounded-md px-2.5 text-[13px] leading-[18px] font-medium transition-colors md:min-h-[34px] ${
                      isAllPinFilterClear
                        ? 'bg-[#1B2A4A] text-white'
                        : 'bg-[#F4F3EF] text-[#4F5C67] hover:text-[#1B2A4A]'
                    }`}
                  >
                    All
                  </button>

                  <button
                    type="button"
                    onClick={handleStartCreateMode}
                    data-testid="dock-add-pin-button"
                    className={`ml-0.5 inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[14px] leading-[20px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] md:min-h-[36px] ${
                      createMode
                        ? 'border border-[#A64011] bg-[#A64011]/10 text-[#A64011]'
                        : 'bg-[#A64011] text-white hover:bg-[#8C350E]'
                    }`}
                  >
                    {createMode ? (
                      <>
                        <X className="h-4 w-4" aria-hidden="true" />
                        <span>Cancel pin</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        <span>{addPinActionLabel}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Contextual Right Inspector (Desktop side panel / Mobile bottom sheet) */}
        {inspectorOpen && (
          <aside
            aria-label="Spatial Inspector"
            className="fixed inset-x-0 bottom-0 z-30 flex max-h-[76dvh] flex-col rounded-t-2xl border-t border-[#D9DEE2] bg-white shadow-xl md:static md:z-10 md:h-full md:max-h-none md:w-[390px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none"
          >
            {/* Mobile grab bar */}
            <div className="flex justify-center pt-2 md:hidden" aria-hidden="true">
              <div className="h-1 w-10 rounded-full bg-[#D9DEE2]" />
            </div>

            {createMode ? (
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#D9DEE2] px-5 py-4">
                  <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                    Create demo Pin
                  </h2>
                  <button
                    type="button"
                    onClick={handleStartCreateMode}
                    aria-label="Close Create Pin panel"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {voidClickError && (
                    <div
                      role="alert"
                      className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#B42318]/40 bg-[#FEF3F2] p-3.5 text-[13px] leading-[18px] text-[#B42318]"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{voidClickError}</span>
                    </div>
                  )}

                  {!pendingHit ? (
                    <div className="rounded-xl border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/60 p-5 text-center">
                      <Crosshair className="mx-auto h-6 w-6 text-[#A64011]" aria-hidden="true" />
                      <h3 className="mt-2 text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                        Select a surface in 3D
                      </h3>
                      <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                        Click any wall or slab on the model to lock the anchor location.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitNewPin} noValidate className="space-y-4">
                      <div className="rounded-xl border border-[#D9DEE2] bg-[#F4F3EF]/60 p-3.5 text-[13px] leading-[18px]">
                        <div className="font-semibold text-[#1B2A4A]">{pendingHit.elementName}</div>
                        <div className="text-[#4F5C67]">
                          {pendingHit.roomName} · {pendingHit.surfaceSide}
                        </div>
                        <div className="mt-1 text-[#4F5C67] tabular-nums">
                          {formatCoordsMeters(pendingHit.point)} · {state.project.modelVersionId}
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="new-pin-title"
                          className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                        >
                          Work title
                        </label>
                        <input
                          id="new-pin-title"
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="e.g. Baseboard seal & joint check"
                          className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="new-pin-dept"
                            className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                          >
                            Department
                          </label>
                          <select
                            id="new-pin-dept"
                            value={newDepartment}
                            onChange={(e) => {
                              const nextDeptName = e.target.value as Department;
                              setNewDepartment(nextDeptName);
                              if (!newPinColorManualOverride) {
                                const match = departments.find(
                                  (d) => d.name.toLowerCase() === nextDeptName.toLowerCase()
                                );
                                if (match) setNewPinColor(match.defaultPinColor);
                              }
                            }}
                            className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A]"
                          >
                            {departments.map((dept) => (
                              <option key={dept.id} value={dept.name}>
                                {dept.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="new-pin-assignee"
                            className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                          >
                            Assignee
                          </label>
                          <select
                            id="new-pin-assignee"
                            value={newAssignee}
                            onChange={(e) => setNewAssignee(e.target.value)}
                            className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A]"
                          >
                            {DEMO_WORKERS.map((w) => (
                              <option key={w.name} value={w.name}>
                                {w.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="new-pin-desc"
                          className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                        >
                          Instructions (optional)
                        </label>
                        <textarea
                          id="new-pin-desc"
                          rows={2}
                          value={newDescription}
                          onChange={(e) => setNewDescription(e.target.value)}
                          placeholder="Short site note for this Pin..."
                          className="mt-1 w-full rounded-lg border border-[#D9DEE2] bg-white p-3 text-[15px] text-[#1B2A4A]"
                        />
                      </div>

                      {/* Department default swatches (4 initial) + Manual color disclosure */}
                      <div className="rounded-xl border border-[#D9DEE2] bg-[#F4F3EF]/35 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-[#1B2A4A]">
                            Pin color
                          </span>
                          <span className="text-[11px] text-[#4F5C67]">
                            {newPinColorManualOverride ? 'Manual override' : 'Inherits department'}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {departments.slice(0, 4).map((dept) => {
                              const active =
                                newPinColor.toLowerCase() === dept.defaultPinColor.toLowerCase();
                              return (
                                <button
                                  key={dept.id}
                                  type="button"
                                  data-testid={`new-pin-color-${dept.slug}`}
                                  aria-pressed={active}
                                  onClick={() => {
                                    setNewPinColor(dept.defaultPinColor);
                                    setNewPinColorManualOverride(
                                      dept.name.toLowerCase() !== newDepartment.toLowerCase()
                                    );
                                  }}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                                    active
                                      ? 'border-[#1B2A4A] bg-white text-[#1B2A4A]'
                                      : 'border-[#D9DEE2] bg-white text-[#4F5C67] hover:bg-[#F4F3EF]'
                                  }`}
                                >
                                  <span
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: dept.defaultPinColor }}
                                  />
                                  <span>{dept.name}</span>
                                </button>
                              );
                            })}
                        </div>
                        <button
                          type="button"
                          data-testid="new-pin-manual-color-toggle"
                          aria-expanded={showNewPinManualColor}
                          onClick={() => setShowNewPinManualColor((v) => !v)}
                          className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#A64011] hover:underline"
                        >
                          {showNewPinManualColor ? 'Hide manual color' : 'Manual color'}
                        </button>
                        {showNewPinManualColor && (
                          <div className="mt-2.5 border-t border-[#D9DEE2] pt-2.5">
                            <ColorPickerControl
                              value={newPinColor}
                              onChange={(hex) => {
                                setNewPinColor(hex);
                                setNewPinColorManualOverride(true);
                              }}
                              label="Manual Pin color"
                              compact
                              testIdPrefix="new-pin-manual-color"
                            />
                          </div>
                        )}
                      </div>

                      {createFormError && (
                        <p role="alert" className="text-[13px] font-medium text-[#B42318]">
                          {createFormError}
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleStartCreateMode}
                          className="min-h-[44px] rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] leading-[20px] font-medium text-[#4F5C67] hover:bg-[#F4F3EF]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="min-h-[44px] rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white hover:bg-[#8C350E]"
                        >
                          Save demo Pin
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ) : selectedPin ? (
              /* Selected Spatial Pin — Work title shown before Pin ID */
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-[#D9DEE2] px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      {selectedPin.title}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] leading-[18px] text-[#4F5C67]">
                      <span className="font-semibold text-[#D4652F]">
                        {formatStatusLabel(selectedPin.status)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">Cycle {selectedPin.cycleNumber}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{selectedPin.id}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    aria-label="Close Pin inspector"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={routes.pinDetailPath(selectedPin.slug)}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E]"
                    >
                      Open Pin Detail
                    </Link>
                    <button
                      type="button"
                      onClick={() => issueCameraCommand({ kind: 'pin', pin: selectedPin })}
                      className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DEE2] bg-white px-3.5 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                    >
                      <Focus className="h-4 w-4 text-[#D4652F]" aria-hidden="true" />
                      Focus
                    </button>
                  </div>

                  {/* Location, Assignment & Anchor Coordinates (kept inside Inspector) */}
                  <dl className="divide-y divide-[#D9DEE2] rounded-xl border border-[#D9DEE2] bg-[#F4F3EF]/40 px-3.5 text-[13px] leading-[18px]">
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#4F5C67]">Room & Face</dt>
                      <dd className="text-right font-medium text-[#1B2A4A]">
                        {selectedPin.roomName} · {selectedPin.surfaceSide}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#4F5C67]">Element</dt>
                      <dd className="text-right font-medium text-[#1B2A4A]">
                        {selectedPin.elementName}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#4F5C67]">Department</dt>
                      <dd className="text-right font-medium text-[#1B2A4A]">
                        {selectedPin.department}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#4F5C67]">Assignee</dt>
                      <dd className="text-right font-medium text-[#1B2A4A]">
                        {selectedPin.assigneeName}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#4F5C67]">Anchor XYZ</dt>
                      <dd className="text-right font-medium text-[#1B2A4A] tabular-nums">
                        {formatCoordsMeters(selectedPin.position)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#4F5C67]">Model version</dt>
                      <dd className="text-right font-medium text-[#1B2A4A] tabular-nums">
                        {selectedPin.modelVersionId}
                      </dd>
                    </div>
                  </dl>

                  {/* Edit Pin color: 4 default department swatches + Manual color disclosure */}
                  <div className="rounded-xl border border-[#D9DEE2] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                        Pin color
                      </div>
                      <span className="text-[11px] text-[#4F5C67]">
                        {selectedPin.pinColorOverride ? 'Manual override' : 'Department default'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {departments.slice(0, 4).map((dept) => {
                          const active =
                            resolvePinColorHex(selectedPin.color).toLowerCase() ===
                            dept.defaultPinColor.toLowerCase();
                          return (
                            <button
                              key={dept.id}
                              type="button"
                              data-testid={`inspector-pin-color-${dept.slug}`}
                              aria-pressed={active}
                              onClick={() =>
                                updatePinColor(
                                  selectedPin.id,
                                  dept.defaultPinColor,
                                  dept.name.toLowerCase() !== selectedPin.department.toLowerCase()
                                )
                              }
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] font-medium transition-colors ${
                                active
                                  ? 'border-[#1B2A4A] bg-[#F4F3EF] text-[#1B2A4A]'
                                  : 'border-[#D9DEE2] bg-white text-[#4F5C67] hover:bg-[#F4F3EF]'
                              }`}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: dept.defaultPinColor }}
                              />
                              <span>{dept.name}</span>
                            </button>
                          );
                        })}
                    </div>
                    <button
                      type="button"
                      data-testid="inspector-manual-color-toggle"
                      aria-expanded={showInspectorManualColor}
                      onClick={() => setShowInspectorManualColor((v) => !v)}
                      className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#A64011] hover:underline"
                    >
                      {showInspectorManualColor ? 'Hide manual color' : 'Manual color'}
                    </button>
                    {showInspectorManualColor && (
                      <div className="mt-2.5 border-t border-[#D9DEE2] pt-2.5">
                        <ColorPickerControl
                          value={resolvePinColorHex(selectedPin.color)}
                          onChange={(hex) => updatePinColor(selectedPin.id, hex, true)}
                          label="Manual Pin color"
                          compact
                          testIdPrefix="inspector-manual-color"
                        />
                      </div>
                    )}
                  </div>

                  <p className="text-[15px] leading-[22px] text-[#4F5C67]">
                    {selectedPin.description}
                  </p>

                  <div className="border-t border-[#D9DEE2] pt-4">
                    <MaterialsSection
                      pin={selectedPin}
                      onAddMaterial={(input) => addMaterial(selectedPin.id, input)}
                      compact
                    />
                  </div>

                  <div className="border-t border-[#D9DEE2] pt-4">
                    <EvidenceSection
                      pin={selectedPin}
                      onAttachEvidence={(input) => attachEvidence(selectedPin.id, input)}
                      onRemoveEvidence={(slot) => removeEvidence(selectedPin.id, slot)}
                      compact
                    />
                  </div>
                </div>
              </div>
            ) : selectedElement ? (
              /* Selected Building Element */
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-[#D9DEE2] px-5 py-4">
                  <div>
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      {selectedElement.name}
                    </h2>
                    <div className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
                      {selectedElement.id} · {selectedElement.gridAxis}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    aria-label="Close Element inspector"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  <p className="text-[15px] leading-[22px] text-[#4F5C67]">
                    {selectedElement.description}
                  </p>

                  <dl className="divide-y divide-[#D9DEE2] rounded-xl border border-[#D9DEE2] bg-[#F4F3EF]/40 px-3.5 text-[13px] leading-[18px]">
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#4F5C67]">Thickness × Height</dt>
                      <dd className="font-medium text-[#1B2A4A] tabular-nums">
                        {selectedElement.thicknessMm} ×{' '}
                        {selectedElement.heightMm.toLocaleString('en-US')} mm
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-[#4F5C67]">Adjacent rooms</dt>
                      <dd className="font-medium text-[#1B2A4A]">
                        {selectedElement.rooms.join(', ')}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <h3 className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                      Spatial Pins ({pinsOnSelectedElement.length})
                    </h3>

                    {pinsOnSelectedElement.length === 0 ? (
                      <div className="mt-2.5 rounded-xl border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/40 p-4 text-[13px] leading-[18px] text-[#4F5C67]">
                        No Spatial Pins are anchored on this element.
                      </div>
                    ) : (
                      <ul className="mt-2.5 space-y-2.5">
                        {pinsOnSelectedElement.map((pin) => (
                          <li key={pin.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectPin(pin.id)}
                              className="w-full rounded-xl border border-[#D9DEE2] bg-white p-3.5 text-left transition-colors hover:border-[#D4652F] hover:bg-[#F4F3EF]/40"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                                  {pin.title}
                                </span>
                                <MapPin
                                  className="mt-0.5 h-4 w-4 shrink-0 text-[#D4652F]"
                                  aria-hidden="true"
                                />
                              </div>
                              <div className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                                <span className="font-medium text-[#D4652F]">
                                  {formatStatusLabel(pin.status)}
                                </span>
                                <span aria-hidden="true"> · </span>
                                <span>{pin.surfaceSide}</span>
                                <span aria-hidden="true"> · </span>
                                <span className="tabular-nums">{pin.id}</span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        )}
          </div>
        </div>
      </div>

      {/* Scoped Invitation Modal shared with Team */}
      <InviteMemberModal
        open={inviteModalOpen}
        projectName={state.project.name}
        onClose={() => setInviteModalOpen(false)}
        onLookupEmail={addendum.lookupDemoInviteEmail}
        onSendInvitation={addendum.sendDemoInvitation}
        pendingInvitations={addendum.invitations}
        onAcceptDemoInvitation={addendum.acceptDemoInvitation}
        onRevokeInvitation={addendum.revokeDemoInvitation}
        isDemo
      />
    </div>
  );
}
