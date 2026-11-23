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

  if (!expanded) {
    return (
      <div
        data-testid="workspace-sidebar-areas-collapsed"
        className="flex flex-col items-center gap-1.5"
      >
        <button
          type="button"
          onClick={() => handleSelect(activeAreaId === 'all' ? (areas[0]?.id ?? 'all') : 'all')}
          aria-label="Building areas"
          title={`Building areas (${areas.length})`}
          data-testid="sidebar-area-all-collapsed"
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-[#D4652F]/45 bg-[#FFF3EB] text-[#A64011] transition-colors hover:bg-[#FFE8D6]"
        >
          <Layers className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div data-testid="workspace-sidebar-building-areas" className="space-y-1.5">
      <div className="flex items-center justify-between px-2.5">
        <span className="text-[12px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase">
          Building areas
        </span>
        <span className="text-[12px] text-[#4F5C67] tabular-nums">{areas.length}</span>
      </div>

      {/* All areas option */}
      <button
        type="button"
        data-testid="sidebar-area-all"
        aria-pressed={activeAreaId === 'all'}
        onClick={() => handleSelect('all')}
        className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors ${
          activeAreaId === 'all'
            ? 'border-[#D4652F]/40 bg-[#FFF3EB] font-semibold text-[#A64011]'
            : 'border-transparent text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
        }`}
      >
        <span className="inline-flex items-center gap-2 truncate">
          <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">All areas</span>
        </span>
        <span className="shrink-0 rounded bg-[#F4F3EF] px-1.5 py-0.5 text-[11px] tabular-nums text-[#4F5C67]">
          {pins.length}
        </span>
      </button>

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
    </div>
  );
};
