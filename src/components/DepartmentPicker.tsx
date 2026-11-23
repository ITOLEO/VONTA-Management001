import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronUp, Layers, Search, X } from 'lucide-react';
import type { ProjectDepartment } from '../domain/departmentCatalog';
import type { SpatialPin } from '../domain/types';

interface DepartmentPickerProps {
  departments: ProjectDepartment[];
  pins: SpatialPin[];
  activeDepartmentName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDepartment: (departmentName: string | null) => void;
}

/**
 * Bottom-dock upward Department popover styled identically to RoomsPicker (Doc 05).
 * Filters visible Workspace Pins by project department catalog (including newly added 5th+ departments)
 * independently from technical Civil / Electrical / Plumbing geometry layers.
 */
export function DepartmentPicker({
  departments,
  pins,
  activeDepartmentName,
  open,
  onOpenChange,
  onSelectDepartment,
}: DepartmentPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');

  const activeDepartments = useMemo(() => departments, [departments]);

  const filteredDepartments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeDepartments;
    return activeDepartments.filter((d) => d.name.toLowerCase().includes(q));
  }, [activeDepartments, query]);

  const activeDept = useMemo(
    () =>
      activeDepartmentName
        ? activeDepartments.find(
            (d) => d.name.toLowerCase() === activeDepartmentName.toLowerCase()
          ) ?? null
        : null,
    [activeDepartments, activeDepartmentName]
  );

  const closeAndRestoreFocus = () => {
    onOpenChange(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        window.requestAnimationFrame(() => {
          triggerRef.current?.focus();
        });
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onOpenChange]);

  const handleSelect = (deptName: string | null) => {
    onSelectDepartment(deptName);
    onOpenChange(false);
    setQuery('');
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  return (
    <div ref={containerRef} className="relative">
      {open && (
        <div
          id="workspace-department-popover"
          role="dialog"
          aria-label="Department Pin filter"
          data-testid="department-popover"
          className="absolute bottom-full left-1/2 z-40 mb-2 w-[min(300px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl border border-[#D9DEE2] bg-white shadow-lg"
        >
          <div className="border-b border-[#D9DEE2] p-3">
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                Department ({activeDepartments.length})
              </span>
              <button
                type="button"
                onClick={closeAndRestoreFocus}
                aria-label="Close Department filter"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search departments..."
                aria-label="Search departments"
                className="h-9 w-full rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 pl-9 pr-3 text-[13px] text-[#1B2A4A] placeholder:text-[#4F5C67]/75"
              />
            </div>
          </div>

          <div
            role="listbox"
            aria-label="Project departments"
            className="max-h-[240px] overflow-y-auto p-2"
          >
            <div className="space-y-1">
              {!query.trim() && (
                <button
                  type="button"
                  role="option"
                  aria-selected={activeDepartmentName === null}
                  data-testid="department-option-all"
                  onClick={() => handleSelect(null)}
                  className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    activeDepartmentName === null
                      ? 'bg-[#D4652F]/10 font-semibold text-[#1B2A4A]'
                      : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                  }`}
                >
                  <div>
                    <div className="text-[14px] leading-[20px]">All departments</div>
                    <div className="text-[12px] text-[#4F5C67] tabular-nums">
                      {pins.length} {pins.length === 1 ? 'Pin' : 'Pins'} total
                    </div>
                  </div>
                  {activeDepartmentName === null && (
                    <Check className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
                  )}
                </button>
              )}

              {filteredDepartments.length === 0 ? (
                <div className="px-3 py-5 text-center text-[13px] text-[#4F5C67]">
                  No departments matched “{query}”.
                </div>
              ) : (
                filteredDepartments.map((dept) => {
                  const isSelected =
                    activeDepartmentName?.toLowerCase() === dept.name.toLowerCase();
                  const count = pins.filter(
                    (p) => p.department.toLowerCase() === dept.name.toLowerCase()
                  ).length;
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-testid={`department-option-${dept.slug}`}
                      onClick={() => handleSelect(dept.name)}
                      className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#D4652F]/10 font-semibold text-[#1B2A4A]'
                          : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: dept.defaultPinColor }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[14px] leading-[20px] font-medium">
                            {dept.name}
                          </div>
                          <div className="text-[12px] text-[#4F5C67] tabular-nums">
                            {count} {count === 1 ? 'Pin' : 'Pins'}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-[#D4652F]" aria-hidden="true" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="workspace-department-popover"
        data-testid="department-trigger-button"
        className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[14px] leading-[20px] font-medium transition-colors md:min-h-[38px] ${
          open || activeDept
            ? 'border-[#D4652F] bg-[#D4652F]/10 text-[#1B2A4A]'
            : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
        }`}
      >
        {activeDept ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: activeDept.defaultPinColor }}
            aria-hidden="true"
          />
        ) : (
          <Layers className="h-4 w-4 shrink-0 text-[#4F5C67]" aria-hidden="true" />
        )}
        <span>{activeDept ? activeDept.name : 'Department'}</span>
        <ChevronUp
          className={`h-3.5 w-3.5 text-[#4F5C67] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
