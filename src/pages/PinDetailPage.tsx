import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  MapPin,
  Palette,
} from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { useDemoAddendum } from '../context/DemoAddendumContext';
import { formatCoordsMeters, formatStatusLabel } from '../domain/demoStore';
import { resolveEffectivePinColor } from '../domain/departmentCatalog';
import type { PinWorkStatus } from '../domain/types';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { MaterialsSection } from '../components/MaterialsSection';
import { EvidenceSection } from '../components/EvidenceSection';
import { ColorPickerControl } from '../components/ColorPickerControl';
import { getProjectRoutes } from '../utils/projectRoutes';
import { buildPinDepartmentRailGroups } from '../utils/moduleNavConfig';

const STATUS_ACTIONS: ReadonlyArray<{ status: PinWorkStatus; label: string }> = [
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'pending_review', label: 'Submit for QC' },
  { status: 'approved', label: 'Approve QC' },
];

export function PinDetailPage() {
  const { project: projectParam, slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    state,
    departments,
    addMaterial,
    attachEvidence,
    removeEvidence,
    updatePinColor,
    updatePinStatus,
  } = useDemo();
  const addendum = useDemoAddendum();

  const [manualColorOpen, setManualColorOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const pin = state.pins.find((p) => p.slug === slug || p.id === slug);
  const projectSlug = state.project.slug;
  const routes = getProjectRoutes(location.pathname, projectSlug);

  const pinRailGroups = useMemo(() => {
    const activeDept = pin
      ? departments.find((d) => d.name.toLowerCase() === pin.department.toLowerCase())
      : null;
    return buildPinDepartmentRailGroups({
      departments: departments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        pinCount: state.pins.filter((p) => p.department.toLowerCase() === dept.name.toLowerCase())
          .length,
      })),
      activeDepartmentId: activeDept ? activeDept.id : 'all',
      onSelectDepartment: (deptId) => {
        navigate(
          deptId === 'all' ? routes.pinListPath : `${routes.pinListPath}?dept=${encodeURIComponent(deptId)}`
        );
      },
    });
  }, [departments, pin, state.pins, navigate, routes.pinListPath]);

  if (!pin || (projectParam && projectParam !== projectSlug)) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <ProjectNavbar />
        <main className="mx-auto w-full max-w-[760px] px-4 py-16 text-center">
          <h1 className="text-[26px] leading-[32px] font-bold">Spatial Pin not found</h1>
          <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
            This Pin does not exist in the active demo state.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              to={routes.pinListPath}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              PIN list
            </Link>
            <Link
              to={routes.workspacePath}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
            >
              Open Workspace
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const locateIn3DUrl = routes.locatePinPath(pin.id);
  const effectiveColor = resolveEffectivePinColor(pin, departments);
  const pinDepartment = departments.find(
    (d) => d.name.toLowerCase() === pin.department.toLowerCase()
  );
  const hasQcAuthority =
    addendum.activePersona.role === 'contractor' || addendum.activePersona.role === 'owner';

  const handleStatusTransition = (nextStatus: PinWorkStatus) => {
    setStatusError(null);
    setStatusMessage(null);
    const res = updatePinStatus(pin.id, nextStatus, {
      actorName: addendum.activePersona.displayName,
      hasQcAuthority,
    });
    if (!res.ok) {
      setStatusError(res.error);
      return;
    }
    setStatusMessage(`Pin status updated to ${formatStatusLabel(nextStatus)}.`);
  };

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
          <div className="mx-auto w-full max-w-[1200px]">
            {/* Back Links & Demo Provenance */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to={routes.pinListPath}
                  className="inline-flex min-h-[40px] items-center gap-1.5 text-[14px] leading-[20px] font-medium text-[#4F5C67] hover:text-[#1B2A4A]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  PIN
                </Link>
                <span aria-hidden="true" className="text-[#D9DEE2]">
                  /
                </span>
                <Link
                  to={locateIn3DUrl}
                  className="inline-flex min-h-[40px] items-center text-[14px] leading-[20px] font-medium text-[#4F5C67] hover:text-[#1B2A4A]"
                >
                  Workspace
                </Link>
              </div>

              <span className="text-[13px] leading-[18px] font-semibold text-[#A64011]">
                {state.project.demoLabel}
              </span>
            </div>

            {/* Header Card */}
            <section className="rounded-xl border border-[#D9DEE2] bg-white p-6">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                      style={{ backgroundColor: effectiveColor }}
                      title={`Effective Pin color ${effectiveColor}`}
                      aria-hidden="true"
                    />
                    <h1 className="text-[26px] leading-[32px] font-bold tracking-tight text-[#1B2A4A]">
                      {pin.title}
                    </h1>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[18px] text-[#4F5C67]">
                    <span className="font-semibold text-[#D4652F]">
                      {formatStatusLabel(pin.status)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Cycle {pin.cycleNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{pin.department}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{pin.id}</span>
                  </div>
                  <p className="mt-3 max-w-3xl text-[15px] leading-[22px] text-[#4F5C67]">
                    {pin.description}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                  <Link
                    to={routes.modulePath('store-requests')}
                    className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DEE2] bg-white px-3.5 py-2 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                  >
                    <ClipboardList className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                    Store Requests (SR)
                  </Link>
                  <Link
                    to={routes.modulePath('purchase-requests')}
                    className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D9DEE2] bg-white px-3.5 py-2 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                    Purchase Requests (PR)
                  </Link>
                  <Link
                    to={locateIn3DUrl}
                    className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg bg-[#A64011] px-5 py-2.5 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E]"
                  >
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Locate in 3D
                  </Link>
                </div>
              </div>

              {/* Metadata */}
              <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-[#D9DEE2] pt-5 text-[14px] leading-[20px] sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[13px] leading-[18px] text-[#4F5C67]">Location</dt>
                  <dd className="mt-0.5 font-semibold text-[#1B2A4A]">{pin.roomName}</dd>
                  <div className="text-[13px] leading-[18px] text-[#4F5C67]">{pin.surfaceSide}</div>
                </div>

                <div>
                  <dt className="text-[13px] leading-[18px] text-[#4F5C67]">Element</dt>
                  <dd className="mt-0.5 font-semibold text-[#1B2A4A]">{pin.elementName}</dd>
                  <div className="text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
                    {pin.elementId}
                  </div>
                </div>

                <div>
                  <dt className="text-[13px] leading-[18px] text-[#4F5C67]">Assignee</dt>
                  <dd className="mt-0.5 font-semibold text-[#1B2A4A]">{pin.assigneeName}</dd>
                  <div className="text-[13px] leading-[18px] text-[#4F5C67]">{pin.department}</div>
                </div>

                <div>
                  <dt className="text-[13px] leading-[18px] text-[#4F5C67]">Anchor & Version</dt>
                  <dd className="mt-0.5 font-medium text-[#1B2A4A] tabular-nums">
                    {formatCoordsMeters(pin.position)}
                  </dd>
                  <div className="text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
                    {pin.modelVersionId}
                  </div>
                </div>
              </dl>
            </section>

            {/* Main Content Grid: Materials + Before/After Evidence + Status / Color / Timeline */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-8">
                <div className="rounded-xl border border-[#D9DEE2] bg-white p-6">
                  <MaterialsSection
                    pin={pin}
                    onAddMaterial={(input) => addMaterial(pin.id, input)}
                  />
                </div>

                <div className="rounded-xl border border-[#D9DEE2] bg-white p-6">
                  <EvidenceSection
                    pin={pin}
                    onAttachEvidence={(input) => attachEvidence(pin.id, input)}
                    onRemoveEvidence={(slot) => removeEvidence(pin.id, slot)}
                  />
                </div>
              </div>

              <aside className="space-y-6 lg:col-span-4">
                <section className="rounded-xl border border-[#D9DEE2] bg-white p-6">
                  <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                    Work & QC status
                  </h2>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {STATUS_ACTIONS.map((action) => {
                      const active = pin.status === action.status;
                      return (
                        <button
                          key={action.status}
                          type="button"
                          data-testid={`pin-detail-status-${action.status}`}
                          aria-pressed={active}
                          onClick={() => handleStatusTransition(action.status)}
                          className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                            active
                              ? 'border-[#1B2A4A] bg-[#1B2A4A] text-white'
                              : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                          }`}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>

                  {statusError && (
                    <div
                      role="alert"
                      data-testid="pin-detail-status-error"
                      className="mt-3 flex items-start gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-2.5 text-[12px] font-medium text-[#B42318]"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{statusError}</span>
                    </div>
                  )}

                  {statusMessage && (
                    <div
                      role="status"
                      className="mt-3 flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-2.5 text-[12px] font-medium text-[#166534]"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{statusMessage}</span>
                    </div>
                  )}

                  <dl className="mt-4 divide-y divide-[#D9DEE2] text-[14px] leading-[20px]">
                    <div className="py-3 first:pt-0">
                      <dt className="text-[13px] leading-[18px] text-[#4F5C67]">QC status</dt>
                      <dd className="mt-0.5 font-medium text-[#1B2A4A]">
                        {formatStatusLabel(pin.status)}
                      </dd>
                    </div>
                    <div className="py-3">
                      <dt className="text-[13px] leading-[18px] text-[#4F5C67]">Warehouse issue</dt>
                      <dd className="mt-0.5 font-medium text-[#1B2A4A]">
                        {pin.materials.filter((m) => m.issuedQty > 0).length} of{' '}
                        {pin.materials.length} lines issued
                      </dd>
                    </div>
                    <div className="py-3">
                      <dt className="text-[13px] leading-[18px] text-[#4F5C67]">
                        Pin marker color{' '}
                        <span className="text-[11px] font-normal">
                          ({pin.pinColorOverride ? 'Manual override' : `${pin.department} default`})
                        </span>
                      </dt>
                      <dd className="mt-2 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {departments.slice(0, 6).map((dept) => {
                            const active =
                              !pin.pinColorOverride &&
                              dept.name.toLowerCase() === pin.department.toLowerCase();
                            return (
                              <button
                                key={dept.id}
                                type="button"
                                data-testid={`pin-detail-dept-color-${dept.slug}`}
                                onClick={() => updatePinColor(pin.id, dept.defaultPinColor, false)}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] font-medium transition-colors ${
                                  active
                                    ? 'border-[#1B2A4A] bg-[#F4F3EF] text-[#1B2A4A]'
                                    : 'border-[#D9DEE2] bg-white text-[#4F5C67] hover:bg-[#F4F3EF]'
                                }`}
                              >
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: dept.defaultPinColor }}
                                />
                                <span>{dept.name}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setManualColorOpen((v) => !v)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-2.5 py-1 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                          >
                            <Palette className="h-3.5 w-3.5 text-[#A64011]" aria-hidden="true" />
                            {manualColorOpen ? 'Hide manual color' : 'Manual color'}
                          </button>
                          {pin.pinColorOverride && pinDepartment && (
                            <button
                              type="button"
                              onClick={() =>
                                updatePinColor(pin.id, pinDepartment.defaultPinColor, false)
                              }
                              className="text-[12px] font-medium text-[#A64011] hover:underline"
                            >
                              Reset to {pinDepartment.name} default
                            </button>
                          )}
                        </div>

                        {manualColorOpen && (
                          <ColorPickerControl
                            compact
                            label="Manual Pin override color"
                            value={effectiveColor}
                            onChange={(hex) => updatePinColor(pin.id, hex, true)}
                          />
                        )}
                      </dd>
                    </div>
                    <div className="py-3 last:pb-0">
                      <dt className="text-[13px] leading-[18px] text-[#4F5C67]">Geometry source</dt>
                      <dd className="mt-0.5 text-[13px] font-semibold text-[#A64011]">
                        {state.project.geometryNotice}
                      </dd>
                    </div>
                  </dl>
                </section>

                {/* Record-level Pin status history (replaces retired Project Settings History link) */}
                <section className="rounded-xl border border-[#D9DEE2] bg-white p-6">
                  <h2 className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                    Pin record timeline
                  </h2>
                  <ol className="mt-3 space-y-2.5 text-[13px]">
                    {(pin.statusHistory && pin.statusHistory.length > 0
                      ? pin.statusHistory
                      : [{ status: pin.status, at: pin.createdAt, actor: pin.assigneeName }]
                    ).map((entry, idx) => (
                      <li
                        key={`${entry.status}-${entry.at}-${idx}`}
                        className="rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/35 px-3 py-2"
                      >
                        <div className="font-semibold text-[#1B2A4A]">
                          {formatStatusLabel(entry.status)}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#4F5C67]">
                          {entry.actor || 'Project member'} ·{' '}
                          {new Date(entry.at).toLocaleString()}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
