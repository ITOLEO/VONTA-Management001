import { isProjectLead } from '../domain/accountTypes';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Columns3,
  List as ListIcon,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { useDemoAddendum } from '../context/DemoAddendumContext';
import { formatStatusLabel, pinHasMaterialException } from '../domain/demoStore';
import {
  buildRoomOptionsFromPins,
  computePinStatusCounts,
  describeActivePinFilters,
  filterPinsForBoard,
  getPinUpdatedIso,
  groupPinsForKanban,
  KANBAN_COLUMNS,
  resolvePinDisplayColor,
  resolveProjectPinDepartments,
  toProjectLocalDateKey,
  type PinBoardFilters,
} from '../domain/pinBoard';
import type { PinWorkStatus, SpatialPin } from '../domain/types';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { getProjectRoutes } from '../utils/projectRoutes';
import { buildPinDepartmentRailGroups } from '../utils/moduleNavConfig';

type PinStatusFilter = 'all' | PinWorkStatus;
type PinViewMode = 'list' | 'kanban';

const STATUS_TABS: ReadonlyArray<{ key: PinStatusFilter; label: string }> = [
  { key: 'all', label: 'All Pins' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'pending_review', label: 'Pending QC' },
  { key: 'approved', label: 'Approved' },
];

function parseStatusParam(raw: string | null): PinStatusFilter {
  if (raw === 'pending-qc' || raw === 'pending_review') return 'pending_review';
  if (raw === 'open' || raw === 'in_progress' || raw === 'approved') return raw;
  return 'all';
}

