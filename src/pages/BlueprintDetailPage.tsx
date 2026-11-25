import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  CheckCircle2,
  Download,
  FileWarning,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { useAuth } from '../context/AuthContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import { privateApi } from '../data/privateApi';
import { ensureProjectDepartments } from '../domain/departmentCatalog';
import {
  getSheetPreviewSrc,
  type BlueprintSheetRecord,
  type TranscriptionField,
} from '../domain/blueprintRegister';
import { buildLiveBlueprintSheets } from '../domain/liveBlueprintAdapter';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { OverviewBlueprintRailSlot } from '../components/OverviewBlueprintRailSlot';
import { getProjectRoutes } from '../utils/projectRoutes';
import { buildOverviewRailGroups } from '../utils/moduleNavConfig';

interface BlueprintDetailPageProps {
  mode: 'demo' | 'live';
}

function StatusPill({ status }: { status: TranscriptionField['status'] }) {
  if (status === 'needs_review') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-[#FFF3EB] px-1.5 py-0.5 text-[10px] font-semibold text-[#A64011]">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Needs review
      </span>
    );
  }
  if (status === 'not_specified') {
    return (
      <span className="rounded bg-[#F4F3EF] px-1.5 py-0.5 text-[10px] font-medium text-[#4F5C67]">
        Not specified on this sheet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] font-semibold text-[#166534]">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Source-backed
    </span>
  );
}

