import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, PanelLeft, Settings, X } from 'lucide-react';
import { useLayoutShell } from '../context/LayoutShellContext';
import {
  computeRailLayoutState,
  SIDEBAR_CLOSE_DELAY_MS,
  SIDEBAR_MODE_OPTIONS,
  type SidebarMode,
} from '../utils/sidebarModePreference';

export interface RailNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  active?: boolean;
  badge?: string | number;
  to?: string;
  onClick?: () => void;
  testId?: string;
}

export interface RailNavGroup {
  id: string;
  label?: string;
  items: RailNavItem[];
}

interface ContextualRailProps {
  /** Visible active module label when expanded (e.g. "Overview", "Workspace", "PIN", "Warehouse", "Accounting") */
  moduleLabel: string;
  groups: RailNavGroup[];
  /** Optional top section rendered above nav groups (e.g. Workspace Building areas) */
  topSlot?: (expanded: boolean, closeMobileOnClick: boolean) => React.ReactNode;
  /** Optional lower scrollable slot rendered below nav groups (e.g. Overview Blueprint search/filter/sheet list) */
  bottomSlot?:
    | React.ReactNode
    | ((expanded: boolean, closeMobileOnClick: boolean) => React.ReactNode);
  /** Optional footer actions pinned above Project settings with explicit dividers */
  footerItems?: RailNavItem[];
  /** Present whenever a project is active; stays pinned at the foot of the rail */
  projectSettingsPath?: string;
  projectSettingsActive?: boolean;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return reduced;
}

