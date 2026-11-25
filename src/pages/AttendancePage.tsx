import { isProjectLead } from '../domain/accountTypes';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileCheck2,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { useDemo } from '../context/DemoContext';
import { DEMO_TODAY, useDemoAddendum } from '../context/DemoAddendumContext';
import { useAuth } from '../context/AuthContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import {
  canDecideIzinForShift,
  deriveEffectiveAttendanceStatus,
  formatAttendanceStatusLabel,
  formatInstantInProjectZone,
  formatIzinRequestStatusLabel,
} from '../domain/attendanceEngine';
import { buildAttendanceRailGroups } from '../utils/moduleNavConfig';
import { getProjectRoutes } from '../utils/projectRoutes';

function statusBadgeStyle(status: string): string {
  switch (status) {
    case 'present':
    case 'approved':
      return 'bg-[#ECFDF3] text-emerald-800 border-emerald-200';
    case 'alfa':
    case 'rejected':
      return 'bg-[#FEF2F2] text-red-800 border-red-200';
    case 'izin':
      return 'bg-[#EFF6FF] text-blue-800 border-blue-200';
    case 'pending':
    case 'awaiting_mandor_assignment':
    case 'conflict_requires_correction':
      return 'bg-[#FFF8EB] text-amber-900 border-amber-200';
    default:
      return 'bg-[#F4F3EF] text-[#4F5C67] border-[#D9DEE2]';
  }
}

