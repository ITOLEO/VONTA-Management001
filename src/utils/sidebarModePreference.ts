export type SidebarMode = 'expanded' | 'collapsed' | 'hover';

export const DEFAULT_SIDEBAR_MODE: SidebarMode = 'hover';
export const SIDEBAR_COLLAPSED_WIDTH_PX = 52 as const;
export const SIDEBAR_EXPANDED_WIDTH_PX = 256 as const;
export const SIDEBAR_OPEN_TRANSITION_MS = 110;
export const SIDEBAR_CLOSE_TRANSITION_MS = 220;
export const SIDEBAR_CLOSE_DELAY_MS = 280;

export interface SidebarModeOption {
  mode: SidebarMode;
  label: string;
}

export const SIDEBAR_MODE_OPTIONS: readonly SidebarModeOption[] = [
  { mode: 'expanded', label: 'Expanded' },
  { mode: 'collapsed', label: 'Collapsed' },
  { mode: 'hover', label: 'Expand on hover' },
] as const;

const STORAGE_PREFIX = 'vonta.sidebarMode.v1';

const LEGACY_KEYS = [
  'vonta.sidebar.mode',
  'vonta.sidebarMode',
  'vonta.railExpanded',
  'vonta.sidebar.expanded',
] as const;

export function normalizeProfileKey(profileKey?: string | null): string {
  const trimmed = (profileKey ?? '').trim();
  if (!trimmed) return 'local';
  return trimmed.replace(/[^a-zA-Z0-9._:@-]/g, '_');
}

export function getSidebarModeStorageKey(profileKey?: string | null): string {
  return `${STORAGE_PREFIX}:${normalizeProfileKey(profileKey)}`;
}

export function parseSidebarMode(raw: string | null | undefined): SidebarMode | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'expanded' || normalized === 'pinned' || normalized === 'open') {
    return 'expanded';
  }
  if (normalized === 'collapsed' || normalized === 'compact' || normalized === 'icons') {
    return 'collapsed';
  }
  if (
    normalized === 'hover' ||
    normalized === 'expand_on_hover' ||
    normalized === 'expand-on-hover' ||
    normalized === 'auto'
  ) {
    return 'hover';
  }
  return null;
}

function parseLegacyPreference(raw: string | null | undefined): SidebarMode | null {
  const direct = parseSidebarMode(raw);
  if (direct) return direct;
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return 'expanded';
  if (normalized === 'false' || normalized === '0') return 'hover';
  return null;
}

export function readSidebarMode(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  profileKey?: string | null
): SidebarMode {
  if (!storage) return DEFAULT_SIDEBAR_MODE;

  try {
    const scopedRaw = storage.getItem(getSidebarModeStorageKey(profileKey));
    const scoped = parseSidebarMode(scopedRaw);
    if (scoped) return scoped;

    for (const legacyKey of LEGACY_KEYS) {
      const legacyVal = storage.getItem(legacyKey);
      const migrated = parseLegacyPreference(legacyVal);
      if (migrated) return migrated;
    }
  } catch {
    return DEFAULT_SIDEBAR_MODE;
  }

  return DEFAULT_SIDEBAR_MODE;
}

export function writeSidebarMode(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  mode: SidebarMode,
  profileKey?: string | null
): void {
  if (!storage) return;
  try {
    storage.setItem(getSidebarModeStorageKey(profileKey), mode);
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

export interface RailLayoutInput {
  mode: SidebarMode;
  hoverExpanded: boolean;
  focusWithin: boolean;
  controlMenuOpen: boolean;
  touchExpanded: boolean;
}

export interface RailLayoutState {
  slotWidthPx: typeof SIDEBAR_COLLAPSED_WIDTH_PX | typeof SIDEBAR_EXPANDED_WIDTH_PX;
  panelWidthPx: typeof SIDEBAR_COLLAPSED_WIDTH_PX | typeof SIDEBAR_EXPANDED_WIDTH_PX;
  visualExpanded: boolean;
  isFloatingOverlay: boolean;
}

/**
 * Pure geometry and overlay state machine for the desktop project sidebar:
 * - Only persistent `expanded` mode reserves the full 256 px width in document flow.
 * - `collapsed` stays 52 px and never hover-expands.
 * - `hover` reserves 52 px in flow and floats over the page at 256 px while hovered,
 *   keyboard focused, touch-expanded, or while the Sidebar control menu is open.
 */
export function computeRailLayoutState(input: RailLayoutInput): RailLayoutState {
  if (input.mode === 'expanded') {
    return {
      slotWidthPx: SIDEBAR_EXPANDED_WIDTH_PX,
      panelWidthPx: SIDEBAR_EXPANDED_WIDTH_PX,
      visualExpanded: true,
      isFloatingOverlay: false,
    };
  }

  if (input.mode === 'collapsed') {
    return {
      slotWidthPx: SIDEBAR_COLLAPSED_WIDTH_PX,
      panelWidthPx: SIDEBAR_COLLAPSED_WIDTH_PX,
      visualExpanded: false,
      isFloatingOverlay: false,
    };
  }

  const visualExpanded =
    input.hoverExpanded || input.focusWithin || input.controlMenuOpen || input.touchExpanded;

  return {
    slotWidthPx: SIDEBAR_COLLAPSED_WIDTH_PX,
    panelWidthPx: visualExpanded ? SIDEBAR_EXPANDED_WIDTH_PX : SIDEBAR_COLLAPSED_WIDTH_PX,
    visualExpanded,
    isFloatingOverlay: visualExpanded,
  };
}