export function BlueprintDetailPage({ mode }: BlueprintDetailPageProps) {
  const { project: projectParam = '', sheetId = '' } = useParams();
  const location = useLocation();
  const demo = useDemo();
  const { accessToken } = useAuth();
  const { activeProject, loadActiveProject } = usePrivateProjects();

  const [railQuery, setRailQuery] = useState('');
  const [railDept, setRailDept] = useState('all');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [enlarged, setEnlarged] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);
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

  const sheet = useMemo(
    () => sheets.find((s) => s.id === sheetId || s.sheetCode.toLowerCase() === sheetId.toLowerCase()) ?? null,
    [sheets, sheetId]
  );

  const routes = useMemo(
    () =>
      getProjectRoutes(
        mode === 'demo' ? location.pathname : '/projects',
        mode === 'demo' ? demo.state.project.slug : projectParam
      ),
    [mode, location.pathname, demo.state.project.slug, projectParam]
  );

  const railGroups = useMemo(() => buildOverviewRailGroups(routes, 'blueprints'), [routes]);

  useEffect(() => {
    setZoomPercent(100);
    setPan({ x: 0, y: 0 });
    setEnlarged(false);
  }, [sheetId]);

  const previewSrc = sheet ? getSheetPreviewSrc(sheet) : null;

  const handleDownloadSource = () => {
    if (!sheet || !previewSrc) return;
    const link = document.createElement('a');
    link.href = previewSrc;
    link.download = sheet.sourceFileName.endsWith('.png') || sheet.sourceFileName.endsWith('.svg')
      ? sheet.sourceFileName
      : `${sheet.sheetCode}-${sheet.revision}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              query={railQuery}
              onQueryChange={setRailQuery}
              departmentFilter={railDept}
              onDepartmentFilterChange={setRailDept}
              activeSheetId={sheet?.id ?? null}
              getSheetDetailPath={routes.blueprintDetailPath}
            />
          }
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1320px]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Link
                  to={routes.overviewPath}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4F5C67] hover:text-[#1B2A4A]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to Overview
                </Link>
                <span className="text-[#D9DEE2]">/</span>
                <Link
                  to={routes.blueprintManagementPath}
                  className="text-[13px] font-medium text-[#4F5C67] hover:text-[#1B2A4A]"
                >
                  Blueprint management
                </Link>
              </div>
              <Link
                to={routes.workspacePath}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#A64011] px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-[#8C350E]"
              >
                <Box className="h-4 w-4" aria-hidden="true" />
                Open area in 3D
              </Link>
            </div>

            {!sheet ? (
              <section className="rounded-xl border border-[#D9DEE2] bg-white p-8 text-center">
                <FileWarning className="mx-auto h-8 w-8 text-[#A64011]" aria-hidden="true" />
                <h1 className="vonta-page-title mt-3 text-[#1B2A4A]">Drawing not found</h1>
                <p className="mt-1 text-[14px] text-[#4F5C67]">
                  The requested blueprint revision is not in this project&apos;s register.
                </p>
                <Link
                  to={routes.blueprintManagementPath}
                  className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-[#1B2A4A] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#1B2A4A]/90"
                >
                  Browse Blueprint management
                </Link>
              </section>
            ) : (
              <>
                {/* Full Blueprint Viewer Card */}
                <section
                  data-testid="blueprint-detail-viewer"
                  className={`rounded-xl border border-[#D9DEE2] bg-white ${
                    enlarged ? 'fixed inset-4 z-50 flex flex-col shadow-2xl' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D9DEE2] px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1
                          data-testid="blueprint-detail-title"
                          className="vonta-page-title text-[#1B2A4A]"
                        >
                          {sheet.sheetCode} · {sheet.title}
                        </h1>
                        <span className="rounded bg-[#F4F3EF] px-2 py-0.5 text-[12px] font-semibold text-[#1B2A4A]">
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
                      <p className="mt-0.5 text-[12px] text-[#4F5C67]">
                        {sheet.areaName} · {sheet.floorLabel} · {sheet.sourceFileName} (Page{' '}
                        {sheet.pageNumber}/{sheet.totalPages}) · Scale {sheet.scaleLabel}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center rounded-lg border border-[#D9DEE2] bg-white">
                        <button
                          type="button"
                          onClick={() => setZoomPercent((z) => Math.max(50, z - 25))}
                          aria-label="Zoom out blueprint"
                          className="p-2 text-[#4F5C67] hover:text-[#1B2A4A]"
                        >
                          <ZoomOut className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setZoomPercent(100);
                            setPan({ x: 0, y: 0 });
                          }}
                          className="border-x border-[#D9DEE2] px-2.5 py-1.5 text-[12px] font-medium text-[#1B2A4A] tabular-nums hover:bg-[#F4F3EF]"
                        >
                          Fit ({zoomPercent}%)
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoomPercent((z) => Math.min(300, z + 25))}
                          aria-label="Zoom in blueprint"
                          className="p-2 text-[#4F5C67] hover:text-[#1B2A4A]"
                        >
                          <ZoomIn className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setEnlarged((e) => !e)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                      >
                        {enlarged ? (
                          <>
                            <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Exit enlarge
                          </>
                        ) : (
                          <>
                            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Enlarge
                          </>
                        )}
                      </button>

                      {previewSrc && (
                        <button
                          type="button"
                          onClick={handleDownloadSource}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          Source file
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Zoom/Pan Drawing Surface */}
                  <div
                    className={`relative overflow-hidden bg-[#F8F9FA] ${
                      enlarged ? 'flex-1' : 'h-[440px]'
                    } ${zoomPercent > 100 ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onMouseDown={(e) => {
                      if (zoomPercent <= 100) return;
                      setDragOrigin({ x: e.clientX - pan.x, y: e.clientY - pan.y });
                    }}
                    onMouseMove={(e) => {
                      if (!dragOrigin) return;
                      setPan({ x: e.clientX - dragOrigin.x, y: e.clientY - dragOrigin.y });
                    }}
                    onMouseUp={() => setDragOrigin(null)}
                    onMouseLeave={() => setDragOrigin(null)}
                  >
                    {previewSrc ? (
                      <div className="flex h-full w-full items-center justify-center p-4">
                        <img
                          src={previewSrc}
                          alt={`${sheet.sheetCode} ${sheet.title}`}
                          draggable={false}
                          style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomPercent / 100})`,
                            transformOrigin: 'center center',
                          }}
                          className="max-h-full max-w-full select-none object-contain transition-transform duration-75"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                        <FileWarning className="h-8 w-8 text-[#A64011]" aria-hidden="true" />
                        <p className="mt-2 text-[14px] font-semibold text-[#1B2A4A]">
                          Preview unavailable for {sheet.sheetCode}
                        </p>
                        <p className="mt-1 max-w-md text-[13px] text-[#4F5C67]">
                          {sheet.previewMissingReason ??
                            'Source file is registered privately; transcription metadata remains available below.'}
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Four Structured Transcription Groups */}
                <section
                  aria-label="Structured blueprint transcription"
                  data-testid="blueprint-transcription-groups"
                  className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2"
                >
                  {(
                    [
                      {
                        key: 'identity',
                        title: '1. Identity',
                        subtitle: 'Title block & issue metadata present on this sheet',
                        fields: sheet.transcription.identity,
                      },
                      {
                        key: 'geometryAndCriteria',
                        title: '2. Geometry and criteria',
                        subtitle: 'Scale, grid axes, datums, north reference, and dimensions',
                        fields: sheet.transcription.geometryAndCriteria,
                      },
                      {
                        key: 'constructionContent',
                        title: '3. Construction content',
                        subtitle: 'Named elements, symbols, schedules, materials, and MEP route status',
                        fields: sheet.transcription.constructionContent,
                      },
                      {
                        key: 'provenance',
                        title: '4. Provenance',
                        subtitle: 'Source file reference, revision state, review flags, and omissions',
                        fields: sheet.transcription.provenance,
                      },
                    ] as const
                  ).map((group) => (
                    <article
                      key={group.key}
                      data-testid={`transcription-group-${group.key}`}
                      className="rounded-xl border border-[#D9DEE2] bg-white p-5"
                    >
                      <h2 className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                        {group.title}
                      </h2>
                      <p className="mt-0.5 text-[12px] text-[#4F5C67]">{group.subtitle}</p>

                      <dl className="mt-4 divide-y divide-[#D9DEE2] border-t border-[#D9DEE2]">
                        {group.fields.map((field) => (
                          <div
                            key={`${group.key}-${field.label}`}
                            className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                          >
                            <dt className="shrink-0 text-[13px] font-medium text-[#4F5C67]">
                              {field.label}
                            </dt>
                            <dd className="text-left text-[13px] text-[#1B2A4A] sm:text-right">
                              <div className="font-medium">{field.value}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:justify-end">
                                <StatusPill status={field.status} />
                                {field.sourceRef && (
                                  <span className="text-[11px] text-[#4F5C67]">
                                    {field.sourceRef}
                                  </span>
                                )}
                              </div>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
