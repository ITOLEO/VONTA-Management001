import { LiveBudget } from './LiveBudget';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Box,
  Calendar,
  Columns3,
  Crosshair,
  Focus,
  Info,
  Layers,
  List as ListIcon,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import { useLayoutShell } from '../context/LayoutShellContext';
import { ApiClientError, privateApi } from '../data/privateApi';
import {
  canEditProjectSettings,
  formatRoleLabel,
  type ModelVersionRecord,
} from '../domain/accountTypes';
import {
  canDownloadWorkspaceView,
  canDrawLocally,
  canShareWorkspaceView,
  resolvePinColorHex,
} from '../domain/attendanceEngine';
import type { AreaDefinition, LayerKey, RoomId, SurfaceHitCandidate } from '../domain/types';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { ContextualRail, type RailNavItem } from '../components/ContextualRail';
import { WorkspaceBuildingAreasSlot } from '../components/WorkspaceBuildingAreasSlot';
import { WorkspaceDrawingToolbar } from '../components/WorkspaceDrawingToolbar';
import { WorkspaceOutputActions } from '../components/WorkspaceOutputActions';
import { WorkspaceCompassWidget } from '../components/WorkspaceCompassWidget';
import { RoomsPicker } from '../components/RoomsPicker';
import { DepartmentPicker } from '../components/DepartmentPicker';
import { WorkspaceLayersPicker } from '../components/WorkspaceLayersPicker';
import {
  SpatialViewport3D,
  type CameraFocusCommand,
  type SpatialViewportHandle,
} from '../components/SpatialViewport3D';
import { AddRoomBoundaryModal } from '../components/AddRoomBoundaryModal';
import { BlueprintReviewStudio } from '../components/BlueprintReviewStudio';
import { getProjectRoutes } from '../utils/projectRoutes';
import type { DrawingLineStyle } from '../domain/workspaceMath';
import {
  buildWorkspaceGeometryLayerCatalog,
  isAllPinsFilterClear,
  resetWorkspacePinFilters,
  type GeometryLayerKey,
} from '../domain/workspaceControls';
import {
  isCursorModeTool,
  type DrawingStrokeWidthKey,
  type DrawingToolType,
} from '../utils/privateDrawingStore';
import { usePrivateAnnotations } from '../hooks/usePrivateAnnotations';
import {
  ACCOUNTING_VIEWS,
  buildAccountingRailGroups,
  buildOverviewRailGroups,
  buildPinDepartmentRailGroups,
  buildWarehouseRailGroups,
  resolveAccountingView,
  resolveModuleFromSlug,
} from '../utils/moduleNavConfig';
import {
  buildRoomOptionsFromPins,
  computePinStatusCounts,
  describeActivePinFilters,
  filterPinsForBoard,
  getPinUpdatedIso,
  groupPinsForKanban,
  resolvePinDisplayColor,
  resolveProjectPinDepartments,
  toProjectLocalDateKey,
  type PinBoardFilters,
} from '../domain/pinBoard';
import { formatStatusLabel, pinHasMaterialException } from '../domain/demoStore';
import type { PinWorkStatus } from '../domain/types';

const MODULE_TITLES: Record<string, string> = {
  users: 'User Management',
  attendance: 'Attendance',
  inventory: 'Inventory',
  'store-requests': 'Store Requests',
  'purchase-requests': 'Purchase Requests',
  'market-list': 'Market List',
  'goods-receipts': 'Goods Receipts',
  accounting: 'Accounting',
};

const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  civil: true,
  electrical: false,
  plumbing: false,
  pins: true,
};

function useGuardedPrivateProject(projectId: string) {
  const {
    activeProject,
    activeProjectLoading,
    activeProjectError,
    loadActiveProject,
    syncProjectInCache,
  } = usePrivateProjects();

  useEffect(() => {
    if (projectId) void loadActiveProject(projectId);
  }, [projectId, loadActiveProject]);

  const project = activeProject?.id === projectId ? activeProject : null;
  return {
    project,
    loading: activeProjectLoading && !project,
    error: activeProjectError,
    syncProjectInCache,
  };
}

function ForbiddenView({ message }: { message: string }) {
  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <PrivateNavbar inProjectContext={false} />
      <main className="mx-auto max-w-[600px] flex-1 px-4 py-16">
        <section
          data-testid="project-forbidden-state"
          className="rounded-xl border border-[#D9DEE2] bg-white p-8 text-center"
        >
          <ShieldAlert className="mx-auto h-8 w-8 text-[#B42318]" aria-hidden="true" />
          <h1 className="mt-3 text-[26px] leading-[32px] font-bold">Access forbidden</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">{message}</p>
          <Link
            to="/projects"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
          >
            Back to Projects
          </Link>
        </section>
      </main>
    </div>
  );
}

/**
 * Live blueprint-backed Spatial Workspace (/projects/:projectId/spatial).
 * Never loads Paviliun Kerja demo geometry. Renders published area models,
 * docked left Blueprint management rail, bottom model dock with upward Rooms picker,
 * Add area / Add closed-boundary room modals, and surface Pin creation.
 */
