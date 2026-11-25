import type { LayerKey, RoomId, SpatialPin } from './types';

export type GeometryLayerKey = 'civil' | 'electrical' | 'plumbing';

export const GEOMETRY_LAYER_KEYS: readonly GeometryLayerKey[] = [
  'civil',
  'electrical',
  'plumbing',
] as const;

export interface WorkspaceLayerDescriptor {
  key: GeometryLayerKey;
  label: string;
  available: boolean;
  statusText: string;
  unavailableNotice?: string;
}

export interface WorkspacePinFilterState {
  activeRoomId: RoomId | null;
  activeDepartmentFilter: string | null;
  selectedPinId: string | null;
  layers: Record<LayerKey, boolean>;
}

export interface WorkspaceOutputVisibility {
  showToggle: boolean;
  showDownload: boolean;
  showShare: boolean;
}

/**
 * Returns the supported 3D geometry layers for a workspace model.
 * Adding a department in Overview, Accounting, or PIN never creates a 3D geometry layer here.
 */
export function buildWorkspaceGeometryLayerCatalog(
  sheetLabel?: string | null,
  support?: Partial<Record<GeometryLayerKey, boolean>>
): WorkspaceLayerDescriptor[] {
  const sheetRef = sheetLabel?.trim() || 'this published model';
  const civilAvailable = support?.civil ?? true;
  const electricalAvailable = support?.electrical ?? false;
  const plumbingAvailable = support?.plumbing ?? false;

  return [
    {
      key: 'civil',
      label: 'Civil',
      available: civilAvailable,
      statusText: civilAvailable
        ? 'Modeled architectural & structural geometry'
        : `Unavailable · No civil geometry on ${sheetRef}`,
      unavailableNotice: civilAvailable
        ? undefined
        : `No modeled Civil geometry is attached to ${sheetRef}.`,
    },
    {
      key: 'electrical',
      label: 'Electrical',
      available: electricalAvailable,
      statusText: electricalAvailable
        ? 'Modeled electrical routing geometry'
        : `Unavailable · No routing source on ${sheetRef}`,
      unavailableNotice: electricalAvailable
        ? undefined
        : `Electrical 3D geometry is unavailable on ${sheetRef}. No conduits or fixtures are fabricated.`,
    },
    {
      key: 'plumbing',
      label: 'Plumbing',
      available: plumbingAvailable,
      statusText: plumbingAvailable
        ? 'Modeled plumbing routing geometry'
        : `Unavailable · No routing source on ${sheetRef}`,
      unavailableNotice: plumbingAvailable
        ? undefined
        : `Plumbing 3D geometry is unavailable on ${sheetRef}. No pipes or risers are fabricated.`,
    },
  ];
}

/**
 * Counts how many 3D geometry layers (Civil, Electrical, Plumbing) are currently toggled on.
 * Excludes Pin marker visibility (`layers.pins`), which belongs to Pin filters.
 */
export function countActiveGeometryLayers(layers: Record<LayerKey, boolean>): number {
  let count = 0;
  for (const key of GEOMETRY_LAYER_KEYS) {
    if (layers[key]) count += 1;
  }
  return count;
}

/**
 * Pure Pin filter evaluation.
 * Independent of 3D geometry layer toggles (Civil, Electrical, Plumbing).
 */
export function filterWorkspacePins(
  pins: readonly SpatialPin[],
  options: {
    areaId?: string | null;
    roomId?: RoomId | null;
    departmentName?: string | null;
    showPinMarkers?: boolean;
  }
): {
  matchingPins: SpatialPin[];
  visibleMarkerPins: SpatialPin[];
} {
  let list = [...pins];
  if (options.areaId && options.areaId !== 'all') {
    list = list.filter((p) => p.areaId === options.areaId);
  }
  if (options.roomId) {
    list = list.filter((p) => p.roomId === options.roomId);
  }
  if (options.departmentName) {
    const target = options.departmentName.trim().toLowerCase();
    list = list.filter((p) => p.department.trim().toLowerCase() === target);
  }
  const showMarkers = options.showPinMarkers ?? true;
  return {
    matchingPins: list,
    visibleMarkerPins: showMarkers ? list : [],
  };
}

/**
 * Toggles a single 3D geometry layer independently.
 * Preserves active Pin filter criteria, room scope, selected Pin, and Pin marker visibility.
 */
export function toggleWorkspaceGeometryLayer(
  state: WorkspacePinFilterState,
  key: GeometryLayerKey
): WorkspacePinFilterState {
  return {
    ...state,
    layers: {
      ...state.layers,
      [key]: !state.layers[key],
    },
  };
}

/**
 * Selects or clears a department inside Pin filters.
 * Preserves all 3D geometry layers (`civil`, `electrical`, `plumbing`).
 * Ensures Pin markers are visible when selecting a specific department.
 */
export function setWorkspacePinDepartmentFilter(
  state: WorkspacePinFilterState,
  departmentName: string | null
): WorkspacePinFilterState {
  return {
    ...state,
    activeDepartmentFilter: departmentName,
    layers: {
      ...state.layers,
      pins: departmentName ? true : state.layers.pins,
    },
  };
}

/**
 * Toggles Pin marker visibility inside Pin filters.
 * Preserves active department, room scope, Pin selection, and all 3D geometry layers.
 */
export function toggleWorkspacePinMarkers(
  state: WorkspacePinFilterState
): WorkspacePinFilterState {
  return {
    ...state,
    layers: {
      ...state.layers,
      pins: !state.layers.pins,
    },
  };
}

/**
 * Explicit "All pins" reset inside Pin filters.
 * Clears department filter, room scope, and Pin selection, ensures Pin markers are visible,
 * and strictly preserves the chosen 3D geometry layer settings (`civil`, `electrical`, `plumbing`).
 */
export function resetWorkspacePinFilters(
  state: WorkspacePinFilterState
): WorkspacePinFilterState {
  return {
    activeRoomId: null,
    activeDepartmentFilter: null,
    selectedPinId: null,
    layers: {
      ...state.layers,
      pins: true,
    },
  };
}

export function isAllPinsFilterClear(state: WorkspacePinFilterState): boolean {
  return (
    !state.activeRoomId &&
    !state.activeDepartmentFilter &&
    !state.selectedPinId &&
    state.layers.pins
  );
}

/**
 * Determines visibility of the collapsible top-right Download / Share output control.
 * Hides the right-edge toggle completely if the member has neither grant.
 */
export function resolveWorkspaceOutputVisibility(grants: {
  canDownload: boolean;
  canShare: boolean;
}): WorkspaceOutputVisibility {
  const showDownload = Boolean(grants.canDownload);
  const showShare = Boolean(grants.canShare);
  return {
    showToggle: showDownload || showShare,
    showDownload,
    showShare,
  };
}