function isEditableControl(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Shared project contextual navigation rail with three persisted desktop modes:
 * - Expanded: persistent 256 px sidebar reserving full width in document flow.
 * - Collapsed: persistent 52 px icon rail (never hover-expands; shows feature names on hover/focus).
 * - Expand on hover (default): reserves 52 px in flow and floats over the page at 256 px on hover/focus,
 *   keeping every underlying panel completely still.
 *
 * Geometry guarantee (NAV-1):
 * - Every rail row uses the exact same horizontal padding (6 px), fixed 38x38 icon box (centered at x=26 px),
 *   16x16 icon size, and constant vertical label slot height across all modes so icons stay within <= 1 px.
 */
export function ContextualRail({
  moduleLabel,
  groups,
  topSlot,
  bottomSlot,
  footerItems,
  projectSettingsPath,
  projectSettingsActive = false,
}: ContextualRailProps) {
  const { sidebarMode, setSidebarMode, mobileRailOpen, setMobileRailOpen } = useLayoutShell();

  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [touchExpanded, setTouchExpanded] = useState(false);
  const [controlMenuOpen, setControlMenuOpen] = useState(false);

  const asideRef = useRef<HTMLElement | null>(null);
  const controlTriggerRef = useRef<HTMLButtonElement | null>(null);
  const controlMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileCloseRef = useRef<HTMLButtonElement | null>(null);
  const mobileOpenerRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const reducedMotion = usePrefersReducedMotion();

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const layoutState = computeRailLayoutState({
    mode: sidebarMode,
    hoverExpanded,
    focusWithin,
    controlMenuOpen,
    touchExpanded,
  });

  // Close Sidebar control menu / touch-expanded rail on outside pointer down
  useEffect(() => {
    if (!controlMenuOpen && !touchExpanded) return;
    const onPointerDownOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (asideRef.current && asideRef.current.contains(target)) {
        if (
          controlMenuOpen &&
          controlMenuRef.current &&
          !controlMenuRef.current.contains(target) &&
          controlTriggerRef.current &&
          !controlTriggerRef.current.contains(target)
        ) {
          setControlMenuOpen(false);
        }
        return;
      }
      setControlMenuOpen(false);
      setTouchExpanded(false);
      setHoverExpanded(false);
      setFocusWithin(false);
    };
    window.addEventListener('pointerdown', onPointerDownOutside);
    return () => window.removeEventListener('pointerdown', onPointerDownOutside);
  }, [controlMenuOpen, touchExpanded]);

  // Move focus into Sidebar control menu when opened
  useEffect(() => {
    if (!controlMenuOpen) return;
    const raf = window.requestAnimationFrame(() => {
      const activeOption = controlMenuRef.current?.querySelector<HTMLButtonElement>(
        `[data-testid="sidebar-mode-${sidebarMode}"]`
      );
      activeOption?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [controlMenuOpen, sidebarMode]);

  // Mobile drawer Escape handling + focus management
  useEffect(() => {
    if (!mobileRailOpen) return;
    mobileOpenerRef.current =
      (document.activeElement instanceof HTMLElement ? document.activeElement : null) ??
      document.querySelector<HTMLElement>('[data-testid="mobile-rail-trigger"]');

    const raf = window.requestAnimationFrame(() => {
      mobileCloseRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileRailOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      if (mobileOpenerRef.current && mobileOpenerRef.current.isConnected) {
        mobileOpenerRef.current.focus();
      }
    };
  }, [mobileRailOpen, setMobileRailOpen]);

  const scheduleHoverClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setHoverExpanded(false);
      setTouchExpanded(false);
      const activeEl = document.activeElement;
      if (
        !(
          asideRef.current &&
          activeEl &&
          asideRef.current.contains(activeEl) &&
          isEditableControl(activeEl)
        )
      ) {
        setFocusWithin(false);
      }
    }, SIDEBAR_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const handlePointerEnter = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') return;
    clearCloseTimer();
    if (sidebarMode === 'hover') {
      setHoverExpanded(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') return;
    if (closeTimerRef.current !== null) {
      clearCloseTimer();
    }
    if (sidebarMode === 'hover' && !hoverExpanded) {
      setHoverExpanded(true);
    }
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') return;
    if (sidebarMode !== 'hover') return;
    if (controlMenuOpen) return;
    scheduleHoverClose();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' && sidebarMode === 'hover' && !layoutState.visualExpanded) {
      setTouchExpanded(true);
    }
  };

  const handleFocusCapture = (e: React.FocusEvent<HTMLElement>) => {
    clearCloseTimer();
    const target = e.target as HTMLElement | null;
    if (sidebarMode === 'hover' && target && (target.matches(':focus-visible') || isEditableControl(target))) {
      setFocusWithin(true);
    }
  };

  const handleBlurCapture = (e: React.FocusEvent<HTMLElement>) => {
    const nextFocused = e.relatedTarget as Node | null;
    if (asideRef.current && nextFocused && asideRef.current.contains(nextFocused)) {
      return;
    }
    setFocusWithin(false);
    if (sidebarMode === 'hover' && !controlMenuOpen && !asideRef.current?.matches(':hover')) {
      scheduleHoverClose();
    }
  };

  const handleSelectSidebarMode = (nextMode: SidebarMode) => {
    clearCloseTimer();
    setSidebarMode(nextMode);
    setControlMenuOpen(false);
    if (nextMode === 'collapsed') {
      setHoverExpanded(false);
      setFocusWithin(false);
      setTouchExpanded(false);
    } else if (nextMode === 'hover') {
      setTouchExpanded(false);
    }
    window.requestAnimationFrame(() => {
      controlTriggerRef.current?.focus();
    });
  };

  const handleControlMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(
      controlMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
    );
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(idx + 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setControlMenuOpen(false);
      controlTriggerRef.current?.focus();
    }
  };

  const handleRailKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;

    if (controlMenuOpen) {
      e.preventDefault();
      e.stopPropagation();
      setControlMenuOpen(false);
      controlTriggerRef.current?.focus();
      return;
    }

    if (sidebarMode === 'hover' && layoutState.visualExpanded) {
      e.preventDefault();
      e.stopPropagation();
      clearCloseTimer();
      setHoverExpanded(false);
      setFocusWithin(false);
      setTouchExpanded(false);
      if (document.activeElement instanceof HTMLElement && asideRef.current?.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
  };

  const renderCollapsedTooltip = (label: string, badge?: string | number) => (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-[46px] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-[#1B2A4A]/15 bg-[#1B2A4A] px-2.5 py-1 text-[12px] leading-[16px] font-medium text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
      {badge !== undefined ? ` (${badge})` : ''}
    </span>
  );

  const renderItem = (item: RailNavItem, expanded: boolean, closeMobileOnClick: boolean) => {
    const Icon = item.icon;
    const itemClasses = `group relative flex h-10 items-center rounded-lg border text-left text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
      expanded ? 'w-full pr-2.5' : 'w-10'
    } ${
      item.active
        ? 'border-[#D4652F]/40 bg-[#FFF3EB] font-semibold text-[#A64011]'
        : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
    }`;

    const content = (
      <>
        <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center">
          <Icon
            className={`h-4 w-4 shrink-0 ${
              item.active ? 'text-[#D4652F]' : 'text-[#4F5C67] group-hover:text-[#1B2A4A]'
            }`}
            aria-hidden={true}
          />
        </span>
        {expanded ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[12px] leading-[16px] tabular-nums ${
                  item.active
                    ? 'bg-white/80 font-semibold text-[#A64011]'
                    : 'bg-[#F4F3EF] font-medium text-[#4F5C67]'
                }`}
              >
                {item.badge}
              </span>
            )}
          </span>
        ) : (
          renderCollapsedTooltip(item.label, item.badge)
        )}
      </>
    );

    if (item.to) {
      return (
        <Link
          key={item.id}
          to={item.to}
          aria-current={item.active ? 'page' : undefined}
          aria-label={expanded ? undefined : item.label}
          data-testid={item.testId ?? `rail-item-${item.id}`}
          onClick={() => {
            if (closeMobileOnClick) setMobileRailOpen(false);
          }}
          className={itemClasses}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        aria-pressed={item.active}
        aria-label={expanded ? undefined : item.label}
        data-testid={item.testId ?? `rail-item-${item.id}`}
        onClick={() => {
          item.onClick?.();
          if (closeMobileOnClick) setMobileRailOpen(false);
        }}
        className={itemClasses}
      >
        {content}
      </button>
    );
  };

  const renderRailBody = (expanded: boolean, closeMobileOnClick: boolean, showSidebarControl: boolean) => {
    const hasExpandedBottomSlot = Boolean(bottomSlot && (typeof bottomSlot === 'function' || expanded));
    return (
    <>
      <nav
        id={closeMobileOnClick ? 'vonta-mobile-rail-nav' : 'vonta-contextual-rail-nav'}
        aria-label={`${moduleLabel} navigation`}
        className={`flex min-h-0 flex-1 flex-col px-[6px] py-3 ${
          expanded
            ? hasExpandedBottomSlot
              ? 'overflow-hidden'
              : 'overflow-y-auto overflow-x-hidden'
            : 'overflow-visible'
        }`}
      >
        {/* Constant-height module label slot preserves exact vertical icon coordinates across all modes */}
        <div
          data-testid="rail-module-label"
          aria-hidden={!expanded}
          className={`mb-2 flex h-6 shrink-0 items-center overflow-hidden pl-[11px] pr-2 text-[12px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase transition-opacity duration-100 ${
            expanded ? 'opacity-100' : 'pointer-events-none select-none opacity-0'
          }`}
        >
          <span className="truncate">{moduleLabel}</span>
        </div>

        {topSlot && <div className="mb-3 shrink-0">{topSlot(expanded, closeMobileOnClick)}</div>}

        <div className="shrink-0 space-y-3">
          {groups.map((group, gIdx) => (
            <div
              key={group.id}
              className={gIdx > 0 || topSlot ? 'border-t border-[#D9DEE2] pt-3' : undefined}
            >
              {group.label && (
                <div
                  aria-hidden={!expanded}
                  className={`mb-1.5 flex h-5 items-center overflow-hidden pl-[11px] pr-2 text-[12px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase transition-opacity duration-100 ${
                    expanded ? 'opacity-100' : 'pointer-events-none select-none opacity-0'
                  }`}
                >
                  <span className="truncate">{group.label}</span>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {group.items.map((item) => renderItem(item, expanded, closeMobileOnClick))}
              </div>
            </div>
          ))}
        </div>

        {hasExpandedBottomSlot && bottomSlot && (
          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            {typeof bottomSlot === 'function'
              ? bottomSlot(expanded, closeMobileOnClick)
              : bottomSlot}
          </div>
        )}
      </nav>

      {(projectSettingsPath || (footerItems && footerItems.length > 0) || showSidebarControl) && (
        <div
          data-testid="rail-footer-section"
          className="relative shrink-0 divide-y divide-[#D9DEE2] border-t border-[#D9DEE2] bg-white"
        >
          {footerItems?.map((item) => (
            <div key={item.id} className="px-[6px] py-1.5">
              {renderItem(item, expanded, closeMobileOnClick)}
            </div>
          ))}

          {projectSettingsPath && (
            <div className="px-[6px] py-1.5">
              <Link
                to={projectSettingsPath}
                aria-current={projectSettingsActive ? 'page' : undefined}
                aria-label={expanded ? undefined : 'Project settings'}
                data-testid="rail-project-settings"
                onClick={() => {
                  if (closeMobileOnClick) setMobileRailOpen(false);
                }}
                className={`group relative flex h-10 items-center rounded-lg border text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                  expanded ? 'w-full pr-2.5' : 'w-10'
                } ${
                  projectSettingsActive
                    ? 'border-[#D4652F]/40 bg-[#FFF3EB] font-semibold text-[#A64011]'
                    : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                }`}
              >
                <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center">
                  <Settings
                    className={`h-4 w-4 shrink-0 ${
                      projectSettingsActive ? 'text-[#D4652F]' : 'text-[#4F5C67] group-hover:text-[#1B2A4A]'
                    }`}
                    aria-hidden="true"
                  />
                </span>
                {expanded ? (
                  <span className="truncate">Project settings</span>
                ) : (
                  renderCollapsedTooltip('Project settings')
                )}
              </Link>
            </div>
          )}

          {showSidebarControl && (
            <div className="relative px-[6px] py-1.5">
              <button
                ref={controlTriggerRef}
                type="button"
                data-testid="rail-sidebar-control"
                aria-haspopup="menu"
                aria-expanded={controlMenuOpen}
                aria-controls="vonta-sidebar-control-menu"
                aria-label={expanded ? undefined : 'Sidebar control'}
                onClick={() => setControlMenuOpen((prev) => !prev)}
                className={`group relative flex h-10 items-center rounded-lg border text-left text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                  expanded ? 'w-full pr-2.5' : 'w-10'
                } ${
                  controlMenuOpen
                    ? 'border-[#D4652F]/40 bg-[#FFF3EB] font-semibold text-[#A64011]'
                    : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                }`}
              >
                <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center">
                  <PanelLeft
                    className={`h-4 w-4 shrink-0 ${
                      controlMenuOpen ? 'text-[#D4652F]' : 'text-[#4F5C67] group-hover:text-[#1B2A4A]'
                    }`}
                    aria-hidden="true"
                  />
                </span>
                {expanded ? (
                  <span className="truncate">Sidebar control</span>
                ) : (
                  !controlMenuOpen && renderCollapsedTooltip('Sidebar control')
                )}
              </button>

              {controlMenuOpen && (
                <div
                  ref={controlMenuRef}
                  id="vonta-sidebar-control-menu"
                  role="menu"
                  aria-label="Sidebar control"
                  data-testid="sidebar-control-menu"
                  onKeyDown={handleControlMenuKeyDown}
                  className="absolute bottom-[calc(100%+6px)] left-[6px] z-50 w-[224px] rounded-xl border border-[#D9DEE2] bg-white p-1.5 shadow-xl"
                >
                  <div className="px-2.5 py-1.5 text-[11px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase">
                    Sidebar control
                  </div>
                  <div className="space-y-0.5">
                    {SIDEBAR_MODE_OPTIONS.map((option) => {
                      const checked = sidebarMode === option.mode;
                      return (
                        <button
                          key={option.mode}
                          type="button"
                          role="menuitemradio"
                          aria-checked={checked}
                          data-testid={`sidebar-mode-${option.mode}`}
                          onClick={() => handleSelectSidebarMode(option.mode)}
                          className={`flex min-h-[36px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] leading-[20px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE] ${
                            checked
                              ? 'bg-[#FFF3EB] font-semibold text-[#A64011]'
                              : 'font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]'
                          }`}
                        >
                          <span>{option.label}</span>
                          {checked && (
                            <Check className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
    );
  };

  const panelTransitionClass = reducedMotion
    ? 'transition-none'
    : layoutState.visualExpanded
      ? 'transition-[width,box-shadow] duration-[110ms] ease-out'
      : 'transition-[width,box-shadow] duration-[220ms] ease-in-out';

  const slotWidthClass = layoutState.slotWidthPx === 256 ? 'w-[256px]' : 'w-[52px]';
  const panelWidthClass = layoutState.panelWidthPx === 256 ? 'w-[256px]' : 'w-[52px]';
  const panelShadowClass = layoutState.isFloatingOverlay ? 'shadow-xl' : 'shadow-none';

  return (
    <>
      {/* Desktop layout slot: 256 px ONLY in persistent Expanded mode; 52 px in Collapsed and Expand on hover */}
      <div
        data-testid="contextual-rail-slot"
        data-mode={sidebarMode}
        className={`relative hidden shrink-0 md:block ${slotWidthClass}`}
      >
        <aside
          ref={asideRef}
          aria-label={`${moduleLabel} sidebar`}
          data-testid="contextual-rail"
          data-module={moduleLabel}
          data-mode={sidebarMode}
          data-expanded={layoutState.visualExpanded ? 'true' : 'false'}
          data-floating={layoutState.isFloatingOverlay ? 'true' : 'false'}
          data-pinned={sidebarMode === 'expanded' ? 'true' : 'false'}
          onPointerEnter={handlePointerEnter}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onFocusCapture={handleFocusCapture}
          onBlurCapture={handleBlurCapture}
          onKeyDown={handleRailKeyDown}
          className={`fixed left-0 top-[60px] z-30 flex h-[calc(100dvh-60px)] flex-col border-r border-[#D9DEE2] bg-white ${
            layoutState.visualExpanded ? 'overflow-visible' : 'overflow-visible'
          } ${panelTransitionClass} ${panelWidthClass} ${panelShadowClass}`}
        >
          {renderRailBody(layoutState.visualExpanded, false, true)}
        </aside>
      </div>

      {/* Mobile Slide-Over Contextual Rail Drawer (< md) */}
      {mobileRailOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={`${moduleLabel} navigation drawer`}
          data-testid="mobile-contextual-rail-drawer"
        >
          <div
            className="fixed inset-0 bg-[#1B2A4A]/35"
            aria-hidden="true"
            onClick={() => setMobileRailOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[min(280px,86vw)] flex-col border-r border-[#D9DEE2] bg-white shadow-xl">
            <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#D9DEE2] px-4">
              <span className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                {moduleLabel}
              </span>
              <button
                ref={mobileCloseRef}
                type="button"
                onClick={() => setMobileRailOpen(false)}
                aria-label="Close navigation drawer"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {renderRailBody(true, true, false)}
          </aside>
        </div>
      )}
    </>
  );
}
