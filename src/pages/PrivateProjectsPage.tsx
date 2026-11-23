import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  FolderOpen,
  LayoutGrid,
  List,
  Mail,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import { ApiClientError, privateApi } from '../data/privateApi';
import {
  canEditProjectSettings,
  formatProjectSetupStatusLabel,
  formatRoleLabel,
  type AuthorizedProject,
} from '../domain/accountTypes';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { DeleteProjectModal } from '../components/DeleteProjectModal';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'active' | 'draft';
type SortMode = 'name-asc' | 'name-desc';

export function PrivateProjectsPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const {
    projects,
    pendingInvitations,
    activeDraft,
    directoryLoading,
    directoryError,
    refreshDirectory,
    removeProjectFromCache,
  } = usePrivateProjects();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [userMgmtChooserOpen, setUserMgmtChooserOpen] = useState(false);

  const [openOverflowId, setOpenOverflowId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuthorizedProject | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);

  useEffect(() => {
    if (!openOverflowId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenOverflowId(null);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenOverflowId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [openOverflowId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((proj) => {
      if (statusFilter === 'active' && proj.status !== 'ready' && proj.status !== 'active') {
        return false;
      }
      if (statusFilter === 'draft' && proj.status !== 'draft') {
        return false;
      }
      if (!q) return true;
      const hay = [
        proj.name,
        proj.contractorDisplayName,
        proj.timezone,
        proj.status,
        formatRoleLabel(proj.membership.role, proj.membership),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    return [...list].sort((a, b) =>
      sortMode === 'name-asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    );
  }, [projects, query, statusFilter, sortMode]);

  const handleConfirmDelete = async (payload: {
    keyword: string;
    typedProjectName: string;
  }) => {
    if (!deleteTarget || !accessToken) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await privateApi.deleteProject(accessToken, deleteTarget.id, {
        keyword: payload.keyword,
        typedProjectName: payload.typedProjectName,
        expectedVersion: deleteTarget.version,
      });
      removeProjectFromCache(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiClientError ? err.message : 'Failed to delete project. Try again.'
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <PrivateNavbar inProjectContext={false} sectionLabel="Projects" hasContextualRail={false} />

      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        <main ref={menuContainerRef} className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1280px]">
            <div>
              <h1 className="text-[26px] leading-[32px] font-bold tracking-tight text-[#1B2A4A]">
                Projects
              </h1>
            </div>

            {/* Full-Width Toolbar (same layout for populated & empty states, Layout System Fig 4 & 6) */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#D9DEE2] pb-5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                <div className="relative min-w-[240px] flex-1 sm:max-w-[340px]">
                  <label htmlFor="private-project-search" className="sr-only">
                    Search projects
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                    aria-hidden="true"
                  />
                  <input
                    id="private-project-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects, contractors, roles…"
                    className="h-10 w-full rounded-lg border border-[#D9DEE2] bg-white pl-9 pr-9 text-[14px] text-[#1B2A4A] placeholder:text-[#4F5C67]/75 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE]"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search query"
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-[#4F5C67] hover:bg-[#F4F3EF]"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <label htmlFor="private-status-filter" className="sr-only">
                  Filter by status
                </label>
                <select
                  id="private-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="h-10 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE]"
                >
                  <option value="all">Status: All</option>
                  <option value="active">Status: Ready / Active</option>
                  <option value="draft">Status: Draft</option>
                </select>

                <label htmlFor="private-sort-mode" className="sr-only">
                  Sort projects
                </label>
                <select
                  id="private-sort-mode"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="h-10 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE]"
                >
                  <option value="name-asc">Sort: Name (A–Z)</option>
                  <option value="name-desc">Sort: Name (Z–A)</option>
                </select>
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                <div
                  role="group"
                  aria-label="Project view layout"
                  className="inline-flex h-10 items-center rounded-lg border border-[#D9DEE2] bg-white p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-pressed={viewMode === 'grid'}
                    aria-label="Grid view"
                    data-testid="view-toggle-grid"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-[#FFF3EB] text-[#A64011]'
                        : 'text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    aria-pressed={viewMode === 'list'}
                    aria-label="List view"
                    data-testid="view-toggle-list"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                      viewMode === 'list'
                        ? 'bg-[#FFF3EB] text-[#A64011]'
                        : 'text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                    }`}
                  >
                    <List className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <Link
                  to="/projects/new"
                  data-testid="create-new-project-btn"
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create new project
                </Link>
              </div>
            </div>

            {/* Project Chooser for User Management (never mixes members across projects) */}
            {userMgmtChooserOpen && (
              <section
                role="region"
                aria-label="Select a project for User Management"
                data-testid="directory-user-mgmt-chooser"
                className="mt-5 rounded-xl border border-[#D4652F]/45 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Users className="mt-0.5 h-5 w-5 shrink-0 text-[#D4652F]" aria-hidden="true" />
                    <div>
                      <h2 className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                        Select a project for User Management
                      </h2>
                      <p className="mt-0.5 text-[14px] leading-[20px] text-[#4F5C67]">
                        Select an authorized project before viewing or editing its team.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUserMgmtChooserOpen(false)}
                    aria-label="Close project chooser"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {projects.length === 0 ? (
                  <p className="mt-3 text-[14px] text-[#4F5C67]">
                    No authorized projects are available yet. Create or join a project first.
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    {projects.map((proj) => (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => {
                          setUserMgmtChooserOpen(false);
                          navigate(`/projects/${proj.id}/users`);
                        }}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/70 px-3.5 py-2 text-[14px] font-medium text-[#1B2A4A] transition-colors hover:border-[#D4652F] hover:bg-[#FFF3EB]"
                      >
                        <span>{proj.name}</span>
                        <span className="text-[13px] text-[#4F5C67]">
                          ({formatRoleLabel(proj.membership.role, proj.membership)})
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#A64011]" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Resumable Draft Banner */}
            {activeDraft && (
              <div
                role="status"
                data-testid="resume-draft-banner"
                className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4652F]/40 bg-white px-5 py-3.5"
              >
                <div className="text-[14px] leading-[20px]">
                  <span className="font-semibold text-[#A64011]">Draft in progress:</span>{' '}
                  <span className="font-semibold text-[#1B2A4A]">{activeDraft.name}</span>{' '}
                  <span className="text-[#4F5C67]">(Step {activeDraft.draftStep} of 3)</span>
                </div>
                <Link
                  to="/projects/new"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D4652F] bg-[#FFF3EB] px-3.5 py-1.5 text-[14px] font-semibold text-[#A64011] hover:bg-[#D4652F]/15"
                >
                  Resume draft
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}

            {/* Pending Invitations State */}
            {pendingInvitations.length > 0 && (
              <section
                aria-label="Pending project invitations"
                data-testid="pending-invitations-section"
                className="mt-5 rounded-xl border border-[#D9DEE2] bg-white p-5"
              >
                <div className="flex items-center gap-2 text-[15px] leading-[22px] font-semibold text-[#1B2A4A]">
                  <Mail className="h-4 w-4 text-[#D4652F]" aria-hidden="true" />
                  Invitation pending ({pendingInvitations.length})
                </div>
                <ul className="mt-3 divide-y divide-[#D9DEE2]">
                  {pendingInvitations.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]"
                    >
                      <div>
                        <span className="font-semibold text-[#1B2A4A]">{inv.projectName}</span>
                        <span className="text-[#4F5C67]"> · Role: {formatRoleLabel(inv.role)}</span>
                      </div>
                      <span className="rounded-md border border-[#D4652F]/35 bg-[#FFF3EB] px-2.5 py-0.5 text-[13px] font-medium text-[#A64011]">
                        Invitation pending
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Network / Server Error State */}
            {directoryError && (
              <div
                role="alert"
                className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B42318]/35 bg-[#FEF3F2] px-5 py-4 text-[14px] text-[#B42318]"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{directoryError.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshDirectory()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#B42318]/30 bg-white px-3.5 text-[13px] font-semibold text-[#B42318] hover:bg-[#FEF3F2]"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              </div>
            )}

            {/* Directory Body */}
            {directoryLoading ? (
              <div className="mt-6 rounded-xl border border-[#D9DEE2] bg-white px-6 py-12 text-center text-[15px] text-[#4F5C67]">
                Loading authorized projects…
              </div>
            ) : projects.length === 0 ? (
              <section
                data-testid="empty-projects-directory"
                className="mt-6 rounded-xl border border-[#D9DEE2] bg-white px-6 py-14 text-center"
              >
                <FolderOpen className="mx-auto h-7 w-7 text-[#4F5C67]" aria-hidden="true" />
                <h2 className="mt-3 text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                  No projects yet
                </h2>
                <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-[22px] text-[#4F5C67]">
                  You do not have active membership in any project yet. Start a new project as a
                  Contractor or wait for a project invitation to be activated.
                </p>
                <Link
                  to="/projects/new"
                  className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create new project
                </Link>
              </section>
            ) : filtered.length === 0 ? (
              <section className="mt-6 rounded-xl border border-[#D9DEE2] bg-white px-6 py-12 text-center">
                <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                  No matching projects
                </h2>
                <p className="mt-1.5 text-[15px] leading-[22px] text-[#4F5C67]">
                  No authorized projects matched the current search or filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setStatusFilter('all');
                  }}
                  className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                >
                  Clear filters
                </button>
              </section>
            ) : viewMode === 'grid' ? (
              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((proj) => {
                  const isContractor = canEditProjectSettings(proj.membership.role);
                  const overviewPath = `/projects/${proj.id}`;
                  const settingsPath = `/projects/${proj.id}/settings`;
                  const activeBlueprintCount = proj.blueprints.filter(
                    (b) => b.status !== 'removed'
                  ).length;

                  return (
                    <article
                      key={proj.id}
                      data-testid={`project-card-${proj.id}`}
                      className="relative flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-5 transition-colors hover:border-[#1B2A4A]/45"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-[13px] leading-[18px]">
                            <span className="font-semibold text-[#1B2A4A]">
                              {formatRoleLabel(proj.membership.role, proj.membership)}
                            </span>
                            <span aria-hidden="true" className="text-[#D9DEE2]">
                              ·
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-[12px] font-medium ${
                                proj.status === 'ready' || proj.status === 'active'
                                  ? 'bg-[#DCFCE7] text-[#166534]'
                                  : proj.status === 'draft'
                                    ? 'bg-[#FFF3EB] text-[#A64011]'
                                    : 'bg-[#F4F3EF] text-[#1B2A4A]'
                              }`}
                            >
                              {formatProjectSetupStatusLabel(proj.status)}
                            </span>
                          </div>

                          {isContractor && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenOverflowId((prev) => (prev === proj.id ? null : proj.id))
                                }
                                aria-expanded={openOverflowId === proj.id}
                                aria-haspopup="menu"
                                aria-label={`Project actions for ${proj.name}`}
                                data-testid={`project-overflow-${proj.id}`}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
                              >
                                <MoreVertical className="h-4 w-4" aria-hidden="true" />
                              </button>

                              {openOverflowId === proj.id && (
                                <div
                                  role="menu"
                                  aria-label={`Actions for ${proj.name}`}
                                  className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-[#D9DEE2] bg-white p-1.5 shadow-lg"
                                >
                                  <Link
                                    to={settingsPath}
                                    role="menuitem"
                                    onClick={() => setOpenOverflowId(null)}
                                    className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-1.5 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                                  >
                                    <Settings className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                                    Edit project
                                  </Link>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenOverflowId(null);
                                      setDeleteError(null);
                                      setDeleteTarget(proj);
                                    }}
                                    className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[14px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    Delete project
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <Link
                          to={overviewPath}
                          className="mt-2 block text-[18px] leading-[24px] font-bold text-[#1B2A4A] hover:text-[#A64011]"
                        >
                          {proj.name}
                        </Link>

                        <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
                          Contractor: {proj.contractorDisplayName}
                        </p>

                        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#D9DEE2] pt-3.5 text-[13px] leading-[18px]">
                          <div>
                            <dt className="text-[#4F5C67]">Blueprints</dt>
                            <dd className="mt-0.5 font-semibold text-[#1B2A4A] tabular-nums">
                              {activeBlueprintCount}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1 text-[#4F5C67]">
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              Timezone
                            </dt>
                            <dd className="mt-0.5 truncate font-medium text-[#1B2A4A]">
                              {proj.timezone}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="mt-5 border-t border-[#D9DEE2] pt-4">
                        <Link
                          to={overviewPath}
                          data-testid={`open-project-${proj.id}`}
                          className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E]"
                        >
                          Open project
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-xl border border-[#D9DEE2] bg-white">
                <ul className="divide-y divide-[#D9DEE2]">
                  {filtered.map((proj) => {
                    const isContractor = canEditProjectSettings(proj.membership.role);
                    const overviewPath = `/projects/${proj.id}`;
                    const settingsPath = `/projects/${proj.id}/settings`;
                    const activeBlueprintCount = proj.blueprints.filter(
                      (b) => b.status !== 'removed'
                    ).length;

                    return (
                      <li
                        key={proj.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#F4F3EF]/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={overviewPath}
                              className="text-[16px] leading-[22px] font-bold text-[#1B2A4A] hover:text-[#A64011]"
                            >
                              {proj.name}
                            </Link>
                            <span
                              className={`rounded px-2 py-0.5 text-[12px] font-medium ${
                                proj.status === 'ready' || proj.status === 'active'
                                  ? 'bg-[#DCFCE7] text-[#166534]'
                                  : 'bg-[#FFF3EB] text-[#A64011]'
                              }`}
                            >
                              {formatProjectSetupStatusLabel(proj.status)}
                            </span>
                          </div>
                          <div className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                            {formatRoleLabel(proj.membership.role, proj.membership)} · Contractor:{' '}
                            {proj.contractorDisplayName} · {activeBlueprintCount} blueprints ·{' '}
                            {proj.timezone}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            to={overviewPath}
                            data-testid={`open-project-${proj.id}`}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                          >
                            Open project
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                          {isContractor && (
                            <Link
                              to={settingsPath}
                              aria-label={`Edit ${proj.name}`}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
                            >
                              <Settings className="h-4 w-4" aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </main>
      </div>

      <DeleteProjectModal
        open={Boolean(deleteTarget)}
        projectName={deleteTarget?.name ?? ''}
        projectId={deleteTarget?.id ?? ''}
        impact={
          deleteTarget
            ? {
                areaCount: deleteTarget.areas?.length ?? 0,
                blueprintCount: deleteTarget.blueprints.filter((b) => b.status !== 'removed')
                  .length,
                publishedModelCount: (deleteTarget.modelVersions ?? []).filter(
                  (v) => v.status === 'published'
                ).length,
                pinCount: deleteTarget.pins?.length ?? 0,
              }
            : undefined
        }
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (!deleteBusy) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
