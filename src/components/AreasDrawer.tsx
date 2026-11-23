import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  X,
} from 'lucide-react';
import type { AreaDefinition, SpatialPin } from '../domain/types';
import { resolveAllAreasDisplayMode } from '../domain/demoStore';

interface AreasDrawerProps {
  areas: AreaDefinition[];
  pins: SpatialPin[];
  roomCountByArea: Record<string, number>;
  activeAreaId: string; // specific area id or 'all'
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectArea: (areaId: string) => void;
  settingsPath: string;
  canAddArea?: boolean;
  onAddAreaClick?: () => void;
}

/**
 * Full-height left Blueprint management navigation rail.
 * - Desktop (md+): stays docked below the top header as a collapsed 56 px rail; clicking the
 *   toggle expands a docked 264 px sidebar and resizes the sibling 3D canvas cleanly.
 * - Mobile (< md): opens a full-height left navigation drawer over the viewport.
 * - Includes "All areas", large named area rows from actual records, "Add area" for authorized
 *   users, and "Project settings" pinned to the bottom outside the scrolling list.
 * - Opening/closing preserves camera, selected Pin, pending edits, and active area selection.
 */
export function AreasDrawer({
  areas,
  pins,
  roomCountByArea,
  activeAreaId,
  open,
  onOpenChange,
  onSelectArea,
  settingsPath,
  canAddArea = true,
  onAddAreaClick,
}: AreasDrawerProps) {
  const desktopToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileCloseRef = useRef<HTMLButtonElement | null>(null);
  const [showAddNotice, setShowAddNotice] = useState(false);

  const allAreasMode = resolveAllAreasDisplayMode(areas);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        setShowAddNotice(false);
        window.requestAnimationFrame(() => {
          desktopToggleRef.current?.focus();
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const renderSidebarBody = (closeOnSelect: boolean) => (
    <>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {/* All Areas Row */}
        <button
          type="button"
          onClick={() => {
            onSelectArea('all');
            if (closeOnSelect) onOpenChange(false);
          }}
          aria-pressed={activeAreaId === 'all'}
          className={`w-full rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
            activeAreaId === 'all'
              ? 'border-[#D4652F] bg-[#D4652F]/8'
              : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] leading-[22px] font-semibold text-[#1B2A4A]">
              All areas
            </span>
            {activeAreaId === 'all' && (
              <Check className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
            )}
          </div>
          <div className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
            {areas.length} {areas.length === 1 ? 'area' : 'areas'} · {pins.length}{' '}
            {pins.length === 1 ? 'Pin' : 'Pins'}
          </div>
          {allAreasMode.mode === 'separate_unverified_previews' && (
            <div className="mt-1.5 text-[13px] leading-[18px] font-medium text-[#A64011]">
              Placement not verified — separate previews shown
            </div>
          )}
        </button>

        <div className="px-1 pt-2 text-[13px] leading-[18px] font-medium text-[#4F5C67]">
          Areas
        </div>

        <ul className="space-y-2">
          {areas.map((area) => {
            const isSelected = activeAreaId === area.id;
            const areaPinCount = pins.filter((p) => p.areaId === area.id).length;
            const areaRoomCount = roomCountByArea[area.id] ?? 0;

            return (
              <li key={area.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectArea(area.id);
                    if (closeOnSelect) onOpenChange(false);
                  }}
                  aria-pressed={isSelected}
                  className={`w-full rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                    isSelected
                      ? 'border-[#D4652F] bg-[#D4652F]/8'
                      : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[15px] leading-[22px] font-semibold text-[#1B2A4A]">
                      {area.name}
                    </span>
                    {isSelected && (
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#D4652F]"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                    {area.sheetLabel}
                  </div>
                  <div className="mt-1 text-[13px] leading-[18px]">
                    <span className="font-medium text-[#1B2A4A]">{area.modelStatus}</span>
                  </div>
                  {!area.isRegisteredInCommonFrame && (
                    <div className="mt-1 text-[13px] leading-[18px] font-medium text-[#A64011]">
                      Placement not verified
                    </div>
                  )}
                  <div className="mt-1.5 text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
                    {areaRoomCount} {areaRoomCount === 1 ? 'room' : 'rooms'} · {areaPinCount}{' '}
                    {areaPinCount === 1 ? 'Pin' : 'Pins'}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {canAddArea && (
          <div className="pt-1">
            <button
              type="button"
              data-testid="areas-add-area-btn"
              onClick={() => {
                if (onAddAreaClick) {
                  onAddAreaClick();
                  if (closeOnSelect) onOpenChange(false);
                } else {
                  setShowAddNotice((v) => !v);
                }
              }}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#D9DEE2] bg-white px-3 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:border-[#A64011] hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              <Plus className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
              Add area
            </button>

            {!onAddAreaClick && showAddNotice && (
              <div
                role="status"
                className="mt-2 rounded-xl border border-[#D4652F]/40 bg-[#F4F3EF]/80 p-3 text-[13px] leading-[18px] text-[#1B2A4A]"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]"
                    aria-hidden="true"
                  />
                  <div>
                    <div className="font-semibold">Temporarily unavailable</div>
                    <p className="mt-0.5 text-[#4F5C67]">
                      Uploading additional area blueprints is not yet enabled in this preview.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pinned bottom footer — outside scrolling area list */}
      <div className="shrink-0 border-t border-[#D9DEE2] bg-white p-3">
        <Link
          to={settingsPath}
          data-testid="rail-project-settings"
          className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 px-3 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
        >
          <Settings className="h-4 w-4 shrink-0 text-[#4F5C67]" aria-hidden="true" />
          <span>Project settings</span>
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Docked Full-Height Left Navigation Rail (collapsed 56 px / expanded 264 px) */}
      <aside
        aria-label="Blueprint management"
        data-testid="blueprint-rail"
        data-expanded={open ? 'true' : 'false'}
        className={`hidden h-full shrink-0 flex-col border-r border-[#D9DEE2] bg-white transition-[width] duration-200 md:flex ${
          open ? 'w-[264px]' : 'w-14'
        }`}
      >
        {/* Rail Header & Collapse/Expand Toggle */}
        <div
          className={`flex h-12 shrink-0 items-center border-b border-[#D9DEE2] ${
            open ? 'justify-between px-3' : 'justify-center px-1'
          }`}
        >
          {open && (
            <h2
              id="blueprint-rail-heading"
              className="truncate text-[15px] leading-[22px] font-semibold text-[#1B2A4A]"
            >
              Blueprint management
            </h2>
          )}
          <button
            ref={desktopToggleRef}
            type="button"
            onClick={() => {
              onOpenChange(!open);
              if (open) setShowAddNotice(false);
            }}
            aria-expanded={open}
            aria-controls="blueprint-rail-content"
            aria-label={
              open ? 'Collapse Blueprint management sidebar' : 'Expand Blueprint management sidebar'
            }
            title={open ? 'Collapse Blueprint management' : 'Blueprint management'}
            data-testid="areas-trigger-button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
          >
            {open ? (
              <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        {open ? (
          <div id="blueprint-rail-content" className="flex min-h-0 flex-1 flex-col">
            {renderSidebarBody(false)}
          </div>
        ) : (
          /* Collapsed Desktop Rail Icons (always visible) */
          <div className="flex flex-1 flex-col items-center justify-between py-3">
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              aria-label="Open Blueprint management areas"
              title="Areas"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D4652F]/40 bg-[#D4652F]/8 text-[#1B2A4A] transition-colors hover:bg-[#D4652F]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              <Layers className="h-4 w-4 text-[#D4652F]" aria-hidden="true" />
            </button>

            <Link
              to={settingsPath}
              aria-label="Project settings"
              title="Project settings"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#4F5C67] transition-colors hover:bg-[#F4F3EF] hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </aside>

      {/* Mobile Full-Height Left Navigation Drawer (< md) */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-blueprint-rail-heading"
          data-testid="mobile-blueprint-drawer"
        >
          <div
            className="fixed inset-0 bg-[#1B2A4A]/30"
            aria-hidden="true"
            onClick={() => {
              onOpenChange(false);
              setShowAddNotice(false);
            }}
          />
          <aside className="relative z-10 flex h-full w-[min(280px,85vw)] flex-col border-r border-[#D9DEE2] bg-white shadow-xl">
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#D9DEE2] px-4">
              <h2
                id="mobile-blueprint-rail-heading"
                className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
              >
                Blueprint management
              </h2>
              <button
                ref={mobileCloseRef}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setShowAddNotice(false);
                }}
                aria-label="Close Blueprint management"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{renderSidebarBody(true)}</div>
          </aside>
        </div>
      )}
    </>
  );
}
