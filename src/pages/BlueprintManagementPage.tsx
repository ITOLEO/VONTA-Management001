import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  FileWarning,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { useAuth } from '../context/AuthContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import { privateApi } from '../data/privateApi';
import { canEditProjectSettings } from '../domain/accountTypes';
import { ensureProjectDepartments } from '../domain/departmentCatalog';
import {
  filterBlueprintSheets,
  getSheetPreviewSrc,
  type BlueprintSheetClassification,
  type BlueprintSheetRecord,
} from '../domain/blueprintRegister';
import { buildLiveBlueprintSheets } from '../domain/liveBlueprintAdapter';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { OverviewBlueprintRailSlot } from '../components/OverviewBlueprintRailSlot';
import { OrbitableModelPreview } from '../components/OrbitableModelPreview';
import { getProjectRoutes } from '../utils/projectRoutes';
import { buildOverviewRailGroups } from '../utils/moduleNavConfig';

interface BlueprintManagementPageProps {
  mode: 'demo' | 'live';
}

export function BlueprintManagementPage({ mode }: BlueprintManagementPageProps) {
  const { project: projectParam = '' } = useParams();
  const location = useLocation();
  const demo = useDemo();
  const { accessToken } = useAuth();
  const { activeProject, loadActiveProject } = usePrivateProjects();

  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Upload form state (enforces mandatory department OR combined Electrical + Plumbing mapping)
  const [uploadCode, setUploadCode] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadRevision, setUploadRevision] = useState('R00');
  const [uploadAreaId, setUploadAreaId] = useState('area-a03-ground');
  const [uploadFloorLabel, setUploadFloorLabel] = useState('Ground Floor (0.00 m)');
  const [uploadMappingMode, setUploadMappingMode] = useState<string>(''); // '' = unselected (required!)
  const [uploadClass, setUploadClass] = useState<BlueprintSheetClassification>('plan');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadScale, setUploadScale] = useState('1:50 (mm)');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [visibleCount, setVisibleCount] = useState(12);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode === 'live' && projectParam) {
      void loadActiveProject(projectParam);
    }
  }, [mode, projectParam, loadActiveProject]);

  const liveProject =
    mode === 'live' && activeProject?.id === projectParam ? activeProject : null;

  useEffect(() => {
    if (mode !== 'live' || !accessToken || !liveProject?.assets?.length) {
      setBlobUrls({});
      return;
    }
    let cancelled = false;
    const urls: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const asset of liveProject.assets ?? []) {
        if (asset.mimeType === 'application/pdf' || asset.status === 'removed') continue;
        const u = await privateApi.fetchPrivateAssetBlobUrl(accessToken, asset.privateFileUrl);
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        if (u) {
          urls.push(u);
          next[asset.id] = u;
        }
      }
      if (!cancelled) setBlobUrls(next);
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [mode, accessToken, liveProject?.id, liveProject?.assets]);

  const departments = useMemo(() => {
    if (mode === 'demo') return demo.departments;
    return ensureProjectDepartments(liveProject?.id ?? projectParam, null);
  }, [mode, demo.departments, liveProject?.id, projectParam]);

  const sheets = useMemo<BlueprintSheetRecord[]>(() => {
    if (mode === 'demo') return demo.blueprintSheets;
    if (!liveProject) return [];
    return buildLiveBlueprintSheets(liveProject, departments, blobUrls);
  }, [mode, demo.blueprintSheets, liveProject, departments, blobUrls]);

  const filteredSheets = useMemo(
    () =>
      filterBlueprintSheets(
        sheets,
        { query, departmentId: departmentFilter, areaId: areaFilter, includeSuperseded: true },
        departments
      ),
    [sheets, query, departmentFilter, areaFilter, departments]
  );

  const areaOptions = useMemo(() => {
    const map = new Map<string, string>();
    if (mode === 'demo') {
      map.set('area-a03-ground', 'Ground Floor');
      map.set('area-a04-level2', 'Level 2 Studio');
    } else if (liveProject?.areas) {
      for (const a of liveProject.areas) map.set(a.id, a.name);
    }
    for (const s of sheets) {
      if (!map.has(s.areaId)) map.set(s.areaId, s.areaName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [mode, liveProject?.areas, sheets]);

  const routes = useMemo(
    () =>
      getProjectRoutes(
        mode === 'demo' ? location.pathname : '/projects',
        mode === 'demo' ? demo.state.project.slug : projectParam
      ),
    [mode, location.pathname, demo.state.project.slug, projectParam]
  );

  const railGroups = useMemo(() => buildOverviewRailGroups(routes, 'blueprints'), [routes]);
  const canManage =
    mode === 'demo' || canEditProjectSettings(liveProject?.membership.role);

  const electricalDept = departments.find((d) => d.slug === 'electrical');
  const plumbingDept = departments.find((d) => d.slug === 'plumbing');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') setUploadPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setUploadPreviewUrl(null);
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setUploadSuccess(null);

    if (!uploadMappingMode) {
      setUploadError(
        'Department mapping is required before upload. Choose one department or Electrical + Plumbing.'
      );
      return;
    }

    if (mode === 'live') {
      setUploadError(
        'Use the calibrated Blueprint Setup Wizard or Project Settings uploader to upload and verify live private files.'
      );
      return;
    }

    const isCombined = uploadMappingMode === 'combined_ep';
    const departmentIds = isCombined
      ? [electricalDept?.id ?? 'dept-electrical', plumbingDept?.id ?? 'dept-plumbing']
      : [uploadMappingMode];

    const selectedArea = areaOptions.find((a) => a.id === uploadAreaId);

    const res = demo.uploadBlueprintSheet({
      sheetCode: uploadCode,
      title: uploadTitle,
      revision: uploadRevision,
      areaId: uploadAreaId,
      areaName: selectedArea?.name ?? 'Ground Floor',
      floorLabel: uploadFloorLabel,
      departmentIds,
      isCombinedElectricalPlumbing: isCombined,
      classification: uploadClass,
      fileName: uploadFileName || `${uploadCode.trim().toUpperCase() || 'NEW'}.pdf`,
      previewDataUrl: uploadPreviewUrl,
      scaleLabel: uploadScale,
      notes: uploadNotes,
    });

    if (!res.ok) {
      setUploadError(res.error);
      return;
    }

    setUploadSuccess(
      `Registered ${res.sheet.sheetCode} (${res.sheet.departmentNames.join(' + ')}) with job ${res.sheet.processingJobId}.`
    );
    setUploadCode('');
    setUploadTitle('');
    setUploadNotes('');
    setUploadFileName('');
    setUploadPreviewUrl(null);
    setUploadMappingMode('');
    setShowUploadForm(false);
  };

  const getModelElementsForSheet = (sheet: BlueprintSheetRecord) => {
    if (mode === 'demo') {
      return demo.model.elements;
    }
    const published = liveProject?.modelVersions?.find(
      (v) => v.id === sheet.modelVersionId && v.status === 'published'
    );
    return published?.geometry.elements ?? [];
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      {mode === 'demo' ? (
        <ProjectNavbar />
      ) : (
        <PrivateNavbar
          inProjectContext
          projectId={liveProject?.id ?? projectParam}
          projectName={liveProject?.name ?? 'Project'}
        />
      )}

      <div className="flex min-h-[calc(100dvh-60px)] flex-1">
        <ContextualRail
          moduleLabel="Overview"
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
          bottomSlot={
            <OverviewBlueprintRailSlot
              sheets={sheets}
              departments={departments}
              query={query}
              onQueryChange={setQuery}
              departmentFilter={departmentFilter}
              onDepartmentFilterChange={setDepartmentFilter}
              getSheetDetailPath={routes.blueprintDetailPath}
            />
          }
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1360px]">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-[24px] leading-[30px] font-bold text-[#1B2A4A]">
                  Blueprint management
                </h1>
                <p className="mt-1 text-[14px] text-[#4F5C67]">
                  Pair each issued source drawing with its verified 3D area preview or current
                  processing state. Every upload requires a department mapping.
                </p>
              </div>

              {canManage && (
                <div className="flex flex-wrap items-center gap-2">
                  {mode === 'live' ? (
                    <Link
                      to="/projects/new"
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Add calibrated drawing
                    </Link>
                  ) : (
                    <button
                      type="button"
                      data-testid="toggle-upload-blueprint-btn"
                      onClick={() => {
                        setShowUploadForm((prev) => !prev);
                        setUploadError(null);
                      }}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add drawing
                    </button>
                  )}
                </div>
              )}
            </div>

            {uploadSuccess && (
              <div
                role="status"
                data-testid="blueprint-upload-success"
                className="mt-4 flex items-center gap-2 rounded-xl border border-[#166534]/30 bg-[#DCFCE7] px-4 py-3 text-[13px] font-medium text-[#166534]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            {/* Upload Form (Demo Contractor) */}
            {showUploadForm && canManage && (
              <form
                onSubmit={handleUploadSubmit}
                data-testid="blueprint-upload-form"
                className="mt-5 rounded-xl border border-[#D9DEE2] bg-white p-5"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#D9DEE2] pb-3">
                  <div>
                    <h2 className="text-[16px] font-semibold text-[#1B2A4A]">
                      Register new drawing revision
                    </h2>
                    <p className="text-[12px] text-[#4F5C67]">
                      Assign a single department or the combined Electrical + Plumbing mapping
                      before submission.
                    </p>
                  </div>
                </div>

                {uploadError && (
                  <div
                    role="alert"
                    data-testid="blueprint-upload-error"
                    className="mt-3 flex items-start gap-2 rounded-lg border border-[#B42318]/30 bg-[#FEE2E2] px-3 py-2 text-[13px] text-[#991B1B]"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{uploadError}</span>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label
                      htmlFor="bp-upload-code"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Drawing code *
                    </label>
                    <input
                      id="bp-upload-code"
                      type="text"
                      value={uploadCode}
                      onChange={(e) => setUploadCode(e.target.value)}
                      placeholder="e.g. MEP-103 or A-06"
                      className="mt-1 w-full rounded-lg border border-[#D9DEE2] px-3 py-2 text-[13px] text-[#1B2A4A]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bp-upload-title"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Drawing title *
                    </label>
                    <input
                      id="bp-upload-title"
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="e.g. Roof MEP Coordination Plan"
                      className="mt-1 w-full rounded-lg border border-[#D9DEE2] px-3 py-2 text-[13px] text-[#1B2A4A]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bp-upload-dept"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Department mapping *
                    </label>
                    <select
                      id="bp-upload-dept"
                      data-testid="blueprint-upload-dept-select"
                      value={uploadMappingMode}
                      onChange={(e) => setUploadMappingMode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] text-[#1B2A4A]"
                    >
                      <option value="">Select department (required)…</option>
                      <option value="combined_ep">
                        Electrical + Plumbing (Coordinated shared drawing)
                      </option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="bp-upload-area"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Physical area
                    </label>
                    <select
                      id="bp-upload-area"
                      value={uploadAreaId}
                      onChange={(e) => setUploadAreaId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] text-[#1B2A4A]"
                    >
                      {areaOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="bp-upload-class"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Sheet classification
                    </label>
                    <select
                      id="bp-upload-class"
                      value={uploadClass}
                      onChange={(e) => setUploadClass(e.target.value as BlueprintSheetClassification)}
                      className="mt-1 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] text-[#1B2A4A]"
                    >
                      <option value="plan">Floor / Layout Plan</option>
                      <option value="coordination">Coordinated Service Plan</option>
                      <option value="elevation">Elevation</option>
                      <option value="section">Section</option>
                      <option value="schedule">Schedule</option>
                      <option value="detail">Construction Detail</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="bp-upload-rev"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Revision &amp; scale
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id="bp-upload-rev"
                        type="text"
                        value={uploadRevision}
                        onChange={(e) => setUploadRevision(e.target.value)}
                        className="w-24 rounded-lg border border-[#D9DEE2] px-2.5 py-2 text-[13px]"
                      />
                      <input
                        type="text"
                        value={uploadScale}
                        onChange={(e) => setUploadScale(e.target.value)}
                        placeholder="1:50 (mm)"
                        aria-label="Scale"
                        className="min-w-0 flex-1 rounded-lg border border-[#D9DEE2] px-2.5 py-2 text-[13px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="bp-upload-floor"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Floor / datum label
                    </label>
                    <input
                      id="bp-upload-floor"
                      type="text"
                      value={uploadFloorLabel}
                      onChange={(e) => setUploadFloorLabel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#D9DEE2] px-3 py-2 text-[13px]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bp-upload-file"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Source file (PDF / PNG / JPG)
                    </label>
                    <input
                      id="bp-upload-file"
                      type="file"
                      accept=".pdf,image/png,image/jpeg"
                      onChange={handleFileChange}
                      className="mt-1 w-full rounded-lg border border-[#D9DEE2] bg-white px-2.5 py-1.5 text-[12px]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bp-upload-notes"
                      className="block text-[12px] font-semibold text-[#1B2A4A]"
                    >
                      Source notes
                    </label>
                    <input
                      id="bp-upload-notes"
                      type="text"
                      value={uploadNotes}
                      onChange={(e) => setUploadNotes(e.target.value)}
                      placeholder="Optional revision or coordination note"
                      className="mt-1 w-full rounded-lg border border-[#D9DEE2] px-3 py-2 text-[13px]"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadForm(false)}
                    className="rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="blueprint-upload-submit"
                    className="rounded-lg bg-[#A64011] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#8C350E]"
                  >
                    Accept upload
                  </button>
                </div>
              </form>
            )}

            {/* Filter Bar */}
            <section
              aria-label="Filter blueprints"
              className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#D9DEE2] bg-white p-3.5"
            >
              <div className="relative min-w-[220px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by code, title, or source file…"
                  aria-label="Search drawings"
                  data-testid="bm-search-input"
                  className="w-full rounded-lg border border-[#D9DEE2] py-2 pl-9 pr-3 text-[13px] text-[#1B2A4A] placeholder:text-[#4F5C67] focus:border-[#A64011] focus:outline-none"
                />
              </div>

              <select
                aria-label="Filter by department"
                data-testid="bm-dept-filter"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] font-medium text-[#1B2A4A]"
              >
                <option value="all">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by area"
                data-testid="bm-area-filter"
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] font-medium text-[#1B2A4A]"
              >
                <option value="all">All areas</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <span className="text-[12px] font-medium text-[#4F5C67] tabular-nums">
                Showing {Math.min(visibleCount, filteredSheets.length)} of {filteredSheets.length}
              </span>
            </section>

            {/* Paired Source + 3D Model Cards */}
            {filteredSheets.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-[#D9DEE2] bg-white p-10 text-center">
                <FileText className="mx-auto h-8 w-8 text-[#4F5C67]" aria-hidden="true" />
                <p className="mt-2 text-[15px] font-semibold text-[#1B2A4A]">
                  No matching drawings
                </p>
                <p className="mt-1 text-[13px] text-[#4F5C67]">
                  {sheets.length === 0
                    ? 'Upload your first calibrated blueprint with a department assignment to populate this register.'
                    : 'Clear search or switch filters to see registered drawings.'}
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {filteredSheets.slice(0, visibleCount).map((sheet, idx) => {
                  const src = getSheetPreviewSrc(sheet);
                  const notesOpen = Boolean(expandedNotes[sheet.id]);
                  const modelElements =
                    sheet.modelPreviewState === 'orbitable'
                      ? getModelElementsForSheet(sheet)
                      : [];
                  // Cap simultaneous WebGL contexts to the first 3 orbitable cards so headless/low-GPU browsers stay fast
                  const allowLiveWebgl = sheet.modelPreviewState === 'orbitable' && idx < 4 && modelElements.length > 0;

                  return (
                    <article
                      key={sheet.id}
                      data-testid={`bm-card-${sheet.sheetCode.toLowerCase()}`}
                      className="rounded-xl border border-[#D9DEE2] bg-white p-4"
                    >
                      {/* Compact metadata line */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9DEE2] pb-3">
                        <div className="flex flex-wrap items-center gap-2 text-[14px]">
                          <span className="font-bold text-[#1B2A4A]">{sheet.sheetCode}</span>
                          <span className="text-[#D9DEE2]">·</span>
                          <span className="font-medium text-[#4F5C67]">{sheet.areaName}</span>
                          <span className="text-[#D9DEE2]">·</span>
                          <span className="font-medium text-[#1B2A4A]">{sheet.title}</span>
                          <span className="rounded bg-[#F4F3EF] px-2 py-0.5 text-[11px] font-semibold text-[#1B2A4A]">
                            {sheet.revision}
                          </span>
                          {sheet.isCombinedElectricalPlumbing ? (
                            <span className="rounded bg-[#E6F7F5] px-2 py-0.5 text-[11px] font-semibold text-[#0F766E]">
                              Electrical + Plumbing
                            </span>
                          ) : (
                            sheet.departmentNames.map((dept) => (
                              <span
                                key={dept}
                                className="rounded bg-[#F4F3EF] px-2 py-0.5 text-[11px] font-medium text-[#4F5C67]"
                              >
                                {dept}
                              </span>
                            ))
                          )}
                          {sheet.isSuperseded && (
                            <span className="rounded bg-[#FEE2E2] px-2 py-0.5 text-[11px] font-semibold text-[#991B1B]">
                              Superseded
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={routes.blueprintDetailPath(sheet.id)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#D9DEE2] bg-white px-3 py-1 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                          >
                            View drawing details
                          </Link>
                          <Link
                            to={routes.workspacePath}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[#1B2A4A] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#1B2A4A]/90"
                          >
                            <Box className="h-3.5 w-3.5" aria-hidden="true" />
                            Open this area in 3D
                          </Link>
                        </div>
                      </div>

                      {/* Paired Left Source Preview | Right Orbitable 3D Preview or Processing State */}
                      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* Left: Source Preview */}
                        <div className="flex h-[210px] flex-col overflow-hidden rounded-lg border border-[#D9DEE2] bg-[#F8F9FA]">
                          <div className="flex items-center justify-between border-b border-[#D9DEE2] bg-white px-3 py-1.5 text-[11px] text-[#4F5C67]">
                            <span className="truncate font-medium text-[#1B2A4A]">
                              Source: {sheet.sourceFileName} (p.{sheet.pageNumber}/{sheet.totalPages})
                            </span>
                            <span className="shrink-0">{sheet.scaleLabel}</span>
                          </div>
                          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
                            {src ? (
                              <img
                                src={src}
                                alt={`${sheet.sheetCode} source preview`}
                                loading="lazy"
                                className="max-h-full max-w-full object-contain"
                              />
                            ) : (
                              <div className="px-4 text-center text-[12px] text-[#4F5C67]">
                                <FileWarning
                                  className="mx-auto h-5 w-5 text-[#A64011]"
                                  aria-hidden="true"
                                />
                                <p className="mt-1">
                                  {sheet.previewMissingReason ?? 'Source preview unavailable'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Orbitable 3D Model Preview or Explicit Lifecycle State */}
                        <div>
                          {allowLiveWebgl ? (
                            <OrbitableModelPreview
                              elements={modelElements}
                              label={`${sheet.sheetCode} ${sheet.areaName}`}
                            />
                          ) : sheet.modelPreviewState === 'orbitable' ? (
                            <div className="flex h-[210px] flex-col items-center justify-center rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] p-4 text-center">
                              <Layers className="h-6 w-6 text-[#1B2A4A]" aria-hidden="true" />
                              <p className="mt-2 text-[13px] font-semibold text-[#1B2A4A]">
                                Verified area model linked ({sheet.areaName})
                              </p>
                              <p className="mt-1 text-[12px] text-[#4F5C67]">
                                Open this area in Workspace 3D to orbit and inspect Pins.
                              </p>
                            </div>
                          ) : sheet.modelPreviewState === 'processing' ? (
                            <div
                              data-testid={`bm-state-processing-${sheet.sheetCode.toLowerCase()}`}
                              className="flex h-[210px] flex-col items-center justify-center rounded-lg border border-[#D9DEE2] bg-[#F8F9FA] p-5 text-center"
                            >
                              <Clock className="h-6 w-6 text-[#A64011]" aria-hidden="true" />
                              <p className="mt-2 text-[13px] font-semibold text-[#1B2A4A]">
                                Processing geometry extraction
                              </p>
                              <p className="mt-1 max-w-sm text-[12px] text-[#4F5C67]">
                                {sheet.modelPreviewReason}
                              </p>
                              {sheet.processingJobId && (
                                <span className="mt-2 rounded bg-white px-2 py-0.5 text-[11px] font-mono text-[#4F5C67]">
                                  Job {sheet.processingJobId}
                                </span>
                              )}
                            </div>
                          ) : sheet.modelPreviewState === 'needs_review' ? (
                            <div
                              data-testid={`bm-state-review-${sheet.sheetCode.toLowerCase()}`}
                              className="flex h-[210px] flex-col items-center justify-center rounded-lg border border-[#D4652F]/40 bg-[#FFF3EB]/50 p-5 text-center"
                            >
                              <AlertCircle className="h-6 w-6 text-[#A64011]" aria-hidden="true" />
                              <p className="mt-2 text-[13px] font-semibold text-[#1B2A4A]">
                                Review required before publication
                              </p>
                              <p className="mt-1 max-w-sm text-[12px] text-[#4F5C67]">
                                {sheet.modelPreviewReason}
                              </p>
                              {canManage && mode === 'demo' && (
                                <button
                                  type="button"
                                  onClick={() => demo.publishBlueprintSheetDraft(sheet.id)}
                                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#A64011] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#8C350E]"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Verify &amp; publish preview (Demo)
                                </button>
                              )}
                            </div>
                          ) : sheet.modelPreviewState === 'failed' ? (
                            <div
                              data-testid={`bm-state-failed-${sheet.sheetCode.toLowerCase()}`}
                              className="flex h-[210px] flex-col items-center justify-center rounded-lg border border-[#B42318]/40 bg-[#FEE2E2]/40 p-5 text-center"
                            >
                              <AlertCircle className="h-6 w-6 text-[#B42318]" aria-hidden="true" />
                              <p className="mt-2 text-[13px] font-semibold text-[#991B1B]">
                                Extraction failed
                              </p>
                              <p className="mt-1 max-w-sm text-[12px] text-[#7F1D1D]">
                                {sheet.modelPreviewReason}
                              </p>
                              {canManage && mode === 'demo' && (
                                <button
                                  type="button"
                                  onClick={() => demo.retryBlueprintSheet(sheet.id)}
                                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#B42318]/40 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#991B1B] hover:bg-[#FEE2E2]"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                                  Retry extraction
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex h-[210px] flex-col items-center justify-center rounded-lg border border-[#D9DEE2] bg-[#F8F9FA] p-5 text-center">
                              <FileText className="h-6 w-6 text-[#4F5C67]" aria-hidden="true" />
                              <p className="mt-2 text-[13px] font-semibold text-[#1B2A4A]">
                                Reference-only drawing
                              </p>
                              <p className="mt-1 max-w-sm text-[12px] text-[#4F5C67]">
                                {sheet.modelPreviewReason ??
                                  'Supports area coordination without generating an independent 3D model.'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Collapsible Source-Backed Notes Disclosure */}
                      {sheet.notes.length > 0 && (
                        <div className="mt-3 border-t border-[#D9DEE2] pt-2.5">
                          <button
                            type="button"
                            aria-expanded={notesOpen}
                            onClick={() =>
                              setExpandedNotes((prev) => ({
                                ...prev,
                                [sheet.id]: !prev[sheet.id],
                              }))
                            }
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4F5C67] hover:text-[#1B2A4A]"
                          >
                            {notesOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Source-backed notes ({sheet.notes.length})
                          </button>
                          {notesOpen && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-[#4F5C67]">
                              {sheet.notes.map((n, i) => (
                                <li key={i}>{n}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}

                {filteredSheets.length > visibleCount && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + 15)}
                      className="rounded-lg border border-[#D9DEE2] bg-white px-5 py-2 text-[13px] font-semibold text-[#1B2A4A] hover:bg-[#F4F3EF]"
                    >
                      Load more drawings ({filteredSheets.length - visibleCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
