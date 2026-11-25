import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronUp, Eye, EyeOff, Filter, Search, X } from 'lucide-react';
import type { ProjectDepartment } from '../domain/departmentCatalog';
import type { SpatialPin } from '../domain/types';
import { resolvePinColorHex } from '../domain/attendanceEngine';

export interface DepartmentPickerProps {
  departments: ProjectDepartment[];
  pins: SpatialPin[];
  activeDepartmentName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDepartment: (departmentName: string | null) => void;
  showPinMarkers?: boolean;
  onTogglePinMarkers?: () => void;
  isAllPinsClear?: boolean;
  onResetAllPins?: () => void;
  activeRoomName?: string | null;
}

/**
 * Upward "Pin filters" popover matching RoomsPicker behavior.
 * Controls Pin department filtering, Pin marker visibility, and explicit "All pins" reset
 * (which clears department, room scope, and Pin selection while preserving 3D geometry layers).
 */
export const DepartmentPicker: React.FC<DepartmentPickerProps> = ({
  departments,
  pins,
  activeDepartmentName,
  open,
  onOpenChange,
  onSelectDepartment,
  showPinMarkers = true,
  onTogglePinMarkers,
  isAllPinsClear,
  onResetAllPins,
  activeRoomName = null,
}) => {
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const allPinsBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevOpenRef = useRef(false);

  const pinCountByDept = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of pins) {
      const key = p.department.toLowerCase();
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [pins]);

  const activeDept = useMemo(
    () =>
      activeDepartmentName
        ? departments.find((d) => d.name.toLowerCase() === activeDepartmentName.toLowerCase()) ??
          null
        : null,
    [departments, activeDepartmentName]
  );

  const filteredDepartments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => d.name.toLowerCase().includes(q));
  }, [departments, query]);

  const allPinsClearState =
    isAllPinsClear !== undefined
      ? isAllPinsClear
      : !activeDepartmentName && !activeRoomName && showPinMarkers;

  const hasActiveFilterHighlight = Boolean(activeDepartmentName || !showPinMarkers);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen) {
      setQuery('');
      const raf = window.requestAnimationFrame(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus({ preventScroll: true });
        } else {
          allPinsBtnRef.current?.focus({ preventScroll: true });
        }
      });
      return () => window.cancelAnimationFrame(raf);
    }
    if (!open && wasOpen) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open, onOpenChange]);

  const handleAllPinsClick = () => {
    if (onResetAllPins) {
      onResetAllPins();
    } else {
      onSelectDepartment(null);
    }
    onOpenChange(false);
  };

  const handleSelectDept = (deptName: string) => {
    onSelectDepartment(deptName);
    onOpenChange(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="pin-filters-trigger"
        data-active-department={activeDepartmentName ?? ''}
        data-pins-visible={showPinMarkers ? 'true' : 'false'}
        className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[13px] leading-[18px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] md:min-h-[36px] ${
          open || hasActiveFilterHighlight
            ? 'bg-[#1B2A4A] text-white'
            : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
        }`}
      >
        {activeDept ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/50"
            style={{ backgroundColor: resolvePinColorHex(activeDept.defaultPinColor) }}
            aria-hidden="true"
          />
        ) : (
          <Filter
            className={`h-3.5 w-3.5 shrink-0 ${
              open || hasActiveFilterHighlight ? 'text-white' : 'text-[#4F5C67]'
            }`}
            aria-hidden="true"
          />
        )}
        <span className="max-w-[140px] truncate">
          {activeDept
            ? activeDept.name
            : activeDepartmentName
              ? activeDepartmentName
              : !showPinMarkers
                ? 'Pins hidden'
                : 'Pin filters'}
        </span>
        {activeDepartmentName && !showPinMarkers && (
          <span className="rounded bg-white/20 px-1 py-0.5 text-[10px] font-semibold">
            Hidden
          </span>
        )}
        <ChevronUp
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pin filters"
          data-testid="pin-filters-popover"
          className="absolute bottom-full left-0 z-40 mb-2 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[#D9DEE2] bg-white shadow-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#D9DEE2] px-3.5 py-2.5">
            <div>
              <div className="text-[13px] font-semibold text-[#1B2A4A]">Pin filters</div>
              <div className="text-[11px] text-[#4F5C67]">
                Department & marker visibility · keeps 3D layers
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close Pin filters"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Pin markers visibility toggle */}
          {onTogglePinMarkers && (
            <div className="border-b border-[#ECEAE4] px-3 py-2">
              <button
                type="button"
                role="switch"
                aria-checked={showPinMarkers}
                data-testid="pin-filters-markers-toggle"
                onClick={onTogglePinMarkers}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE]"
              >
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[#1B2A4A]">
                  {showPinMarkers ? (
                    <Eye className="h-3.5 w-3.5 text-[#1B2A4A]" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-[#4F5C67]" aria-hidden="true" />
                  )}
                  <span>Show Pin markers</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    showPinMarkers ? 'bg-[#1B2A4A]' : 'bg-[#D9DEE2]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                      showPinMarkers ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </span>
              </button>
            </div>
          )}

          {/* Search input */}
          <div className="border-b border-[#ECEAE4] px-3 py-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4F5C67]"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search departments…"
                aria-label="Search departments"
                data-testid="pin-filters-search-input"
                className="h-9 w-full rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] pl-8 pr-3 text-[13px] text-[#1B2A4A] placeholder:text-[#4F5C67]/70 focus:border-[#1B2A4A] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* All pins + department list */}
          <div className="max-h-[260px] overflow-y-auto p-1.5">
            {/* Explicit All pins action inside popover */}
            <button
              ref={allPinsBtnRef}
              type="button"
              data-testid="pin-filters-all-pins"
              aria-pressed={allPinsClearState}
              onClick={handleAllPinsClick}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                allPinsClearState
                  ? 'bg-[#1B2A4A] text-white'
                  : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  <span>All pins</span>
                </div>
                {!allPinsClearState && (
                  <div className="mt-0.5 text-[11px] text-[#4F5C67]">
                    {activeRoomName
                      ? `Clears ${activeRoomName} & department filter · resets view`
                      : 'Clears active Pin filters · resets view'}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    allPinsClearState
                      ? 'bg-white/20 text-white'
                      : 'bg-[#F4F3EF] text-[#4F5C67]'
                  }`}
                >
                  {pins.length}
                </span>
                {allPinsClearState && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </div>
            </button>

            <div className="my-1.5 border-t border-[#ECEAE4]" aria-hidden="true" />

            {filteredDepartments.length === 0 ? (
              <div className="px-3 py-5 text-center text-[12px] text-[#4F5C67]">
                No departments match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filteredDepartments.map((dept) => {
                  const selected =
                    activeDepartmentName?.toLowerCase() === dept.name.toLowerCase();
                  const count = pinCountByDept[dept.name.toLowerCase()] ?? 0;
                  const hex = resolvePinColorHex(dept.defaultPinColor);
                  return (
                    <li key={dept.id}>
                      <button
                        type="button"
                        data-testid={`pin-filter-dept-${dept.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                        aria-pressed={selected}
                        onClick={() => handleSelectDept(dept.name)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                          selected
                            ? 'bg-[#1B2A4A] font-semibold text-white'
                            : 'font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                              selected ? 'ring-1 ring-white/70' : ''
                            }`}
                            style={{ backgroundColor: hex }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{dept.name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                              selected
                                ? 'bg-white/20 text-white'
                                : 'bg-[#F4F3EF] text-[#4F5C67]'
                            }`}
                          >
                            {count}
                          </span>
                          {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const PinFiltersPicker = DepartmentPicker;
