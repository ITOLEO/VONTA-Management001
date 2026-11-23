import React, { useMemo, useState } from 'react';
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
  filterPinsForBoard,
  getPinUpdatedIso,
  groupPinsForKanban,
  KANBAN_COLUMNS,
  resolvePinDisplayColor,
  toProjectLocalDateKey,
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

  const rawFilter = searchParams.get('filter');
  const activeStatus = parseStatusParam(rawFilter);
  const materialExceptionOnly =
    searchParams.get('exceptions') === '1' ||
    rawFilter === 'exceptions' ||
    rawFilter === 'material_exceptions';
  const activeRoomParam = searchParams.get('room') || '';
  const activeDeptIdParam = searchParams.get('dept') || 'all';
  const routes = getProjectRoutes(location.pathname, state.project.slug);

  const activeDepartment =
    activeDeptIdParam === 'all'
      ? null
      : departments.find(
          (d) =>
            d.id === activeDeptIdParam ||
            d.slug === activeDeptIdParam ||
            d.name.toLowerCase() === activeDeptIdParam.toLowerCase()
        ) ?? null;

  const activeDepartmentName = activeDepartment ? activeDepartment.name : 'all';

  // Compute counts respecting current department, room, search, date, and exceptions
  const baseScopedPins = useMemo(
    () =>
      filterPinsForBoard(state.pins, {
        departmentName: activeDepartmentName,
        status: 'all',
        materialExceptionOnly,
        roomId: activeRoomParam,
        query,
        updatedFrom,
        updatedTo,
        timezone: state.project.timezone,
      }),
    [
      state.pins,
      activeDepartmentName,
      materialExceptionOnly,
      activeRoomParam,
      query,
      updatedFrom,
      updatedTo,
      state.project.timezone,
    ]
  );

  const filteredPins = useMemo(
    () =>
      filterPinsForBoard(state.pins, {
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
      state.pins,
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

  const kanbanColumns = useMemo(() => groupPinsForKanban(filteredPins), [filteredPins]);

  const countForStatus = (status: PinStatusFilter): number => {
    if (status === 'all') return baseScopedPins.length;
    return baseScopedPins.filter((p) => p.status === status).length;
  };

  const materialExceptionCount = useMemo(
    () =>
      filterPinsForBoard(state.pins, {
        departmentName: activeDepartmentName,
        status: activeStatus,
        materialExceptionOnly: true,
        roomId: activeRoomParam,
        query,
        updatedFrom,
        updatedTo,
        timezone: state.project.timezone,
      }).length,
    [
      state.pins,
      activeDepartmentName,
      activeStatus,
      activeRoomParam,
      query,
      updatedFrom,
      updatedTo,
      state.project.timezone,
    ]
  );

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
    addendum.activePersona.role === 'contractor' || addendum.activePersona.role === 'owner';

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
    const deptItems = departments.map((dept) => ({
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
  }, [departments, state.pins, activeDepartment]);

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

  const hasActiveFilter =
    activeDepartmentName !== 'all' ||
    activeStatus !== 'all' ||
    materialExceptionOnly ||
    Boolean(activeRoomParam) ||
    Boolean(query.trim()) ||
    Boolean(updatedFrom) ||
    Boolean(updatedTo);

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
          <div className="mx-auto w-full max-w-[1320px]">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#D9DEE2] pb-5">
              <div>
                <div className="text-[13px] leading-[18px] font-semibold text-[#A64011]">
                  {state.project.demoLabel}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2.5">
                  <h1 className="text-[26px] leading-[32px] font-bold tracking-tight text-[#1B2A4A]">
                    PIN
                  </h1>
                  {activeDepartment && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-[#D9DEE2] bg-white px-2.5 py-0.5 text-[13px] font-medium text-[#1B2A4A]">
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

            {/* Filter Toolbar: Status chips + independent Material exceptions + Room + Updated date + Search */}
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
                      ({materialExceptionCount})
                    </span>
                  </button>
                </div>

                <div className="text-[13px] font-medium text-[#4F5C67] tabular-nums" data-testid="pin-result-count">
                  Showing <strong className="text-[#1B2A4A]">{filteredPins.length}</strong>{' '}
                  {filteredPins.length === 1 ? 'Pin' : 'Pins'}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
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
                    {model.rooms.map((room) => (
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
                className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-[#B42318]/35 bg-[#FEF3F2] px-4 py-3 text-[13px] font-medium text-[#B42318]"
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
                className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#166534]/30 bg-[#DCFCE7]/60 px-4 py-2.5 text-[13px] font-medium text-[#166534]"
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
                className="mt-5 overflow-hidden rounded-xl border border-[#D9DEE2] bg-white"
              >
                {filteredPins.length === 0 ? (
                  <div className="px-6 py-12 text-center" aria-live="polite">
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      {query.trim() ? 'No matching Pins' : 'No Pins in this view'}
                    </h2>
                    <p className="mt-1.5 text-[15px] leading-[22px] text-[#4F5C67]">
                      {activeStatus === 'approved'
                        ? 'Zero Pins have been approved in this scope.'
                        : activeStatus === 'pending_review'
                          ? 'Zero Pins are currently waiting for QC review.'
                          : 'Try adjusting the department, status, Material exceptions, or Updated date filters.'}
                    </p>
                    {hasActiveFilter && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-[#D9DEE2]">
                    {filteredPins.map((pin) => {
                      const issuedCount = pin.materials.filter((m) => m.issuedQty > 0).length;
                      const photoCount =
                        (pin.evidence.before ? 1 : 0) + (pin.evidence.after ? 1 : 0);
                      const hasMatException = pinHasMaterialException(pin);
                      const pinColor = resolvePinDisplayColor(pin, departments);
                      const updatedDate = toProjectLocalDateKey(
                        getPinUpdatedIso(pin),
                        state.project.timezone
                      );

                      return (
                        <li
                          key={pin.id}
                          data-testid={`pin-list-row-${pin.id}`}
                          className="flex flex-col justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#F4F3EF]/40 md:flex-row md:items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <span
                                className="h-3 w-3 shrink-0 rounded-full border border-black/15"
                                style={{ backgroundColor: pinColor }}
                                title={`Pin color ${pinColor}`}
                                aria-hidden="true"
                              />
                              <Link
                                to={routes.pinDetailPath(pin.slug)}
                                className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A] underline-offset-4 hover:text-[#A64011] hover:underline"
                              >
                                {pin.title}
                              </Link>
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

                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                              <span className="font-medium text-[#1B2A4A]">{pin.roomName}</span>
                              <span aria-hidden="true">·</span>
                              <span>{pin.department}</span>
                              <span aria-hidden="true">·</span>
                              <span>{pin.assigneeName}</span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{pin.id}</span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">Updated {updatedDate}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-[13px] leading-[18px] text-[#4F5C67] md:justify-end">
                            <div className="tabular-nums">
                              <span className="font-medium text-[#1B2A4A]">
                                {pin.materials.length}
                              </span>{' '}
                              materials ({issuedCount} issued)
                            </div>
                            <div className="tabular-nums">
                              <span className="font-medium text-[#1B2A4A]">{photoCount}/2</span>{' '}
                              photos
                            </div>

                            <div className="flex items-center gap-2">
                              <Link
                                to={routes.locatePinPath(pin.id)}
                                className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] leading-[18px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                              >
                                <MapPin className="h-3.5 w-3.5 text-[#D4652F]" aria-hidden="true" />
                                Locate in 3D
                              </Link>
                              <Link
                                to={routes.pinDetailPath(pin.slug)}
                                className="inline-flex min-h-[40px] items-center whitespace-nowrap rounded-lg bg-[#1B2A4A] px-3.5 py-1.5 text-[13px] leading-[18px] font-medium text-white hover:bg-[#1B2A4A]/90"
                              >
                                Detail
                              </Link>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : (
              /* 4-COLUMN KANBAN VIEW */
              <section
                data-testid="pin-kanban-view"
                aria-label="PIN Kanban board"
                className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
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
                    className="flex min-h-[340px] flex-col rounded-xl border border-[#D9DEE2] bg-white p-3.5"
                  >
                    <div className="flex items-center justify-between border-b border-[#D9DEE2] pb-2.5">
                      <h2 className="text-[14px] font-bold text-[#1B2A4A]">{col.label}</h2>
                      <span
                        data-testid={`pin-kanban-count-${col.status}`}
                        className="rounded-md bg-[#F4F3EF] px-2 py-0.5 text-[12px] font-semibold text-[#4F5C67] tabular-nums"
                      >
                        ({col.pins.length})
                      </span>
                    </div>

                    {col.pins.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/35 px-3 py-8 text-center text-[13px] text-[#4F5C67] mt-3">
                        No Pins in {col.label}
                      </div>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {col.pins.map((pin) => {
                          const pinColor = resolvePinDisplayColor(pin, departments);
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
                              className="rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/30 p-3 shadow-xs transition-colors hover:border-[#1B2A4A]/40"
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
                                    {pin.roomName} · {pin.department}
                                  </div>
                                  <div className="mt-0.5 text-[12px] text-[#4F5C67]">
                                    {pin.assigneeName} ·{' '}
                                    <span className="tabular-nums">{photoCount}/2 photos</span>
                                  </div>
                                </div>
                              </div>

                              {hasMatException && (
                                <div className="mt-2 inline-flex items-center gap-1 rounded bg-[#FFF3EB] px-2 py-0.5 text-[11px] font-semibold text-[#A64011]">
                                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                  Material exception
                                </div>
                              )}

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#D9DEE2] pt-2.5">
                                <Link
                                  to={routes.locatePinPath(pin.id)}
                                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#A64011] hover:underline"
                                >
                                  <MapPin className="h-3 w-3" aria-hidden="true" />
                                  Locate in 3D
                                </Link>
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
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
