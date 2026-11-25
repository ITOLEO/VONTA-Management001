import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  LayoutGrid,
  List,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { getProjectRoutes } from '../utils/projectRoutes';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'active';
type SortMode = 'name-asc' | 'name-desc';

export function MyProjectsPage() {
  const { state, summary } = useDemo();
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showCreateNotice, setShowCreateNotice] = useState(false);
  const [userMgmtChooserOpen, setUserMgmtChooserOpen] = useState(false);

  const projects = useMemo(() => [state.project], [state.project]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((proj) => {
      if (statusFilter === 'active' && !proj.sheetCode) return false;
      if (!q) return true;
      const searchable = [
        proj.name,
        proj.sheetCode,
        proj.sheetRevision,
        proj.roleLabel,
        proj.locationLabel,
        'ruang kerja',
        'ruang rapat',
        'ruang arsip',
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(q);
    });

    return [...list].sort((a, b) =>
      sortMode === 'name-asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    );
  }, [projects, query, statusFilter, sortMode]);

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <ProjectNavbar inProjectContext={false} sectionLabel="Projects" hasContextualRail={false} />

      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1280px]">
            {/* Directory Title */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[13px] leading-[18px] font-medium text-[#4F5C67]">
                  Sample workspace · Isolated local session
                </p>
                <h1 className="vonta-page-title mt-0.5 text-[#1B2A4A]">
                  Projects
                </h1>
              </div>
            </div>

            {/* Full-Width Toolbar (Layout System Figure 4 & 6) */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#D9DEE2] pb-5">
              {/* Left: Search, Status Filter, Sort */}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
                <div className="relative min-w-[240px] flex-1 sm:max-w-[340px]">
                  <label htmlFor="project-search" className="sr-only">
                    Search projects
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                    aria-hidden="true"
                  />
                  <input
                    id="project-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects or sheets…"
                    className="h-10 w-full rounded-lg border border-[#D9DEE2] bg-white pl-9 pr-9 text-[14px] text-[#1B2A4A] placeholder:text-[#4F5C67]/75 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE]"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search query"
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <label htmlFor="demo-status-filter" className="sr-only">
                  Filter by status
                </label>
                <select
                  id="demo-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="h-10 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE]"
                >
                  <option value="all">Status: All</option>
                  <option value="active">Status: Active</option>
                </select>

                <label htmlFor="demo-sort-mode" className="sr-only">
                  Sort projects
                </label>
                <select
                  id="demo-sort-mode"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="h-10 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0B63CE]"
                >
                  <option value="name-asc">Sort: Name (A–Z)</option>
                  <option value="name-desc">Sort: Name (Z–A)</option>
                </select>
              </div>

              {/* Right: Grid/List View Toggle + Create New Project */}
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

                <button
                  type="button"
                  onClick={() => setShowCreateNotice((v) => !v)}
                  data-testid="create-new-project-btn"
                  className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create new project
                </button>
              </div>
            </div>

            {showCreateNotice && (
              <div
                role="status"
                className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-[#D4652F]/40 bg-white px-4 py-3 text-[14px] leading-[20px] text-[#1B2A4A]"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]"
                    aria-hidden="true"
                  />
                  <span>
                    Creating new projects requires a signed-in Contractor account. Open Paviliun
                    Kerja below to review the synthetic A-03 workspace.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateNotice(false)}
                  aria-label="Dismiss notice"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Project Chooser when User Management is opened without an active project */}
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
                        Team access is isolated per project. Choose a project to inspect its team.
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

                <div className="mt-4 flex flex-wrap gap-3">
                  {projects.map((proj) => {
                    const cardRoutes = getProjectRoutes(location.pathname, proj.slug);
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => {
                          setUserMgmtChooserOpen(false);
                          navigate(cardRoutes.modulePath('users'));
                        }}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/70 px-3.5 py-2 text-[14px] font-medium text-[#1B2A4A] transition-colors hover:border-[#D4652F] hover:bg-[#FFF3EB]"
                      >
                        <span>{proj.name}</span>
                        <span className="text-[13px] text-[#4F5C67]">({proj.roleLabel})</span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#A64011]" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Directory Cards or Rows */}
            {filtered.length === 0 ? (
              <section
                aria-live="polite"
                className="mt-6 rounded-xl border border-[#D9DEE2] bg-white px-6 py-12 text-center"
              >
                <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                  No matching projects
                </h2>
                <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
                  No projects matched “{query}”.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setStatusFilter('all');
                  }}
                  className="mt-5 inline-flex min-h-[40px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E]"
                >
                  Clear filter
                </button>
              </section>
            ) : viewMode === 'grid' ? (
              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((proj) => {
                  const cardRoutes = getProjectRoutes(location.pathname, proj.slug);

                  return (
                    <article
                      key={proj.id}
                      data-testid={`project-card-${proj.slug}`}
                      className="flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-5 transition-colors hover:border-[#1B2A4A]/45"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-[13px] leading-[18px] text-[#4F5C67]">
                          <span className="font-semibold text-[#1B2A4A]">{proj.roleLabel}</span>
                          <span className="rounded bg-[#DCFCE7] px-2 py-0.5 text-[12px] font-medium text-[#166534]">
                            Published · {proj.sheetCode} {proj.sheetRevision}
                          </span>
                        </div>

                        <Link
                          to={cardRoutes.overviewPath}
                          className="mt-2.5 block text-[18px] leading-[24px] font-bold text-[#1B2A4A] hover:text-[#A64011]"
                        >
                          {proj.name}
                        </Link>

                        <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
                          {proj.locationLabel}
                        </p>

                        <p className="mt-2.5 text-[13px] leading-[18px] font-medium text-[#A64011]">
                          {proj.geometryNotice}
                        </p>

                        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[#D9DEE2] pt-3.5 text-[13px] leading-[18px]">
                          <div>
                            <dt className="text-[#4F5C67]">Pins</dt>
                            <dd className="mt-0.5 font-semibold text-[#1B2A4A] tabular-nums">
                              {summary.totalPins}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#4F5C67]">Approved</dt>
                            <dd className="mt-0.5 font-semibold text-[#1B2A4A] tabular-nums">
                              {summary.approvedCount}/{summary.totalPins}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#4F5C67]">Materials</dt>
                            <dd className="mt-0.5 font-semibold text-[#1B2A4A] tabular-nums">
                              {summary.materialExceptionCount} open
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="mt-5 border-t border-[#D9DEE2] pt-4">
                        <Link
                          to={cardRoutes.overviewPath}
                          data-testid={`open-project-${proj.slug}`}
                          className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
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
                    const cardRoutes = getProjectRoutes(location.pathname, proj.slug);
                    return (
                      <li
                        key={proj.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#F4F3EF]/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={cardRoutes.overviewPath}
                              className="text-[16px] leading-[22px] font-bold text-[#1B2A4A] hover:text-[#A64011]"
                            >
                              {proj.name}
                            </Link>
                            <span className="rounded bg-[#DCFCE7] px-2 py-0.5 text-[12px] font-medium text-[#166534]">
                              Published · {proj.sheetCode} {proj.sheetRevision}
                            </span>
                          </div>
                          <div className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                            {proj.roleLabel} · {proj.locationLabel} · {summary.totalPins} Pins (
                            {summary.approvedCount}/{summary.totalPins} approved)
                          </div>
                        </div>

                        <Link
                          to={cardRoutes.overviewPath}
                          data-testid={`open-project-${proj.slug}`}
                          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                        >
                          Open project
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
