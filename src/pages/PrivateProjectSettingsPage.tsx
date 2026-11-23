import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileImage,
  Info,
  KeyRound,
  Lock,
  Palette,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import { ApiClientError, privateApi } from '../data/privateApi';
import {
  COMMON_TIMEZONES,
  canEditProjectSettings,
  canManageProjectAccess,
  formatBlueprintStatusLabel,
  formatRoleLabel,
  validateProjectPasswordChangeInput,
  type BlueprintAssetRecord,
  type BlueprintImpactSummary,
  type ModelVersionRecord,
  type ProjectBlueprintRecord,
  type ProjectPasswordChangeErrors,
} from '../domain/accountTypes';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { BlueprintPreview, type BlueprintSourceItem } from '../components/BlueprintPreview';
import { DeleteProjectModal } from '../components/DeleteProjectModal';
import { BlueprintReviewStudio } from '../components/BlueprintReviewStudio';
import { ColorPickerControl } from '../components/ColorPickerControl';
import {
  seedDefaultDepartments,
  updateDepartmentPinColor,
  type ProjectDepartment,
} from '../domain/departmentCatalog';
import { getProjectRoutes } from '../utils/projectRoutes';
import { buildOverviewRailGroups } from '../utils/moduleNavConfig';
import { useSectionScrollSpy } from '../utils/scrollSpy';

type PrivateSettingsSectionId = 'general' | 'departments' | 'access' | 'blueprints' | 'danger';

const PRIVATE_SETTINGS_SECTIONS: ReadonlyArray<{
  id: PrivateSettingsSectionId;
  label: string;
  anchor: string;
}> = [
  { id: 'general', label: 'General', anchor: 'settings-general' },
  { id: 'departments', label: 'Department Pin colors', anchor: 'settings-departments' },
  { id: 'access', label: 'Project access', anchor: 'settings-access' },
  { id: 'blueprints', label: 'Blueprints', anchor: 'settings-blueprints' },
  { id: 'danger', label: 'Danger zone', anchor: 'settings-danger' },
];