export function PrivateSpatialWorkspacePage() {
  const { project: projectId = '' } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { accessToken, user, profile } = useAuth();
  const { setMobileRailOpen } = useLayoutShell();
  const requestedOverview = searchParams.get('overview') === '1';

  useEffect(() => {
    if (requestedOverview && projectId) {
      navigate(`/projects/${projectId}`, { replace: true });
    }
  }, [requestedOverview, projectId, navigate]);

  const { project, loading, error, syncProjectInCache } = useGuardedPrivateProject(projectId);
  const viewportRef = useRef<SpatialViewportHandle | null>(null);

  const [pinListOpen, setPinListOpen] = useState(false);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  const [activeAreaId, setActiveAreaId] = useState<string>('');
  const [activeRoomId, setActiveRoomId] = useState<RoomId | null>(null);
  const [activeDepartmentFilter, setActiveDepartmentFilter] = useState<string | null>(null);
  const [roomsPickerOpen, setRoomsPickerOpen] = useState(false);
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [layersPickerOpen, setLayersPickerOpen] = useState(false);
  const [layerNotice, setLayerNotice] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [pendingHit, setPendingHit] = useState<SurfaceHitCandidate | null>(null);
  const [voidClickNotice, setVoidClickNotice] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<CameraFocusCommand | null>(null);
  const [cameraAzimuthDeg, setCameraAzimuthDeg] = useState(0);
  const [showGroundCompass, setShowGroundCompass] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);

  // Private device-local 3D drawing tool preferences (separate from server-saved Pin color)
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingToolType>('cursor');
  const [drawingColorHex, setDrawingColorHex] = useState<string>('#E11D48');
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState<DrawingStrokeWidthKey>('medium');
  const [drawingStrokeWidthPx, setDrawingStrokeWidthPx] = useState<number>(4);
  const [drawingLineStyle, setDrawingLineStyle] = useState<DrawingLineStyle>('solid');
  const [drawingDeleteMode, setDrawingDeleteMode] = useState<boolean>(false);
  const [hideLocalDrawings, setHideLocalDrawings] = useState<boolean>(
    () => searchParams.get('hideLocalDrawings') === '1'
  );

  const routes = useMemo(() => getProjectRoutes('/projects', projectId), [projectId]);

  // Add Area & Add Room modals
  const [addAreaModalOpen, setAddAreaModalOpen] = useState(false);
  const [addRoomModalOpen, setAddRoomModalOpen] = useState(false);

  // New Pin form
  const [newPinTitle, setNewPinTitle] = useState('');
  const [newPinCategory, setNewPinCategory] = useState('Finishing');
  const [newPinWorker, setNewPinWorker] = useState(profile?.displayName || 'Field Crew');
  const [newPinDesc, setNewPinDesc] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const isContractor = canEditProjectSettings(project?.membership.role);
  const canDraw = Boolean(project?.membership && canDrawLocally(project.membership));
  const canDownload = Boolean(project?.membership && canDownloadWorkspaceView(project.membership));
  const canShare = Boolean(project?.membership && canShareWorkspaceView(project.membership));

  const projectAreas = project?.areas ?? [];
  const modelVersions = project?.modelVersions ?? [];
  const allPins = project?.pins ?? [];

  const projectDepartments = useMemo(
    () => resolveProjectPinDepartments(projectId || 'live', project?.departments, allPins),
    [projectId, project?.departments, allPins]
  );

  // Default to first area with a published model (or first area)
  useEffect(() => {
    if (!project) return;
    if (activeAreaId && (activeAreaId === 'all' || projectAreas.some((a) => a.id === activeAreaId))) {
      return;
    }
    const firstPublishedArea = projectAreas.find((a) =>
      modelVersions.some((v) => v.id === a.activeModelVersionId && v.status === 'published')
    );
    setActiveAreaId(firstPublishedArea?.id ?? projectAreas[0]?.id ?? 'all');
  }, [project?.id, projectAreas, modelVersions, activeAreaId]);

  const activeArea = useMemo(
    () => (activeAreaId !== 'all' ? projectAreas.find((a) => a.id === activeAreaId) ?? null : null),
    [projectAreas, activeAreaId]
  );

  const activeModelVersion: ModelVersionRecord | null = useMemo(() => {
    if (!activeArea?.activeModelVersionId) return null;
    return (
      modelVersions.find(
        (v) => v.id === activeArea.activeModelVersionId && v.status === 'published'
      ) ?? null
    );
  }, [activeArea, modelVersions]);

  const areaDefinitions = useMemo<AreaDefinition[]>(() => {
    return projectAreas.map((area) => {
      const published = modelVersions.find(
        (v) => v.id === area.activeModelVersionId && v.status === 'published'
      );
      return {
        id: area.id,
        name: area.name,
        sheetLabel: published ? `${published.sheetCode} ${published.revision}` : 'Draft',
        blueprintStatus: published ? 'Published' : 'Awaiting verification',
        modelStatus: published ? 'Published' : 'Draft',
        modelVersionId: published?.id ?? '',
        isRegisteredInCommonFrame: area.isRegisteredInCommonFrame,
        blueprintSrc: null,
      };
    });
  }, [projectAreas, modelVersions]);

  const roomCountByArea = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const area of projectAreas) {
      const published = modelVersions.find(
        (v) => v.id === area.activeModelVersionId && v.status === 'published'
      );
      map[area.id] = published?.geometry.rooms.length ?? 0;
    }
    return map;
  }, [projectAreas, modelVersions]);

  const activeAreaPins = useMemo(() => {
    let list = activeArea ? allPins.filter((p) => p.areaId === activeArea.id) : allPins;
    if (activeRoomId) {
      list = list.filter((p) => p.roomId === activeRoomId);
    }
    if (activeDepartmentFilter) {
      list = list.filter(
        (p) => p.department.toLowerCase() === activeDepartmentFilter.toLowerCase()
      );
    }
    return list;
  }, [allPins, activeArea, activeRoomId, activeDepartmentFilter]);

  const selectedPin = useMemo(
    () => activeAreaPins.find((p) => p.id === selectedPinId) ?? null,
    [activeAreaPins, selectedPinId]
  );

  const selectedElement = useMemo(
    () =>
      activeModelVersion?.geometry.elements.find((el) => el.id === selectedElementId) ?? null,
    [activeModelVersion, selectedElementId]
  );

  const allAreasRegistered =
    projectAreas.length > 0 && projectAreas.every((a) => a.isRegisteredInCommonFrame);

  const geometryLayerCatalog = useMemo(
    () =>
      buildWorkspaceGeometryLayerCatalog(
        activeModelVersion
          ? `sheet ${activeModelVersion.sheetCode} ${activeModelVersion.revision}`
          : null
      ),
    [activeModelVersion]
  );

  const isAllPinFilterClear = isAllPinsFilterClear({
    activeRoomId,
    activeDepartmentFilter,
    selectedPinId,
    layers,
  });

  const triggerCamera = (
    kind: CameraFocusCommand['kind'],
    roomId?: RoomId,
    pin?: typeof selectedPin
  ) => {
    setCameraCommand({ id: Date.now(), kind, roomId, pin: pin ?? undefined });
  };

  const handleResetAllPinFilters = () => {
    const reset = resetWorkspacePinFilters({
      activeRoomId,
      activeDepartmentFilter,
      selectedPinId,
      layers,
    });
    setActiveRoomId(reset.activeRoomId);
    setActiveDepartmentFilter(reset.activeDepartmentFilter);
    setSelectedPinId(reset.selectedPinId);
    setSelectedElementId(null);
    setLayers((prev) => ({ ...prev, pins: true }));
    triggerCamera('overall');
  };

  const handleToggleGeometryLayer = (key: GeometryLayerKey) => {
    const descriptor = geometryLayerCatalog.find((item) => item.key === key);
    setLayers((prev) => {
      const nextVal = !prev[key];
      if (nextVal && descriptor && !descriptor.available && descriptor.unavailableNotice) {
        setLayerNotice(descriptor.unavailableNotice);
      } else {
        setLayerNotice(null);
      }
      return { ...prev, [key]: nextVal };
    });
  };

  const handleSelectArea = (nextAreaId: string) => {
    setActiveAreaId(nextAreaId);
    setActiveRoomId(null);
    setSelectedPinId(null);
    setSelectedElementId(null);
    setPendingHit(null);
    setCreateMode(false);
  };

  const handleCreatePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !accessToken || !activeArea || !pendingHit) return;
    if (!newPinTitle.trim()) {
      setPinError('Pin title is required.');
      return;
    }
    setSavingPin(true);
    setPinError(null);
    try {
      const res = await privateApi.createProjectPin(accessToken, project.id, {
        areaId: activeArea.id,
        roomId: pendingHit.roomId,
        roomName: pendingHit.roomName,
        elementId: pendingHit.elementId,
        elementName: pendingHit.elementName,
        surfaceSide: pendingHit.surfaceSide,
        title: newPinTitle.trim(),
        category: newPinCategory,
        assignedWorkerName: newPinWorker.trim() || 'Field Crew',
        description: newPinDesc.trim() || `Work item on ${pendingHit.elementName}`,
        position: pendingHit.point,
        normal: pendingHit.normal,
      });
      syncProjectInCache(res.project);
      setNewPinTitle('');
      setNewPinDesc('');
      setPendingHit(null);
      setCreateMode(false);
      setSelectedPinId(res.pin.id);
    } catch (err) {
      setPinError(err instanceof ApiClientError ? err.message : 'Could not save work Pin.');
    } finally {
      setSavingPin(false);
    }
  };

  const drawingScope = useMemo(
    () =>
      user?.id && project?.id && activeModelVersion?.id && activeArea?.id
        ? {
            environment: 'live' as const,
            accountId: user.id,
            projectId: project.id,
            modelVersionId: activeModelVersion.id,
            areaId: activeArea.id,
          }
        : null,
    [user?.id, project?.id, activeModelVersion?.id, activeArea?.id]
  );

  const handleToolActivatedFromShortcut = useCallback((tool: DrawingToolType) => {
    if (!isCursorModeTool(tool)) {
      setCreateMode(false);
      setPendingHit(null);
      setHideLocalDrawings(false);
    }
  }, []);

  const {
    annotations,
    selectedAnnotationId,
    selectedAnnotation,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    storageMode: drawingStorageMode,
    storageWarning: drawingStorageWarning,
    rejectedNotice: drawingRejectedNotice,
    setRejectedNotice: setDrawingRejectedNotice,
    selectAnnotation,
    createAnnotation: handleCreateAnnotation,
    deleteAnnotation: handleDeleteAnnotation,
    clearAllOwnAnnotations: handleClearAllOwnAnnotations,
    undoAnnotation: handleUndoAnnotation,
    redoAnnotation: handleRedoAnnotation,
  } = usePrivateAnnotations({
    scope: drawingScope,
    canDraw,
    activeTool: activeDrawingTool,
    setActiveTool: setActiveDrawingTool,
    deleteMode: drawingDeleteMode,
    setDeleteMode: setDrawingDeleteMode,
    onToolActivated: handleToolActivatedFromShortcut,
  });

  // Apply shared view hydration (E04–E06)
  const sharedStateAppliedRef = useRef<string | null>(null);
  useEffect(() => {
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

    const token = searchParams.get('share') ?? navShared?.shareId ?? null;
    if (!token || !navShared || sharedStateAppliedRef.current === token) return;
    sharedStateAppliedRef.current = token;
    setHideLocalDrawings(true);
    if (navShared.areaId) setActiveAreaId(navShared.areaId);
    if (navShared.roomId !== undefined) setActiveRoomId((navShared.roomId as RoomId) ?? null);
    if (navShared.selectedPinId !== undefined) setSelectedPinId(navShared.selectedPinId);
    if (navShared.layers) setLayers(navShared.layers);
    if (navShared.camera) {
      const cam = navShared.camera;
      window.setTimeout(() => {
        viewportRef.current?.applyCameraSnapshot(cam);
      }, 150);
    }
  }, [searchParams, location.state]);

  const handleSelectAnnotation = useCallback(
    (annotationId: string | null) => {
      if (annotationId) {
        setCreateMode(false);
        setPendingHit(null);
        setSelectedPinId(null);
        setSelectedElementId(null);
      }
      selectAnnotation(annotationId);
    },
    [selectAnnotation]
  );

  const drawerPins = useMemo(() => {
    if (!activeRoomId) return activeAreaPins;
    return activeAreaPins.filter((p) => p.roomId === activeRoomId);
  }, [activeAreaPins, activeRoomId]);

  const workspaceFooterItems = useMemo<RailNavItem[]>(
    () => [
      {
        id: 'pin-list',
        label: 'Pin list',
        icon: MapPin,
        active: pinListOpen,
        badge: drawerPins.length,
        testId: 'rail-item-pin-list',
        onClick: () => {
          setPinListOpen((v) => !v);
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
          setPinListOpen(false);
        },
      },
    ],
    [drawerPins.length, pinListOpen, modelInfoOpen]
  );

  const privateInspectorOpen = Boolean(pendingHit || selectedPin || selectedElement);
  const privateInspectorRef = useRef<HTMLElement | null>(null);
  const privateInspectorOpenerRef = useRef<HTMLElement | null>(null);
  const prevPrivateInspectorOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = prevPrivateInspectorOpenRef.current;
    prevPrivateInspectorOpenRef.current = privateInspectorOpen;

    if (privateInspectorOpen && !wasOpen) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (active && active !== document.body && !privateInspectorRef.current?.contains(active)) {
        privateInspectorOpenerRef.current = active;
      }
      const raf = window.requestAnimationFrame(() => {
        privateInspectorRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(raf);
    }

    if (!privateInspectorOpen && wasOpen) {
      const opener = privateInspectorOpenerRef.current;
      privateInspectorOpenerRef.current = null;
      const fallback =
        document.querySelector<HTMLElement>('[data-testid="rail-item-pin-list"]') ??
        document.querySelector<HTMLElement>('[data-testid="workspace-new-pin-btn"]');
      const target = opener && opener.isConnected ? opener : fallback;
      if (target) {
        window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
      }
    }
  }, [privateInspectorOpen]);

  useEffect(() => {
    if (!privateInspectorOpen || addAreaModalOpen || addRoomModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        e.preventDefault();
        setPendingHit(null);
        setSelectedPinId(null);
        setSelectedElementId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [privateInspectorOpen, addAreaModalOpen, addRoomModalOpen]);

  if (requestedOverview) return null;
  if (error && !project) return <ForbiddenView message={error.message} />;

  return (
    <div className="flex h-dvh flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <PrivateNavbar
        inProjectContext={Boolean(project)}
        projectId={project?.id}
        projectName={project?.name}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {project && (
          <ContextualRail
            moduleLabel="Workspace"
            groups={[]}
            topSlot={(expanded, closeMobileOnClick) => (
              <WorkspaceBuildingAreasSlot
                expanded={expanded}
                closeMobileOnClick={closeMobileOnClick}
                onCloseMobile={() => setMobileRailOpen(false)}
                areas={areaDefinitions}
                pins={allPins}
                roomCountByArea={roomCountByArea}
                activeAreaId={activeAreaId || 'all'}
                onSelectArea={handleSelectArea}
                canAddArea={isContractor}
                onAddAreaClick={() => setAddAreaModalOpen(true)}
              />
            )}
            footerItems={workspaceFooterItems}
            projectSettingsPath={routes.settingsPath}
          />
        )}

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {loading || !project ? (
            <div className="flex flex-1 items-center justify-center p-6 text-[15px] text-[#4F5C67]">
              Loading workspace…
            </div>
          ) : activeAreaId === 'all' ? (
            /* All Areas view: never fabricates a combined 3D model when coordinates are unverified */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-5xl space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="vonta-page-title text-[#1B2A4A]">
                      All areas · {project.name}
                    </h1>
                    <p className="mt-1.5 text-[14px] text-[#4F5C67]">
                      {allAreasRegistered
                        ? 'All areas share a verified common coordinate frame.'
                        : 'Placement not verified between separate area blueprints. Areas are shown as separate cards instead of a combined 3D scene.'}
                    </p>
                  </div>
                  {isContractor && (
                    <button
                      type="button"
                      onClick={() => setAddAreaModalOpen(true)}
                      data-testid="workspace-add-area-btn"
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add area
                    </button>
                  )}
                </div>

                {!allAreasRegistered && projectAreas.length > 1 && (
                  <div
                    role="status"
                    data-testid="unverified-placement-notice"
                    className="flex items-start gap-2.5 rounded-xl border border-[#D4652F]/40 bg-white px-4 py-3 text-[13px] text-[#1B2A4A]"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]"
                      aria-hidden="true"
                    />
                    <span>
                      <strong>Placement not verified:</strong> Select an individual area card below
                      to inspect its calibrated 3D model, rooms, and building surface Pins.
                    </span>
                  </div>
                )}

                {projectAreas.length === 0 ? (
                  <div className="rounded-xl border border-[#D9DEE2] bg-white p-10 text-center">
                    <Layers className="mx-auto h-7 w-7 text-[#4F5C67]" aria-hidden="true" />
                    <h2 className="mt-3 text-[18px] font-semibold text-[#1B2A4A]">
                      No building areas yet
                    </h2>
                    <p className="mt-1 text-[14px] text-[#4F5C67]">
                      Upload and verify a blueprint to generate your first 3D building area.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                      {isContractor && (
                        <button
                          type="button"
                          onClick={() => setAddAreaModalOpen(true)}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Add area & blueprint
                        </button>
                      )}
                      <Link
                        to={`/projects/${project.id}`}
                        className="inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                      >
                        Back to Overview
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {projectAreas.map((area) => {
                      const published = modelVersions.find(
                        (v) => v.id === area.activeModelVersionId && v.status === 'published'
                      );
                      const count = allPins.filter((p) => p.areaId === area.id).length;
                      return (
                        <button
                          key={area.id}
                          type="button"
                          onClick={() => handleSelectArea(area.id)}
                          data-testid={`all-areas-card-${area.id}`}
                          className="flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-5 text-left transition-colors hover:border-[#A64011]"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 text-[12px]">
                              <span className="font-semibold text-[#A64011]">
                                {published
                                  ? `Published v${published.versionNumber}`
                                  : 'Awaiting model'}
                              </span>
                              <span className="text-[#4F5C67]">
                                {area.isRegisteredInCommonFrame
                                  ? 'Common frame'
                                  : 'Standalone area'}
                              </span>
                            </div>
                            <h2 className="mt-2 text-[18px] font-bold text-[#1B2A4A]">
                              {area.name}
                            </h2>
                            <p className="mt-1 text-[13px] text-[#4F5C67]">
                              {published
                                ? `${published.sheetCode} ${published.revision} · ${published.geometry.footprintWidthMm.toLocaleString()} × ${published.geometry.footprintDepthMm.toLocaleString()} mm`
                                : 'No verified 3D model published for this area yet.'}
                            </p>
                          </div>
                          <div className="mt-4 flex items-center justify-between border-t border-[#D9DEE2] pt-3 text-[13px] font-medium text-[#1B2A4A]">
                            <span>
                              {published?.geometry.rooms.length ?? 0} rooms · {count} Pins
                            </span>
                            <span className="text-[#A64011]">Open 3D →</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : !activeModelVersion ? (
            /* Selected area has no published 3D model yet */
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md rounded-xl border border-[#D9DEE2] bg-white p-8 text-center">
                <Box className="mx-auto h-7 w-7 text-[#D4652F]" aria-hidden="true" />
                <h1 className="vonta-page-title mt-3 text-[#1B2A4A]">
                  {activeArea ? `${activeArea.name} · No published model` : 'No published 3D model'}
                </h1>
                <p className="mt-2 text-[14px] leading-[20px] text-[#4F5C67]">
                  Upload a dimensioned blueprint, verify the generated 3D geometry, and publish it
                  to activate this Workspace. Demo geometry is never loaded into private projects.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  {isContractor && (
                    <button
                      type="button"
                      onClick={() => setAddAreaModalOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Upload & publish blueprint
                    </button>
                  )}
                  <Link
                    to={`/projects/${project.id}`}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                  >
                    Project overview
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            /* Active Published Area 3D Viewport */
            <div className="relative flex min-h-0 flex-1">
              <div className="relative min-w-0 flex-1">
                <SpatialViewport3D
                  ref={viewportRef}
                  model={activeModelVersion.geometry}
                  pins={activeAreaPins}
                  selectedPinId={selectedPinId}
                  selectedElementId={selectedElementId}
                  activeRoomId={activeRoomId}
                  layers={layers}
                  createMode={createMode}
                  pendingHit={pendingHit}
                  cameraCommand={cameraCommand}
                  onSelectPin={(pinId) => {
                    selectAnnotation(null);
                    setSelectedPinId(pinId);
                    setSelectedElementId(null);
                    setPendingHit(null);
                  }}
                  onSelectElement={(elementId) => {
                    selectAnnotation(null);
                    setSelectedElementId(elementId);
                    setSelectedPinId(null);
                  }}
                  onClearSelection={() => {
                    selectAnnotation(null);
                    setSelectedPinId(null);
                    setSelectedElementId(null);
                  }}
                  onCreateSurfaceHit={(hit) => {
                    selectAnnotation(null);
                    setPendingHit(hit);
                    setVoidClickNotice(false);
                    setSelectedPinId(null);
                  }}
                  onCreateVoidClick={() => setVoidClickNotice(true)}
                  annotations={annotations}
                  selectedAnnotationId={selectedAnnotationId}
                  activeDrawingTool={activeDrawingTool}
                  drawingColorHex={drawingColorHex}
                  drawingStrokeWidth={drawingStrokeWidth}
                  drawingStrokeWidthPx={drawingStrokeWidthPx}
                  drawingLineStyle={drawingLineStyle}
                  drawingDeleteMode={drawingDeleteMode}
                  hideLocalDrawings={hideLocalDrawings}
                  canDraw={canDraw}
                  isModelCalibrated={true}
                  northAngleDeg={null}
                  showGroundCompass={showGroundCompass}
                  onCameraAzimuthChange={setCameraAzimuthDeg}
                  onSelectAnnotation={handleSelectAnnotation}
                  onCreateAnnotation={handleCreateAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  onDrawingRejected={(reason) => setDrawingRejectedNotice(reason)}
                />

                {/* Upper-left: Grouped Vertical Private Device Drawing Tools */}
                <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
                  <WorkspaceDrawingToolbar
                    canDraw={canDraw}
                    activeTool={activeDrawingTool}
                    onSelectTool={(tool) => {
                      setActiveDrawingTool(tool);
                      setDrawingRejectedNotice(null);
                      if (!isCursorModeTool(tool)) {
                        selectAnnotation(null);
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
                    selectedAnnotation={selectedAnnotation}
                    onDeleteSelectedAnnotation={() => {
                      if (selectedAnnotationId) {
                        void handleDeleteAnnotation(selectedAnnotationId);
                      }
                    }}
                    onDeselectAnnotation={() => selectAnnotation(null)}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    undoCount={undoCount}
                    redoCount={redoCount}
                    onUndo={handleUndoAnnotation}
                    onRedo={handleRedoAnnotation}
                  />
                </div>

                {/* Upper-right: Authorized Download View / Share View + Dual Compass directly below */}
                <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
                  <WorkspaceOutputActions
                    canDownload={canDownload}
                    canShare={canShare}
                    projectName={project.name}
                    projectId={project.id}
                    accountId={user?.id ?? ''}
                    modelVersionId={activeModelVersion.id}
                    areaId={activeArea?.id ?? ''}
                    viewportRef={viewportRef}
                    onAuthorizeDownload={async () => {
                      if (!accessToken) throw new Error('Sign in required.');
                      const res = await privateApi.authorizeWorkspaceDownload(
                        accessToken,
                        project.id,
                        {
                          modelVersionId: activeModelVersion.id,
                          areaId: activeArea?.id ?? '',
                        }
                      );
                      return { suggestedFileName: res.suggestedFileName };
                    }}
                    onCreateShareLink={async (camera, accessMode) => {
                      if (!accessToken) throw new Error('Sign in required.');
                      const res = await privateApi.createWorkspaceShare(accessToken, project.id, {
                        modelVersionId: activeModelVersion.id,
                        areaId: activeArea?.id ?? '',
                        roomId: activeRoomId,
                        selectedPinId,
                        accessMode,
                        camera,
                        layers,
                      });
                      return {
                        shareId: res.share.id,
                        shareUrl: `${window.location.origin}${res.sharePath}`,
                        accessMode: res.share.accessMode,
                        publicToken: res.share.publicToken,
                      };
                    }}
                    onUpdateShareAccess={async (shareId, accessMode) => {
                      if (!accessToken) throw new Error('Sign in required.');
                      const res = await privateApi.updateWorkspaceShareAccess(
                        accessToken,
                        project.id,
                        shareId,
                        accessMode
                      );
                      return {
                        shareId: res.share.id,
                        shareUrl: `${window.location.origin}${res.sharePath}`,
                        accessMode: res.share.accessMode,
                        publicToken: res.share.publicToken,
                      };
                    }}
                    onRevokeShareLink={async (shareId) => {
                      if (!accessToken) throw new Error('Sign in required.');
                      await privateApi.revokeWorkspaceShare(accessToken, project.id, shareId);
                    }}
                  />

                  <WorkspaceCompassWidget
                    cameraAzimuthDeg={cameraAzimuthDeg}
                    northAngleDeg={null}
                    showGroundCompass={showGroundCompass}
                    onToggleGroundCompass={() => setShowGroundCompass((v) => !v)}
                  />
                </div>

                {/* Pin List Overlay Panel (toggled from left contextual rail) */}
                {pinListOpen && (
                  <section
                    aria-label="Pin list"
                    className="absolute bottom-20 left-3 top-[68px] z-30 flex w-[min(320px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-[#D9DEE2] bg-white shadow-lg"
                  >
                    <div className="flex items-center justify-between border-b border-[#D9DEE2] px-4 py-3">
                      <h2 className="text-[16px] font-semibold text-[#1B2A4A]">
                        Pins ({drawerPins.length})
                      </h2>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid="pin-list-filter-all"
                          aria-pressed={isAllPinFilterClear}
                          onClick={handleResetAllPinFilters}
                          className={`inline-flex min-h-[32px] items-center rounded-lg border px-2 text-[12px] font-semibold ${
                            isAllPinFilterClear
                              ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                              : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                          }`}
                        >
                          All ({allPins.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setPinListOpen(false)}
                          aria-label="Close Pin list"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                      {drawerPins.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-[#D9DEE2] p-4 text-center text-[13px] text-[#4F5C67]">
                          No Pins placed in this view yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {drawerPins.map((pin) => (
                            <li key={pin.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPinId(pin.id);
                                  setSelectedElementId(null);
                                  setPinListOpen(false);
                                }}
                                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                                  selectedPinId === pin.id
                                    ? 'border-[#D4652F] bg-[#FFF3EB]'
                                    : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]'
                                }`}
                              >
                                <div className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#1B2A4A]">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: resolvePinColorHex(pin.color) }}
                                  />
                                  <span>{pin.title}</span>
                                </div>
                                <div className="mt-0.5 text-[12px] text-[#4F5C67]">
                                  {pin.roomName} · {pin.assigneeName}
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                )}

                {/* Model Info Panel (toggled from left contextual rail) */}
                {modelInfoOpen && (
                  <section
                    aria-label="Model info"
                    className="absolute right-3 top-3 z-30 w-[min(360px,calc(100%-24px))] rounded-xl border border-[#D9DEE2] bg-white p-4 shadow-lg"
                  >
                    <div className="flex items-center justify-between border-b border-[#D9DEE2] pb-2.5">
                      <h2 className="text-[16px] font-semibold text-[#1B2A4A]">Model info</h2>
                      <button
                        type="button"
                        onClick={() => setModelInfoOpen(false)}
                        aria-label="Close Model info"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <dl className="mt-3 divide-y divide-[#D9DEE2] text-[13px]">
                      <div className="flex justify-between py-2">
                        <dt className="text-[#4F5C67]">Area</dt>
                        <dd className="font-medium text-[#1B2A4A]">{activeArea?.name}</dd>
                      </div>
                      <div className="flex justify-between py-2">
                        <dt className="text-[#4F5C67]">Blueprint</dt>
                        <dd className="font-medium text-[#1B2A4A]">
                          {activeModelVersion.sheetCode} {activeModelVersion.revision}
                        </dd>
                      </div>
                      <div className="flex justify-between py-2">
                        <dt className="text-[#4F5C67]">Published version</dt>
                        <dd className="font-medium text-[#1B2A4A]">
                          v{activeModelVersion.versionNumber}
                        </dd>
                      </div>
                      <div className="flex justify-between py-2">
                        <dt className="text-[#4F5C67]">Footprint</dt>
                        <dd className="font-medium text-[#1B2A4A] tabular-nums">
                          {activeModelVersion.geometry.footprintWidthMm.toLocaleString()} ×{' '}
                          {activeModelVersion.geometry.footprintDepthMm.toLocaleString()} mm
                        </dd>
                      </div>
                    </dl>
                  </section>
                )}

                {voidClickNotice && createMode && (
                  <div
                    role="status"
                    className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-[#D4652F] bg-white px-4 py-2 text-[13px] font-medium text-[#1B2A4A] shadow-md"
                  >
                    Click directly on a wall, floor, or opening surface to place a Pin.
                  </div>
                )}

                {layerNotice && (
                  <div
                    role="status"
                    data-testid="private-workspace-layer-notice"
                    className="pointer-events-auto absolute bottom-20 left-1/2 z-20 flex w-[min(460px,calc(100%-24px))] -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-[#D9DEE2] bg-white px-3.5 py-2 text-[12px] text-[#1B2A4A] shadow-md"
                  >
                    <span>{layerNotice}</span>
                    <button
                      type="button"
                      onClick={() => setLayerNotice(null)}
                      aria-label="Dismiss layer notice"
                      className="rounded p-1 text-[#4F5C67] hover:bg-[#F4F3EF]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {/* Bottom Model Tools Dock (Pin filters on left of 3D layers) */}
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
                  <div
                    role="toolbar"
                    aria-label="Camera, rooms, Pin filters, and 3D layers controls"
                    data-testid="workspace-bottom-dock"
                    className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-[#D9DEE2] bg-white/95 p-1.5 shadow-lg backdrop-blur"
                  >
                    <button
                      type="button"
                      data-testid="dock-overall-view-button"
                      onClick={() => {
                        setActiveRoomId(null);
                        triggerCamera('overall');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                    >
                      <Box className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                      Overall View
                    </button>

                    <div className="h-5 w-px bg-[#D9DEE2]" aria-hidden="true" />

                    <RoomsPicker
                      rooms={activeModelVersion.geometry.rooms}
                      pins={allPins}
                      activeRoomId={activeRoomId}
                      open={roomsPickerOpen}
                      onOpenChange={(next) => {
                        setRoomsPickerOpen(next);
                        if (next) {
                          setDepartmentPickerOpen(false);
                          setLayersPickerOpen(false);
                        }
                      }}
                      onSelectRoom={(roomId) => {
                        setActiveRoomId(roomId);
                        if (roomId) {
                          triggerCamera('room', roomId);
                        } else {
                          triggerCamera('overall');
                        }
                      }}
                      canAddRoom={isContractor}
                      onAddRoomClick={() => {
                        setRoomsPickerOpen(false);
                        setAddRoomModalOpen(true);
                      }}
                    />

                    <div className="h-5 w-px bg-[#D9DEE2]" aria-hidden="true" />

                    {/* Pin filters popover (left of 3D layers) */}
                    <DepartmentPicker
                      departments={projectDepartments}
                      pins={allPins}
                      activeDepartmentName={activeDepartmentFilter}
                      open={departmentPickerOpen}
                      onOpenChange={(next) => {
                        setDepartmentPickerOpen(next);
                        if (next) {
                          setRoomsPickerOpen(false);
                          setLayersPickerOpen(false);
                        }
                      }}
                      onSelectDepartment={(deptName) => {
                        setActiveDepartmentFilter(deptName);
                        if (deptName) {
                          setLayers((prev) => ({ ...prev, pins: true }));
                        }
                      }}
                      showPinMarkers={layers.pins}
                      onTogglePinMarkers={() =>
                        setLayers((prev) => ({ ...prev, pins: !prev.pins }))
                      }
                      isAllPinsClear={isAllPinFilterClear}
                      onResetAllPins={handleResetAllPinFilters}
                      activeRoomName={
                        activeRoomId
                          ? activeModelVersion.geometry.rooms.find((r) => r.id === activeRoomId)
                              ?.name ?? null
                          : null
                      }
                    />

                    <div className="h-5 w-px bg-[#D9DEE2]" aria-hidden="true" />

                    {/* 3D layers popover (right of Pin filters) */}
                    <WorkspaceLayersPicker
                      catalog={geometryLayerCatalog}
                      layers={layers}
                      open={layersPickerOpen}
                      onOpenChange={(next) => {
                        setLayersPickerOpen(next);
                        if (next) {
                          setRoomsPickerOpen(false);
                          setDepartmentPickerOpen(false);
                        }
                      }}
                      onToggleLayer={handleToggleGeometryLayer}
                    />

                    <div className="h-5 w-px bg-[#D9DEE2]" aria-hidden="true" />

                    <button
                      type="button"
                      data-testid="dock-pin-focus-button"
                      disabled={!selectedPin}
                      onClick={() => {
                        if (selectedPin) {
                          triggerCamera('pin', undefined, selectedPin);
                        }
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] px-2.5 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-45"
                    >
                      <Focus className="h-3.5 w-3.5 text-[#D4652F]" aria-hidden="true" />
                      Pin Focus
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCreateMode((v) => !v);
                        setPendingHit(null);
                        setVoidClickNotice(false);
                        setRoomsPickerOpen(false);
                        setDepartmentPickerOpen(false);
                        setLayersPickerOpen(false);
                      }}
                      data-testid="workspace-new-pin-btn"
                      className={`inline-flex min-h-[36px] min-w-[104px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors ${
                        createMode
                          ? 'bg-[#1B2A4A] text-white'
                          : 'bg-[#A64011] text-white hover:bg-[#8C350E]'
                      }`}
                    >
                      <Crosshair className="h-4 w-4" aria-hidden="true" />
                      {createMode ? 'Cancel Pin' : 'Add Pin'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Contextual Overlay Side Card (New Pin Form / Selected Pin / Selected Element) */}
              {privateInspectorOpen && (
                <aside
                  ref={privateInspectorRef}
                  tabIndex={-1}
                  aria-label="Workspace Inspector"
                  data-testid="private-workspace-right-inspector"
                  className="fixed inset-x-0 bottom-0 z-30 max-h-[76dvh] overflow-y-auto rounded-t-2xl border-t border-[#D9DEE2] bg-white p-5 shadow-xl outline-none md:absolute md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:z-30 md:h-full md:max-h-none md:w-[360px] md:rounded-none md:border-l md:border-t-0 md:shadow-2xl"
                >
                  {pendingHit ? (
                    <form onSubmit={handleCreatePinSubmit} className="space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-semibold text-[#A64011]">
                            New surface Pin
                          </div>
                          <h2 className="text-[18px] font-semibold text-[#1B2A4A]">
                            {pendingHit.elementName}
                          </h2>
                          <p className="text-[12px] text-[#4F5C67]">
                            Room: {pendingHit.roomName} · Side: {pendingHit.surfaceSide}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingHit(null)}
                          aria-label="Close new surface Pin form"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-[#1B2A4A]">
                          Work title <span className="text-[#B42318]">*</span>
                        </label>
                        <input
                          type="text"
                          value={newPinTitle}
                          onChange={(e) => setNewPinTitle(e.target.value)}
                          placeholder="e.g. Wall repaint & putty"
                          className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[13px] font-medium text-[#1B2A4A]">
                            Category
                          </label>
                          <input
                            type="text"
                            value={newPinCategory}
                            onChange={(e) => setNewPinCategory(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] font-medium text-[#1B2A4A]">
                            Assignee
                          </label>
                          <input
                            type="text"
                            value={newPinWorker}
                            onChange={(e) => setNewPinWorker(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-[#1B2A4A]">
                          Instructions
                        </label>
                        <textarea
                          rows={3}
                          value={newPinDesc}
                          onChange={(e) => setNewPinDesc(e.target.value)}
                          placeholder="Describe scope, surface prep, or inspection criteria"
                          className="mt-1 w-full rounded-lg border border-[#D9DEE2] p-2.5 text-[14px]"
                        />
                      </div>

                      {pinError && (
                        <p role="alert" className="text-[13px] font-medium text-[#B42318]">
                          {pinError}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={savingPin}
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-50"
                      >
                        {savingPin ? 'Saving Pin…' : 'Save Pin on surface'}
                      </button>
                    </form>
                  ) : selectedPin ? (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-semibold text-[#A64011]">
                            {selectedPin.department} · {selectedPin.status.replace('_', ' ')}
                          </div>
                          <h2 className="text-[18px] font-semibold text-[#1B2A4A]">
                            {selectedPin.title}
                          </h2>
                          <p className="text-[12px] text-[#4F5C67]">
                            {selectedPin.roomName} · {selectedPin.elementName} (
                            {selectedPin.surfaceSide})
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedPinId(null)}
                          aria-label="Close Pin inspector"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <p className="text-[14px] leading-[20px] text-[#4F5C67]">
                        {selectedPin.description}
                      </p>

                      <dl className="divide-y divide-[#D9DEE2] rounded-lg border border-[#D9DEE2] text-[13px]">
                        <div className="flex justify-between px-3 py-2">
                          <dt className="text-[#4F5C67]">Assigned worker</dt>
                          <dd className="font-medium text-[#1B2A4A]">
                            {selectedPin.assigneeName}
                          </dd>
                        </div>
                        <div className="flex justify-between px-3 py-2">
                          <dt className="text-[#4F5C67]">Anchor status</dt>
                          <dd className="font-medium capitalize text-[#1B2A4A]">
                            {selectedPin.anchorStatus.replace('_', ' ')}
                          </dd>
                        </div>
                        <div className="flex justify-between px-3 py-2">
                          <dt className="text-[#4F5C67]">Evidence photos</dt>
                          <dd className="font-medium text-[#1B2A4A]">
                            {(selectedPin.evidence.before ? 1 : 0) +
                              (selectedPin.evidence.after ? 1 : 0)}
                          </dd>
                        </div>
                      </dl>

                      <Link
                        to={`/projects/${project.id}/work/${selectedPin.id}`}
                        className="inline-flex min-h-[42px] w-full items-center justify-center rounded-lg bg-[#1B2A4A] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#1B2A4A]/90"
                      >
                        Open Pin detail
                      </Link>
                    </div>
                  ) : selectedElement ? (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-semibold text-[#4F5C67]">
                            Building element
                          </div>
                          <h2 className="text-[18px] font-semibold text-[#1B2A4A]">
                            {selectedElement.name}
                          </h2>
                          <p className="text-[12px] text-[#4F5C67]">
                            ID: {selectedElement.id} · {selectedElement.category.replace('_', ' ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedElementId(null)}
                          aria-label="Close building element inspector"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <p className="text-[13px] text-[#4F5C67]">
                        Turn on <strong>New Pin</strong> in the bottom dock and click this surface
                        to anchor a work item directly on this mesh.
                      </p>
                    </div>
                  ) : null}
                </aside>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Add Area & Blueprint Modal */}
      {addAreaModalOpen && project && accessToken && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add area and blueprint"
        >
          <div className="max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[#D9DEE2] bg-[#F4F3EF] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[20px] font-bold text-[#1B2A4A]">Add building area</h2>
              <button
                type="button"
                onClick={() => setAddAreaModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#4F5C67] hover:text-[#1B2A4A]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <BlueprintReviewStudio
              accessToken={accessToken}
              project={project}
              mode="add-area"
              onProjectUpdated={(updated) => syncProjectInCache(updated)}
              onPublished={(res) => {
                syncProjectInCache(res.project);
                setActiveAreaId(res.modelVersion.areaId);
                setAddAreaModalOpen(false);
              }}
              onCancel={() => setAddAreaModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Add Closed-Boundary Room Modal */}
      {project && accessToken && activeArea && activeModelVersion && (
        <AddRoomBoundaryModal
          open={addRoomModalOpen}
          accessToken={accessToken}
          projectId={project.id}
          areaId={activeArea.id}
          areaName={activeArea.name}
          model={activeModelVersion.geometry}
          onClose={() => setAddRoomModalOpen(false)}
          onSaved={(updated) => syncProjectInCache(updated)}
        />
      )}
    </div>
  );
}

export function PrivateWorkOrPinPage({ isPinDetail = false }: { isPinDetail?: boolean }) {
  const { project: projectId = '', slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { project, loading, error } = useGuardedPrivateProject(projectId);
  const routes = useMemo(() => getProjectRoutes('/projects', projectId), [projectId]);

  const [query, setQuery] = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() =>
    searchParams.get('view') === 'kanban' ? 'kanban' : 'list'
  );
  const [transitionNotice, setTransitionNotice] = useState<string | null>(null);

  const viewParam = searchParams.get('view');
  useEffect(() => {
    const expected: 'list' | 'kanban' = viewParam === 'kanban' ? 'kanban' : 'list';
    setViewMode((prev) => (prev === expected ? prev : expected));
  }, [viewParam]);

  const rawFilter = searchParams.get('filter');
  const activeStatus: 'all' | PinWorkStatus =
    rawFilter === 'open' || rawFilter === 'in_progress' || rawFilter === 'approved'
      ? rawFilter
      : rawFilter === 'pending-qc' || rawFilter === 'pending_review'
        ? 'pending_review'
        : 'all';
  const materialExceptionOnly =
    searchParams.get('exceptions') === '1' ||
    rawFilter === 'exceptions' ||
    rawFilter === 'material_exceptions';
  const activeRoomParam = searchParams.get('room') || '';
  const activeDeptIdParam = searchParams.get('dept') || 'all';
  const projectTimezone = project?.timezone || 'Asia/Makassar';

  const pins = project?.pins ?? [];

  const projectDepartments = useMemo(
    () =>
      resolveProjectPinDepartments(
        project?.id ?? projectId ?? 'private-project',
        project?.departments,
        pins
      ),
    [project?.id, projectId, project?.departments, pins]
  );

  const roomOptions = useMemo(() => {
    const modelRooms =
      project?.modelVersions?.flatMap((mv) =>
        (mv.geometry?.rooms ?? []).map((r) => ({ id: r.id, name: r.name }))
      ) ?? [];
    return buildRoomOptionsFromPins(modelRooms, pins);
  }, [project?.modelVersions, pins]);

  const activeDepartment =
    activeDeptIdParam === 'all'
      ? null
      : projectDepartments.find(
          (d) =>
            d.id === activeDeptIdParam ||
            d.slug === activeDeptIdParam ||
            d.name.toLowerCase() === activeDeptIdParam.toLowerCase()
        ) ?? null;

  const setDepartmentFilter = (deptId: string) => {
    const next = new URLSearchParams(searchParams);
    if (deptId === 'all') next.delete('dept');
    else next.set('dept', deptId);
    setSearchParams(next, { replace: true });
  };

  const setStatusFilter = (nextStatus: 'all' | PinWorkStatus) => {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === 'all') {
      if (next.get('filter') !== 'exceptions' && next.get('filter') !== 'material_exceptions') {
        next.delete('filter');
      } else {
        next.delete('filter');
        next.set('exceptions', '1');
      }
    } else {
      if (next.get('filter') === 'exceptions' || next.get('filter') === 'material_exceptions') {
        next.set('exceptions', '1');
      }
      next.set('filter', nextStatus);
    }
    setSearchParams(next, { replace: true });
  };

  const toggleMaterialExceptions = () => {
    const next = new URLSearchParams(searchParams);
    if (materialExceptionOnly) {
      next.delete('exceptions');
      if (next.get('filter') === 'exceptions' || next.get('filter') === 'material_exceptions') {
        next.delete('filter');
      }
    } else {
      next.set('exceptions', '1');
    }
    setSearchParams(next, { replace: true });
  };

  const setRoomFilter = (roomId: string) => {
    const next = new URLSearchParams(searchParams);
    if (!roomId) next.delete('room');
    else next.set('room', roomId);
    setSearchParams(next, { replace: true });
  };

  const handleViewModeChange = (nextMode: 'list' | 'kanban') => {
    setViewMode(nextMode);
    const next = new URLSearchParams(searchParams);
    if (nextMode === 'kanban') next.set('view', 'kanban');
    else next.delete('view');
    setSearchParams(next, { replace: true });
  };

  const clearAllFilters = () => {
    setQuery('');
    setUpdatedFrom('');
    setUpdatedTo('');
    const next = new URLSearchParams();
    if (viewMode === 'kanban') next.set('view', 'kanban');
    setSearchParams(next, { replace: true });
  };

  const pinRailGroups = useMemo(
    () =>
      buildPinDepartmentRailGroups({
        departments: projectDepartments.map((dept) => ({
          id: dept.id,
          name: dept.name,
          pinCount: pins.filter((p) => p.department.toLowerCase() === dept.name.toLowerCase())
            .length,
        })),
        activeDepartmentId: activeDepartment ? activeDepartment.id : 'all',
        onSelectDepartment: setDepartmentFilter,
      }),
    [projectDepartments, pins, activeDepartment]
  );

  const boardFilters = useMemo<PinBoardFilters>(
    () => ({
      departmentName: activeDepartment ? activeDepartment.name : 'all',
      status: activeStatus,
      materialExceptionOnly,
      roomId: activeRoomParam,
      query,
      updatedFrom,
      updatedTo,
      timezone: projectTimezone,
    }),
    [
      activeDepartment,
      activeStatus,
      materialExceptionOnly,
      activeRoomParam,
      query,
      updatedFrom,
      updatedTo,
      projectTimezone,
    ]
  );

  const statusCounts = useMemo(
    () => computePinStatusCounts(pins, boardFilters),
    [pins, boardFilters]
  );

  const filteredPins = useMemo(
    () => filterPinsForBoard(pins, boardFilters),
    [pins, boardFilters]
  );

  const kanbanColumns = useMemo(() => groupPinsForKanban(filteredPins), [filteredPins]);

  const activeRoomName =
    roomOptions.find((room) => room.id === activeRoomParam)?.name ?? activeRoomParam;

  const activeFilterLabels = useMemo(
    () => describeActivePinFilters(boardFilters, { roomName: activeRoomName }),
    [boardFilters, activeRoomName]
  );

  const hasActiveFilter = activeFilterLabels.length > 0;

  if (error && !project) return <ForbiddenView message={error.message} />;

  const matchedPin = isPinDetail
    ? pins.find((p) => p.id === slug || p.slug === slug) ?? null
    : null;
  const matchedEvidenceItems = matchedPin
    ? [matchedPin.evidence.before, matchedPin.evidence.after].filter(
        (ev): ev is NonNullable<typeof ev> => Boolean(ev)
      )
    : [];

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <PrivateNavbar
        inProjectContext={Boolean(project)}
        projectId={project?.id}
        projectName={project?.name}
      />
      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        {project && (
          <ContextualRail
            moduleLabel="PIN"
            groups={pinRailGroups}
            projectSettingsPath={routes.settingsPath}
          />
        )}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="w-full">
            {loading ? (
              <p className="text-[15px] text-[#4F5C67]">Loading…</p>
            ) : project ? (
              <div>
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#D9DEE2] pb-5">
                  <div>
                    <Link
                      to={isPinDetail ? routes.pinListPath : routes.overviewPath}
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-[#4F5C67] hover:text-[#1B2A4A]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      {isPinDetail ? 'All project Pins' : 'Back to Overview'}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2.5">
                      <h1 className="vonta-page-title text-[#1B2A4A]">
                        {isPinDetail ? (matchedPin?.title ?? `Pin · ${slug}`) : 'PIN'}
                      </h1>
                      {!isPinDetail && activeDepartment && (
                        <span
                          data-testid="private-pin-active-department-badge"
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#D9DEE2] bg-white px-2.5 py-0.5 text-[13px] font-medium text-[#1B2A4A]"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: activeDepartment.defaultPinColor }}
                            aria-hidden="true"
                          />
                          {activeDepartment.name}
                        </span>
                      )}
                    </div>
                    {!isPinDetail && (
                      <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
                        Track surface-anchored Spatial Pins by department, QC stage, material
                        status, and project-local update date ({projectTimezone}).
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {!isPinDetail && (
                      <div
                        role="group"
                        aria-label="PIN display mode"
                        className="inline-flex rounded-lg border border-[#D9DEE2] bg-white p-1"
                      >
                        <button
                          type="button"
                          data-testid="private-pin-view-list"
                          onClick={() => handleViewModeChange('list')}
                          aria-pressed={viewMode === 'list'}
                          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors ${
                            viewMode === 'list'
                              ? 'bg-[#1B2A4A] text-white'
                              : 'text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                          }`}
                        >
                          <ListIcon className="h-4 w-4" aria-hidden="true" />
                          List
                        </button>
                        <button
                          type="button"
                          data-testid="private-pin-view-kanban"
                          onClick={() => handleViewModeChange('kanban')}
                          aria-pressed={viewMode === 'kanban'}
                          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors ${
                            viewMode === 'kanban'
                              ? 'bg-[#1B2A4A] text-white'
                              : 'text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                          }`}
                        >
                          <Columns3 className="h-4 w-4" aria-hidden="true" />
                          Kanban
                        </button>
                      </div>
                    )}
                    <Link
                      to={routes.workspacePath}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E]"
                    >
                      <Box className="h-4 w-4" aria-hidden="true" />
                      Open Workspace
                    </Link>
                  </div>
                </div>

                {isPinDetail ? (
                  matchedPin ? (
                    <div className="mt-5 space-y-6">
                      <dl className="grid grid-cols-1 gap-4 border-b border-[#E6E8EB] bg-white p-5 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <dt className="text-[12px] text-[#4F5C67]">Location</dt>
                          <dd className="mt-0.5 font-semibold text-[#1B2A4A]">
                            {matchedPin.roomName} · {matchedPin.elementName} ({matchedPin.surfaceSide})
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[12px] text-[#4F5C67]">Assigned worker & role</dt>
                          <dd className="mt-0.5 font-semibold text-[#1B2A4A]">
                            {matchedPin.assigneeName} ·{' '}
                            {formatRoleLabel(project.membership.role, project.membership)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[12px] text-[#4F5C67]">Anchor status</dt>
                          <dd className="mt-0.5 font-semibold capitalize text-[#1B2A4A]">
                            {matchedPin.anchorStatus.replace('_', ' ')}
                            {matchedPin.remappedFromVersionId
                              ? ` (remapped from ${matchedPin.remappedFromVersionId})`
                              : ''}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[12px] text-[#4F5C67]">Evidence records</dt>
                          <dd className="mt-0.5 font-semibold text-[#1B2A4A]">
                            {matchedEvidenceItems.length} preserved item
                            {matchedEvidenceItems.length === 1 ? '' : 's'}
                          </dd>
                        </div>
                      </dl>

                      <div>
                        <h2 className="text-[16px] font-semibold text-[#1B2A4A]">
                          Work instructions
                        </h2>
                        <p className="mt-1 text-[14px] leading-[22px] text-[#4F5C67]">
                          {matchedPin.description}
                        </p>
                      </div>

                      <div>
                        <h2 className="text-[16px] font-semibold text-[#1B2A4A]">
                          Before / After Evidence ({matchedEvidenceItems.length})
                        </h2>
                        {matchedEvidenceItems.length === 0 ? (
                          <p className="mt-1 text-[14px] text-[#4F5C67]">
                            No Before/After photos attached yet.
                          </p>
                        ) : (
                          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {matchedEvidenceItems.map((ev) => (
                              <li
                                key={ev.id}
                                className="rounded-lg border border-[#E6E8EB] bg-white p-3.5 text-[13px]"
                              >
                                <div className="font-semibold uppercase text-[#A64011]">
                                  {ev.slot}
                                </div>
                                <div className="mt-0.5 font-medium text-[#1B2A4A]">
                                  {ev.note || ev.fileName}
                                </div>
                                <div className="mt-1 text-[12px] text-[#4F5C67]">
                                  Cycle {ev.cycleNumber} · {ev.uploadedAt}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 flex items-center gap-2 text-[14px] text-[#4F5C67]">
                      <AlertCircle className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
                      <span>
                        Pin “{slug}” was not found on {project.name}.
                      </span>
                    </div>
                  )
                ) : (
                  <div className="mt-5 space-y-4">
                    {/* Live PIN Filter Toolbar: Status row + independent Material exceptions + Search + Room + Updated date */}
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div
                            role="tablist"
                            aria-label="Filter Pins by status"
                            className="flex flex-wrap items-center gap-1.5"
                          >
                            {(
                              [
                                { key: 'all', label: 'All Pins' },
                                { key: 'open', label: 'Open' },
                                { key: 'in_progress', label: 'In progress' },
                                { key: 'pending_review', label: 'Pending QC' },
                                { key: 'approved', label: 'Approved' },
                              ] as const
                            ).map((tab) => {
                              const active = activeStatus === tab.key;
                              return (
                                <button
                                  key={tab.key}
                                  type="button"
                                  role="tab"
                                  aria-selected={active}
                                  data-testid={`private-pin-status-tab-${tab.key}`}
                                  onClick={() => setStatusFilter(tab.key)}
                                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] leading-[18px] font-medium transition-colors ${
                                    active
                                      ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                                      : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                                  }`}
                                >
                                  <span>{tab.label}</span>
                                  <span
                                    className={`text-[12px] tabular-nums ${
                                      active ? 'text-white/80' : 'text-[#4F5C67]'
                                    }`}
                                  >
                                    ({statusCounts[tab.key]})
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            data-testid="private-pin-filter-material-exceptions"
                            aria-pressed={materialExceptionOnly}
                            onClick={toggleMaterialExceptions}
                            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] leading-[18px] font-semibold transition-colors ${
                              materialExceptionOnly
                                ? 'border-[#A64011] bg-[#FFF3EB] text-[#A64011]'
                                : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                            }`}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Material exceptions</span>
                            <span className="text-[12px] tabular-nums opacity-80">
                              ({statusCounts.materialExceptions})
                            </span>
                          </button>
                        </div>

                        <div
                          className="text-[13px] font-medium text-[#4F5C67] tabular-nums"
                          data-testid="private-pin-result-count"
                        >
                          Showing <strong className="text-[#1B2A4A]">{filteredPins.length}</strong>{' '}
                          {filteredPins.length === 1 ? 'Pin' : 'Pins'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                          <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                            aria-hidden="true"
                          />
                          <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search Pin title, ID, room, worker..."
                            aria-label="Search project Pins"
                            className="h-10 w-full rounded-lg border border-[#D9DEE2] bg-white pl-9 pr-8 text-[14px] text-[#1B2A4A]"
                          />
                          {query && (
                            <button
                              type="button"
                              onClick={() => setQuery('')}
                              aria-label="Clear Pin search"
                              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#4F5C67] hover:bg-[#F4F3EF]"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        <div>
                          <label htmlFor="private-pin-room-filter" className="sr-only">
                            Filter by room
                          </label>
                          <select
                            id="private-pin-room-filter"
                            value={activeRoomParam}
                            onChange={(e) => setRoomFilter(e.target.value)}
                            className="h-10 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#1B2A4A]"
                          >
                            <option value="">All rooms</option>
                            {roomOptions.map((room) => (
                              <option key={room.id} value={room.id}>
                                {room.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-2.5 py-1">
                          <Calendar className="h-3.5 w-3.5 text-[#4F5C67]" aria-hidden="true" />
                          <span className="text-[12px] font-semibold text-[#4F5C67]">Updated</span>
                          <input
                            type="date"
                            aria-label="Updated from"
                            value={updatedFrom}
                            onChange={(e) => setUpdatedFrom(e.target.value)}
                            className="h-8 rounded border border-[#D9DEE2] px-2 text-[12px] text-[#1B2A4A]"
                          />
                          <span className="text-[12px] text-[#4F5C67]">to</span>
                          <input
                            type="date"
                            aria-label="Updated to"
                            value={updatedTo}
                            onChange={(e) => setUpdatedTo(e.target.value)}
                            className="h-8 rounded border border-[#D9DEE2] px-2 text-[12px] text-[#1B2A4A]"
                          />
                        </div>

                        {hasActiveFilter && (
                          <button
                            type="button"
                            onClick={clearAllFilters}
                            className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            Reset filters
                          </button>
                        )}
                      </div>
                    </div>

                    {transitionNotice && (
                      <div
                        role="alert"
                        className="flex items-center justify-between gap-2 rounded-lg border border-[#A64011]/30 bg-[#FFF3EB] px-4 py-2.5 text-[13px] text-[#1B2A4A]"
                      >
                        <span>{transitionNotice}</span>
                        <button
                          type="button"
                          onClick={() => setTransitionNotice(null)}
                          aria-label="Dismiss notice"
                          className="rounded p-1 text-[#4F5C67] hover:bg-white"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}

                    {viewMode === 'list' ? (
                      <section
                        data-testid="private-pin-list-view"
                        aria-label="Project PIN list"
                        className="border-t border-b border-[#D9DEE2] bg-white"
                      >
                        {filteredPins.length === 0 ? (
                          <div className="px-6 py-12 text-center" aria-live="polite">
                            <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                              {pins.length === 0
                                ? 'No Spatial Pins yet'
                                : 'No Pins match the current filters'}
                            </h2>
                            {pins.length === 0 ? (
                              <p className="mt-1.5 text-[14px] leading-[20px] text-[#4F5C67]">
                                No Spatial Pins exist on {project.name} yet. Open the 3D Workspace
                                to anchor work on a verified surface.
                              </p>
                            ) : (
                              <>
                                <p className="mt-2 text-[14px] leading-[20px] text-[#4F5C67]">
                                  Active filters:{' '}
                                  <span className="font-medium text-[#1B2A4A]">
                                    {activeFilterLabels.join(' · ')}
                                  </span>
                                </p>
                                <p className="mx-auto mt-1.5 max-w-[600px] text-[14px] leading-[20px] text-[#4F5C67]">
                                  {activeDepartment
                                    ? 'Select All departments in the left sidebar to remove only the department condition while keeping your other filters, or reset all filters below.'
                                    : 'Clear individual toolbar filters above, or click Reset filters to show all Pins on this project.'}
                                </p>
                                {hasActiveFilter && (
                                  <button
                                    type="button"
                                    onClick={clearAllFilters}
                                    className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[13px] font-semibold text-[#1B2A4A] hover:bg-[#F4F3EF]"
                                  >
                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                    Reset filters
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div
                              aria-hidden="true"
                              className="hidden border-b border-[#E6E8EB] bg-[#FAF9F6] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#4F5C67] lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.15fr)_minmax(0,1.1fr)_auto] lg:items-center lg:gap-4"
                            >
                              <span>Pin & status</span>
                              <span>Location & department</span>
                              <span>Assignee & updated</span>
                              <span>Materials & QC evidence</span>
                              <span className="text-right">Actions</span>
                            </div>

                            <ul className="divide-y divide-[#E6E8EB]">
                              {filteredPins.map((pin) => {
                                const issuedCount = pin.materials.filter(
                                  (m) => m.issuedQty > 0
                                ).length;
                                const evCount =
                                  (pin.evidence.before ? 1 : 0) + (pin.evidence.after ? 1 : 0);
                                const pinColor = resolvePinDisplayColor(pin, projectDepartments);
                                const updatedKey = toProjectLocalDateKey(
                                  getPinUpdatedIso(pin),
                                  projectTimezone
                                );
                                return (
                                  <li
                                    key={pin.id}
                                    data-testid={`private-pin-list-row-${pin.id}`}
                                    className="grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-[#FAF9F6] lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.15fr)_minmax(0,1.1fr)_auto] lg:items-center lg:gap-4"
                                  >
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span
                                          className="h-3 w-3 shrink-0 rounded-full border border-black/15"
                                          style={{ backgroundColor: pinColor }}
                                          aria-hidden="true"
                                        />
                                        <Link
                                          to={routes.pinDetailPath(pin.id)}
                                          className="text-[15px] leading-[21px] font-semibold text-[#1B2A4A] underline-offset-4 hover:text-[#A64011] hover:underline"
                                        >
                                          {pin.title}
                                        </Link>
                                      </div>
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5">
                                        <span className="text-[12px] font-medium text-[#4F5C67] tabular-nums">
                                          {pin.id}
                                        </span>
                                        <span className="rounded bg-[#F4F3EF] px-2 py-0.5 text-[12px] font-semibold text-[#1B2A4A]">
                                          {formatStatusLabel(pin.status)}
                                        </span>
                                        {pinHasMaterialException(pin) && (
                                          <span className="inline-flex items-center gap-1 rounded bg-[#FFF3EB] px-2 py-0.5 text-[11px] font-semibold text-[#A64011]">
                                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                            Material exception
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="min-w-0 pl-5 text-[13px] leading-[18px] lg:pl-0">
                                      <div className="font-medium text-[#1B2A4A]">
                                        {pin.roomName}
                                      </div>
                                      <div className="text-[#4F5C67]">{pin.department}</div>
                                    </div>

                                    <div className="min-w-0 pl-5 text-[13px] leading-[18px] lg:pl-0">
                                      <div className="text-[#1B2A4A]">{pin.assigneeName}</div>
                                      <div className="text-[12px] text-[#4F5C67] tabular-nums">
                                        Updated {updatedKey}
                                      </div>
                                    </div>

                                    <div className="min-w-0 pl-5 text-[13px] leading-[18px] text-[#4F5C67] tabular-nums lg:pl-0">
                                      <div>
                                        <span className="font-medium text-[#1B2A4A]">
                                          {pin.materials.length}
                                        </span>{' '}
                                        materials ({issuedCount} issued)
                                      </div>
                                      <div>
                                        <span className="font-medium text-[#1B2A4A]">
                                          {evCount}/2
                                        </span>{' '}
                                        QC photos
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pl-5 lg:justify-end lg:pl-0">
                                      <Link
                                        to={routes.locatePinPath(pin.id)}
                                        className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] leading-[18px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                                      >
                                        <MapPin
                                          className="h-3.5 w-3.5 text-[#D4652F]"
                                          aria-hidden="true"
                                        />
                                        Locate in 3D
                                      </Link>
                                      <Link
                                        to={routes.pinDetailPath(pin.id)}
                                        className="inline-flex min-h-[38px] items-center whitespace-nowrap rounded-lg bg-[#1B2A4A] px-3.5 py-1.5 text-[13px] leading-[18px] font-medium text-white hover:bg-[#1B2A4A]/90"
                                      >
                                        Inspect Pin
                                      </Link>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </section>
                    ) : (
                      <div className="space-y-4">
                        {filteredPins.length === 0 && hasActiveFilter && (
                          <div
                            role="status"
                            aria-live="polite"
                            className="flex flex-wrap items-center justify-between gap-3 border-y border-[#D9DEE2] bg-white px-4 py-3 text-[13px] text-[#4F5C67]"
                          >
                            <div>
                              <span className="font-semibold text-[#1B2A4A]">
                                No Pins match the active filters ({activeFilterLabels.join(' · ')}).
                              </span>{' '}
                              {activeDepartment
                                ? 'Select All departments in the left sidebar to remove only the department condition, or reset all filters.'
                                : 'Adjust toolbar filters above or click Reset filters.'}
                            </div>
                            <button
                              type="button"
                              onClick={clearAllFilters}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[12px] font-semibold text-[#1B2A4A] hover:bg-[#F4F3EF]"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              Reset filters
                            </button>
                          </div>
                        )}

                        <section
                          data-testid="private-pin-kanban-view"
                          aria-label="Project PIN Kanban board"
                          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
                        >
                          {kanbanColumns.map((col) => (
                            <div
                              key={col.status}
                              className="flex min-h-[300px] flex-col border-t-2 border-[#D9DEE2] bg-[#FAF9F6] px-3 py-3"
                            >
                              <div className="flex items-center justify-between border-b border-[#E6E8EB] pb-2.5">
                                <h2 className="text-[14px] font-bold text-[#1B2A4A]">
                                  {col.label}
                                </h2>
                                <span className="text-[12px] font-semibold text-[#4F5C67] tabular-nums">
                                  ({col.pins.length})
                                </span>
                              </div>
                              {col.pins.length === 0 ? (
                                <div className="mt-3 flex flex-1 items-center justify-center border border-dashed border-[#D9DEE2] bg-white/60 p-4 text-center text-[13px] text-[#4F5C67]">
                                  No Pins in {col.label}
                                </div>
                              ) : (
                                <ul className="mt-3 space-y-2.5">
                                  {col.pins.map((pin) => {
                                    const pinColor = resolvePinDisplayColor(
                                      pin,
                                      projectDepartments
                                    );
                                    const evCount =
                                      (pin.evidence.before ? 1 : 0) +
                                      (pin.evidence.after ? 1 : 0);
                                    return (
                                      <li
                                        key={pin.id}
                                        className="rounded-lg border border-[#E6E8EB] bg-white p-3.5 transition-colors hover:border-[#1B2A4A]/40"
                                      >
                                        <div className="flex items-start gap-2">
                                          <span
                                            className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/15"
                                            style={{ backgroundColor: pinColor }}
                                            aria-hidden="true"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <Link
                                              to={routes.pinDetailPath(pin.id)}
                                              className="block text-[14px] leading-[19px] font-semibold text-[#1B2A4A] hover:text-[#A64011] hover:underline"
                                            >
                                              {pin.title}
                                            </Link>
                                            <div className="mt-1 text-[12px] text-[#4F5C67]">
                                              <span className="font-medium text-[#1B2A4A] tabular-nums">
                                                {pin.id}
                                              </span>{' '}
                                              · {pin.roomName} · {pin.department}
                                            </div>
                                            <div className="mt-0.5 text-[12px] text-[#4F5C67]">
                                              {pin.assigneeName} ·{' '}
                                              <span className="font-medium text-[#1B2A4A] tabular-nums">
                                                {evCount}/2 QC photos
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        {pinHasMaterialException(pin) && (
                                          <div className="mt-2 inline-flex items-center gap-1 rounded bg-[#FFF3EB] px-2 py-0.5 text-[11px] font-semibold text-[#A64011]">
                                            <AlertTriangle
                                              className="h-3 w-3"
                                              aria-hidden="true"
                                            />
                                            Material exception
                                          </div>
                                        )}
                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E6E8EB] pt-2.5 text-[12px]">
                                          <Link
                                            to={routes.locatePinPath(pin.id)}
                                            className="inline-flex items-center gap-1 font-semibold text-[#A64011] hover:underline"
                                          >
                                            <MapPin className="h-3 w-3" aria-hidden="true" />
                                            Locate in 3D
                                          </Link>
                                          <div className="flex items-center gap-3">
                                            <Link
                                              to={routes.pinDetailPath(pin.id)}
                                              className="font-medium text-[#1B2A4A] hover:underline"
                                            >
                                              Inspect Pin
                                            </Link>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setTransitionNotice(
                                                  `Open ${pin.title} detail to attach required Before/After QC evidence and run server-verified status transitions.`
                                                )
                                              }
                                              className="font-medium text-[#4F5C67] hover:text-[#1B2A4A] hover:underline"
                                            >
                                              QC status…
                                            </button>
                                          </div>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          ))}
                        </section>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Approved minimal development shell for unfinished operational modules in private projects.
 * Keeps shared top bar and contextual module left rail + centered VONTA, destination name,
 * and "This module is in development."
 */
export function PrivateModuleUnavailablePage({ moduleKey }: { moduleKey: string }) {
  const { project: projectId = '' } = useParams();
  const location = useLocation();
  const { project, error } = useGuardedPrivateProject(projectId);
  const routes = useMemo(() => getProjectRoutes('/projects', projectId), [projectId]);
  const activeModule = resolveModuleFromSlug(moduleKey);
  const accountingView = resolveAccountingView(location.search);

  const { moduleLabel, railGroups, title } = useMemo(() => {
    if (activeModule === 'warehouse') {
      return {
        moduleLabel: 'Warehouse',
        railGroups: buildWarehouseRailGroups(routes, moduleKey),
        title: MODULE_TITLES[moduleKey] ?? 'Warehouse',
      };
    }
    if (activeModule === 'accounting') {
      return {
        moduleLabel: 'Accounting',
        railGroups: buildAccountingRailGroups(routes, accountingView),
        title: ACCOUNTING_VIEWS[accountingView].title,
      };
    }
    return {
      moduleLabel: 'Overview',
      railGroups: buildOverviewRailGroups(
        routes,
        moduleKey === 'attendance' ? 'attendance' : 'users'
      ),
      title: MODULE_TITLES[moduleKey] ?? 'Module',
    };
  }, [activeModule, routes, moduleKey, accountingView]);

  if (error && !project) return <ForbiddenView message={error.message} />;

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <PrivateNavbar
        inProjectContext={Boolean(project)}
        projectId={project?.id ?? projectId}
        projectName={project?.name}
      />
      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        <ContextualRail
          moduleLabel={moduleLabel}
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
        />
        <main className="flex min-w-0 flex-1 items-start justify-center px-4 py-12">
          {activeModule==='accounting' && project ? <div className="w-full"><h1 className="vonta-page-title">Department accounting</h1><LiveBudget key={project.id} project={project} editable/></div> :
          <section
            aria-labelledby="module-dev-heading"
            data-testid="module-dev-card"
            className="w-full max-w-md rounded-xl border border-[#D9DEE2] bg-white px-8 py-12 text-center"
          >
            <div className="text-[20px] leading-[24px] font-bold tracking-tight text-[#1B2A4A]">
              VONTA
            </div>
            <h1
              id="module-dev-heading"
              className="mt-4 text-[26px] leading-[32px] font-bold tracking-tight text-[#1B2A4A]"
            >
              {title}
            </h1>
            <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
              This module is in development.
            </p>
          </section>}
        </main>
      </div>
    </div>
  );
}
