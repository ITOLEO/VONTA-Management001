import type { PinWorkStatus, SpatialPin } from './types';
import { pinHasMaterialException } from './demoStore';
import {
  addProjectDepartment,
  ensureProjectDepartments,
  resolveEffectivePinColor,
  type ProjectDepartment,
} from './departmentCatalog';

export interface PinBoardFilters {
  departmentName: string; // 'all' or department name
  status: 'all' | PinWorkStatus;
  materialExceptionOnly: boolean;
  roomId: string; // '' or roomId
  query: string;
  updatedFrom: string; // '' or YYYY-MM-DD (project local date)
  updatedTo: string; // '' or YYYY-MM-DD (project local date)
  timezone: string;
}

export interface KanbanColumnSpec {
  status: PinWorkStatus;
  label: string;
  pins: SpatialPin[];
}

export const KANBAN_COLUMNS: ReadonlyArray<{ status: PinWorkStatus; label: string }> = [
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'pending_review', label: 'Pending QC' },
  { status: 'approved', label: 'Approved' },
];

export const PIN_STATUS_LABELS: Record<'all' | PinWorkStatus, string> = {
  all: 'All Pins',
  open: 'Open',
  in_progress: 'In progress',
  pending_review: 'Pending QC',
  approved: 'Approved',
};

export interface PinStatusCounts {
  all: number;
  open: number;
  in_progress: number;
  pending_review: number;
  approved: number;
  materialExceptions: number;
}

export interface PinRoomOption {
  id: string;
  name: string;
}

/**
 * Formats a UTC ISO timestamp as a YYYY-MM-DD calendar date in the project's IANA timezone.
 */
export function toProjectLocalDateKey(isoUtc: string, timeZone = 'Asia/Makassar'): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function getPinUpdatedIso(pin: Pick<SpatialPin, 'createdAt' | 'updatedAt'>): string {
  return pin.updatedAt || pin.createdAt;
}

/**
 * Resolves a single authoritative department list for a project's PIN module:
 * 1. Starts from the project's authorized department catalog (falling back to the 4 seeded
 *    defaults via `ensureProjectDepartments`).
 * 2. Preserves any custom department names already present on authorized project Pins so
 *    custom departments are never dropped from the left sidebar or color resolution.
 */
export function resolveProjectPinDepartments(
  projectId: string,
  catalogDepartments?: readonly ProjectDepartment[] | null,
  pins?: readonly Pick<SpatialPin, 'department' | 'color'>[] | null
): ProjectDepartment[] {
  let resolved = ensureProjectDepartments(
    projectId,
    catalogDepartments ? [...catalogDepartments] : null
  );

  if (pins && pins.length > 0) {
    for (const pin of pins) {
      const deptName = pin.department?.trim();
      if (!deptName) continue;
      const alreadyExists = resolved.some(
        (d) => d.name.trim().toLowerCase() === deptName.toLowerCase()
      );
      if (alreadyExists) continue;
      const added = addProjectDepartment(
        resolved,
        projectId,
        {
          name: deptName,
          defaultPinColor: pin.color,
        },
        '2026-11-19T08:00:00.000Z'
      );
      if (added.ok) {
        resolved = added.departments;
      }
    }
  }

  return resolved;
}

/**
 * Builds deduplicated room filter options from model/area rooms and authorized Pins.
 */
