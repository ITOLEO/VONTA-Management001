import { isProjectLead } from '../domain/accountTypes';
import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Box } from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { useDemoAddendum } from '../context/DemoAddendumContext';
import { filterBlueprintSheets } from '../domain/blueprintRegister';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { OverviewBlueprintHub } from '../components/OverviewBlueprintHub';
import { OverviewBlueprintRailSlot } from '../components/OverviewBlueprintRailSlot';
import { OverviewKpiRow } from '../components/OverviewKpiRow';
import { BlueprintLightboxModal } from '../components/BlueprintLightboxModal';
import { DepartmentDashboardSection } from '../components/DepartmentDashboardSection';
import { BudgetDashboardSection } from '../components/BudgetDashboardSection';
import { getProjectRoutes } from '../utils/projectRoutes';
import { buildOverviewRailGroups } from '../utils/moduleNavConfig';
import { buildDemoOverviewKpis } from '../utils/overviewKpis';

export function ProjectOverviewPage() {
  const { project: projectParam } = useParams();
  const location = useLocation();
  const {
    state,
    summary,
    model,
    storageWarning,
    departments,
    addDepartment,
    blueprintSheets,
    buildingSummary,
  } = useDemo();
  const addendum = useDemoAddendum();

  const [railQuery, setRailQuery] = useState('');
  const [railDeptFilter, setRailDeptFilter] = useState('all');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxInitialId, setLightboxInitialId] = useState<string | null>(null);
  const lightboxOpenerRef = useRef<HTMLElement | null>(null);

  const routes = getProjectRoutes(location.pathname, state.project.slug);
  const railGroups = useMemo(() => buildOverviewRailGroups(routes, 'overview'), [routes]);

  const lightboxSheets = useMemo(
    () =>
      filterBlueprintSheets(
        blueprintSheets,
        { query: railQuery, departmentId: railDeptFilter, includeSuperseded: true },
        departments
      ),
    [blueprintSheets, railQuery, railDeptFilter, departments]
  );

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (railDeptFilter !== 'all') {
      const deptName = departments.find((d) => d.id === railDeptFilter)?.name ?? railDeptFilter;
      parts.push(deptName);
    }
    if (railQuery.trim()) parts.push(`"${railQuery.trim()}"`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [railDeptFilter, railQuery, departments]);

  if (projectParam && projectParam !== state.project.slug) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <ProjectNavbar inProjectContext={false} hasContextualRail={false} />
        <main className="mx-auto w-full max-w-[800px] px-4 py-16 text-center">
          <h1 className="text-[26px] leading-[32px] font-bold">Project not found</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
            Return to the project directory to open {state.project.name}.
          </p>
          <Link
            to={routes.directoryPath}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All projects
          </Link>
        </main>
      </div>
    );
  }

  const activeArea = state.areas[0];
  const missingEvidenceCount = state.pins.filter(
    (p) => !p.evidence.before || !p.evidence.after
  ).length;
  const kpiItems = buildDemoOverviewKpis({
    approvedCount: summary.approvedCount,
    totalPins: summary.totalPins,
    verifiedProgressPercent: summary.verifiedProgressPercent,
    areaCount: state.areas.length,
    pendingReviewCount: summary.pendingReviewCount,
    materialExceptionCount: summary.materialExceptionCount,
    totalIssuedLines: summary.totalIssuedLines,
    totalMaterialLines: summary.totalMaterialLines,
    pins: state.pins,
  });

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <ProjectNavbar />

      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        <ContextualRail
          moduleLabel="Overview"
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
          bottomSlot={
            <OverviewBlueprintRailSlot
              sheets={blueprintSheets}
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
            {storageWarning && (
              <div
                role="status"
                className="mb-4 rounded-lg border border-[#D4652F]/40 bg-white px-4 py-2.5 text-[13px] leading-[18px] text-[#1B2A4A]"
              >
                {storageWarning}
              </div>
            )}

            {/* Upper Band: Left Context & Open Workspace | Right Whole-Building Summary + Department Strip */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,350px)_minmax(0,1fr)] lg:items-stretch xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <section className="flex flex-1 flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-6">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] leading-[18px]">
                      <span className="font-semibold text-[#1B2A4A]">
                        {state.project.roleLabel} · {state.project.sheetCode}{' '}
                        {state.project.sheetRevision}
                      </span>
                    </div>

                    <h1 className="vonta-page-title mt-2 text-[#1B2A4A]">
                      {state.project.name}
                    </h1>
                    <p className="mt-1 text-[15px] leading-[22px] text-[#4F5C67]">
                      2-Storey Pavilion · Ground Floor &amp; Level 2 Studio
                    </p>

                    <p className="mt-3 text-[13px] leading-[18px] font-medium text-[#A64011]">
                      {state.project.geometryNotice}
                    </p>

                    <dl className="mt-4 divide-y divide-[#D9DEE2] border-y border-[#D9DEE2] text-[14px] leading-[20px]">
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#4F5C67]">Published model</dt>
                        <dd
                          data-testid="overview-model-version"
                          className="font-semibold text-[#1B2A4A]"
                        >
                          {activeArea?.name ?? 'Ground Floor'} · {state.project.sheetCode}{' '}
                          {state.project.sheetRevision}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#4F5C67]">Verification check</dt>
                        <dd className="font-semibold text-[#1B2A4A] tabular-nums">
                          Ruang Rapat {model.crossCheck.actualMm.toLocaleString('en-US')} mm (Δ{' '}
                          {model.crossCheck.deltaMm} mm)
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#4F5C67]">Blueprint register</dt>
                        <dd className="font-medium text-[#1B2A4A] tabular-nums">
                          {blueprintSheets.length} sheets · {departments.length} departments
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#4F5C67]">Open exceptions</dt>
                        <dd className="font-medium text-[#1B2A4A] tabular-nums">
                          {summary.materialExceptionCount} material · {missingEvidenceCount} missing
                          photos
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Single Primary Action */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-[13px] leading-[18px] text-[#4F5C67]">
                      Inspect areas, rooms, and wall-anchored Pins in 3D.
                    </span>
                    <Link
                      to={routes.workspacePath}
                      data-testid="open-workspace-cta"
                      className="inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                    >
                      <Box className="h-4 w-4" aria-hidden="true" />
                      Open workspace
                    </Link>
                  </div>
                </section>
              </div>

              {/* Right Column: Whole-Building Summary + Side Elevation + Horizontal Department Strip */}
              <div className="min-w-0">
                <OverviewBlueprintHub
                  wholeBuilding={buildingSummary.wholeBuilding}
                  departmentStrip={buildingSummary.departmentStrip}
                  totalSheetCount={lightboxSheets.length}
                  blueprintManagementPath={routes.blueprintManagementPath}
                  getSheetDetailPath={routes.blueprintDetailPath}
                  isDemo
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
              filterSummary={activeFilterSummary}
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
                pins={state.pins}
                departments={departments}
                getPinHref={(p) => routes.pinDetailPath(p.slug)}
                pinListHref={routes.workListPath}
                attendanceDays={addendum.getDemoDepartmentAttendance('All')}
                getAttendanceDaysForDepartment={addendum.getDemoDepartmentAttendance}
                attendanceHref={routes.modulePath('attendance')}
                projectTimezone={state.project.timezone}
              />
            </div>

            {/* Monthly Department Budget Carousel + Full-Width Budget Usage Chart (replaces Recent activity) */}
            <div className="mt-6">
              <BudgetDashboardSection
                departments={departments}
                ledger={addendum.budgetLedger}
                accountingHref={routes.modulePath('accounting')}
                canAddDepartment={isProjectLead(addendum.activePersona.role)}
                onAddDepartment={({ name, pinColorHex }) =>
                  addDepartment({ name, defaultPinColor: pinColorHex })
                }
                projectTimezone={state.project.timezone}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
