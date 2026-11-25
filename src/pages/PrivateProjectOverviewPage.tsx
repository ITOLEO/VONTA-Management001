import { demoAccounts } from '../domain/demoAccounts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Box,
  Layers,
  MapPin,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import { privateApi } from '../data/privateApi';
import {
  canEditProjectSettings,
  formatJobStatusLabel,
  formatProjectSetupStatusLabel,
  formatRoleLabel,
} from '../domain/accountTypes';
import { ensureProjectDepartments } from '../domain/departmentCatalog';
import {
  buildBuildingSummarySlides,
  filterBlueprintSheets,
} from '../domain/blueprintRegister';
import { buildLiveBlueprintSheets } from '../domain/liveBlueprintAdapter';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { OverviewBlueprintHub } from '../components/OverviewBlueprintHub';
import { OverviewBlueprintRailSlot } from '../components/OverviewBlueprintRailSlot';
import { OverviewKpiRow } from '../components/OverviewKpiRow';
import { BlueprintLightboxModal } from '../components/BlueprintLightboxModal';
import { DepartmentDashboardSection } from '../components/DepartmentDashboardSection';
import { LiveBudget } from './LiveBudget';
import type { DepartmentAttendanceDayMetric } from '../domain/attendanceEngine';

import type { Department } from '../domain/types';
import { getProjectRoutes } from '../utils/projectRoutes';
import { buildOverviewRailGroups } from '../utils/moduleNavConfig';
import { buildLiveOverviewKpis } from '../utils/overviewKpis';

