import { useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileImage,
  Info,
  KeyRound,
  Palette,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { BlueprintPreview, type BlueprintSourceItem } from '../components/BlueprintPreview';
import { ColorPickerControl } from '../components/ColorPickerControl';
import { getProjectRoutes } from '../utils/projectRoutes';
import { buildOverviewRailGroups } from '../utils/moduleNavConfig';
import { useSectionScrollSpy } from '../utils/scrollSpy';

type SettingsSectionId = 'general' | 'departments' | 'access' | 'blueprints' | 'danger';

const SETTINGS_SECTIONS: ReadonlyArray<{
  id: SettingsSectionId;
  label: string;
  anchor: string;
}> = [
  { id: 'general', label: 'General', anchor: 'demo-settings-general' },
  { id: 'departments', label: 'Department Pin colors', anchor: 'demo-settings-departments' },
  { id: 'access', label: 'Project access', anchor: 'demo-settings-access' },
  { id: 'blueprints', label: 'Blueprints', anchor: 'demo-settings-blueprints' },
  { id: 'danger', label: 'Danger zone', anchor: 'demo-settings-danger' },
];

export function ProjectSettingsPage() {
  const { project: projectParam } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, model, departments, updateDepartmentColor, clearCustomBlueprint } = useDemo();
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [deptColorNotice, setDeptColorNotice] = useState<string | null>(null);
  const routes = getProjectRoutes(location.pathname, state.project.slug);

  const blueprintSources = useMemo<BlueprintSourceItem[]>(() => {
    const items: BlueprintSourceItem[] = state.areas.map((area, index) => ({
      id: area.id,
      areaName: area.name,
      sheetCode: state.project.sheetCode,
      revision: state.project.sheetRevision,
      pageLabel: `Sheet ${index + 1} · Floor Plan & Sections`,
      caption: 'Simulated architectural reference sheet (Floor plan)',
      dimensionsSummary: `Axes 1–3: 8,400 mm · Axes A–C: 6,000 mm · Cross-check: ${model.crossCheck.actualMm.toLocaleString('en-US')} mm`,
      src: area.blueprintSrc,
    }));

    items.push({
      id: 'a03-sections-schedule',
      areaName: state.areas[0]?.name ?? 'Ground Floor',
      sheetCode: `${state.project.sheetCode}-S`,
      revision: state.project.sheetRevision,
      pageLabel: 'Sheet 2 · Wall Sections & Openings',
      caption: 'Simulated architectural reference sheet (Sections & opening schedule)',
      dimensionsSummary:
        'Wall height +3,200 mm · Exterior 150 mm · Interior 100 mm · Read-only sheet preview',
      src: state.areas[0]?.blueprintSrc ?? null,
    });

    if (state.customBlueprintDataUrl && state.customBlueprintFileName) {
      items.push({
        id: 'uploaded-local-source',
        areaName: state.areas[0]?.name ?? 'Ground Floor',
        sheetCode: state.customBlueprintFileName,
        revision: 'Uploaded copy',
        pageLabel: 'Local reference',
        caption: `Uploaded reference image (${state.customBlueprintFileName})`,
        dimensionsSummary:
          'Browsing an uploaded reference image does not publish a model version or change A-03 geometry.',
        src: state.customBlueprintDataUrl,
      });
    }
    return items;
  }, [
    state.areas,
    state.project.sheetCode,
    state.project.sheetRevision,
    state.customBlueprintDataUrl,
    state.customBlueprintFileName,
    model.crossCheck.actualMm,
  ]);

  const legacyHistoryRequested = searchParams.get('section') === 'history';
  const { activeSection, jumpToSection } = useSectionScrollSpy<SettingsSectionId>(
    SETTINGS_SECTIONS,
    'general',
    { readingLineOffsetPx: 118 }
  );

  if (projectParam && projectParam !== state.project.slug) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <ProjectNavbar inProjectContext={false} hasContextualRail={false} />
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

  const overviewRailGroups = buildOverviewRailGroups(routes, 'settings');

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <ProjectNavbar />

      <div className="flex min-h-0 flex-1">
        <ContextualRail
          moduleLabel="Overview"
          groups={overviewRailGroups}
          projectSettingsPath={routes.settingsPath}
          projectSettingsActive
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            {/* Local settings section navigation */}
            <aside
              aria-label="Project settings sections"
              className="w-full shrink-0 lg:sticky lg:top-[84px] lg:w-[208px]"
            >
              <Link
                to={routes.overviewPath}
                data-testid="settings-back-to-overview"
                className="mb-3 inline-flex min-h-[40px] w-full items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] leading-[18px] font-semibold text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF]"
              >
                <ArrowLeft className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
                <span>Back to Project Overview</span>
              </Link>

              <div className="mb-3 hidden lg:block">
                <div className="text-[12px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase">
                  Project settings
                </div>
                <p className="mt-0.5 truncate text-[13px] leading-[18px] text-[#4F5C67]">
                  {state.project.name}
                </p>
              </div>

              <div className="lg:hidden">
                <label
                  htmlFor="demo-settings-section-select"
                  className="block text-[12px] font-semibold tracking-wide text-[#4F5C67] uppercase"
                >
                  Settings section
                </label>
                <select
                  id="demo-settings-section-select"
                  value={activeSection}
                  onChange={(e) => jumpToSection(e.target.value as SettingsSectionId)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] font-medium text-[#1B2A4A]"
                >
                  {SETTINGS_SECTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <nav className="hidden space-y-1 lg:block" aria-label="Settings sections">
                {SETTINGS_SECTIONS.map((s) => {
                  const active = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      data-testid={`project-settings-nav-${s.id}`}
                      aria-current={active ? 'location' : undefined}
                      onClick={() => jumpToSection(s.id)}
                      className={`flex min-h-[40px] w-full items-center rounded-lg border px-3 py-2 text-left text-[14px] leading-[20px] font-medium transition-colors ${
                        active
                          ? 'border-[#D4652F]/35 bg-[#FFF3EB] font-semibold text-[#A64011]'
                          : 'border-transparent text-[#4F5C67] hover:bg-white hover:text-[#1B2A4A]'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Centered settings cards */}
            <div className="min-w-0 flex-1 max-w-[780px]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-[26px] leading-[32px] font-bold tracking-tight text-[#1B2A4A]">
                    Project settings
                  </h1>
                  <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
                    Configuration, access, and blueprints for {state.project.name}.
                  </p>
                </div>
                <span className="rounded-md border border-[#D9DEE2] bg-white px-2.5 py-1 text-[12px] leading-[16px] font-semibold text-[#A64011]">
                  {state.project.demoLabel}
                </span>
              </div>

              {legacyHistoryRequested && (
                <div
                  role="status"
                  data-testid="legacy-project-history-notice"
                  className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#D4652F]/35 bg-[#FFF3EB] p-4 text-[13px] leading-[19px] text-[#1B2A4A]"
                >
                  <div className="flex items-start gap-2.5">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]" aria-hidden="true" />
                    <div>
                      <strong className="font-semibold text-[#A64011]">
                        Project Settings History has been retired.
                      </strong>{' '}
                      All underlying operational audit records remain preserved. Inspect personal
                      changes in{' '}
                      <Link to="/demo/profile?section=history" className="font-semibold underline">
                        Account history
                      </Link>
                      , or open individual records in{' '}
                      <Link to={routes.pinListPath} className="font-semibold underline">
                        PIN
                      </Link>{' '}
                      and{' '}
                      <Link to={routes.attendancePath} className="font-semibold underline">
                        Attendance
                      </Link>
                      .
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchParams({})}
                    className="rounded-lg border border-[#D9DEE2] bg-white px-2.5 py-1 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="mt-6 space-y-6">
                {/* 1. General */}
                <section
                  id="demo-settings-general"
                  className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D9DEE2] px-6 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                        <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                          General
                        </h2>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                        Synthetic preview metadata is fixed in demo mode.
                      </p>
                    </div>
                  </div>

                  <dl className="divide-y divide-[#D9DEE2] px-6 text-[14px] leading-[20px]">
                    <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-4">
                      <dt className="font-medium text-[#4F5C67]">Project name</dt>
                      <dd className="font-medium text-[#1B2A4A]">{state.project.name}</dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-4">
                      <dt className="font-medium text-[#4F5C67]">Role label</dt>
                      <dd className="font-medium text-[#1B2A4A]">{state.project.roleLabel}</dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-4">
                      <dt className="font-medium text-[#4F5C67]">Active sheet reference</dt>
                      <dd className="font-medium text-[#1B2A4A]">
                        {state.project.sheetCode} {state.project.sheetRevision}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex justify-end border-t border-[#D9DEE2] bg-[#F4F3EF]/35 px-6 py-3.5">
                    <Link
                      to="/auth/sign-in"
                      className="inline-flex min-h-[40px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                    >
                      Sign in to manage live projects
                    </Link>
                  </div>
                </section>

                {/* 1b. Department Pin colors */}
                <section
                  id="demo-settings-departments"
                  data-testid="settings-department-colors-section"
                  className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white p-6"
                >
                  <div className="border-b border-[#D9DEE2] pb-4">
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
                      <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                        Department Pin colors
                      </h2>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                      Edit each department’s default Pin marker color. Inheriting Pins update
                      immediately while Pins with manual overrides keep their chosen color.
                    </p>
                  </div>

                  {deptColorNotice && (
                    <div
                      role="status"
                      className="mt-4 flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 px-3 py-2 text-[13px] text-[#166534]"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{deptColorNotice}</span>
                    </div>
                  )}

                  <div className="mt-4 space-y-3">
                    {departments.map((dept) => {
                        const isOpen = editingDeptId === dept.id;
                        return (
                          <div
                            key={dept.id}
                            data-testid={`dept-color-row-${dept.slug}`}
                            className="rounded-xl border border-[#D9DEE2] bg-[#F4F3EF]/35 p-3.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="h-5 w-5 rounded-full border border-black/15"
                                  style={{ backgroundColor: dept.defaultPinColor }}
                                />
                                <div>
                                  <div className="text-[14px] font-semibold text-[#1B2A4A]">
                                    {dept.name}
                                  </div>
                                  <div className="font-mono text-[12px] text-[#4F5C67]">
                                    {dept.defaultPinColor}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                data-testid={`dept-color-edit-${dept.slug}`}
                                onClick={() => setEditingDeptId(isOpen ? null : dept.id)}
                                className="inline-flex min-h-[36px] items-center rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                              >
                                {isOpen ? 'Done' : 'Change color'}
                              </button>
                            </div>
                            {isOpen && (
                              <div className="mt-3 border-t border-[#D9DEE2] pt-3">
                                <ColorPickerControl
                                  value={dept.defaultPinColor}
                                  onChange={(hex) => {
                                    const res = updateDepartmentColor(dept.id, hex);
                                    if (res.ok) {
                                      setDeptColorNotice(
                                        `Updated ${dept.name} default Pin color to ${res.updated.defaultPinColor}. Inheriting Pins refreshed.`
                                      );
                                    }
                                  }}
                                  label={`${dept.name} Pin color`}
                                  compact
                                  testIdPrefix={`dept-color-picker-${dept.slug}`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </section>

                {/* 2. Project access */}
                <section
                  id="demo-settings-access"
                  className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white p-6"
                >
                  <div className="flex items-start gap-3">
                    <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#4F5C67]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                        Project access
                      </h2>
                      <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
                        Project passwords and team role grants are disabled in the synthetic local
                        demo. Live projects store project passwords separately from account
                        passwords.
                      </p>
                    </div>
                  </div>
                </section>

                {/* 3. Blueprints */}
                <section
                  id="demo-settings-blueprints"
                  data-testid="settings-blueprints-section"
                  className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white"
                >
                  <div className="border-b border-[#D9DEE2] px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileImage className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                      <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                        Blueprints
                      </h2>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                      Inspect original blueprint sheets and pages here. Switching previews does not
                      publish a model version.
                    </p>
                  </div>

                  <div className="p-4 sm:p-5">
                    <BlueprintPreview
                      sources={blueprintSources}
                      settingsPath={routes.settingsPath}
                      hideManageLink
                      settingsFooterSlot={(activeSource) => (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                          <span className="text-[#4F5C67]">
                            Original source:{' '}
                            <strong className="text-[#1B2A4A]">
                              {activeSource
                                ? `${activeSource.areaName} · ${activeSource.sheetCode} ${activeSource.revision}`
                                : 'None'}
                            </strong>
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            {activeSource?.src && (
                              <a
                                href={activeSource.src}
                                download={`${activeSource.sheetCode}-${activeSource.revision}.png`}
                                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                Download source
                              </a>
                            )}
                            {activeSource?.id === 'uploaded-local-source' && (
                              <button
                                type="button"
                                onClick={clearCustomBlueprint}
                                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#B42318]/35 bg-white px-3 text-[12px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                              >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                Remove copy
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    />
                  </div>
                </section>

                {/* 4. Danger zone */}
                <section
                  id="demo-settings-danger"
                  className="scroll-mt-[84px] rounded-xl border border-[#B42318]/35 bg-white p-6"
                >
                  <div className="flex items-center gap-2 border-b border-[#B42318]/20 pb-3.5">
                    <AlertTriangle className="h-4 w-4 text-[#B42318]" aria-hidden="true" />
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#B42318]">
                      Danger zone
                    </h2>
                  </div>
                  <p className="mt-3 text-[14px] leading-[20px] text-[#4F5C67]">
                    The synthetic A-03 demo project cannot be permanently deleted. If a local
                    custom drawing was attached earlier, you can clear it below.
                  </p>

                  {state.customBlueprintFileName ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 px-4 py-3 text-[14px]">
                      <span className="font-medium text-[#1B2A4A]">
                        Local custom drawing: {state.customBlueprintFileName}
                      </span>
                      <button
                        type="button"
                        onClick={clearCustomBlueprint}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#B42318]/35 bg-white px-3 text-[13px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Remove blueprint
                      </button>
                    </div>
                  ) : (
                    <p className="mt-3 text-[13px] leading-[18px] text-[#4F5C67]">
                      No removable custom drawings are currently attached.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