export const DemoAttendancePage: React.FC = () => {
  const { state, departments } = useDemo();
  const addendum = useDemoAddendum();
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get('view') === 'roster' ? 'roster' : 'manual';
  const routes = getProjectRoutes('/demo/projects', state.project.slug);
  const railGroups = useMemo(
    () =>
      buildAttendanceRailGroups(viewParam, (nextView) =>
        setSearchParams(nextView === 'roster' ? { view: 'roster' } : {}, { replace: true })
      ),
    [viewParam, setSearchParams]
  );

  // Shared calendar date and department filters across both views
  const [selectedDate, setSelectedDate] = useState<string>(DEMO_TODAY);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerIdInput, setWorkerIdInput] = useState('WRK-022');
  const [actionBanner, setActionBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Live getUserMedia camera state (tracks stopped cleanly on unmount / view switch)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<
    'idle' | 'starting' | 'active' | 'captured' | 'error'
  >('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedSelfieUrl, setCapturedSelfieUrl] = useState<string | null>(null);

  // Izin drawer state (supports PDF + image)
  const [izinModalShiftId, setIzinModalShiftId] = useState<string | null>(null);
  const [izinReason, setIzinReason] = useState('');
  const [uploadedEvidenceId, setUploadedEvidenceId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Foreman reject drafts & manual correction modal state
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const [correctionTarget, setCorrectionTarget] = useState<{
    obligationId: string;
    workerName: string;
    workDate: string;
  } | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<'present' | 'alfa'>('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionEvidence, setCorrectionEvidence] = useState('');
  const [evidenceViewerId, setEvidenceViewerId] = useState<string | null>(null);

  const stopCameraTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Cleanup camera stream whenever view switches away from Manual attendance or component unmounts
  useEffect(() => {
    if (viewParam !== 'manual') {
      stopCameraTracks();
      if (cameraStatus === 'active' || cameraStatus === 'starting') {
        setCameraStatus('idle');
      }
    }
    return () => {
      stopCameraTracks();
    };
  }, [viewParam]);

  const startCamera = async () => {
    setCameraError(null);
    setCapturedSelfieUrl(null);
    stopCameraTracks();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error');
      setCameraError(
        'Camera API is not available in this browser. Connect a camera or grant permissions to capture a daily selfie.'
      );
      return;
    }
    setCameraStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraStatus('active');
    } catch (err) {
      setCameraStatus('error');
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in browser settings and retry.'
          : 'No usable camera found or capture was interrupted. Retry when ready — Present has not been recorded.';
      setCameraError(msg);
    }
  };

  const captureFrameFromVideo = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setCameraError('Camera stream is not ready yet. Wait a moment and retry Capture.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(320, video.videoWidth || 480);
    canvas.height = Math.max(240, video.videoHeight || 360);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCameraTracks();
    setCapturedSelfieUrl(dataUrl);
    setCameraStatus('captured');
  };

  const handleSelfieFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCameraError(null);
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      setCameraError('Select a valid image file to capture a daily attendance selfie.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        stopCameraTracks();
        setCapturedSelfieUrl(reader.result);
        setCameraStatus('captured');
      }
    };
    reader.readAsDataURL(file);
  };

  const matchedSubject = useMemo(() => {
    const trimmed = workerIdInput.trim().toLowerCase();
    if (!trimmed) return null;
    return (
      addendum.members.find(
        (m) =>
          m.workerCode.toLowerCase() === trimmed ||
          m.userId.toLowerCase() === trimmed
      ) ?? null
    );
  }, [addendum.members, workerIdInput]);

  const handleConfirmManualAttendance = () => {
    if (!matchedSubject) {
      setActionBanner({
        kind: 'err',
        text: 'Enter a valid Worker ID or select a worker from Search worker first.',
      });
      return;
    }
    if (!capturedSelfieUrl) {
      setActionBanner({
        kind: 'err',
        text: 'Capture a fresh daily selfie before confirming attendance. Present was not recorded.',
      });
      return;
    }
    const res = addendum.recordManualSelfieCheckIn({
      workerUserId: matchedSubject.userId,
      workDate: selectedDate,
      selfieDataUrl: capturedSelfieUrl,
    });
    setActionBanner({ kind: res.ok ? 'ok' : 'err', text: res.message });
    if (res.ok) {
      setCapturedSelfieUrl(null);
      setCameraStatus('idle');
    }
  };

  const filteredWorkers = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    return addendum.members.filter((m) => {
      if (m.status === 'revoked') return false;
      if (deptFilter !== 'all' && m.division.toLowerCase() !== deptFilter.toLowerCase()) {
        return false;
      }
      if (q) {
        const hay = `${m.displayName} ${m.workerCode} ${m.division} ${m.profession}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [addendum.members, deptFilter, workerSearch]);

  // Compute roster rows for selectedDate + reporting period aggregates
  const rosterRows = useMemo(() => {
    return filteredWorkers.map((member) => {
      const isOwner = member.role === 'owner';
      const selfieKey = `${member.userId}::${selectedDate}`;
      const dailySelfie = addendum.dailySelfies[selfieKey] ?? null;

      if (isOwner) {
        return {
          member,
          isOwner: true,
          dailySelfie: null,
          dayShift: null,
          dayDerived: null,
          dayIzin: null,
          attendancePct: '—',
          approvedIzinCount: '—',
          alfaCount: '—',
          canForemanReview: false,
          canCorrect: false,
        };
      }

      const dayShift =
        addendum.shifts.find(
          (s) => s.workerUserId === member.userId && s.workDate === selectedDate
        ) ?? null;
      const dayRec = dayShift ? (addendum.records[dayShift.id] ?? null) : null;
      const dayIzin = dayShift
        ? (addendum.izinRequests.find((r) => r.obligationId === dayShift.id) ?? null)
        : null;
      const dayDerived = dayShift
        ? deriveEffectiveAttendanceStatus({
            shift: dayShift,
            record: dayRec,
            izin: dayIzin,
            nowUtcMs: addendum.demoClockUtcMs,
          })
        : null;

      // Reporting period aggregates across all shifts for this worker
      let present = 0;
      let alfa = 0;
      let approvedIzin = 0;
      for (const s of addendum.shifts.filter((x) => x.workerUserId === member.userId)) {
        const r = addendum.records[s.id] ?? null;
        const iz = addendum.izinRequests.find((req) => req.obligationId === s.id) ?? null;
        const d = deriveEffectiveAttendanceStatus({
          shift: s,
          record: r,
          izin: iz,
          nowUtcMs: addendum.demoClockUtcMs,
        });
        if (d.attendanceStatus === 'present') present += 1;
        else if (d.attendanceStatus === 'alfa') alfa += 1;
        else if (d.attendanceStatus === 'izin') approvedIzin += 1;
      }
      const denom = present + alfa;
      const attendancePct = denom > 0 ? `${Math.round((present / denom) * 100)}%` : '—';

      const canForemanReview = Boolean(
        dayShift &&
          dayIzin &&
          dayIzin.status === 'pending' &&
          canDecideIzinForShift({
            reviewerUserId: addendum.activePersona.userId,
            reviewerMembership: addendum.activePersona,
            shift: dayShift,
          }).allowed
      );

      const canCorrect = Boolean(
        dayShift &&
          (isProjectLead(addendum.activePersona.role) ||
            (addendum.activePersona.hasMandorGrant &&
              dayShift.assignedMandorUserIds.includes(addendum.activePersona.userId)))
      );

      return {
        member,
        isOwner: false,
        dailySelfie,
        dayShift,
        dayDerived,
        dayIzin,
        attendancePct,
        approvedIzinCount: String(approvedIzin),
        alfaCount: String(alfa),
        canForemanReview,
        canCorrect,
      };
    });
  }, [
    filteredWorkers,
    selectedDate,
    addendum.dailySelfies,
    addendum.shifts,
    addendum.records,
    addendum.izinRequests,
    addendum.demoClockUtcMs,
    addendum.activePersona,
  ]);

  const handleEvidenceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setUploadError('Only PDF, JPEG, PNG, or WebP files are accepted as leave evidence.');
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setUploadError('Supporting document must be between 1 byte and 10 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        setUploadError('Could not read file. Retry uploading.');
        return;
      }
      const saved = addendum.uploadDemoIzinPhoto({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        previewDataUrl: dataUrl,
      });
      setUploadedEvidenceId(saved.id);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitIzinModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!izinModalShiftId) return;
    const res = addendum.submitDemoIzin({
      obligationId: izinModalShiftId,
      reason: izinReason,
      evidencePhotoIds: uploadedEvidenceId ? [uploadedEvidenceId] : [],
    });
    setActionBanner({ kind: res.ok ? 'ok' : 'err', text: res.message });
    if (res.ok) {
      setIzinModalShiftId(null);
      setIzinReason('');
      setUploadedEvidenceId(null);
    }
  };

  const handleSaveCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;
    const res = addendum.applyManualAttendanceCorrection({
      obligationId: correctionTarget.obligationId,
      nextStatus: correctionStatus,
      reason: correctionReason,
      evidenceNote: correctionEvidence,
    });
    setActionBanner({ kind: res.ok ? 'ok' : 'err', text: res.message });
    if (res.ok) {
      setCorrectionTarget(null);
      setCorrectionReason('');
      setCorrectionEvidence('');
    }
  };

  const viewedEvidence = evidenceViewerId ? addendum.evidencePhotos[evidenceViewerId] : null;

  return (
    <div className="min-h-dvh bg-[#F4F3EF] flex flex-col text-[#1B2A4A]">
      <ProjectNavbar inProjectContext hasContextualRail />

      <div className="flex flex-1 min-h-[calc(100dvh-60px)]">
        <ContextualRail
          moduleLabel="Attendance"
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1360px] space-y-5">
            {/* Header — zero user-facing synthetic clock widget */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="vonta-page-title text-[#1B2A4A]">
                  Attendance management
                </h1>
                <p className="mt-1 text-[14px] text-[#4F5C67]">
                  Schedule timezone: <strong>{state.project.timezone}</strong> (08:00 shift start ·
                  09:00 automatic <strong>Absent</strong> cutoff). <strong>Approved leave</strong>{' '}
                  requires private PDF or photo evidence reviewed by an assigned Foreman.
                </p>
              </div>

              {/* View Switcher: Manual attendance / Attendance roster */}
              <div
                role="tablist"
                aria-label="Attendance views"
                className="inline-flex rounded-xl border border-[#D9DEE2] bg-white p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewParam === 'manual'}
                  data-testid="tab-manual-attendance"
                  onClick={() => setSearchParams({ view: 'manual' })}
                  className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                    viewParam === 'manual'
                      ? 'bg-[#1B2A4A] text-white'
                      : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  Manual attendance
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewParam === 'roster'}
                  data-testid="tab-attendance-roster"
                  onClick={() => setSearchParams({ view: 'roster' })}
                  className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                    viewParam === 'roster'
                      ? 'bg-[#1B2A4A] text-white'
                      : 'text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  Attendance roster
                </button>
              </div>
            </div>

            {actionBanner && (
              <div
                data-testid="attendance-action-banner"
                role="status"
                className={`rounded-xl border px-4 py-3 text-[13px] font-medium ${
                  actionBanner.kind === 'ok'
                    ? 'border-emerald-300 bg-[#ECFDF3] text-emerald-900'
                    : 'border-red-300 bg-[#FEF2F2] text-red-800'
                }`}
              >
                {actionBanner.text}
              </div>
            )}

            {/* Shared Date + Department Filter Bar */}
            <section
              aria-label="Attendance date and department filters"
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[#D9DEE2] bg-white p-3.5"
            >
              <div className="flex items-center gap-2">
                <label htmlFor="attendance-date-input" className="text-[12px] font-semibold text-[#4F5C67]">
                  Work date
                </label>
                <input
                  id="attendance-date-input"
                  data-testid="attendance-date-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-[#D9DEE2] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#1B2A4A]"
                />
              </div>

              <select
                aria-label="Filter attendance by department"
                data-testid="attendance-dept-filter"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-lg border border-[#D9DEE2] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A]"
              >
                <option value="all">Department: All</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>

              <div className="relative min-w-[200px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  placeholder="Search workers by name or ID…"
                  aria-label="Search workers"
                  data-testid="attendance-worker-search"
                  className="w-full rounded-lg border border-[#D9DEE2] py-1.5 pl-9 pr-3 text-[13px] text-[#1B2A4A]"
                />
              </div>
            </section>

            {/* VIEW 1: MANUAL ATTENDANCE */}
            {viewParam === 'manual' ? (
              <div
                data-testid="manual-attendance-view"
                className="grid grid-cols-1 gap-6 lg:grid-cols-12"
              >
                {/* Left: Camera Preview + Capture/Retake/Confirm + Worker ID below */}
                <section className="space-y-4 rounded-xl border border-[#D9DEE2] bg-white p-5 lg:col-span-6">
                  <div>
                    <h2 className="text-[16px] font-semibold text-[#1B2A4A]">
                      Daily selfie check-in
                    </h2>
                    <p className="mt-0.5 text-[12px] text-[#4F5C67]">
                      Capture a fresh daily selfie for the displayed worker. Daily selfies remain
                      private attendance evidence and never replace the account portrait.
                    </p>
                  </div>

                  {/* Camera Frame */}
                  <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-[#D9DEE2] bg-[#111B2E] text-white">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className={`h-full w-full object-cover ${
                        cameraStatus === 'active' ? 'block' : 'hidden'
                      }`}
                    />
                    {cameraStatus === 'captured' && capturedSelfieUrl && (
                      <img
                        src={capturedSelfieUrl}
                        alt="Captured daily attendance selfie"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {cameraStatus === 'idle' && (
                      <div className="p-6 text-center">
                        <Camera className="mx-auto h-8 w-8 text-white/70" aria-hidden="true" />
                        <p className="mt-2 text-[13px] font-medium">Camera standby</p>
                        <p className="mt-1 text-[12px] text-white/70">
                          Start camera to capture a fresh selfie for {selectedDate}.
                        </p>
                      </div>
                    )}
                    {cameraStatus === 'starting' && (
                      <p className="text-[13px] text-white/80">Requesting camera access…</p>
                    )}
                    {cameraStatus === 'error' && (
                      <div className="max-w-sm p-5 text-center" role="alert">
                        <AlertTriangle
                          className="mx-auto h-7 w-7 text-[#F39C6B]"
                          aria-hidden="true"
                        />
                        <p className="mt-2 text-[13px] font-semibold">Camera unavailable</p>
                        <p className="mt-1 text-[12px] text-white/80">{cameraError}</p>
                      </div>
                    )}
                  </div>

                  {/* Camera Actions: Start / Capture / Retake / Confirm */}
                  <div className="flex flex-wrap items-center gap-2">
                    {(cameraStatus === 'idle' || cameraStatus === 'error') && (
                      <button
                        type="button"
                        data-testid="camera-start-btn"
                        onClick={() => void startCamera()}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#1B2A4A]/90"
                      >
                        <Camera className="h-4 w-4" aria-hidden="true" />
                        {cameraStatus === 'error' ? 'Retry camera' : 'Start camera'}
                      </button>
                    )}
                    {cameraStatus === 'active' && (
                      <button
                        type="button"
                        data-testid="camera-capture-btn"
                        onClick={captureFrameFromVideo}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#A64011] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#8C350E]"
                      >
                        <Camera className="h-4 w-4" aria-hidden="true" />
                        Capture
                      </button>
                    )}
                    {cameraStatus === 'captured' && (
                      <>
                        <button
                          type="button"
                          data-testid="camera-retake-btn"
                          onClick={() => {
                            setCapturedSelfieUrl(null);
                            void startCamera();
                          }}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3.5 py-2 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                          Retake
                        </button>
                        <button
                          type="button"
                          data-testid="camera-confirm-btn"
                          onClick={handleConfirmManualAttendance}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-800"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Confirm check-in
                        </button>
                      </>
                    )}

                    {/* Device photo fallback for devices without webcam */}
                    <label className="ml-auto inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] px-3 py-2 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]">
                      <span>Attach selfie photo</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="user"
                        onChange={handleSelfieFileFallback}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {/* Worker ID input directly below camera */}
                  <div className="border-t border-[#D9DEE2] pt-4">
                    <label
                      htmlFor="manual-worker-id-input"
                      className="block text-[13px] font-semibold text-[#1B2A4A]"
                    >
                      Worker ID
                    </label>
                    <input
                      id="manual-worker-id-input"
                      data-testid="manual-worker-id-input"
                      type="text"
                      value={workerIdInput}
                      onChange={(e) => setWorkerIdInput(e.target.value)}
                      placeholder="Enter Worker ID (e.g. WRK-022)"
                      className="mt-1.5 w-full rounded-lg border border-[#D9DEE2] px-3 py-2 text-[14px] font-mono text-[#1B2A4A] focus:border-[#A64011] focus:outline-none"
                    />
                    {matchedSubject ? (
                      <div
                        data-testid="manual-subject-banner"
                        className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] px-3 py-2 text-[13px]"
                      >
                        <div>
                          <span className="font-semibold text-[#1B2A4A]">
                            {matchedSubject.displayName}
                          </span>{' '}
                          <span className="text-[#4F5C67]">
                            · {matchedSubject.division} · {matchedSubject.workerCode}
                          </span>
                        </div>
                        {matchedSubject.role === 'owner' && (
                          <span className="rounded bg-[#F4F3EF] px-2 py-0.5 text-[11px] font-medium text-[#4F5C67]">
                            Owner (Exempt)
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[12px] text-[#4F5C67]">
                        Select a worker on the right or enter a matching Worker ID to verify the
                        subject before saving.
                      </p>
                    )}
                  </div>
                </section>

                {/* Right: Search Worker List with Circular Daily-Selfie Slot */}
                <section className="rounded-xl border border-[#D9DEE2] bg-white p-5 lg:col-span-6">
                  <div className="flex items-center justify-between gap-2 border-b border-[#D9DEE2] pb-3">
                    <div>
                      <h2 className="text-[16px] font-semibold text-[#1B2A4A]">Search worker</h2>
                      <p className="text-[12px] text-[#4F5C67]">
                        Select a worker to load their ID. Circular slot shows {selectedDate} selfie
                        once captured.
                      </p>
                    </div>
                    <span className="text-[12px] font-medium text-[#4F5C67] tabular-nums">
                      {filteredWorkers.filter((w) => w.role !== 'owner').length} workers
                    </span>
                  </div>

                  <ul className="mt-3 max-h-[460px] divide-y divide-[#E6E8EB] overflow-y-auto">
                    {filteredWorkers
                      .filter((w) => w.role !== 'owner')
                      .map((worker) => {
                        const selfie = addendum.dailySelfies[`${worker.userId}::${selectedDate}`];
                        const isSelected = matchedSubject?.userId === worker.userId;
                        return (
                          <li key={worker.userId}>
                            <button
                              type="button"
                              onClick={() => setWorkerIdInput(worker.workerCode)}
                              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                                isSelected ? 'bg-[#FFF3EB]/70' : 'hover:bg-[#FAF9F6]'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#D9DEE2] bg-[#F4F3EF]">
                                  {selfie ? (
                                    <img
                                      src={selfie.dataUrl}
                                      alt={`${worker.displayName} daily selfie`}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <User className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-[14px] font-semibold text-[#1B2A4A]">
                                    {worker.displayName}
                                  </div>
                                  <div className="text-[12px] text-[#4F5C67]">
                                    <span className="font-mono">{worker.workerCode}</span> ·{' '}
                                    {worker.division}
                                  </div>
                                </div>
                              </div>
                              <span className="shrink-0 text-[11px] font-medium text-[#4F5C67]">
                                {selfie ? 'Selfie recorded' : 'No selfie yet'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </section>
              </div>
            ) : (
              /* VIEW 2: ATTENDANCE ROSTER */
              <section
                data-testid="attendance-roster-view"
                className="overflow-x-auto rounded-xl border border-[#D9DEE2] bg-white"
              >
                <table className="w-full min-w-[960px] border-collapse text-left">
                  <thead className="border-b border-[#D9DEE2] bg-[#FAF9F6] text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Selfie ({selectedDate})
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Worker
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Status ({selectedDate})
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Attendance <span aria-hidden="true">%</span>
                        <span className="sr-only">percentage</span>
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Approved leave
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Absent
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Leave evidence &amp; actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E8EB] text-[13px]">
                    {rosterRows.map((row) => (
                      <tr
                        key={row.member.userId}
                        data-testid={`roster-row-${row.member.userId}`}
                        className="hover:bg-[#FAF9F6]"
                      >
                        {/* Circular daily selfie */}
                        <td className="px-4 py-3 align-middle">
                          {row.isOwner ? (
                            <span className="text-[#4F5C67]">—</span>
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#D9DEE2] bg-[#F4F3EF]">
                              {row.dailySelfie ? (
                                <img
                                  src={row.dailySelfie.dataUrl}
                                  alt={`${row.member.displayName} selfie`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <User className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                              )}
                            </div>
                          )}
                        </td>

                        {/* Name + Worker ID */}
                        <td className="px-4 py-3 align-middle">
                          <div className="font-semibold text-[#1B2A4A]">
                            {row.member.displayName}
                          </div>
                          <div className="text-[12px] text-[#4F5C67]">
                            <span className="font-mono">{row.member.workerCode}</span> ·{' '}
                            {row.member.division}
                            {row.isOwner ? ' · Owner (Exempt)' : ''}
                          </div>
                        </td>

                        {/* Effective Status */}
                        <td className="px-4 py-3 align-middle">
                          {row.isOwner ? (
                            <span className="text-[#4F5C67]">—</span>
                          ) : row.dayDerived ? (
                            <div className="space-y-1">
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-[12px] font-semibold ${statusBadgeStyle(
                                  row.dayDerived.attendanceStatus
                                )}`}
                              >
                                {formatAttendanceStatusLabel(row.dayDerived.attendanceStatus)}
                              </span>
                              {row.dayIzin && (
                                <div className="text-[11px] text-[#4F5C67]">
                                  {formatIzinRequestStatusLabel(row.dayIzin.status)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#4F5C67]">Not scheduled</span>
                          )}
                        </td>

                        {/* Attendance % */}
                        <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums">
                          {row.attendancePct}
                        </td>

                        {/* Approved Izin */}
                        <td className="px-4 py-3 text-right align-middle tabular-nums">
                          {row.approvedIzinCount}
                        </td>

                        {/* Alfa */}
                        <td className="px-4 py-3 text-right align-middle tabular-nums">
                          {row.alfaCount}
                        </td>

                        {/* Evidence & Inline Foreman / Correction Actions */}
                        <td className="px-4 py-3 align-middle">
                          {row.isOwner ? (
                            <span className="text-[#4F5C67]">—</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {row.dayIzin && row.dayIzin.evidencePhotoIds.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEvidenceViewerId(row.dayIzin!.evidencePhotoIds[0])
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-[#D9DEE2] bg-white px-2 py-1 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                                >
                                  <FileText className="h-3.5 w-3.5 text-[#A64011]" aria-hidden="true" />
                                  Private evidence
                                </button>
                              )}

                              {row.canForemanReview && row.dayIzin && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    data-testid={`roster-approve-izin-${row.dayIzin.id}`}
                                    onClick={() => {
                                      const res = addendum.decideDemoIzin({
                                        izinId: row.dayIzin!.id,
                                        decision: 'approve',
                                      });
                                      setActionBanner({
                                        kind: res.ok ? 'ok' : 'err',
                                        text: res.message,
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-emerald-800"
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                    Approve
                                  </button>
                                  <input
                                    type="text"
                                    value={rejectDrafts[row.dayIzin.id] ?? ''}
                                    onChange={(e) =>
                                      setRejectDrafts((p) => ({
                                        ...p,
                                        [row.dayIzin!.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Rejection reason…"
                                    aria-label="Leave rejection reason"
                                    className="w-36 rounded border border-[#D9DEE2] px-2 py-1 text-[12px]"
                                  />
                                  <button
                                    type="button"
                                    data-testid={`roster-reject-izin-${row.dayIzin.id}`}
                                    onClick={() => {
                                      const res = addendum.decideDemoIzin({
                                        izinId: row.dayIzin!.id,
                                        decision: 'reject',
                                        rejectionReason: rejectDrafts[row.dayIzin!.id] ?? '',
                                      });
                                      setActionBanner({
                                        kind: res.ok ? 'ok' : 'err',
                                        text: res.message,
                                      });
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-red-300 bg-[#FEF2F2] px-2.5 py-1 text-[12px] font-semibold text-red-800 hover:bg-red-100"
                                  >
                                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                    Reject
                                  </button>
                                </div>
                              )}

                              {row.dayShift && !row.dayIzin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIzinModalShiftId(row.dayShift!.id);
                                    setUploadError(null);
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-[#D9DEE2] bg-white px-2 py-1 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                                >
                                  <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Request leave
                                </button>
                              )}

                              {row.canCorrect && row.dayShift && (
                                <button
                                  type="button"
                                  data-testid={`roster-correct-btn-${row.member.userId}`}
                                  onClick={() =>
                                    setCorrectionTarget({
                                      obligationId: row.dayShift!.id,
                                      workerName: row.member.displayName,
                                      workDate: row.dayShift!.workDate,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-[#D9DEE2] bg-[#FAF9F6] px-2 py-1 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                                >
                                  <Wrench className="h-3 w-3" aria-hidden="true" />
                                  Correct
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Append-Only Attendance History */}
            <section className="rounded-xl border border-[#D9DEE2] bg-white p-5 space-y-3">
              <h2 className="text-[15px] font-semibold text-[#1B2A4A]">
                Append-Only Attendance History
              </h2>
              <ul className="divide-y divide-[#E6E8EB]">
                {addendum.history.slice(0, 8).map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]"
                  >
                    <div>
                      <p className="font-medium text-[#1B2A4A]">{entry.summary}</p>
                      <p className="text-[12px] text-[#4F5C67]">
                        Work date: {entry.workDate} · Actor: {entry.actorName}
                      </p>
                    </div>
                    <span className="text-[12px] text-[#4F5C67] tabular-nums">
                      {formatInstantInProjectZone(
                        Date.parse(entry.occurredAt),
                        state.project.timezone
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </main>
      </div>

      {/* Submit Leave Request Modal (PDF + Image support) */}
      {izinModalShiftId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Submit leave request with supporting document"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#111B2E]/60 p-4"
        >
          <form
            onSubmit={handleSubmitIzinModal}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[#D9DEE2] bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#1B2A4A]">
                Submit leave request (PDF or photo)
              </h2>
              <button
                type="button"
                onClick={() => setIzinModalShiftId(null)}
                aria-label="Close leave request modal"
                className="rounded p-1 text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div>
              <label htmlFor="modal-izin-reason" className="block text-[12px] font-semibold">
                Reason *
              </label>
              <textarea
                id="modal-izin-reason"
                rows={3}
                value={izinReason}
                onChange={(e) => setIzinReason(e.target.value)}
                required
                placeholder="State reason for leave request…"
                className="mt-1 w-full rounded-lg border border-[#D9DEE2] px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label htmlFor="modal-izin-file" className="block text-[12px] font-semibold">
                Private supporting evidence (PDF, JPEG, PNG, WebP) *
              </label>
              <input
                id="modal-izin-file"
                data-testid="izin-file-input"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={handleEvidenceFileSelect}
                className="mt-1 block w-full text-[12px] text-[#4F5C67]"
              />
              {uploadError && (
                <p role="alert" className="mt-1 text-[12px] text-red-700">
                  {uploadError}
                </p>
              )}
              {uploadedEvidenceId && (
                <p className="mt-1 text-[12px] font-medium text-emerald-700">
                  Private document attached ({addendum.evidencePhotos[uploadedEvidenceId]?.fileName})
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIzinModalShiftId(null)}
                className="rounded-lg border border-[#D9DEE2] px-3.5 py-2 text-[13px] font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#1B2A4A] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1B2A4A]/90"
              >
                Submit leave request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Manual Correction Modal (preserves original work date) */}
      {correctionTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Manual attendance correction"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#111B2E]/60 p-4"
        >
          <form
            onSubmit={handleSaveCorrection}
            className="w-full max-w-md space-y-4 rounded-2xl border border-[#D9DEE2] bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#1B2A4A]">
                Correct attendance ({correctionTarget.workDate})
              </h2>
              <button
                type="button"
                onClick={() => setCorrectionTarget(null)}
                aria-label="Close correction modal"
                className="rounded p-1 text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-[12px] text-[#4F5C67]">
              Subject: <strong>{correctionTarget.workerName}</strong> · Original work date{' '}
              <strong>{correctionTarget.workDate}</strong> is strictly preserved in the audit log.
            </p>
            <div>
              <label htmlFor="corr-status" className="block text-[12px] font-semibold">
                Corrected status
              </label>
              <select
                id="corr-status"
                value={correctionStatus}
                onChange={(e) => setCorrectionStatus(e.target.value as 'present' | 'alfa')}
                className="mt-1 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px]"
              >
                <option value="present">Present (with validated daily evidence)</option>
                <option value="alfa">Absent (justified correction)</option>
              </select>
            </div>
            <div>
              <label htmlFor="corr-evidence" className="block text-[12px] font-semibold">
                Validated evidence reference *
              </label>
              <input
                id="corr-evidence"
                type="text"
                required
                value={correctionEvidence}
                onChange={(e) => setCorrectionEvidence(e.target.value)}
                placeholder="e.g. Gate log #42 & verified site photo"
                className="mt-1 w-full rounded-lg border border-[#D9DEE2] px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label htmlFor="corr-reason" className="block text-[12px] font-semibold">
                Reason *
              </label>
              <textarea
                id="corr-reason"
                rows={2}
                required
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Explain why the manual correction is authorized…"
                className="mt-1 w-full rounded-lg border border-[#D9DEE2] px-3 py-2 text-[13px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectionTarget(null)}
                className="rounded-lg border border-[#D9DEE2] px-3.5 py-2 text-[13px] font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#A64011] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#8C350E]"
              >
                Save correction
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Private Evidence Preview Modal */}
      {viewedEvidence && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Private leave evidence"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#111B2E]/70 p-4"
        >
          <div className="w-full max-w-lg space-y-3 rounded-2xl border border-[#D9DEE2] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-[#1B2A4A]">
                  {viewedEvidence.fileName}
                </h3>
                <p className="text-[11px] text-[#4F5C67]">
                  Private leave evidence · Restricted to worker and assigned Foreman
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceViewerId(null)}
                aria-label="Close evidence viewer"
                className="rounded p-1 text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {viewedEvidence.mimeType === 'application/pdf' ? (
              <div className="rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] p-6 text-center text-[13px]">
                <FileText className="mx-auto h-8 w-8 text-[#A64011]" aria-hidden="true" />
                <p className="mt-2 font-semibold text-[#1B2A4A]">PDF Document Attached</p>
                <a
                  href={viewedEvidence.previewDataUrl}
                  download={viewedEvidence.fileName}
                  className="mt-3 inline-flex rounded-lg bg-[#1B2A4A] px-3.5 py-1.5 text-[12px] font-semibold text-white"
                >
                  Download PDF ({Math.round(viewedEvidence.sizeBytes / 1024)} KB)
                </a>
              </div>
            ) : (
              <img
                src={viewedEvidence.previewDataUrl}
                alt={viewedEvidence.fileName}
                className="max-h-[380px] w-full rounded-lg border border-[#D9DEE2] object-contain"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const PrivateAttendancePage: React.FC = () => {
  const { project: projectId = '' } = useParams<{ project: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view') === 'roster' ? 'roster' : 'manual';
  const { projects, activeProject } = usePrivateProjects();
  const { session } = useAuth();
  const project = projects.find((p) => p.id === projectId) ?? activeProject;
  const routes = getProjectRoutes('/projects', projectId);
  const railGroups = useMemo(
    () =>
      buildAttendanceRailGroups(viewParam, (nextView) =>
        setSearchParams(nextView === 'roster' ? { view: 'roster' } : {}, { replace: true })
      ),
    [viewParam, setSearchParams]
  );

  return (
    <div className="min-h-dvh bg-[#F4F3EF] flex flex-col text-[#1B2A4A]">
      <PrivateNavbar
        inProjectContext
        projectId={projectId}
        projectName={project?.name}
        hasContextualRail
      />
      <div className="flex flex-1 min-h-[calc(100dvh-60px)]">
        <ContextualRail
          moduleLabel="Attendance"
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
        />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1360px] space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="vonta-page-title text-[#1B2A4A]">
                  Attendance management
                </h1>
                <p className="mt-1 text-[14px] text-[#4F5C67]">
                  Schedule timezone: <strong>{project?.timezone ?? 'Asia/Makassar'}</strong>. Absent
                  is recorded automatically 60 minutes after shift start; Approved leave supports
                  private PDF and photo evidence reviewed by an assigned Foreman.
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-[#D9DEE2] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setSearchParams({ view: 'manual' })}
                  className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold ${
                    viewParam === 'manual' ? 'bg-[#1B2A4A] text-white' : 'text-[#4F5C67]'
                  }`}
                >
                  Manual attendance
                </button>
                <button
                  type="button"
                  onClick={() => setSearchParams({ view: 'roster' })}
                  className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold ${
                    viewParam === 'roster' ? 'bg-[#1B2A4A] text-white' : 'text-[#4F5C67]'
                  }`}
                >
                  Attendance roster
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#D9DEE2] bg-white p-5 space-y-2 text-[14px] text-[#4F5C67]">
              <p className="font-semibold text-[#1B2A4A]">
                Live Attendance API ({session ? 'Authenticated' : 'Sign-in required'})
              </p>
              <p>
                No scheduled shifts have been published for today in this live project yet. Backend
                endpoints <code>/api/projects/{projectId}/attendance</code>,{' '}
                <code>/api/projects/{projectId}/attendance/izin</code>, and{' '}
                <code>/api/projects/{projectId}/attendance/mandor-queue</code> enforce the 1-hour
                cutoff and private evidence permissions.
              </p>
              <Link
                to={routes.overviewPath}
                className="inline-flex text-[14px] font-semibold text-[#A64011] hover:underline"
              >
                Back to Project Overview
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
