import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Settings, X } from 'lucide-react';
import { useLayoutShell } from '../context/LayoutShellContext';

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

const HOVER_CLOSE_DELAY_MS = 280;

function isFinePointerDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(pointer: fine)').matches;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Shared floating overlay left contextual navigation rail (Field Operations Revision):
 * - Desktop (md+): reserves ONLY 52 px in normal document flow so expanding/collapsing
 *   NEVER reflows 3D viewports, charts, or tables.
 * - Expands as a floating overlay panel (248 px) with faster open (~120 ms) and slower
 *   close (~280 ms delay + ~220 ms close transition) on fine-pointer hover.
 * - Click / Enter / Space on toggle button pins/unpins persistent expansion.
 * - Stays open while pointer or keyboard focus is inside (including Search/Filter controls).
 * - Escape closes the expanded/hover rail and returns focus cleanly.
 * - Mobile (< md): opens as an accessible full-height slide-over drawer.
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
  const { railExpanded, setRailExpanded, toggleRailExpanded, mobileRailOpen, setMobileRailOpen } =
    useLayoutShell();

  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  const asideRef = useRef<HTMLElement | null>(null);
  const toggleBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileCloseRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const isOverlayExpanded = railExpanded || hoverExpanded || focusWithin;
  const reducedMotion = prefersReducedMotion();

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!mobileRailOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileRailOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileRailOpen, setMobileRailOpen]);

  const handlePointerEnter = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' || !isFinePointerDevice()) return;
    clearCloseTimer();
    setHoverExpanded(true);
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' || !isFinePointerDevice()) return;
    if (railExpanded) return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      const activeEl = document.activeElement;
      if (asideRef.current && activeEl && asideRef.current.contains(activeEl)) {
        return;
      }
      setHoverExpanded(false);
    }, HOVER_CLOSE_DELAY_MS);
  };

  const handleFocusCapture = () => {
    clearCloseTimer();
    setFocusWithin(true);
  };

  const handleBlurCapture = (e: React.FocusEvent<HTMLElement>) => {
    const nextFocused = e.relatedTarget as Node | null;
    if (asideRef.current && nextFocused && asideRef.current.contains(nextFocused)) {
      return;
    }
    setFocusWithin(false);
    if (!railExpanded) {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setHoverExpanded(false);
      }, HOVER_CLOSE_DELAY_MS);
    }
  };

  const handleRailKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && isOverlayExpanded) {
      e.preventDefault();
      e.stopPropagation();
      clearCloseTimer();
      setHoverExpanded(false);
      setFocusWithin(false);
      if (railExpanded) {
        setRailExpanded(false);
      }
      window.requestAnimationFrame(() => {
        toggleBtnRef.current?.focus();
      });
    }
  };

  const renderItem = (item: RailNavItem, expanded: boolean, closeMobileOnClick: boolean) => {
    const Icon = item.icon;
    const baseClasses = expanded
      ? `group flex min-h-[40px] w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
          item.active
            ? 'border-[#D4652F]/35 bg-[#FFF3EB] font-semibold text-[#A64011]'
            : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
        }`
      : `group relative mx-auto flex h-10 w-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
          item.active
            ? 'border-[#D4652F]/45 bg-[#FFF3EB] text-[#A64011]'
            : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
        }`;

    const content = (
      <>
        <Icon
          className={`h-4 w-4 shrink-0 ${
            item.active ? 'text-[#D4652F]' : 'text-[#4F5C67] group-hover:text-[#1B2A4A]'
          }`}
          aria-hidden={true}
        />
        {expanded && (
          <>
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
          </>
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
          title={expanded ? undefined : item.label}
          data-testid={item.testId ?? `rail-item-${item.id}`}
          onClick={() => {
            if (closeMobileOnClick) setMobileRailOpen(false);
          }}
          className={baseClasses}
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
        title={expanded ? undefined : item.label}
        data-testid={item.testId ?? `rail-item-${item.id}`}
        onClick={() => {
          item.onClick?.();
          if (closeMobileOnClick) setMobileRailOpen(false);
        }}
        className={baseClasses}
      >
        {content}
      </button>
    );
  };

  const renderRailBody = (expanded: boolean, closeMobileOnClick: boolean) => (
    <>
      <nav
        id={closeMobileOnClick ? 'vonta-mobile-rail-nav' : 'vonta-contextual-rail-nav'}
        aria-label={`${moduleLabel} navigation`}
        className={`flex-1 overflow-y-auto ${expanded ? 'px-2.5 py-3' : 'px-1 py-3'}`}
      >
        {expanded && (
          <div
            data-testid="rail-module-label"
            className="mb-2 px-2.5 text-[12px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase"
          >
            {moduleLabel}
          </div>
        )}

        {topSlot && <div className="mb-3">{topSlot(expanded, closeMobileOnClick)}</div>}

        <div className="space-y-3">
          {groups.map((group, gIdx) => (
            <div
              key={group.id}
              className={gIdx > 0 || topSlot ? 'border-t border-[#D9DEE2] pt-3' : undefined}
            >
              {expanded && group.label && (
                <div className="mb-1.5 px-2.5 text-[12px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase">
                  {group.label}
                </div>
              )}
              <div className={expanded ? 'space-y-1' : 'flex flex-col items-center gap-1.5'}>
                {group.items.map((item) => renderItem(item, expanded, closeMobileOnClick))}
              </div>
            </div>
          ))}
        </div>

        {bottomSlot && (typeof bottomSlot === 'function' || expanded) && (
          <div className={expanded ? 'mt-3' : 'mt-2'}>
            {typeof bottomSlot === 'function'
              ? bottomSlot(expanded, closeMobileOnClick)
              : bottomSlot}
          </div>
        )}
      </nav>

      {(projectSettingsPath || (footerItems && footerItems.length > 0)) && (
        <div
          data-testid="rail-footer-section"
          className="shrink-0 divide-y divide-[#D9DEE2] border-t border-[#D9DEE2] bg-white"
        >
          {footerItems?.map((item) => (
            <div key={item.id} className="p-2">
              {renderItem(item, expanded, closeMobileOnClick)}
            </div>
          ))}

          {projectSettingsPath && (
            <div className="p-2">
              <Link
                to={projectSettingsPath}
                aria-current={projectSettingsActive ? 'page' : undefined}
                aria-label={expanded ? undefined : 'Project settings'}
                title={expanded ? undefined : 'Project settings'}
                data-testid="rail-project-settings"
                onClick={() => {
                  if (closeMobileOnClick) setMobileRailOpen(false);
                }}
                className={
                  expanded
                    ? `flex min-h-[40px] w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                        projectSettingsActive
                          ? 'border-[#D4652F]/35 bg-[#FFF3EB] font-semibold text-[#A64011]'
                          : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                      }`
                    : `mx-auto flex h-10 w-10 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                        projectSettingsActive
                          ? 'border-[#D4652F]/45 bg-[#FFF3EB] text-[#A64011]'
                          : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                      }`
                }
              >
                <Settings
                  className={`h-4 w-4 shrink-0 ${projectSettingsActive ? 'text-[#D4652F]' : ''}`}
                  aria-hidden="true"
                />
                {expanded && <span className="truncate">Project settings</span>}
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );

  const panelTransitionClass = reducedMotion
    ? 'transition-none'
    : isOverlayExpanded
      ? 'transition-[width,box-shadow] duration-[120ms] ease-out'
      : 'transition-[width,box-shadow] duration-[220ms] ease-in';

  return (
    <>
      {/* Fixed 52 px layout slot in desktop flow -> ZERO content reflow when rail floats open */}
      <div
        data-testid="contextual-rail-slot"
        className="relative hidden w-[52px] shrink-0 md:block"
      >
        <aside
          ref={asideRef}
          aria-label={`${moduleLabel} sidebar`}
          data-testid="contextual-rail"
          data-module={moduleLabel}
          data-expanded={isOverlayExpanded ? 'true' : 'false'}
          data-pinned={railExpanded ? 'true' : 'false'}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onFocusCapture={handleFocusCapture}
          onBlurCapture={handleBlurCapture}
          onKeyDown={handleRailKeyDown}
          className={`fixed left-0 top-[60px] z-30 flex h-[calc(100dvh-60px)] flex-col border-r border-[#D9DEE2] bg-white ${panelTransitionClass} ${
            isOverlayExpanded ? 'w-[256px] shadow-xl' : 'w-[52px] shadow-none'
          }`}
        >
          {renderRailBody(isOverlayExpanded, false)}

          {/* Middle-right edge toggle handle for click / touch / keyboard pinning */}
          <button
            ref={toggleBtnRef}
            type="button"
            onClick={() => {
              clearCloseTimer();
              if (railExpanded) {
                setRailExpanded(false);
                setHoverExpanded(false);
              } else {
                toggleRailExpanded();
              }
            }}
            aria-expanded={isOverlayExpanded}
            aria-controls="vonta-contextual-rail-nav"
            aria-label={isOverlayExpanded ? 'Collapse navigation rail' : 'Expand navigation rail'}
            title={railExpanded ? 'Unpin and collapse sidebar' : 'Pin sidebar open'}
            data-testid="contextual-rail-toggle"
            className="absolute left-full top-1/2 z-30 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-[#D9DEE2] bg-white text-[#4F5C67] shadow-sm transition-colors hover:bg-[#F4F3EF] hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
          >
            {isOverlayExpanded ? (
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </button>
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
            {renderRailBody(true, true)}
          </aside>
        </div>
      )}
    </>
  );
}
