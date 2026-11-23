import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Layers, Plus, X } from 'lucide-react';
import type { AreaDefinition, SpatialPin } from '../domain/types';
import { resolveAllAreasDisplayMode } from '../domain/demoStore';

interface AreaSelectorPopoverProps {
  areas: AreaDefinition[];
  pins: SpatialPin[];
  roomCountByArea: Record<string, number>;
  activeAreaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectArea: (areaId: string) => void;
  canAddArea?: boolean;
  onAddAreaClick?: () => void;
  subtitle?: string;
}

/**
 * In-viewer building Area selector (Layout System Figure 9).
 * Placed inside the Spatial Workspace viewport at upper left.
 * Shows current area name when closed; opens to All areas, scrollable large area rows,
 * and authorized Add area action. Dismissing preserves camera and Pin selection.
 */
export function AreaSelectorPopover({
  areas,
  pins,
  roomCountByArea,
  activeAreaId,
  open,
  onOpenChange,
  onSelectArea,
  canAddArea = true,
  onAddAreaClick,
  subtitle,
}: AreaSelectorPopoverProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [showAddNotice, setShowAddNotice] = useState(false);

  const allAreasMode = resolveAllAreasDisplayMode(areas);
  const activeAreaName =
    activeAreaId === 'all'
      ? 'All areas'
      : areas.find((a) => a.id === activeAreaId)?.name ?? areas[0]?.name ?? 'Area';

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        setShowAddNotice(false);
        window.requestAnimationFrame(() => {
          triggerRef.current?.focus();
        });
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
        setShowAddNotice(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="workspace-area-selector-popover"
        data-testid="workspace-area-selector"
        className={`inline-flex min-h-[44px] max-w-[min(320px,calc(100vw-24px))] items-center gap-2 rounded-xl border bg-white/95 px-3.5 py-2 text-left shadow-sm backdrop-blur transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] md:min-h-[40px] ${
          open
            ? 'border-[#D4652F] ring-1 ring-[#D4652F]/25'
            : 'border-[#D9DEE2] hover:border-[#1B2A4A]/40 hover:bg-white'
        }`}
      >
        <Layers className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
            {activeAreaName}
          </span>
          {subtitle && (
            <span className="hidden truncate text-[12px] leading-[16px] text-[#4F5C67] sm:block">
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#4F5C67] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="workspace-area-selector-popover"
          role="dialog"
          aria-label="Select building area"
          data-testid="workspace-area-popover"
          className="absolute left-0 top-full z-30 mt-2 flex max-h-[min(460px,calc(100dvh-160px))] w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-[#D9DEE2] bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-[#D9DEE2] px-3.5 py-2.5">
            <span className="text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
              Building areas
            </span>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setShowAddNotice(false);
                window.requestAnimationFrame(() => triggerRef.current?.focus());
              }}
              aria-label="Close area selector"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {/* All areas row */}
            <button
              type="button"
              onClick={() => {
                onSelectArea('all');
                onOpenChange(false);
              }}
              aria-pressed={activeAreaId === 'all'}
              data-testid="area-option-all"
              className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                activeAreaId === 'all'
                  ? 'border-[#D4652F] bg-[#FFF3EB]'
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
                <div className="mt-1 text-[12px] leading-[16px] font-medium text-[#A64011]">
                  Placement not verified — separate previews shown
                </div>
              )}
            </button>

            {/* Named areas */}
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
                        onOpenChange(false);
                      }}
                      aria-pressed={isSelected}
                      data-testid={`area-option-${area.id}`}
                      className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                        isSelected
                          ? 'border-[#D4652F] bg-[#FFF3EB]'
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
                      <div className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                        {area.sheetLabel}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[12px] leading-[16px] text-[#4F5C67] tabular-nums">
                        <span className="font-medium text-[#1B2A4A]">{area.modelStatus}</span>
                        <span>
                          {areaRoomCount} {areaRoomCount === 1 ? 'room' : 'rooms'} · {areaPinCount}{' '}
                          {areaPinCount === 1 ? 'Pin' : 'Pins'}
                        </span>
                      </div>
                      {!area.isRegisteredInCommonFrame && (
                        <div className="mt-1 text-[12px] font-medium text-[#A64011]">
                          Placement not verified
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {canAddArea && (
            <div className="shrink-0 border-t border-[#D9DEE2] bg-white p-2.5">
              <button
                type="button"
                data-testid="areas-add-area-btn"
                onClick={() => {
                  if (onAddAreaClick) {
                    onOpenChange(false);
                    onAddAreaClick();
                  } else {
                    setShowAddNotice((v) => !v);
                  }
                }}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#D9DEE2] bg-white px-3 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:border-[#A64011] hover:bg-[#F4F3EF] md:min-h-[40px]"
              >
                <Plus className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
                Add area
              </button>

              {!onAddAreaClick && showAddNotice && (
                <div
                  role="status"
                  className="mt-2 rounded-lg border border-[#D4652F]/40 bg-[#F4F3EF]/80 p-2.5 text-[13px] leading-[18px] text-[#1B2A4A]"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]"
                      aria-hidden="true"
                    />
                    <span>
                      Additional area blueprint uploads are available in signed-in projects.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
