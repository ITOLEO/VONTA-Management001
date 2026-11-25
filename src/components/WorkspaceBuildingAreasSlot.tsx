import React from 'react';
import { Layers, Plus } from 'lucide-react';
import type { AreaDefinition, SpatialPin } from '../domain/types';

export interface WorkspaceBuildingAreasSlotProps {
  expanded: boolean;
  closeMobileOnClick: boolean;
  onCloseMobile?: () => void;
  areas: AreaDefinition[];
  pins: SpatialPin[];
  roomCountByArea: Record<string, number>;
  activeAreaId: string;
  onSelectArea: (areaId: string) => void;
  canAddArea?: boolean;
  onAddAreaClick?: () => void;
}

/**
 * L02: Building areas placed at the top of the Workspace sidebar
 * (All areas, selectable area rows, and authorized Add area action).
 * Uses the exact same 38x38 icon box and left alignment in collapsed and expanded states
 * so the Layers icon does not shift across hover/expanded/collapsed transitions.
 */
export const WorkspaceBuildingAreasSlot: React.FC<WorkspaceBuildingAreasSlotProps> = ({
  expanded,
  closeMobileOnClick,
  onCloseMobile,
  areas,
  pins,
  roomCountByArea,
  activeAreaId,
  onSelectArea,
  canAddArea = false,
  onAddAreaClick,
}) => {
  const handleSelect = (id: string) => {
    onSelectArea(id);
    if (closeMobileOnClick) onCloseMobile?.();
  };

  const allAreasActive = activeAreaId === 'all';

  return (
    <div
      data-testid={
        expanded ? 'workspace-sidebar-building-areas' : 'workspace-sidebar-areas-collapsed'
      }
      className="space-y-1.5"
    >
      {/* Primary All areas button anchored at exact same (x, y) in both collapsed and expanded states */}
      <button
        type="button"
        data-testid={expanded ? 'sidebar-area-all' : 'sidebar-area-all-collapsed'}
        aria-pressed={allAreasActive}
        aria-label={expanded ? undefined : `Building areas (${areas.length})`}
        onClick={() =>
          expanded
            ? handleSelect('all')
            : handleSelect(allAreasActive ? (areas[0]?.id ?? 'all') : 'all')
        }
        className={`group relative flex h-10 items-center rounded-lg border text-left text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
          expanded ? 'w-full pr-2.5' : 'w-10'
        } ${
          allAreasActive || !expanded
            ? 'border-[#D4652F]/40 bg-[#FFF3EB] font-semibold text-[#A64011]'
            : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
        }`}
      >
        <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center">
          <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
        </span>
        {expanded ? (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden">
            <span className="truncate">All areas</span>
            <span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 text-[12px] leading-[16px] tabular-nums text-[#4F5C67]">
              {pins.length}
            </span>
          </span>
        ) : (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-[46px] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-[#1B2A4A]/15 bg-[#1B2A4A] px-2.5 py-1 text-[12px] leading-[16px] font-medium text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            Building areas ({areas.length})
          </span>
        )}
      </button>

      {expanded && (
        <>
          <div className="flex items-center justify-between pl-[11px] pr-2 pt-1">
            <span className="text-[12px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase">
              Building areas
            </span>
            <span className="text-[12px] text-[#4F5C67] tabular-nums">{areas.length}</span>
          </div>

          {/* Individual area rows */}
          <div className="space-y-1">
            {areas.map((area) => {
              const active = activeAreaId === area.id;
              const pinCount = pins.filter((p) => p.areaId === area.id).length;
              const roomCount = roomCountByArea[area.id] ?? 0;
              return (
                <button
                  key={area.id}
                  type="button"
                  data-testid={`sidebar-area-${area.id}`}
                  aria-pressed={active}
                  onClick={() => handleSelect(area.id)}
                  className={`flex w-full flex-col rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    active
                      ? 'border-[#D4652F]/40 bg-[#FFF3EB] text-[#1B2A4A]'
                      : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-[13px] ${
                        active ? 'font-semibold text-[#A64011]' : 'font-medium text-[#1B2A4A]'
                      }`}
                    >
                      {area.name}
                    </span>
                    <span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 text-[11px] tabular-nums text-[#4F5C67]">
                      {pinCount}
                    </span>
                  </div>
                  <span className="mt-0.5 truncate text-[12px] text-[#4F5C67]">
                    {roomCount} room{roomCount === 1 ? '' : 's'} · {area.modelStatus}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Authorized Add area action */}
          {canAddArea && onAddAreaClick && (
            <button
              type="button"
              data-testid="sidebar-add-area-btn"
              onClick={() => {
                onAddAreaClick();
                if (closeMobileOnClick) onCloseMobile?.();
              }}
              className="mt-1 flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#D4652F]/60 bg-[#FFF8F4] px-2.5 py-1.5 text-[13px] font-semibold text-[#A64011] hover:bg-[#FFF0E6]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add area</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};
