import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search, X } from 'lucide-react';
import type { ProjectDepartment } from '../domain/departmentCatalog';
import {
  filterBlueprintSheets,
  type BlueprintSheetRecord,
} from '../domain/blueprintRegister';

interface OverviewBlueprintRailSlotProps {
  sheets: BlueprintSheetRecord[];
  departments: ProjectDepartment[];
  query: string;
  onQueryChange: (next: string) => void;
  departmentFilter: string;
  onDepartmentFilterChange: (next: string) => void;
  activeSheetId?: string | null;
  getSheetDetailPath: (sheetId: string) => string;
}

/**
 * Full-height Blueprint Sheet Register inside the Overview contextual rail (Stage 04):
 * - Owns all remaining vertical rail height down to Project settings via flex-1 min-h-0.
 * - Keeps search, discipline category filter, sheet count, and Reset fixed above the scroll list.
 */
export function OverviewBlueprintRailSlot({
  sheets,
  departments,
  query,
  onQueryChange,
  departmentFilter,
  onDepartmentFilterChange,
  activeSheetId,
  getSheetDetailPath,
}: OverviewBlueprintRailSlotProps) {
  const filtered = useMemo(
    () =>
      filterBlueprintSheets(
        sheets,
        {
          query,
          departmentId: departmentFilter,
          includeSuperseded: true,
        },
        departments
      ),
    [sheets, query, departmentFilter, departments]
  );

  return (
    <div
      data-testid="overview-blueprint-rail-list"
      className="flex min-h-0 flex-1 flex-col gap-2 border-t border-[#D9DEE2] pt-2.5"
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4F5C67]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search sheets"
            aria-label="Search blueprints"
            data-testid="rail-blueprint-search"
            className="w-full rounded-lg border border-[#D9DEE2] bg-white py-1.5 pl-8 pr-6 text-[12px] leading-[16px] text-[#1B2A4A] placeholder:text-[#4F5C67] focus:border-[#A64011] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear blueprint search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#4F5C67] hover:text-[#1B2A4A]"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>

        <select
          aria-label="Filter blueprints by discipline"
          data-testid="rail-blueprint-dept-filter"
          value={departmentFilter}
          onChange={(e) => onDepartmentFilterChange(e.target.value)}
          className="max-w-[82px] shrink-0 rounded-lg border border-[#D9DEE2] bg-white px-1.5 py-1.5 text-[12px] leading-[16px] font-medium text-[#1B2A4A] focus:border-[#A64011] focus:outline-none"
        >
          <option value="all">All</option>
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
      </div>

      <div
        data-testid="rail-blueprint-count"
        className="flex shrink-0 items-center justify-between px-1 text-[12px] leading-[16px] text-[#4F5C67] tabular-nums"
      >
        <span>
          {filtered.length} of {sheets.length} sheet{sheets.length === 1 ? '' : 's'}
        </span>
        {(query || departmentFilter !== 'all') && (
          <button
            type="button"
            data-testid="rail-blueprint-reset"
            onClick={() => {
              onQueryChange('');
              onDepartmentFilterChange('all');
            }}
            className="font-medium text-[#A64011] hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      <ul
        aria-label="Registered drawings"
        data-testid="rail-blueprint-sheet-list"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5 pb-1"
      >
        {filtered.length === 0 ? (
          <li className="rounded-lg border border-dashed border-[#D9DEE2] px-2.5 py-3 text-center text-[12px] text-[#4F5C67]">
            No drawings match this filter.
          </li>
        ) : (
          filtered.map((sheet) => {
            const isSelected = activeSheetId === sheet.id;
            return (
              <li key={sheet.id}>
                <Link
                  to={getSheetDetailPath(sheet.id)}
                  data-testid={`rail-sheet-${sheet.sheetCode.toLowerCase()}`}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`block rounded-lg border px-2.5 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE] ${
                    isSelected
                      ? 'border-[#D4652F] bg-[#FFF3EB]/70 text-[#1B2A4A]'
                      : 'border-transparent bg-transparent text-[#1B2A4A] hover:border-[#D9DEE2] hover:bg-[#F4F3EF]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="inline-flex min-w-0 items-center gap-1 text-[12px] leading-[16px] font-semibold">
                      <FileText className="h-3 w-3 shrink-0 text-[#4F5C67]" aria-hidden="true" />
                      <span className="truncate">{sheet.sheetCode}</span>
                    </span>
                    <span className="shrink-0 rounded bg-[#F4F3EF] px-1.5 py-0.5 text-[11px] font-medium text-[#4F5C67]">
                      {sheet.revision}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] leading-[16px] text-[#4F5C67]">
                    {sheet.title}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-1 text-[11px] text-[#4F5C67]">
                    <span className="truncate">{sheet.areaName}</span>
                    {sheet.isCombinedElectricalPlumbing ? (
                      <span className="shrink-0 font-semibold text-[#0D9488]">E+P</span>
                    ) : sheet.isSuperseded ? (
                      <span className="shrink-0 font-semibold text-[#B42318]">Superseded</span>
                    ) : (
                      <span className="shrink-0">{sheet.departmentNames[0] ?? ''}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