export function buildRoomOptionsFromPins(
  baseRooms: readonly PinRoomOption[],
  pins: readonly Pick<SpatialPin, 'roomId' | 'roomName'>[]
): PinRoomOption[] {
  const map = new Map<string, string>();
  for (const room of baseRooms) {
    if (room.id && room.name) {
      map.set(room.id, room.name);
    }
  }
  for (const pin of pins) {
    if (pin.roomId && !map.has(pin.roomId)) {
      map.set(pin.roomId, pin.roomName || pin.roomId);
    }
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}

/**
 * Canonical filter pipeline shared identically by List and Kanban views so both views
 * always display the exact same records and counts for any combination of filters.
 */
export function filterPinsForBoard<
  T extends Pick<
    SpatialPin,
    | 'id'
    | 'title'
    | 'roomId'
    | 'roomName'
    | 'department'
    | 'assigneeName'
    | 'status'
    | 'materials'
    | 'createdAt'
    | 'updatedAt'
  >
>(pins: readonly T[], filters: PinBoardFilters): T[] {
  const q = filters.query.trim().toLowerCase();
  const fromKey = filters.updatedFrom.trim();
  const toKey = filters.updatedTo.trim();

  return pins.filter((pin) => {
    if (
      filters.departmentName !== 'all' &&
      pin.department.toLowerCase() !== filters.departmentName.toLowerCase()
    ) {
      return false;
    }
    if (filters.status !== 'all' && pin.status !== filters.status) {
      return false;
    }
    if (filters.materialExceptionOnly && !pinHasMaterialException(pin as unknown as SpatialPin)) {
      return false;
    }
    if (filters.roomId && pin.roomId !== filters.roomId) {
      return false;
    }
    if (fromKey || toKey) {
      const localDate = toProjectLocalDateKey(getPinUpdatedIso(pin), filters.timezone);
      if (fromKey && localDate && localDate < fromKey) return false;
      if (toKey && localDate && localDate > toKey) return false;
    }
    if (q) {
      const hay = [pin.title, pin.id, pin.roomName, pin.department, pin.assigneeName]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Computes status tab counts within the active department and all other active filters
 * (Material exceptions, room, search, updated date), plus the Material exceptions toggle
 * count within the active department, status, room, search, and updated date filters.
 */
export function computePinStatusCounts<
  T extends Pick<
    SpatialPin,
    | 'id'
    | 'title'
    | 'roomId'
    | 'roomName'
    | 'department'
    | 'assigneeName'
    | 'status'
    | 'materials'
    | 'createdAt'
    | 'updatedAt'
  >
>(pins: readonly T[], filters: PinBoardFilters): PinStatusCounts {
  const baseScoped = filterPinsForBoard(pins, {
    ...filters,
    status: 'all',
  });

  let open = 0;
  let in_progress = 0;
  let pending_review = 0;
  let approved = 0;

  for (const pin of baseScoped) {
    if (pin.status === 'open') open += 1;
    else if (pin.status === 'in_progress') in_progress += 1;
    else if (pin.status === 'pending_review') pending_review += 1;
    else if (pin.status === 'approved') approved += 1;
  }

  const materialExceptions = filterPinsForBoard(pins, {
    ...filters,
    materialExceptionOnly: true,
  }).length;

  return {
    all: baseScoped.length,
    open,
    in_progress,
    pending_review,
    approved,
    materialExceptions,
  };
}

/**
 * Produces concise, human-readable labels for each currently active PIN filter so empty
 * states clearly tell users which conditions are hiding Pins and how to clear them.
 */
export function describeActivePinFilters(
  filters: PinBoardFilters,
  options?: { roomName?: string | null }
): string[] {
  const labels: string[] = [];
  if (filters.departmentName && filters.departmentName !== 'all') {
    labels.push(`Department: ${filters.departmentName}`);
  }
  if (filters.status !== 'all') {
    labels.push(`Status: ${PIN_STATUS_LABELS[filters.status]}`);
  }
  if (filters.materialExceptionOnly) {
    labels.push('Material exceptions');
  }
  if (filters.roomId) {
    labels.push(`Room: ${options?.roomName || filters.roomId}`);
  }
  if (filters.query.trim()) {
    labels.push(`Search: "${filters.query.trim()}"`);
  }
  if (filters.updatedFrom || filters.updatedTo) {
    if (filters.updatedFrom && filters.updatedTo) {
      labels.push(`Updated: ${filters.updatedFrom} to ${filters.updatedTo}`);
    } else if (filters.updatedFrom) {
      labels.push(`Updated from ${filters.updatedFrom}`);
    } else {
      labels.push(`Updated until ${filters.updatedTo}`);
    }
  }
  return labels;
}

/**
 * Always emits all 4 canonical Kanban columns (`open`, `in_progress`, `pending_review`, `approved`)
 * so empty columns remain visible with heading and count `(0)`.
 */
export function groupPinsForKanban<T extends Pick<SpatialPin, 'status'>>(
  pins: readonly T[]
): Array<{ status: PinWorkStatus; label: string; pins: T[] }> {
  return KANBAN_COLUMNS.map((col) => ({
    status: col.status,
    label: col.label,
    pins: pins.filter((p) => p.status === col.status),
  }));
}

export function resolvePinDisplayColor(
  pin: Pick<SpatialPin, 'department' | 'color' | 'pinColorOverride'>,
  departments: readonly ProjectDepartment[]
): string {
  return resolveEffectivePinColor(pin, [...departments]);
}
