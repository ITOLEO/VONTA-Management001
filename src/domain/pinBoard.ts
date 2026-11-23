import type { PinWorkStatus, SpatialPin } from './types';
import { pinHasMaterialException } from './demoStore';
import { resolveEffectivePinColor, type ProjectDepartment } from './departmentCatalog';

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