export function WorkListPage() {
  const { project: projectParam } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, model, departments, updatePinStatus } = useDemo();
  const addendum = useDemoAddendum();

  const [query, setQuery] = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');
  const [viewMode, setViewMode] = useState<PinViewMode>(() =>
    searchParams.get('view') === 'kanban' ? 'kanban' : 'list'
  );
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionNotice, setTransitionNotice] = useState<string | null>(null);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);

  const viewParam = searchParams.get('view');
  useEffect(() => {
    const expected: PinViewMode = viewParam === 'kanban' ? 'kanban' : 'list';
    setViewMode((prev) => (prev === expected ? prev : expected));
  }, [viewParam]);

  const rawFilter = searchParams.get('filter');
  const activeStatus = parseStatusParam(rawFilter);
  const materialExceptionOnly =
    searchParams.get('exceptions') === '1' ||
    rawFilter === 'exceptions' ||
    rawFilter === 'material_exceptions';
  const activeRoomParam = searchParams.get('room') || '';
  const activeDeptIdParam = searchParams.get('dept') || 'all';
  const routes = getProjectRoutes(location.pathname, state.project.slug);

  const projectDepartments = useMemo(
    () => resolveProjectPinDepartments(state.project.id, departments, state.pins),
    [state.project.id, departments, state.pins]
  );

  const roomOptions = useMemo(
    () =>
      buildRoomOptionsFromPins(
        model.rooms.map((r) => ({ id: r.id, name: r.name })),
        state.pins
      ),
    [model.rooms, state.pins]
  );

  const activeDepartment =
    activeDeptIdParam === 'all'
      ? null
      : projectDepartments.find(
          (d) =>
            d.id === activeDeptIdParam ||
            d.slug === activeDeptIdParam ||
            d.name.toLowerCase() === activeDeptIdParam.toLowerCase()
        ) ?? null;

  const activeDepartmentName = activeDepartment ? activeDepartment.name : 'all';

  const boardFilters = useMemo<PinBoardFilters>(
    () => ({
      departmentName: activeDepartmentName,
      status: activeStatus,
      materialExceptionOnly,
      roomId: activeRoomParam,
      query,
      updatedFrom,
      updatedTo,
      timezone: state.project.timezone,
    }),
    [
      activeDepartmentName,
      activeStatus,
      materialExceptionOnly,
      activeRoomParam,
      query,
      updatedFrom,
      updatedTo,
      state.project.timezone,
    ]
  );

  const statusCounts = useMemo(
    () => computePinStatusCounts(state.pins, boardFilters),
    [state.pins, boardFilters]
  );

  const filteredPins = useMemo(
    () => filterPinsForBoard(state.pins, boardFilters),
    [state.pins, boardFilters]
  );

  const kanbanColumns = useMemo(() => groupPinsForKanban(filteredPins), [filteredPins]);

  const activeRoomName =
    roomOptions.find((room) => room.id === activeRoomParam)?.name ?? activeRoomParam;

  const activeFilterLabels = useMemo(
    () => describeActivePinFilters(boardFilters, { roomName: activeRoomName }),
    [boardFilters, activeRoomName]
  );

  const countForStatus = (status: PinStatusFilter): number => statusCounts[status];

  const setDepartmentFilter = (deptId: string) => {
    const next = new URLSearchParams(searchParams);
    if (deptId === 'all') next.delete('dept');
    else next.set('dept', deptId);
    setSearchParams(next, { replace: true });
  };

  const setStatusFilter = (nextStatus: PinStatusFilter) => {
    const next = new URLSearchParams(searchParams);
    if (nextStatus === 'all') {
      if (next.get('filter') !== 'exceptions' && next.get('filter') !== 'material_exceptions') {
        next.delete('filter');
      } else {
        next.delete('filter');
        next.set('exceptions', '1');
      }
    } else {
      if (next.get('filter') === 'exceptions' || next.get('filter') === 'material_exceptions') {
        next.set('exceptions', '1');
      }
      next.set('filter', nextStatus);
    }
    setSearchParams(next, { replace: true });
  };

  const toggleMaterialExceptions = () => {
    const next = new URLSearchParams(searchParams);
    if (materialExceptionOnly) {
      next.delete('exceptions');
      if (next.get('filter') === 'exceptions' || next.get('filter') === 'material_exceptions') {
        next.delete('filter');
      }
    } else {
      next.set('exceptions', '1');
    }
    setSearchParams(next, { replace: true });
  };

  const setRoomFilter = (roomId: string) => {
    const next = new URLSearchParams(searchParams);
    if (!roomId) next.delete('room');
    else next.set('room', roomId);
    setSearchParams(next, { replace: true });
  };

  const handleViewModeChange = (nextMode: PinViewMode) => {
    setViewMode(nextMode);
    const next = new URLSearchParams(searchParams);
    if (nextMode === 'kanban') next.set('view', 'kanban');
    else next.delete('view');
    setSearchParams(next, { replace: true });
  };

  const clearAllFilters = () => {
    setQuery('');
    setUpdatedFrom('');
    setUpdatedTo('');
    const next = new URLSearchParams();
    if (viewMode === 'kanban') next.set('view', 'kanban');
    setSearchParams(next, { replace: true });
  };

  const hasQcAuthority =
    isProjectLead(addendum.activePersona.role) || addendum.activePersona.role === 'owner';

  const handleMovePinStatus = (pin: SpatialPin, targetStatus: PinWorkStatus) => {
    if (pin.status === targetStatus) return;
    setTransitionError(null);
    setTransitionNotice(null);
    const res = updatePinStatus(pin.id, targetStatus, {
      actorName: addendum.activePersona.displayName,
      hasQcAuthority,
    });
    if (!res.ok) {
      setTransitionError(`${pin.id} (${pin.title}): ${res.error}`);
      return;
    }
    setTransitionNotice(
      `Moved ${pin.id} (${pin.title}) to ${formatStatusLabel(targetStatus)}.`
    );
  };

  const pinRailGroups = useMemo(() => {
    const deptItems = projectDepartments.map((dept) => ({
      id: dept.id,
      name: dept.name,
      pinCount: state.pins.filter((p) => p.department.toLowerCase() === dept.name.toLowerCase())
        .length,
    }));
    return buildPinDepartmentRailGroups({
      departments: deptItems,
      activeDepartmentId: activeDepartment ? activeDepartment.id : 'all',
      onSelectDepartment: setDepartmentFilter,
    });
  }, [projectDepartments, state.pins, activeDepartment]);

  if (projectParam && projectParam !== state.project.slug) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <ProjectNavbar inProjectContext={false} />
        <main className="mx-auto max-w-[760px] px-4 py-16 text-center">
          <h1 className="text-[26px] leading-[32px] font-bold">Project not found</h1>
          <Link
            to={routes.directoryPath}
            className="mt-5 inline-flex min-h-[44px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
          >
            All projects
          </Link>
        </main>
      </div>
    );
  }

  const hasActiveFilter = activeFilterLabels.length > 0;

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <ProjectNavbar />

      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        <ContextualRail
          moduleLabel="PIN"
          groups={pinRailGroups}
          projectSettingsPath={routes.settingsPath}
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="w-full">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#D9DEE2] pb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="vonta-page-title text-[#1B2A4A]">PIN</h1>
                  {activeDepartment && (
                    <span
                      data-testid="pin-active-department-badge"
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#D9DEE2] bg-white px-2.5 py-0.5 text-[13px] font-medium text-[#1B2A4A]"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: activeDepartment.defaultPinColor }}
                        aria-hidden="true"
                      />
                      {activeDepartment.name}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
                  Track surface-anchored Spatial Pins by department, QC stage, material status, and
                  project-local update date ({state.project.timezone}).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div
                  role="group"
                  aria-label="PIN display mode"
                  className="inline-flex rounded-lg border border-[#D9DEE2] bg-white p-1"
                >
                  <button
                    type="button"
                    data-testid="pin-view-list"
                    aria-pressed={viewMode === 'list'}
                    onClick={() => handleViewModeChange('list')}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors ${
                      viewMode === 'list'
                        ? 'bg-[#1B2A4A] text-white'
                        : 'text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                    }`}
                  >
                    <ListIcon className="h-4 w-4" aria-hidden="true" />
                    List
                  </button>
                  <button
                    type="button"
                    data-testid="pin-view-kanban"
                    aria-pressed={viewMode === 'kanban'}
                    onClick={() => handleViewModeChange('kanban')}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors ${
                      viewMode === 'kanban'
                        ? 'bg-[#1B2A4A] text-white'
                        : 'text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                    }`}
                  >
                    <Columns3 className="h-4 w-4" aria-hidden="true" />
                    Kanban
                  </button>
                </div>

                <Link
                  to={routes.workspacePath}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E]"
                >
                  Open 3D workspace
                </Link>
              </div>
            </div>

            {/* Filter Toolbar: Status row + independent Material exceptions + Search + Room + Updated date */}
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div
                    role="tablist"
                    aria-label="Filter Pins by status"
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {STATUS_TABS.map((tab) => {
                      const active = activeStatus === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          data-testid={`pin-status-tab-${tab.key}`}
                          onClick={() => setStatusFilter(tab.key)}
                          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] leading-[18px] font-medium transition-colors ${
                            active
                              ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                              : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span
                            className={`text-[12px] tabular-nums ${
                              active ? 'text-white/80' : 'text-[#4F5C67]'
                            }`}
                          >
                            ({countForStatus(tab.key)})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Independent Material exceptions toggle */}
                  <button
                    type="button"
                    data-testid="pin-filter-material-exceptions"
                    aria-pressed={materialExceptionOnly}
                    onClick={toggleMaterialExceptions}
                    className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] leading-[18px] font-semibold transition-colors ${
                      materialExceptionOnly
                        ? 'border-[#A64011] bg-[#FFF3EB] text-[#A64011]'
                        : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Material exceptions</span>
                    <span className="text-[12px] tabular-nums opacity-80">
                      ({statusCounts.materialExceptions})
                    </span>
                  </button>
                </div>

                <div
                  className="text-[13px] font-medium text-[#4F5C67] tabular-nums"
                  data-testid="pin-result-count"
                >
                  Showing <strong className="text-[#1B2A4A]">{filteredPins.length}</strong>{' '}
                  {filteredPins.length === 1 ? 'Pin' : 'Pins'}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Pin title, ID, room, worker..."
                    aria-label="Search Pins"
                    className="h-10 w-full rounded-lg border border-[#D9DEE2] bg-white pl-9 pr-8 text-[14px] text-[#1B2A4A]"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear Pin search"
                      className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#4F5C67] hover:bg-[#F4F3EF]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div>
                  <label htmlFor="pin-room-filter" className="sr-only">
                    Filter by room
                  </label>
                  <select
                    id="pin-room-filter"
                    value={activeRoomParam}
                    onChange={(e) => setRoomFilter(e.target.value)}
                    className="h-10 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#1B2A4A]"
                  >
                    <option value="">All rooms</option>
                    {roomOptions.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Project-local Updated date range filter */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-2.5 py-1">
                  <Calendar className="h-3.5 w-3.5 text-[#4F5C67]" aria-hidden="true" />
                  <span className="text-[12px] font-semibold text-[#4F5C67]">Updated</span>
                  <label htmlFor="pin-updated-from" className="sr-only">
                    Updated from date
                  </label>
                  <input
                    id="pin-updated-from"
                    data-testid="pin-updated-from"
                    type="date"
                    value={updatedFrom}
                    onChange={(e) => setUpdatedFrom(e.target.value)}
                    className="h-8 rounded border border-[#D9DEE2] px-2 text-[12px] text-[#1B2A4A]"
                  />
                  <span className="text-[12px] text-[#4F5C67]">to</span>
                  <label htmlFor="pin-updated-to" className="sr-only">
                    Updated to date
                  </label>
                  <input
                    id="pin-updated-to"
                    data-testid="pin-updated-to"
                    type="date"
                    value={updatedTo}
                    onChange={(e) => setUpdatedTo(e.target.value)}
                    className="h-8 rounded border border-[#D9DEE2] px-2 text-[12px] text-[#1B2A4A]"
                  />
                </div>

                {hasActiveFilter && (
                  <button
                    type="button"
                    data-testid="pin-reset-filters"
                    onClick={clearAllFilters}
                    className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Reset filters
                  </button>
                )}
              </div>
            </div>

            {transitionError && (
              <div
                role="alert"
                data-testid="pin-kanban-error"
                className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] px-4 py-3 text-[13px] font-medium text-[#B42318]"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{transitionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setTransitionError(null)}
                  aria-label="Dismiss error"
                  className="rounded p-1 hover:bg-[#B42318]/10"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            {transitionNotice && (
              <div
                role="status"
                data-testid="pin-kanban-notice"
                className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 px-4 py-2.5 text-[13px] font-medium text-[#166534]"
              >
                <span>{transitionNotice}</span>
                <button
                  type="button"
                  onClick={() => setTransitionNotice(null)}
                  aria-label="Dismiss notice"
                  className="rounded p-1 hover:bg-[#166534]/10"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* LIST VIEW */}
            {viewMode === 'list' ? (
              <section
                data-testid="pin-list-view"
                aria-label="PIN list"
                className="mt-5 border-t border-b border-[#D9DEE2] bg-white"
              >
                {filteredPins.length === 0 ? (
                  <div
                    className="px-6 py-12 text-center"
                    aria-live="polite"
                    data-testid="pin-empty-state"
                  >
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      No Pins match the current filters
                    </h2>
                    {hasActiveFilter ? (
                      <>
                        <p className="mt-2 text-[14px] leading-[20px] text-[#4F5C67]">
                          Active filters:{' '}
                          <span className="font-medium text-[#1B2A4A]">
                            {activeFilterLabels.join(' · ')}
                          </span>
                        </p>
                        <p className="mx-auto mt-1.5 max-w-[600px] text-[14px] leading-[20px] text-[#4F5C67]">
                          {activeDepartment
                            ? 'Select All departments in the left sidebar to remove only the department condition while keeping your other filters, or reset all filters below.'
                            : 'Clear individual toolbar filters above, or click Reset filters to show all Pins in this project.'}
                        </p>
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[13px] font-semibold text-[#1B2A4A] hover:bg-[#F4F3EF]"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Reset filters
                        </button>
                      </>
                    ) : (
                      <p className="mt-1.5 text-[14px] leading-[20px] text-[#4F5C67]">
                        No Spatial Pins exist in this project yet. Open the 3D workspace to place a
                        Pin on a surface.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div
                      aria-hidden="true"
                      className="hidden border-b border-[#E6E8EB] bg-[#FAF9F6] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#4F5C67] lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.15fr)_minmax(0,1.1fr)_auto] lg:items-center lg:gap-4"
                    >
                      <span>Pin & status</span>
                      <span>Location & department</span>
                      <span>Assignee & updated</span>
                      <span>Materials & QC evidence</span>
                      <span className="text-right">Actions</span>
                    </div>

                    <ul className="divide-y divide-[#E6E8EB]">
                      {filteredPins.map((pin) => {
                        const issuedCount = pin.materials.filter((m) => m.issuedQty > 0).length;
                        const photoCount =
                          (pin.evidence.before ? 1 : 0) + (pin.evidence.after ? 1 : 0);
                        const hasMatException = pinHasMaterialException(pin);
                        const pinColor = resolvePinDisplayColor(pin, projectDepartments);
                        const updatedDate = toProjectLocalDateKey(
                          getPinUpdatedIso(pin),
                          state.project.timezone
                        );

                        return (
                          <li
                            key={pin.id}
                            data-testid={`pin-list-row-${pin.id}`}
                            className="grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-[#FAF9F6] lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.15fr)_minmax(0,1.1fr)_auto] lg:items-center lg:gap-4"
                          >
                            {/* Pin & Status */}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span
                                  className="h-3 w-3 shrink-0 rounded-full border border-black/15"
                                  style={{ backgroundColor: pinColor }}
                                  title={`Pin color ${pinColor}`}
                                  aria-hidden="true"
                                />
                                <Link
                                  to={routes.pinDetailPath(pin.slug)}
                                  className="text-[15px] leading-[21px] font-semibold text-[#1B2A4A] underline-offset-4 hover:text-[#A64011] hover:underline"
                                >
                                  {pin.title}
                                </Link>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5">
                                <span className="text-[12px] font-medium text-[#4F5C67] tabular-nums">
                                  {pin.id}
                                </span>
                                <span className="rounded bg-[#F4F3EF] px-2 py-0.5 text-[12px] font-semibold text-[#1B2A4A]">
                                  {formatStatusLabel(pin.status)}
                                </span>
                                {hasMatException && (
                                  <span className="inline-flex items-center gap-1 rounded bg-[#FFF3EB] px-2 py-0.5 text-[11px] font-semibold text-[#A64011]">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                    Material exception
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Location & Department */}
                            <div className="min-w-0 pl-5 text-[13px] leading-[18px] lg:pl-0">
                              <div className="font-medium text-[#1B2A4A]">{pin.roomName}</div>
                              <div className="text-[#4F5C67]">{pin.department}</div>
                            </div>

                            {/* Assignee & Updated */}
                            <div className="min-w-0 pl-5 text-[13px] leading-[18px] lg:pl-0">
                              <div className="text-[#1B2A4A]">{pin.assigneeName}</div>
                              <div className="text-[12px] text-[#4F5C67] tabular-nums">
                                Updated {updatedDate}
                              </div>
                            </div>

                            {/* Materials & QC Evidence */}
                            <div className="min-w-0 pl-5 text-[13px] leading-[18px] text-[#4F5C67] tabular-nums lg:pl-0">
                              <div>
                                <span className="font-medium text-[#1B2A4A]">
                                  {pin.materials.length}
                                </span>{' '}
                                materials ({issuedCount} issued)
                              </div>
                              <div>
                                <span className="font-medium text-[#1B2A4A]">{photoCount}/2</span>{' '}
                                QC photos
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-wrap items-center gap-2 pl-5 lg:justify-end lg:pl-0">
                              <Link
                                to={routes.locatePinPath(pin.id)}
                                className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] leading-[18px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                              >
                                <MapPin className="h-3.5 w-3.5 text-[#D4652F]" aria-hidden="true" />
                                Locate in 3D
                              </Link>
                              <Link
                                to={routes.pinDetailPath(pin.slug)}
                                className="inline-flex min-h-[38px] items-center whitespace-nowrap rounded-lg bg-[#1B2A4A] px-3.5 py-1.5 text-[13px] leading-[18px] font-medium text-white hover:bg-[#1B2A4A]/90"
                              >
                                Detail
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            ) : (
              /* 4-COLUMN KANBAN VIEW */
              <div className="mt-5 space-y-4">
                {filteredPins.length === 0 && hasActiveFilter && (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid="pin-kanban-empty-banner"
                    className="flex flex-wrap items-center justify-between gap-3 border-y border-[#D9DEE2] bg-white px-4 py-3 text-[13px] text-[#4F5C67]"
                  >
                    <div>
                      <span className="font-semibold text-[#1B2A4A]">
                        No Pins match the active filters ({activeFilterLabels.join(' · ')}).
                      </span>{' '}
                      {activeDepartment
                        ? 'Select All departments in the left sidebar to remove only the department condition, or reset all filters.'
                        : 'Adjust toolbar filters above or click Reset filters.'}
                    </div>
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[12px] font-semibold text-[#1B2A4A] hover:bg-[#F4F3EF]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Reset filters
                    </button>
                  </div>
                )}

                <section
                  data-testid="pin-kanban-view"
                  aria-label="PIN Kanban board"
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
                >
                  {kanbanColumns.map((col) => (
                    <div
                      key={col.status}
                      data-testid={`pin-kanban-col-${col.status}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const droppedPinId =
                          e.dataTransfer.getData('text/plain') || draggingPinId;
                        setDraggingPinId(null);
                        if (!droppedPinId) return;
                        const pin = state.pins.find((p) => p.id === droppedPinId);
                        if (pin) handleMovePinStatus(pin, col.status);
                      }}
                      className="flex min-h-[320px] flex-col border-t-2 border-[#D9DEE2] bg-[#FAF9F6] px-3 py-3"
                    >
                      <div className="flex items-center justify-between border-b border-[#E6E8EB] pb-2.5">
                        <h2 className="text-[14px] font-bold text-[#1B2A4A]">{col.label}</h2>
                        <span
                          data-testid={`pin-kanban-count-${col.status}`}
                          className="text-[12px] font-semibold text-[#4F5C67] tabular-nums"
                        >
                          ({col.pins.length})
                        </span>
                      </div>

                      {col.pins.length === 0 ? (
                        <div className="mt-3 flex flex-1 items-center justify-center border border-dashed border-[#D9DEE2] bg-white/60 px-3 py-8 text-center text-[13px] text-[#4F5C67]">
                          No Pins in {col.label}
                        </div>
                      ) : (
                        <ul className="mt-3 space-y-2.5">
                          {col.pins.map((pin) => {
                            const pinColor = resolvePinDisplayColor(pin, projectDepartments);
                            const hasMatException = pinHasMaterialException(pin);
                            const photoCount =
                              (pin.evidence.before ? 1 : 0) + (pin.evidence.after ? 1 : 0);
                            const nextTargets = KANBAN_COLUMNS.filter(
                              (c) => c.status !== pin.status
                            );

                            return (
                              <li
                                key={pin.id}
                                draggable
                                onDragStart={(e) => {
                                  setDraggingPinId(pin.id);
                                  e.dataTransfer.setData('text/plain', pin.id);
                                }}
                                onDragEnd={() => setDraggingPinId(null)}
                                data-testid={`pin-kanban-card-${pin.id}`}
                                className="rounded-lg border border-[#E6E8EB] bg-white p-3.5 transition-colors hover:border-[#1B2A4A]/40"
                              >
                                <div className="flex items-start gap-2">
                                  <span
                                    className="mt-1 h-3 w-3 shrink-0 rounded-full border border-black/15"
                                    style={{ backgroundColor: pinColor }}
                                    aria-hidden="true"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <Link
                                      to={routes.pinDetailPath(pin.slug)}
                                      className="block text-[14px] leading-[19px] font-semibold text-[#1B2A4A] hover:text-[#A64011] hover:underline"
                                    >
                                      {pin.title}
                                    </Link>
                                    <div className="mt-1 text-[12px] text-[#4F5C67]">
                                      <span className="tabular-nums font-medium text-[#1B2A4A]">
                                        {pin.id}
                                      </span>{' '}
                                      · {pin.roomName} · {pin.department}
                                    </div>
                                    <div className="mt-0.5 text-[12px] text-[#4F5C67]">
                                      {pin.assigneeName} ·{' '}
                                      <span className="font-medium text-[#1B2A4A] tabular-nums">
                                        {photoCount}/2 QC photos
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {hasMatException && (
                                  <div className="mt-2 inline-flex items-center gap-1 rounded bg-[#FFF3EB] px-2 py-0.5 text-[11px] font-semibold text-[#A64011]">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                    Material exception
                                  </div>
                                )}

                                <div className="mt-3 space-y-2 border-t border-[#E6E8EB] pt-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <Link
                                      to={routes.locatePinPath(pin.id)}
                                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#A64011] hover:underline"
                                    >
                                      <MapPin className="h-3 w-3" aria-hidden="true" />
                                      Locate in 3D
                                    </Link>
                                    <Link
                                      to={routes.pinDetailPath(pin.slug)}
                                      className="text-[12px] font-medium text-[#1B2A4A] hover:underline"
                                    >
                                      Detail
                                    </Link>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1">
                                    {nextTargets.map((target) => (
                                      <button
                                        key={target.status}
                                        type="button"
                                        data-testid={`kanban-move-${pin.id}-to-${target.status}`}
                                        onClick={() => handleMovePinStatus(pin, target.status)}
                                        className="inline-flex items-center gap-0.5 rounded border border-[#D9DEE2] bg-white px-2 py-0.5 text-[11px] font-medium text-[#1B2A4A] hover:bg-[#1B2A4A] hover:text-white"
                                        title={`Move ${pin.id} to ${target.label}`}
                                      >
                                        <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
                                        {target.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