export function PrivateProjectSettingsPage() {
  const { project: projectId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { accessToken, profile } = useAuth();
  const {
    activeProject,
    activeProjectLoading,
    activeProjectError,
    loadActiveProject,
    syncProjectInCache,
    removeProjectFromCache,
  } = usePrivateProjects();

  const project = activeProject?.id === projectId ? activeProject : null;
  const isContractor = canEditProjectSettings(project?.membership.role);
  const canManagePass = canManageProjectAccess(project?.membership.role);

  // 1. General section state
  const [name, setName] = useState('');
  const [contractorDisplayName, setContractorDisplayName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [generalFieldErrors, setGeneralFieldErrors] = useState<{
    name?: string;
    contractorDisplayName?: string;
    timezone?: string;
  }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalStale, setGeneralStale] = useState(false);
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalSavedMsg, setGeneralSavedMsg] = useState<string | null>(null);

  // 1b. Department Pin colors state (project-scoped defaults; persisted per project session until backend department catalog API is provisioned)
  const [departments, setDepartments] = useState<ProjectDepartment[]>(() =>
    seedDefaultDepartments(projectId || 'private-project')
  );
  const [deptColorStatus, setDeptColorStatus] = useState<string | null>(null);
  const [deptColorError, setDeptColorError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setDepartments(seedDefaultDepartments(projectId));
    setDeptColorStatus(null);
    setDeptColorError(null);
  }, [projectId]);

  // 2. Project Access (Change project password) state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [pwFieldErrors, setPwFieldErrors] = useState<ProjectPasswordChangeErrors>({});
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  // 3. Blueprints lifecycle modals (Add area, Replace, Remove/Retire)
  const [addAreaModalOpen, setAddAreaModalOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{
    areaId: string;
    areaName: string;
    modelVersion: ModelVersionRecord | null;
    asset: BlueprintAssetRecord | null;
  } | null>(null);
  const [removeTargetBp, setRemoveTargetBp] = useState<ProjectBlueprintRecord | null>(null);
  const [removeImpact, setRemoveImpact] = useState<BlueprintImpactSummary | null>(null);
  const [removeLoadingImpact, setRemoveLoadingImpact] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [blueprintNotice, setBlueprintNotice] = useState<string | null>(null);
  const [blobUrlsByAssetId, setBlobUrlsByAssetId] = useState<Record<string, string>>({});

  const legacyHistoryRequested = searchParams.get('section') === 'history';

  // 4. Danger zone state
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { activeSection, jumpToSection } = useSectionScrollSpy<PrivateSettingsSectionId>(
    PRIVATE_SETTINGS_SECTIONS,
    'general',
    { readingLineOffsetPx: 118 }
  );

  useEffect(() => {
    if (!projectId) return;
    void loadActiveProject(projectId);
  }, [projectId, loadActiveProject]);

  // Fetch authenticated private image previews for BlueprintPreview (L03)
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
        if (asset.mimeType === 'application/pdf' || asset.status === 'removed') continue;
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
      if (!cancelled) setBlobUrlsByAssetId(next);
    };
    void loadPreviews();
    return () => {
      cancelled = true;
      for (const u of createdUrls) URL.revokeObjectURL(u);
    };
  }, [accessToken, project?.id, project?.assets]);

  const blueprintPreviewSources = useMemo<BlueprintSourceItem[]>(() => {
    if (!project) return [];
    const modelVersions = project.modelVersions ?? [];
    const assets = (project.assets ?? []).filter((a) => a.status !== 'removed');
    if (assets.length > 0) {
      return assets.map((asset) => {
        const linked = modelVersions.find((v) => v.blueprintAssetId === asset.id);
        return {
          id: asset.id,
          areaName: asset.areaName,
          sheetCode: asset.sheetCode,
          revision: asset.revision,
          pageLabel:
            asset.mimeType === 'application/pdf'
              ? `Page ${asset.planPage} (PDF)`
              : `Page ${asset.planPage}`,
          caption: `${asset.areaName} — ${asset.fileName}`,
          dimensionsSummary: linked
            ? `Model v${linked.versionNumber} · ${linked.geometry.footprintWidthMm.toLocaleString()} × ${linked.geometry.footprintDepthMm.toLocaleString()} mm`
            : `Ref ${asset.calibration.knownLengthMm.toLocaleString()} mm`,
          src: asset.mimeType === 'application/pdf' ? null : (blobUrlsByAssetId[asset.id] ?? null),
          statusNote: formatBlueprintStatusLabel(asset.status),
        };
      });
    }
    return project.blueprints
      .filter((bp) => bp.status !== 'removed')
      .map((bp) => ({
        id: bp.id,
        areaName: bp.areaName,
        sheetCode: bp.sheetCode,
        revision: bp.revision,
        pageLabel: 'Page 1',
        caption: `${bp.areaName}${bp.fileName ? ` — ${bp.fileName}` : ''}`,
        src: null,
        statusNote: formatBlueprintStatusLabel(bp.status),
      }));
  }, [project, blobUrlsByAssetId]);

  // Sync form fields from loaded project when project changes or version updates
  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setContractorDisplayName(project.contractorDisplayName);
    setTimezone(project.timezone);
    setGeneralStale(false);
    const activeBlueprints = project.blueprints.filter((b) => b.status !== 'removed');
    if (
      activeBlueprints.length > 0 &&
      !activeBlueprints.some((b) => b.id === selectedBlueprintId)
    ) {
      setSelectedBlueprintId(activeBlueprints[0].id);
    }
  }, [project?.id, project?.version, project?.blueprints.length]);

  const hasGeneralUnsavedChanges = Boolean(
    project &&
      (name.trim() !== project.name ||
        contractorDisplayName.trim() !== project.contractorDisplayName ||
        timezone !== project.timezone)
  );

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !accessToken || !isContractor) return;
    setGeneralError(null);
    setGeneralSavedMsg(null);
    setGeneralStale(false);

    const errs: { name?: string; contractorDisplayName?: string; timezone?: string } = {};
    if (!name.trim()) errs.name = 'Project name is required.';
    if (!contractorDisplayName.trim()) {
      errs.contractorDisplayName = 'Contractor display name is required.';
    }
    if (!timezone.trim()) errs.timezone = 'Project timezone is required.';
    if (Object.keys(errs).length > 0) {
      setGeneralFieldErrors(errs);
      return;
    }
    setGeneralFieldErrors({});

    setGeneralSaving(true);
    try {
      const res = await privateApi.updateProjectGeneral(accessToken, project.id, {
        name,
        contractorDisplayName,
        timezone,
        expectedVersion: project.version,
      });
      syncProjectInCache(res.project);
      setGeneralSavedMsg('Project settings saved. Existing project links remain unchanged.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.fieldErrors) setGeneralFieldErrors(err.fieldErrors);
        if (err.status === 409) setGeneralStale(true);
        setGeneralError(err.message);
      } else {
        setGeneralError('Could not save General settings. Your unsaved input has been preserved.');
      }
    } finally {
      setGeneralSaving(false);
    }
  };

  const handleChangeProjectPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !accessToken || !canManagePass) return;
    setPwError(null);
    setPwSuccess(null);

    const errs = validateProjectPasswordChangeInput({
      currentPassword,
      newPassword,
      confirmNewPassword,
    });
    if (Object.keys(errs).length > 0) {
      setPwFieldErrors(errs);
      return;
    }
    setPwFieldErrors({});

    setPwSaving(true);
    try {
      await privateApi.changeProjectPassword(accessToken, project.id, {
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPwSuccess(
        'Project password updated on the server. Your account password was not affected.'
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.fieldErrors) setPwFieldErrors(err.fieldErrors);
        setPwError(err.message);
      } else {
        setPwError('Could not update project password. Please try again.');
      }
    } finally {
      setPwSaving(false);
    }
  };

  const openReplaceModalForBlueprint = (bp: ProjectBlueprintRecord) => {
    if (!project) return;
    const asset = (project.assets ?? []).find((a) => a.id === bp.id) ?? null;
    const areaId = bp.areaId ?? asset?.areaId ?? project.areas?.[0]?.id ?? '';
    const modelVersion =
      (project.modelVersions ?? []).find(
        (v) => v.areaId === areaId && v.status === 'published'
      ) ?? null;
    setReplaceTarget({
      areaId,
      areaName: bp.areaName,
      modelVersion,
      asset,
    });
  };

  const openRemoveRetireModalForBlueprint = async (bp: ProjectBlueprintRecord) => {
    if (!project || !accessToken) return;
    setRemoveTargetBp(bp);
    setRemoveImpact(null);
    setRemoveError(null);
    setRemoveReason('');
    setRemoveLoadingImpact(true);
    try {
      const res = await privateApi.getBlueprintImpact(accessToken, project.id, bp.id);
      setRemoveImpact(res.impact);
    } catch (err) {
      setRemoveError(
        err instanceof ApiClientError ? err.message : 'Could not inspect blueprint dependencies.'
      );
    } finally {
      setRemoveLoadingImpact(false);
    }
  };

  const handleConfirmRemoveOrRetire = async (mode: 'remove' | 'retire') => {
    if (!project || !accessToken || !removeTargetBp) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      const res = await privateApi.removeOrRetireBlueprint(
        accessToken,
        project.id,
        removeTargetBp.id,
        {
          mode,
          reason:
            removeReason.trim() ||
            (mode === 'remove'
              ? 'Unused draft blueprint removed from Project settings'
              : 'Blueprint retired from Project settings while preserving History and evidence'),
        }
      );
      syncProjectInCache(res.project);
      setBlueprintNotice(
        mode === 'remove'
          ? `Removed unused draft blueprint ${removeTargetBp.areaName} (${removeTargetBp.sheetCode} ${removeTargetBp.revision}).`
          : `Retired ${removeTargetBp.areaName} (${removeTargetBp.sheetCode} ${removeTargetBp.revision}). Audit history, Before/After evidence, and other areas remain preserved.`
      );
      setRemoveTargetBp(null);
      setRemoveImpact(null);
    } catch (err) {
      setRemoveError(
        err instanceof ApiClientError ? err.message : 'Blueprint removal/retirement failed.'
      );
    } finally {
      setRemoveBusy(false);
    }
  };

  const handleConfirmDeleteProject = async (payload: {
    keyword: string;
    typedProjectName: string;
  }) => {
    if (!project || !accessToken) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await privateApi.deleteProject(accessToken, project.id, {
        keyword: payload.keyword,
        typedProjectName: payload.typedProjectName,
        expectedVersion: project.version,
      });
      removeProjectFromCache(project.id);
      setDeleteModalOpen(false);
      navigate('/projects', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiClientError ? err.message : 'Failed to delete project.');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (activeProjectLoading && !project) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <PrivateNavbar inProjectContext={false} hasContextualRail={false} />
        <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-12 text-center text-[15px] text-[#4F5C67]">
          Loading project settings…
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
            <h1 className="mt-3 text-[26px] leading-[32px] font-bold text-[#1B2A4A]">
              {isForbidden ? 'Access forbidden' : 'Could not open project settings'}
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

  const visibleBlueprints = project.blueprints.filter((b) => b.status !== 'removed');
  const selectedDangerBlueprint =
    visibleBlueprints.find((b) => b.id === selectedBlueprintId) ?? visibleBlueprints[0] ?? null;
  const routes = getProjectRoutes(`/projects/${project.id}/settings`, project.id);
  const overviewRailGroups = buildOverviewRailGroups(routes, 'settings');

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <PrivateNavbar inProjectContext projectId={project.id} projectName={project.name} />

      <div className="flex min-h-0 flex-1">
        <ContextualRail
          moduleLabel="Overview"
          groups={overviewRailGroups}
          projectSettingsPath={routes.settingsPath}
          projectSettingsActive
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1060px] flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
            {/* Local settings section navigation */}
            <aside
              aria-label="Project settings sections"
              className="w-full shrink-0 lg:sticky lg:top-[84px] lg:w-[208px]"
            >
              {/* L01: Direct Back to Project Overview link at the top of local settings nav */}
              <Link
                to={`/projects/${project.id}`}
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
                  {project.name}
                </p>
              </div>

              <div className="lg:hidden">
                <label
                  htmlFor="private-settings-section-select"
                  className="block text-[12px] font-semibold tracking-wide text-[#4F5C67] uppercase"
                >
                  Settings section
                </label>
                <select
                  id="private-settings-section-select"
                  value={activeSection}
                  onChange={(e) => jumpToSection(e.target.value as PrivateSettingsSectionId)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] font-medium text-[#1B2A4A]"
                >
                  {PRIVATE_SETTINGS_SECTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <nav className="hidden space-y-1 lg:block" aria-label="Settings sections">
                {PRIVATE_SETTINGS_SECTIONS.map((s) => {
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

            <div className="min-w-0 flex-1 max-w-[780px]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-[26px] leading-[32px] font-bold tracking-tight text-[#1B2A4A]">
                    Project settings
                  </h1>
                  <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
                    {project.name} · Stable ID <code className="text-[13px]">{project.id}</code>
                  </p>
                </div>
                <span className="rounded-md border border-[#D9DEE2] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#1B2A4A]">
                  {formatRoleLabel(project.membership.role, project.membership)}
                </span>
              </div>

              {!isContractor && (
                <div
                  role="status"
                  className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#D9DEE2] bg-white px-4 py-3 text-[14px] text-[#4F5C67]"
                >
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#4F5C67]" aria-hidden="true" />
                  <span>
                    Your role ({formatRoleLabel(project.membership.role, project.membership)}) has
                    read-only access to Project settings. Only an active project Contractor can edit
                    details, manage blueprints, change the project password, or use Danger zone
                    actions.
                  </span>
                </div>
              )}

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
                      Existing audit records remain preserved on the server. Review personal
                      account actions in{' '}
                      <Link to="/profile?section=history" className="font-semibold underline">
                        Account history
                      </Link>
                      , or open record-level history in{' '}
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
                  id="settings-general"
                  aria-labelledby="settings-general-heading"
                  className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white p-6"
                >
                  <form onSubmit={handleSaveGeneral} noValidate>
                    <div className="border-b border-[#D9DEE2] pb-4">
                      <h2
                        id="settings-general-heading"
                        className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                      >
                        General
                      </h2>
                      <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                        Renaming this project preserves its stable ID and all existing blueprint,
                        room, Pin, and history links.
                      </p>
                    </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="settings-project-name"
                    className="block text-[14px] font-medium text-[#1B2A4A]"
                  >
                    Project name
                  </label>
                  <input
                    id="settings-project-name"
                    type="text"
                    disabled={!isContractor}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setGeneralSavedMsg(null);
                      if (generalFieldErrors.name) {
                        setGeneralFieldErrors((p) => ({ ...p, name: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(generalFieldErrors.name)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A] disabled:bg-[#F4F3EF]/60"
                  />
                  {generalFieldErrors.name && (
                    <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                      {generalFieldErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="settings-contractor-name"
                    className="block text-[14px] font-medium text-[#1B2A4A]"
                  >
                    Contractor display name
                  </label>
                  <input
                    id="settings-contractor-name"
                    type="text"
                    disabled={!isContractor}
                    value={contractorDisplayName}
                    onChange={(e) => {
                      setContractorDisplayName(e.target.value);
                      setGeneralSavedMsg(null);
                      if (generalFieldErrors.contractorDisplayName) {
                        setGeneralFieldErrors((p) => ({
                          ...p,
                          contractorDisplayName: undefined,
                        }));
                      }
                    }}
                    aria-invalid={Boolean(generalFieldErrors.contractorDisplayName)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A] disabled:bg-[#F4F3EF]/60"
                  />
                  <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                    Display label only; permissions are governed by project memberships.
                  </p>
                  {generalFieldErrors.contractorDisplayName && (
                    <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                      {generalFieldErrors.contractorDisplayName}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="settings-project-timezone"
                    className="block text-[14px] font-medium text-[#1B2A4A]"
                  >
                    Project timezone
                  </label>
                  <select
                    id="settings-project-timezone"
                    disabled={!isContractor}
                    value={timezone}
                    onChange={(e) => {
                      setTimezone(e.target.value);
                      setGeneralSavedMsg(null);
                    }}
                    className="mt-1.5 h-11 w-full max-w-md rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A] disabled:bg-[#F4F3EF]/60"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                    Used for daily attendance logs and operational dates across this project.
                  </p>
                  {generalFieldErrors.timezone && (
                    <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                      {generalFieldErrors.timezone}
                    </p>
                  )}
                </div>
              </div>

              {generalError && (
                <div
                  role="alert"
                  className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{generalError}</span>
                  </div>
                  {generalStale && (
                    <button
                      type="button"
                      onClick={() => void loadActiveProject(project.id)}
                      className="rounded-lg border border-[#B42318]/30 bg-white px-3 py-1.5 font-semibold text-[#B42318] hover:bg-[#FEF3F2]"
                    >
                      Reload latest
                    </button>
                  )}
                </div>
              )}

              {generalSavedMsg && (
                <div
                  role="status"
                  data-testid="general-saved-status"
                  className="mt-4 flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] text-[#166534]"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{generalSavedMsg}</span>
                </div>
              )}
              {isContractor && (
                <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#D9DEE2] pt-4">
                  {hasGeneralUnsavedChanges && (
                    <span className="mr-auto text-[13px] font-medium text-[#A64011]">
                      Unsaved changes
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={generalSaving || !hasGeneralUnsavedChanges}
                    onClick={() => {
                      setName(project.name);
                      setContractorDisplayName(project.contractorDisplayName);
                      setTimezone(project.timezone);
                      setGeneralFieldErrors({});
                      setGeneralError(null);
                      setGeneralSavedMsg(null);
                    }}
                    className="inline-flex min-h-[42px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={generalSaving || !hasGeneralUnsavedChanges}
                    data-testid="save-general-btn"
                    className="inline-flex min-h-[42px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-50"
                  >
                    {generalSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </form>
          </section>

          {/* 1b. Department Pin colors */}
          <section
            id="settings-departments"
            aria-labelledby="settings-departments-heading"
            data-testid="private-settings-departments-section"
            className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white p-6"
          >
            <div className="border-b border-[#D9DEE2] pb-4">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
                <h2
                  id="settings-departments-heading"
                  className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                >
                  Department Pin colors
                </h2>
              </div>
              <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                Each department defines a default Spatial Pin color. Updating a department color
                applies to Pins inheriting the department default while preserving explicit manual
                Pin color overrides.
              </p>
            </div>

            {deptColorStatus && (
              <div
                role="status"
                className="mt-4 flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] text-[#166534]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{deptColorStatus}</span>
              </div>
            )}

            {deptColorError && (
              <div
                role="alert"
                className="mt-4 flex items-center gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{deptColorError}</span>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  data-testid={`private-dept-color-card-${dept.slug}`}
                  className="rounded-xl border border-[#D9DEE2] bg-[#F4F3EF]/35 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/15"
                        style={{ backgroundColor: dept.defaultPinColor }}
                        aria-hidden="true"
                      />
                      <span className="text-[14px] font-semibold text-[#1B2A4A]">{dept.name}</span>
                    </div>
                    <code className="rounded bg-white px-2 py-0.5 text-[12px] font-medium text-[#4F5C67]">
                      {dept.defaultPinColor}
                    </code>
                  </div>

                  {isContractor ? (
                    <ColorPickerControl
                      compact
                      label={`${dept.name} default Pin color`}
                      value={dept.defaultPinColor}
                      onChange={(hex) => {
                        const res = updateDepartmentPinColor(departments, dept.id, hex);
                        if (!res.ok) {
                          setDeptColorError(res.error);
                          setDeptColorStatus(null);
                          return;
                        }
                        setDepartments(res.departments);
                        setDeptColorError(null);
                        setDeptColorStatus(
                          `Updated ${dept.name} default Pin color to ${res.updated.defaultPinColor}.`
                        );
                      }}
                    />
                  ) : (
                    <p className="text-[12px] leading-[17px] text-[#4F5C67]">
                      Read-only. Only an active project Contractor can change default department
                      Pin colors.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 2. Project access */}
          <section
            id="settings-access"
            aria-labelledby="settings-access-heading"
            className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white p-6"
          >
            <form onSubmit={handleChangeProjectPassword} noValidate>
              <div className="border-b border-[#D9DEE2] pb-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                  <h2
                    id="settings-access-heading"
                    className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                  >
                    Project access
                  </h2>
                </div>
                <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                  Change project password. Project passwords are stored as salted server hashes,
                  never change anyone’s account password, and cannot grant membership by
                  themselves.
                </p>
              </div>

              {canManagePass ? (
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="project-pw-current"
                      className="block text-[14px] font-medium text-[#1B2A4A]"
                    >
                      Current project password
                    </label>
                    <input
                      id="project-pw-current"
                      type="password"
                      autoComplete="off"
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value);
                        setPwSuccess(null);
                        if (pwFieldErrors.currentPassword) {
                          setPwFieldErrors((p) => ({ ...p, currentPassword: undefined }));
                        }
                      }}
                      aria-invalid={Boolean(pwFieldErrors.currentPassword)}
                      className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A]"
                    />
                    {pwFieldErrors.currentPassword && (
                      <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                        {pwFieldErrors.currentPassword}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="project-pw-new"
                      className="block text-[14px] font-medium text-[#1B2A4A]"
                    >
                      New project password
                    </label>
                    <input
                      id="project-pw-new"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPwSuccess(null);
                        if (pwFieldErrors.newPassword) {
                          setPwFieldErrors((p) => ({ ...p, newPassword: undefined }));
                        }
                      }}
                      aria-invalid={Boolean(pwFieldErrors.newPassword)}
                      className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A]"
                    />
                    {pwFieldErrors.newPassword && (
                      <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                        {pwFieldErrors.newPassword}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="project-pw-confirm"
                      className="block text-[14px] font-medium text-[#1B2A4A]"
                    >
                      Confirm new password
                    </label>
                    <input
                      id="project-pw-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirmNewPassword}
                      onChange={(e) => {
                        setConfirmNewPassword(e.target.value);
                        setPwSuccess(null);
                        if (pwFieldErrors.confirmNewPassword) {
                          setPwFieldErrors((p) => ({ ...p, confirmNewPassword: undefined }));
                        }
                      }}
                      aria-invalid={Boolean(pwFieldErrors.confirmNewPassword)}
                      className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A]"
                    />
                    {pwFieldErrors.confirmNewPassword && (
                      <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                        {pwFieldErrors.confirmNewPassword}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-[14px] text-[#4F5C67]">
                  Only the project Contractor can change the project password.
                </p>
              )}

              {pwError && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{pwError}</span>
                </div>
              )}

              {pwSuccess && (
                <div
                  role="status"
                  className="mt-4 flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] text-[#166534]"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{pwSuccess}</span>
                </div>
              )}
              {canManagePass && (
                <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#D9DEE2] pt-4">
                  <button
                    type="button"
                    disabled={pwSaving || (!currentPassword && !newPassword && !confirmNewPassword)}
                    onClick={() => {
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmNewPassword('');
                      setPwFieldErrors({});
                      setPwError(null);
                    }}
                    className="inline-flex min-h-[42px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pwSaving}
                    data-testid="save-project-password-btn"
                    className="inline-flex min-h-[42px] items-center rounded-lg bg-[#1B2A4A] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#1B2A4A]/90 disabled:opacity-50"
                  >
                    {pwSaving ? 'Updating…' : 'Save project password'}
                  </button>
                </div>
              )}
            </form>
          </section>

          {/* 3. Blueprints */}
          <section
            id="settings-blueprints"
            aria-labelledby="settings-blueprints-heading"
            className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D9DEE2] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                  <h2
                    id="settings-blueprints-heading"
                    className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                  >
                    Blueprints & areas
                  </h2>
                </div>
                <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                  Add building areas, replace drawings with explicit Pin remap review, or retire
                  blueprints without erasing audit history or Before/After evidence.
                </p>
              </div>
              {isContractor && (
                <button
                  type="button"
                  onClick={() => setAddAreaModalOpen(true)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add area & blueprint
                </button>
              )}
            </div>

            {blueprintNotice && (
              <div
                role="status"
                className="mt-4 flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] text-[#166534]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{blueprintNotice}</span>
              </div>
            )}

            {visibleBlueprints.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/40 px-4 py-6 text-center text-[14px] text-[#4F5C67]">
                No active blueprint sources registered for this project yet.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {/* L03: Same clear BlueprintPreview as Overview, showing original source + authorized file actions, with no misplaced History shortcut */}
                <BlueprintPreview
                  sources={blueprintPreviewSources}
                  settingsPath={routes.settingsPath}
                  hideManageLink
                  settingsFooterSlot={(activeSource) => {
                    const matchedBp =
                      visibleBlueprints.find((b) => b.id === activeSource?.id) ??
                      visibleBlueprints[0];
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                        <span className="text-[#4F5C67]">
                          Original source:{' '}
                          <strong className="text-[#1B2A4A]">
                            {activeSource
                              ? `${activeSource.areaName} · ${activeSource.sheetCode} ${activeSource.revision}`
                              : 'None'}
                          </strong>
                        </span>
                        {isContractor && matchedBp && matchedBp.status !== 'retired' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openReplaceModalForBlueprint(matchedBp)}
                              className="inline-flex min-h-[34px] items-center rounded-lg border border-[#D9DEE2] bg-white px-3 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                            >
                              Replace blueprint
                            </button>
                            <button
                              type="button"
                              onClick={() => void openRemoveRetireModalForBlueprint(matchedBp)}
                              className="inline-flex min-h-[34px] items-center rounded-lg border border-[#B42318]/35 bg-white px-3 text-[12px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                            >
                              Remove or retire
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              </div>
            )}
          </section>

          {/* 4. Danger zone */}
          <section
            id="settings-danger"
            aria-labelledby="settings-danger-heading"
            className="scroll-mt-[84px] rounded-xl border border-[#B42318]/35 bg-white p-6"
          >
            <div className="flex items-center gap-2 border-b border-[#B42318]/20 pb-4">
              <AlertTriangle className="h-5 w-5 text-[#B42318]" aria-hidden="true" />
              <h2
                id="settings-danger-heading"
                className="text-[18px] leading-[24px] font-semibold text-[#B42318]"
              >
                Danger zone
              </h2>
            </div>

            {!isContractor ? (
              <p className="mt-4 text-[14px] text-[#4F5C67]">
                Only the project Contractor can replace blueprints, retire or remove blueprints, or
                delete this project.
              </p>
            ) : (
              <div className="mt-4 space-y-5">
                {visibleBlueprints.length > 0 && selectedDangerBlueprint && (
                  <div className="rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/40 p-4">
                    <label
                      htmlFor="danger-blueprint-select"
                      className="block text-[14px] font-medium text-[#1B2A4A]"
                    >
                      Target blueprint
                    </label>
                    <select
                      id="danger-blueprint-select"
                      value={selectedDangerBlueprint.id}
                      onChange={(e) => setSelectedBlueprintId(e.target.value)}
                      className="mt-1.5 h-11 w-full max-w-md rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] text-[#1B2A4A]"
                    >
                      {visibleBlueprints.map((bp) => (
                        <option key={bp.id} value={bp.id}>
                          {bp.areaName} · {bp.sheetCode} {bp.revision} (
                          {formatBlueprintStatusLabel(bp.status)})
                        </option>
                      ))}
                    </select>

                    <div className="mt-3 flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => openReplaceModalForBlueprint(selectedDangerBlueprint)}
                        className="inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                      >
                        Replace blueprint
                      </button>
                      <button
                        type="button"
                        onClick={() => void openRemoveRetireModalForBlueprint(selectedDangerBlueprint)}
                        className="inline-flex min-h-[44px] items-center rounded-lg border border-[#B42318]/40 bg-white px-4 py-2 text-[14px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                      >
                        Remove or retire blueprint
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#D9DEE2] pt-4">
                  <div>
                    <div className="text-[15px] font-semibold text-[#1B2A4A]">Delete project</div>
                    <p className="text-[13px] leading-[18px] text-[#4F5C67]">
                      Logically deletes <strong>{project.name}</strong> and revokes all member route
                      and private file access while keeping restricted deletion audit records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteModalOpen(true);
                    }}
                    data-testid="danger-delete-project-btn"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#B42318] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#912018]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete project
                  </button>
                </div>
              </div>
            )}
          </section>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add Area & Blueprint Modal */}
      {addAreaModalOpen && accessToken && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add area and blueprint"
        >
          <div className="max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[#D9DEE2] bg-[#F4F3EF] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[20px] font-bold text-[#1B2A4A]">Add area & blueprint</h2>
              <button
                type="button"
                onClick={() => setAddAreaModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#4F5C67] hover:text-[#1B2A4A]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <BlueprintReviewStudio
              accessToken={accessToken}
              project={project}
              mode="add-area"
              onProjectUpdated={(updated) => syncProjectInCache(updated)}
              onPublished={(res) => {
                syncProjectInCache(res.project);
                setBlueprintNotice(
                  `Published new area blueprint (${res.modelVersion.sheetCode} ${res.modelVersion.revision}, v${res.modelVersion.versionNumber}).`
                );
                setAddAreaModalOpen(false);
              }}
              onCancel={() => setAddAreaModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Replace Blueprint Modal */}
      {replaceTarget && accessToken && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Replace blueprint"
        >
          <div className="max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[#D9DEE2] bg-[#F4F3EF] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-bold text-[#1B2A4A]">
                  Replace blueprint · {project.name} / {replaceTarget.areaName}
                </h2>
                <p className="text-[13px] text-[#4F5C67]">
                  The current published model remains active until you review, resolve any impacted
                  Pins, and publish the replacement version.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplaceTarget(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#4F5C67] hover:text-[#1B2A4A]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <BlueprintReviewStudio
              accessToken={accessToken}
              project={project}
              mode="replace"
              targetAreaId={replaceTarget.areaId}
              targetAreaName={replaceTarget.areaName}
              replacesModelVersion={replaceTarget.modelVersion}
              currentBlueprintAsset={replaceTarget.asset}
              onProjectUpdated={(updated) => syncProjectInCache(updated)}
              onPublished={(res) => {
                syncProjectInCache(res.project);
                setBlueprintNotice(
                  `Published replacement blueprint ${res.modelVersion.sheetCode} ${res.modelVersion.revision} (v${res.modelVersion.versionNumber}) for ${replaceTarget.areaName}. Previous model and Before/After evidence remain preserved.`
                );
                setReplaceTarget(null);
              }}
              onCancel={() => setReplaceTarget(null)}
            />
          </div>
        </div>
      )}

      {/* Remove or Retire Blueprint Confirmation Modal */}
      {removeTargetBp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-blueprint-modal-title"
          data-testid="remove-blueprint-modal"
        >
          <div className="w-full max-w-lg rounded-xl border border-[#D9DEE2] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#B42318]" aria-hidden="true" />
                <h2
                  id="remove-blueprint-modal-title"
                  className="text-[18px] font-semibold text-[#1B2A4A]"
                >
                  Remove or retire blueprint
                </h2>
              </div>
              <button
                type="button"
                disabled={removeBusy}
                onClick={() => setRemoveTargetBp(null)}
                className="rounded-lg p-1 text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/60 p-3.5 text-[13px] text-[#1B2A4A]">
              <div>
                <strong>Project:</strong> {project.name}
              </div>
              <div>
                <strong>Area:</strong> {removeTargetBp.areaName}
              </div>
              <div>
                <strong>Drawing:</strong> {removeTargetBp.sheetCode} {removeTargetBp.revision}
                {removeTargetBp.fileName ? ` (${removeTargetBp.fileName})` : ''}
              </div>
            </div>

            {removeLoadingImpact ? (
              <p className="mt-4 text-[14px] text-[#4F5C67]">Checking dependent models and Pins…</p>
            ) : removeImpact ? (
              <div className="mt-4 space-y-3 text-[13px]">
                <dl className="grid grid-cols-2 gap-2 rounded-lg border border-[#D9DEE2] p-3">
                  <div>
                    <dt className="text-[#4F5C67]">Dependent model versions</dt>
                    <dd className="font-semibold text-[#1B2A4A]">
                      {removeImpact.dependentModelVersionIds.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#4F5C67]">Rooms on active model</dt>
                    <dd className="font-semibold text-[#1B2A4A]">{removeImpact.roomCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[#4F5C67]">Work Pins</dt>
                    <dd className="font-semibold text-[#1B2A4A]">{removeImpact.pinCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[#4F5C67]">Before/After evidence</dt>
                    <dd className="font-semibold text-[#1B2A4A]">{removeImpact.evidenceCount}</dd>
                  </div>
                </dl>

                <p className="leading-[19px] text-[#4F5C67]">
                  {removeImpact.historyRetentionSummary}
                </p>

                <div>
                  <label className="block text-[13px] font-medium text-[#1B2A4A]">
                    Audit reason (optional)
                  </label>
                  <input
                    type="text"
                    value={removeReason}
                    onChange={(e) => setRemoveReason(e.target.value)}
                    placeholder="e.g. Superseded by revised structural sheet"
                    className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px]"
                  />
                </div>
              </div>
            ) : null}

            {removeError && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
              >
                {removeError}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#D9DEE2] pt-4">
              <button
                type="button"
                disabled={removeBusy}
                onClick={() => setRemoveTargetBp(null)}
                className="inline-flex min-h-[42px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                Cancel
              </button>
              {removeImpact?.canHardRemoveDraft ? (
                <button
                  type="button"
                  disabled={removeBusy}
                  onClick={() => void handleConfirmRemoveOrRetire('remove')}
                  className="inline-flex min-h-[42px] items-center rounded-lg bg-[#B42318] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#912018] disabled:opacity-50"
                >
                  {removeBusy ? 'Removing…' : 'Remove unused draft'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={removeBusy || removeLoadingImpact || !removeImpact}
                  onClick={() => void handleConfirmRemoveOrRetire('retire')}
                  className="inline-flex min-h-[42px] items-center rounded-lg bg-[#B42318] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#912018] disabled:opacity-50"
                >
                  {removeBusy ? 'Retiring…' : 'Retire blueprint (preserve History)'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <DeleteProjectModal
        open={deleteModalOpen}
        projectName={project.name}
        projectId={project.id}
        impact={{
          areaCount: project.areas?.length ?? 0,
          blueprintCount: visibleBlueprints.length,
          publishedModelCount: (project.modelVersions ?? []).filter((v) => v.status === 'published')
            .length,
          pinCount: project.pins?.length ?? 0,
        }}
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (!deleteBusy) setDeleteModalOpen(false);
        }}
        onConfirm={handleConfirmDeleteProject}
      />
    </div>
  );
}