export function PrivateProjectOverviewPage() {
  const { project: projectId = '' } = useParams();
  const { accessToken } = useAuth();
  const {
    activeProject,
    activeProjectLoading,
    activeProjectError,
    loadActiveProject,
  } = usePrivateProjects();

  const project = activeProject?.id === projectId ? activeProject : null;
  const [blobUrlsByAssetId, setBlobUrlsByAssetId] = useState<Record<string, string>>({});
  const [attendanceDaysByDept, setAttendanceDaysByDept] = useState<
    Record<string, DepartmentAttendanceDayMetric[]>
  >({});
  const [railQuery, setRailQuery] = useState('');
  const [railDeptFilter, setRailDeptFilter] = useState('all');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxInitialId, setLightboxInitialId] = useState<string | null>(null);
  const lightboxOpenerRef = useRef<HTMLElement | null>(null);

  const routes = useMemo(() => getProjectRoutes('/projects', projectId), [projectId]);
  const railGroups = useMemo(() => buildOverviewRailGroups(routes, 'overview'), [routes]);

  useEffect(() => {
    if (!projectId) return;
    void loadActiveProject(projectId);
  }, [projectId, loadActiveProject]);

  useEffect(() => {
    if (!accessToken || !project?.id) return;
    let cancelled = false;
    const divisions: Array<Department | 'All'> = ['All', 'Civil', 'Electrical', 'Plumbing', 'Finishing'];
    void Promise.all(
      divisions.map(async (div) => {
        try {
          const res = await privateApi.getDepartmentAttendanceMetrics(
            accessToken,
            project.id,
            {
              timezone: project.timezone || 'Asia/Makassar',
              division: div === 'All' ? undefined : div,
            }
          );
          return [div, res.days] as const;
        } catch {
          return [div, [] as DepartmentAttendanceDayMetric[]] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, DepartmentAttendanceDayMetric[]> = {};
      for (const [k, v] of entries) map[k] = v;
      setAttendanceDaysByDept(map);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, project?.id]);

  // Fetch authenticated private file previews for image blueprints (revoking on unmount)
  useEffect(() => {
    if (!accessToken || !project?.assets || project.assets.length === 0) {
      setBlobUrlsByAssetId({});
      return;
    }

    let cancelled = false;
    const createdUrls: string[] = [];

    const loadPreviews = async () => {
      const next: Record<string, string> = {};
      for (const asset of project.assets ?? []) {
        if (asset.mimeType === 'application/pdf') continue;
        if (asset.status === 'removed') continue;
        const url = await privateApi.fetchPrivateAssetBlobUrl(accessToken, asset.privateFileUrl);
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (url) {
          createdUrls.push(url);
          next[asset.id] = url;
        }
      }
      if (!cancelled) {
        setBlobUrlsByAssetId(next);
      }
    };

    void loadPreviews();

    return () => {
      cancelled = true;
      for (const u of createdUrls) {
        URL.revokeObjectURL(u);
      }
    };
  }, [accessToken, project?.id, project?.assets]);

  const departments = useMemo(
    () => ensureProjectDepartments(project?.id ?? projectId, null),
    [project?.id, projectId]
  );

  const liveSheets = useMemo(
    () => (project ? buildLiveBlueprintSheets(project, departments, blobUrlsByAssetId) : []),
    [project, departments, blobUrlsByAssetId]
  );

  const buildingSummary = useMemo(
    () =>
      buildBuildingSummarySlides(liveSheets, departments, {
        projectName: project?.name ?? 'Project',
        storyCount: Math.max(1, project?.areas?.length ?? 1),
        hasVerifiedElevationModel: false,
      }),
    [liveSheets, departments, project?.name, project?.areas?.length]
  );

  const lightboxSheets = useMemo(
    () =>
      filterBlueprintSheets(
        liveSheets,
        { query: railQuery, departmentId: railDeptFilter, includeSuperseded: true },
        departments
      ),
    [liveSheets, railQuery, railDeptFilter, departments]
  );

  if (activeProjectLoading && !project) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <PrivateNavbar inProjectContext={false} hasContextualRail={false} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-12 text-center text-[15px] text-[#4F5C67]">
          Loading project overview…
        </main>
      </div>
    );
  }

  if (activeProjectError && !project) {
    const isForbidden = activeProjectError.status === 403;
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <PrivateNavbar inProjectContext={false} hasContextualRail={false} />
        <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-16">
          <section
            data-testid={isForbidden ? 'project-forbidden-state' : 'project-error-state'}
            className="rounded-xl border border-[#D9DEE2] bg-white p-8 text-center"
          >
            {isForbidden ? (
              <ShieldAlert className="mx-auto h-8 w-8 text-[#B42318]" aria-hidden="true" />
            ) : (
              <AlertCircle className="mx-auto h-8 w-8 text-[#A64011]" aria-hidden="true" />
            )}
            <h1 className="vonta-page-title mt-3 text-[#1B2A4A]">
              {isForbidden ? 'Access forbidden' : 'Project unavailable'}
            </h1>
            <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
              {activeProjectError.message}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/projects"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
              >
                Back to Projects
              </Link>
              {!isForbidden && (
                <button
                  type="button"
                  onClick={() => void loadActiveProject(projectId)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!project) return null;

  const isContractor = canEditProjectSettings(project.membership.role);
  const areas = project.areas ?? [];
  const modelVersions = project.modelVersions ?? [];
  const publishedModels = modelVersions.filter((v) => v.status === 'published');
  const pins = project.pins ?? [];
  const latestJob = project.jobs?.[0] ?? null;

  const kpiItems = buildLiveOverviewKpis({
    pins,
    publishedModelCount: publishedModels.length,
    areaCount: areas.length,
  });

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <PrivateNavbar inProjectContext projectId={project.id} projectName={project.name} />

      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        <ContextualRail
          moduleLabel="Overview"
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
          bottomSlot={
            <OverviewBlueprintRailSlot
              sheets={liveSheets}
              departments={departments}
              query={railQuery}
              onQueryChange={setRailQuery}
              departmentFilter={railDeptFilter}
              onDepartmentFilterChange={setRailDeptFilter}
              getSheetDetailPath={routes.blueprintDetailPath}
            />
          }
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="w-full">
            <nav className="vt-role-tools" aria-label="Tools for your project role">
              <strong>{formatRoleLabel(project.membership.role, project.membership)} tools</strong>
              {demoAccounts.find(a=>a.role===project.membership.role)?.tasks.filter(([,slug])=>Boolean(slug)).map(([label,slug])=>
                <Link key={slug} to={routes.modulePath(slug)}>{label}</Link>
              )}
            </nav>
            {/* Upper Band: Left Context & Open Workspace | Right Blueprint Summary Hub */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,350px)_minmax(0,1fr)] lg:items-stretch xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <section className="flex flex-1 flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-6">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] leading-[18px]">
                      <span className="font-semibold text-[#1B2A4A]">
                        {formatRoleLabel(project.membership.role, project.membership)}
                      </span>
                      <span
                        data-testid="overview-setup-status"
                        className={`rounded px-2 py-0.5 font-medium ${
                          project.status === 'ready' || project.status === 'active'
                            ? 'bg-[#DCFCE7] text-[#166534]'
                            : 'bg-[#FFF3EB] text-[#A64011]'
                        }`}
                      >
                        {formatProjectSetupStatusLabel(project.status)}
                      </span>
                    </div>

                    <h1 className="vonta-page-title mt-2 text-[#1B2A4A]">
                      {project.name}
                    </h1>
                    <p className="mt-1 text-[15px] leading-[22px] text-[#4F5C67]">
                      Contractor: {project.contractorDisplayName}
                    </p>

                    <dl className="mt-4 divide-y divide-[#D9DEE2] border-y border-[#D9DEE2] text-[14px] leading-[20px]">
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#4F5C67]">Published 3D models</dt>
                        <dd className="font-semibold text-[#1B2A4A]">
                          {publishedModels.length > 0
                            ? `${publishedModels.length} active across ${areas.length} area${areas.length === 1 ? '' : 's'}`
                            : 'None published yet'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#4F5C67]">Latest processing job</dt>
                        <dd className="font-medium text-[#1B2A4A]">
                          {latestJob ? formatJobStatusLabel(latestJob.status) : 'Not started'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#4F5C67]">Project timezone</dt>
                        <dd className="font-medium text-[#1B2A4A]">{project.timezone}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#4F5C67]">Spatial work Pins</dt>
                        <dd className="font-semibold text-[#1B2A4A] tabular-nums">{pins.length}</dd>
                      </div>
                    </dl>

                    {project.status === 'draft' && isContractor && (
                      <div className="mt-4 rounded-lg border border-[#D4652F]/40 bg-[#FFF3EB]/60 p-4">
                        <div className="text-[14px] font-semibold text-[#1B2A4A]">
                          Blueprint publication required
                        </div>
                        <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                          This project remains in Draft until a Contractor verifies and publishes
                          its first blueprint-derived 3D model.
                        </p>
                        <Link
                          to="/projects/new"
                          data-testid="resume-setup-wizard-cta"
                          className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                        >
                          Resume setup wizard
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Single Primary Action */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-[13px] leading-[18px] text-[#4F5C67]">
                      {publishedModels.length > 0
                        ? 'Inspect published 3D area models, rooms, and building surface Pins.'
                        : 'Open Workspace to manage areas or publish your first blueprint model.'}
                    </span>
                    <Link
                      to={routes.workspacePath}
                      data-testid="open-workspace-cta"
                      className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                    >
                      <Box className="h-4 w-4" aria-hidden="true" />
                      Open workspace
                    </Link>
                  </div>
                </section>
              </div>

              <div className="min-w-0">
                <OverviewBlueprintHub
                  wholeBuilding={buildingSummary.wholeBuilding}
                  departmentStrip={buildingSummary.departmentStrip}
                  totalSheetCount={lightboxSheets.length}
                  blueprintManagementPath={routes.blueprintManagementPath}
                  getSheetDetailPath={routes.blueprintDetailPath}
                  onOpenLightbox={(sheetId, opener) => {
                    lightboxOpenerRef.current = opener ?? null;
                    setLightboxInitialId(sheetId ?? null);
                    setLightboxOpen(true);
                  }}
                />
              </div>
            </div>

            <BlueprintLightboxModal
              open={lightboxOpen}
              sheets={lightboxSheets}
              initialSheetId={lightboxInitialId}
              getSheetDetailPath={routes.blueprintDetailPath}
              onClose={() => {
                setLightboxOpen(false);
                lightboxOpenerRef.current?.focus();
              }}
            />

            {/* Static 5-Tile Compact Near-Square Operational Summary Row */}
            <OverviewKpiRow items={kpiItems} />

            {/* Operational Charts: 3 Stable Fixed-Height Plot Cards */}
            <div className="mt-7">
              <DepartmentDashboardSection
                pins={pins}
                departments={departments}
                getPinHref={(p) => routes.pinDetailPath(p.id)}
                pinListHref={routes.workListPath}
                attendanceDays={attendanceDaysByDept['All'] ?? []}
                getAttendanceDaysForDepartment={(dept) => attendanceDaysByDept[dept] ?? []}
                attendanceHref={routes.modulePath('attendance')}
                projectTimezone={project.timezone || 'Asia/Makassar'}
              />
            </div>

            {/* Department Budget Allocation & Usage (truthful live state, zero demo figures) */}
            <div className="mt-6">
              <LiveBudget project={project}/>
            </div>

            {/* Building Areas & Recent Activity */}
            <section className="mt-6 rounded-xl border border-[#D9DEE2] bg-white p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                  <Layers className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                  Building areas
                </h2>
                <Link
                  to={routes.workListPath}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[#A64011] hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  View Pins ({pins.length})
                </Link>
              </div>

              {areas.length === 0 ? (
                <p className="mt-3 text-[14px] text-[#4F5C67]">
                  No areas added yet. Upload a blueprint in the setup wizard or Workspace to create
                  your first area.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[#D9DEE2] rounded-lg border border-[#D9DEE2]">
                  {areas.map((area) => {
                    const activeModel = modelVersions.find(
                      (v) => v.id === area.activeModelVersionId && v.status === 'published'
                    );
                    const areaPinCount = pins.filter((p) => p.areaId === area.id).length;
                    return (
                      <li
                        key={area.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[14px]"
                      >
                        <div>
                          <div className="font-semibold text-[#1B2A4A]">{area.name}</div>
                          <div className="text-[12px] text-[#4F5C67]">
                            {activeModel
                              ? `Published v${activeModel.versionNumber} · ${activeModel.sheetCode} ${activeModel.revision} · ${activeModel.geometry.rooms.length} room${activeModel.geometry.rooms.length === 1 ? '' : 's'}`
                              : 'Awaiting verified model publication'}
                          </div>
                        </div>
                        <div className="text-[12px] font-medium text-[#4F5C67] tabular-nums">
                          {areaPinCount} Pin{areaPinCount === 1 ? '' : 's'}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
