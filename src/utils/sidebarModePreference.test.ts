import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRailLayoutState,
  DEFAULT_SIDEBAR_MODE,
  getSidebarModeStorageKey,
  parseSidebarMode,
  readSidebarMode,
  SIDEBAR_CLOSE_DELAY_MS,
  SIDEBAR_CLOSE_TRANSITION_MS,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_EXPANDED_WIDTH_PX,
  SIDEBAR_MODE_OPTIONS,
  SIDEBAR_OPEN_TRANSITION_MS,
  writeSidebarMode,
} from './sidebarModePreference';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

test('defaults to Expand on hover for a new desktop profile', () => {
  const storage = createMemoryStorage();
  assert.equal(DEFAULT_SIDEBAR_MODE, 'hover');
  assert.equal(readSidebarMode(storage, 'user-a'), 'hover');
  assert.equal(readSidebarMode(null, undefined), 'hover');
});

test('persists sidebar mode independently per user/local profile', () => {
  const storage = createMemoryStorage();
  writeSidebarMode(storage, 'expanded', 'user-1');
  writeSidebarMode(storage, 'collapsed', 'user-2');
  writeSidebarMode(storage, 'hover', null);

  assert.equal(readSidebarMode(storage, 'user-1'), 'expanded');
  assert.equal(readSidebarMode(storage, 'user-2'), 'collapsed');
  assert.equal(readSidebarMode(storage, null), 'hover');
  assert.equal(getSidebarModeStorageKey(null), 'vonta.sidebarMode.v1:local');
});

test('migrates explicit legacy preferences when scoped key is absent', () => {
  assert.equal(readSidebarMode(createMemoryStorage({ 'vonta.railExpanded': 'true' }), 'u1'), 'expanded');
  assert.equal(readSidebarMode(createMemoryStorage({ 'vonta.railExpanded': 'false' }), 'u1'), 'hover');
  assert.equal(readSidebarMode(createMemoryStorage({ 'vonta.sidebar.mode': 'collapsed' }), 'u1'), 'collapsed');
  assert.equal(parseSidebarMode('expand-on-hover'), 'hover');
  assert.equal(parseSidebarMode('invalid-value'), null);
});

test('scoped user preference takes precedence over legacy keys', () => {
  const storage = createMemoryStorage({
    'vonta.railExpanded': 'true',
    [getSidebarModeStorageKey('u1')]: 'collapsed',
  });
  assert.equal(readSidebarMode(storage, 'u1'), 'collapsed');
});

test('computeRailLayoutState enforces three sidebar mode geometry contracts', () => {
  // 1. Expanded: reserves full 256px slot width and is not a floating overlay
  assert.deepEqual(
    computeRailLayoutState({
      mode: 'expanded',
      hoverExpanded: false,
      focusWithin: false,
      controlMenuOpen: false,
      touchExpanded: false,
    }),
    {
      slotWidthPx: SIDEBAR_EXPANDED_WIDTH_PX,
      panelWidthPx: SIDEBAR_EXPANDED_WIDTH_PX,
      visualExpanded: true,
      isFloatingOverlay: false,
    }
  );

  // 2. Collapsed: stays 52px even when hovered or focused
  assert.deepEqual(
    computeRailLayoutState({
      mode: 'collapsed',
      hoverExpanded: true,
      focusWithin: true,
      controlMenuOpen: true,
      touchExpanded: true,
    }),
    {
      slotWidthPx: SIDEBAR_COLLAPSED_WIDTH_PX,
      panelWidthPx: SIDEBAR_COLLAPSED_WIDTH_PX,
      visualExpanded: false,
      isFloatingOverlay: false,
    }
  );

  // 3. Expand on hover (resting): reserves 52px slot, panel 52px
  assert.deepEqual(
    computeRailLayoutState({
      mode: 'hover',
      hoverExpanded: false,
      focusWithin: false,
      controlMenuOpen: false,
      touchExpanded: false,
    }),
    {
      slotWidthPx: SIDEBAR_COLLAPSED_WIDTH_PX,
      panelWidthPx: SIDEBAR_COLLAPSED_WIDTH_PX,
      visualExpanded: false,
      isFloatingOverlay: false,
    }
  );

  // 4. Expand on hover (hovered / focused / menu open): reserves 52px slot, floats at 256px
  for (const activeFlag of ['hoverExpanded', 'focusWithin', 'controlMenuOpen', 'touchExpanded'] as const) {
    assert.deepEqual(
      computeRailLayoutState({
        mode: 'hover',
        hoverExpanded: activeFlag === 'hoverExpanded',
        focusWithin: activeFlag === 'focusWithin',
        controlMenuOpen: activeFlag === 'controlMenuOpen',
        touchExpanded: activeFlag === 'touchExpanded',
      }),
      {
        slotWidthPx: SIDEBAR_COLLAPSED_WIDTH_PX,
        panelWidthPx: SIDEBAR_EXPANDED_WIDTH_PX,
        visualExpanded: true,
        isFloatingOverlay: true,
      }
    );
  }
});

test('timing constants use faster open, slower close, and 280 ms close delay', () => {
  assert.ok(SIDEBAR_OPEN_TRANSITION_MS < SIDEBAR_CLOSE_TRANSITION_MS);
  assert.equal(SIDEBAR_CLOSE_DELAY_MS, 280);
  assert.deepEqual(
    SIDEBAR_MODE_OPTIONS.map((o) => o.label),
    ['Expanded', 'Collapsed', 'Expand on hover']
  );
});
