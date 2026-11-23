import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  FileUp,
  Layers,
  Plus,
  RefreshCw,
  Ruler,
  Trash2,
} from 'lucide-react';
import { ApiClientError, privateApi } from '../data/privateApi';
import {
  formatJobStatusLabel,
  type AuthorizedProject,
  type BlueprintAssetRecord,
  type BlueprintCalibration,
  type BlueprintGeometryProposal,
  type CalibrationUnit,
  type ModelVersionRecord,
  type PinAnchorImpact,
  type PinRemapDecision,
  type ProcessingJobRecord,
} from '../domain/accountTypes';
import {
  computeCalibratedScaleMmPerPx,
  createBlankCalibratedFootprintProposal,
  unitValueToMm,
  validateBlueprintUploadFile,
  validateCalibration,
} from '../domain/blueprintGeometry';
import { SpatialViewport3D } from './SpatialViewport3D';

interface BlueprintReviewStudioProps {
  accessToken: string;
  project: AuthorizedProject;
  mode: 'initial' | 'add-area' | 'replace';
  /** Existing job to resume (survives refresh) */
  initialJob?: ProcessingJobRecord | null;
  /** Target area & model version when mode === 'replace' */
  targetAreaId?: string;
  targetAreaName?: string;
  replacesModelVersion?: ModelVersionRecord | null;
  currentBlueprintAsset?: BlueprintAssetRecord | null;
  onProjectUpdated: (project: AuthorizedProject) => void;
  onPublished: (result: { modelVersion: ModelVersionRecord; project: AuthorizedProject }) => void;
  onCancel?: () => void;
}

function readFileAsBase64AndDimensions(file: File): Promise<{
  base64Data: string;
  previewUrl: string | null;
  widthPx: number;
  heightPx: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64Data = result.includes(',') ? result.split(',')[1] : result;
      if (file.type === 'application/pdf') {
        resolve({ base64Data, previewUrl: null, widthPx: 1600, heightPx: 1130 });
        return;
      }
      const img = new Image();
      img.onload = () => {
        resolve({
          base64Data,
          previewUrl: result,
          widthPx: img.naturalWidth || 1600,
          heightPx: img.naturalHeight || 1130,
        });
      };
      img.onerror = () => {
        resolve({ base64Data, previewUrl: result, widthPx: 1600, heightPx: 1130 });
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export function BlueprintReviewStudio({
  accessToken,
  project,
  mode,
  initialJob = null,
  targetAreaId,
  targetAreaName,
  replacesModelVersion = null,
  currentBlueprintAsset = null,
  onProjectUpdated,
  onPublished,
  onCancel,
}: BlueprintReviewStudioProps) {
  // Form & upload state
  const [areaName, setAreaName] = useState(
    targetAreaName || (mode === 'add-area' ? `Level ${(project.areas?.length ?? 1) + 1}` : 'Ground Floor')
  );
  const [isRegisteredInCommonFrame, setIsRegisteredInCommonFrame] = useState(mode === 'initial');
  const [sheetCode, setSheetCode] = useState(
    replacesModelVersion?.sheetCode || (mode === 'add-area' ? `A-0${(project.areas?.length ?? 1) + 1}` : 'A-01')
  );
  const [revision, setRevision] = useState(
    mode === 'replace' && replacesModelVersion
      ? `R0${Number(replacesModelVersion.revision.replace(/\D/g, '') || '0') + 1}`
      : 'R00'
  );
  const [planPage, setPlanPage] = useState(1);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [imageWidthPx, setImageWidthPx] = useState(1600);
  const [imageHeightPx, setImageHeightPx] = useState(1130);
  const [fileError, setFileError] = useState<string | null>(null);

  // Interactive scale calibration points (0..1 normalized)
  const [pointA, setPointA] = useState({ x: 0.14, y: 0.22 });
  const [pointB, setPointB] = useState({ x: 0.84, y: 0.22 });
  const [placingPoint, setPlacingPoint] = useState<'A' | 'B'>('A');
  const [knownLengthInput, setKnownLengthInput] = useState('');
  const [unit, setUnit] = useState<CalibrationUnit>('mm');
  const [wallHeightMm, setWallHeightMm] = useState(3200);
  const [exteriorWallMm, setExteriorWallMm] = useState(150);
  const [interiorWallMm, setInteriorWallMm] = useState(100);

  // Submission & job state
  const submissionKeyRef = useRef(`sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ProcessingJobRecord | null>(initialJob);
  const [retrying, setRetrying] = useState(false);

  // Private preview URL for resumed job asset
  const [resumedPreviewUrl, setResumedPreviewUrl] = useState<string | null>(null);

  // Manual geometry / correction editor state
  const [editingProposal, setEditingProposal] = useState<BlueprintGeometryProposal | null>(
    initialJob?.proposal ?? null
  );
  const [manualWidthMm, setManualWidthMm] = useState(9600);
  const [manualDepthMm, setManualDepthMm] = useState(6400);
  const [manualRoomName, setManualRoomName] = useState('Main Hall');
  const [savingProposal, setSavingProposal] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Verification & Publish + Replacement Pin Remap state
  const [verifiedChecked, setVerifiedChecked] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [affectedPins, setAffectedPins] = useState<PinAnchorImpact[]>([]);
  const [pinDecisions, setPinDecisions] = useState<Record<string, PinRemapDecision>>({});

  useEffect(() => {
    if (initialJob && !activeJob) {
      setActiveJob(initialJob);
      setEditingProposal(initialJob.proposal ?? null);
    }
  }, [initialJob]);

  // Fetch authenticated private preview for resumed job
  const activeAsset = useMemo(() => {
    if (!activeJob) return null;
    return project.assets?.find((a) => a.id === activeJob.blueprintAssetId) ?? null;
  }, [activeJob, project.assets]);

  useEffect(() => {
    if (!activeAsset || localPreviewUrl || activeAsset.mimeType === 'application/pdf') return;
    let revokedUrl: string | null = null;
    let active = true;
    void privateApi
      .fetchPrivateAssetBlobUrl(accessToken, activeAsset.privateFileUrl)
      .then((url) => {
        if (!active) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        revokedUrl = url;
        setResumedPreviewUrl(url);
      });
    return () => {
      active = false;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [accessToken, activeAsset?.id, localPreviewUrl]);

  const knownLengthMm = useMemo(
    () => unitValueToMm(Number(knownLengthInput), unit),
    [knownLengthInput, unit]
  );

  const scaleResult = useMemo(
    () =>
      computeCalibratedScaleMmPerPx({
        pointA,
        pointB,
        imageWidthPx,
        imageHeightPx,
        knownLengthMm,
      }),
    [pointA, pointB, imageWidthPx, imageHeightPx, knownLengthMm]
  );

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setSubmitError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateBlueprintUploadFile({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!check.valid) {
      setFileError(check.message ?? 'Unsupported file format.');
      setSelectedFile(null);
      setFileBase64('');
      setLocalPreviewUrl(null);
      return;
    }

    try {
      const read = await readFileAsBase64AndDimensions(file);
      setSelectedFile(file);
      setFileBase64(read.base64Data);
      setLocalPreviewUrl(read.previewUrl);
      setImageWidthPx(read.widthPx);
      setImageHeightPx(read.heightPx);
      submissionKeyRef.current = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to read blueprint file.');
    }
  };

  const handleCanvasCalibrationClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
    const y = Math.min(0.98, Math.max(0.02, (e.clientY - rect.top) / rect.height));
    if (placingPoint === 'A') {
      setPointA({ x, y });
      setPlacingPoint('B');
    } else {
      setPointB({ x, y });
      setPlacingPoint('A');
    }
  };

  const handleUploadAndProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedFile || !fileBase64) {
      setFileError('Select a single-floor PDF, PNG, or JPG blueprint file first.');
      return;
    }

    const calibration: BlueprintCalibration = {
      unit,
      pointA,
      pointB,
      knownLengthMm,
      imageWidthPx,
      imageHeightPx,
      mmPerPixel: scaleResult.ok ? scaleResult.mmPerPixel : 0,
      wallHeightMm,
      exteriorWallMm,
      interiorWallMm,
    };

    const calErrors = validateCalibration(calibration);
    if (calErrors.length > 0) {
      setSubmitError(calErrors[0]);
      return;
    }

    setUploading(true);
    setUploadPercent(10);
    try {
      const res = await privateApi.uploadBlueprintWithProgress(
        accessToken,
        project.id,
        {
          areaId: targetAreaId,
          areaName: targetAreaName || areaName.trim(),
          isRegisteredInCommonFrame,
          sheetCode: sheetCode.trim(),
          revision: revision.trim(),
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          base64Data: fileBase64,
          planPage,
          planRegion: { x: 0, y: 0, width: 1, height: 1 },
          calibration,
          submissionKey: submissionKeyRef.current,
          mode: mode === 'replace' ? 'replacement' : 'initial',
          replacesModelVersionId: replacesModelVersion?.id ?? null,
        },
        (pct) => setUploadPercent(pct)
      );
      setActiveJob(res.job);
      setEditingProposal(res.job.proposal ?? null);
      onProjectUpdated(res.project);
    } catch (err) {
      setSubmitError(
        err instanceof ApiClientError ? err.message : 'Blueprint upload failed. Try again.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleRetryAi = async () => {
    if (!activeJob) return;
    setRetrying(true);
    setSubmitError(null);
    try {
      const res = await privateApi.retryProcessingJob(accessToken, project.id, activeJob.id);
      setActiveJob(res.job);
      setEditingProposal(res.job.proposal ?? null);
      onProjectUpdated(res.project);
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : 'Retry failed.');
    } finally {
      setRetrying(false);
    }
  };

  const handleStartManualDraft = async () => {
    if (!activeJob || !activeAsset) return;
    const starter = createBlankCalibratedFootprintProposal(
      activeAsset.calibration,
      manualWidthMm,
      manualDepthMm,
      manualRoomName.trim() || 'Main Space'
    );
    setEditingProposal(starter);
    await handleSaveProposal(starter);
  };

  const handleSaveProposal = async (proposalToSave?: BlueprintGeometryProposal) => {
    const targetProposal = proposalToSave ?? editingProposal;
    if (!activeJob || !targetProposal) return;
    setSavingProposal(true);
    setProposalError(null);
    try {
      const res = await privateApi.updateJobProposal(accessToken, project.id, activeJob.id, {
        proposal: targetProposal,
      });
      setActiveJob(res.job);
      setEditingProposal(res.job.proposal ?? targetProposal);
      setAffectedPins([]);
      onProjectUpdated(res.project);
    } catch (err) {
      setProposalError(
        err instanceof ApiClientError ? err.message : 'Could not validate geometry proposal.'
      );
    } finally {
      setSavingProposal(false);
    }
  };

  const handleAddPartitionWall = () => {
    if (!editingProposal || !activeAsset) return;
    const idx = editingProposal.walls.length + 1;
    const midX = Math.round(manualWidthMm / 2);
    setEditingProposal({
      ...editingProposal,
      walls: [
        ...editingProposal.walls,
        {
          id: `W-INT-${idx}`,
          label: `Interior Partition ${idx}`,
          category: 'interior_partition',
          startXMm: midX,
          startZMm: 0,
          endXMm: midX,
          endZMm: manualDepthMm,
          thicknessMm: activeAsset.calibration.interiorWallMm,
          heightMm: activeAsset.calibration.wallHeightMm,
        },
      ],
    });
  };

  const handlePublish = async () => {
    if (!activeJob || !verifiedChecked) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const decisionsList = Object.values(pinDecisions);
      const res = await privateApi.verifyAndPublishJob(accessToken, project.id, activeJob.id, {
        verificationNotes: verificationNotes.trim() || undefined,
        pinRemapDecisions: decisionsList.length > 0 ? decisionsList : undefined,
      });
      setActiveJob(res.job);
      setAffectedPins([]);
      onProjectUpdated(res.project);
      onPublished({ modelVersion: res.modelVersion, project: res.project });
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        err.code === 'PIN_REMAP_REQUIRED' &&
        Array.isArray(err.details?.affectedPins)
      ) {
        const list = err.details.affectedPins as PinAnchorImpact[];
        setAffectedPins(list);
        // Pre-populate default revalidate choices so user can consciously confirm or switch to remap
        const initialDecisions: Record<string, PinRemapDecision> = {};
        const firstWall = activeJob.builtModel?.elements.find((e) => e.category !== 'floor_slab');
        for (const imp of list) {
          initialDecisions[imp.pinId] = {
            pinId: imp.pinId,
            action: 'remap',
            targetElementId: firstWall?.id,
            targetElementName: firstWall?.name,
          };
        }
        setPinDecisions(initialDecisions);
        setPublishError(err.message);
      } else {
        setPublishError(
          err instanceof ApiClientError ? err.message : 'Model verification and publication failed.'
        );
      }
    } finally {
      setPublishing(false);
    }
  };

  const previewImgSrc = localPreviewUrl || resumedPreviewUrl;

  return (
    <div className="space-y-6" data-testid="blueprint-review-studio">
      {/* Replacement Comparison Context Banner */}
      {mode === 'replace' && replacesModelVersion && (
        <div className="rounded-xl border border-[#D4652F]/40 bg-[#FFF8F4] p-4 text-[14px]">
          <div className="font-semibold text-[#1B2A4A]">
            Replacing blueprint for {targetAreaName || activeAsset?.areaName}
          </div>
          <p className="mt-1 text-[13px] leading-[19px] text-[#4F5C67]">
            Current published model: <strong>v{replacesModelVersion.versionNumber}</strong> (
            {replacesModelVersion.sheetCode} {replacesModelVersion.revision}). It remains active and
            usable until you explicitly verify and publish the replacement revision. Existing Pins
            and Before/After evidence will never be silently moved or deleted.
          </p>
          {currentBlueprintAsset && (
            <div className="mt-2 text-[12px] text-[#4F5C67]">
              Current source file: <span className="font-mono">{currentBlueprintAsset.fileName}</span>{' '}
              · Wall height {currentBlueprintAsset.calibration.wallHeightMm} mm
            </div>
          )}
        </div>
      )}

      {/* STAGE A: Upload + Scale Calibration (when no durable job yet) */}
      {!activeJob ? (
        <form onSubmit={handleUploadAndProcess} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="bp-area-name" className="block text-[14px] font-medium text-[#1B2A4A]">
                Area name <span className="text-[#B42318]">*</span>
              </label>
              <input
                id="bp-area-name"
                type="text"
                disabled={mode === 'replace'}
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A] disabled:bg-[#F4F3EF]"
              />
            </div>

            <div>
              <label htmlFor="bp-sheet-code" className="block text-[14px] font-medium text-[#1B2A4A]">
                Sheet code <span className="text-[#B42318]">*</span>
              </label>
              <input
                id="bp-sheet-code"
                type="text"
                value={sheetCode}
                onChange={(e) => setSheetCode(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
              />
            </div>

            <div>
              <label htmlFor="bp-revision" className="block text-[14px] font-medium text-[#1B2A4A]">
                Revision <span className="text-[#B42318]">*</span>
              </label>
              <input
                id="bp-revision"
                type="text"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
              />
            </div>
          </div>

          {mode === 'add-area' && (
            <label className="flex items-start gap-2.5 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 p-3 text-[13px] text-[#1B2A4A]">
              <input
                type="checkbox"
                checked={isRegisteredInCommonFrame}
                onChange={(e) => setIsRegisteredInCommonFrame(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#D9DEE2]"
              />
              <span>
                This area shares a verified common coordinate frame with existing areas. (Leave
                unchecked unless datum alignment is verified; “All areas” will show separate area
                previews instead of fabricating a combined scene.)
              </span>
            </label>
          )}

          {/* File dropzone */}
          <div className="rounded-xl border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-[#A64011]" aria-hidden="true" />
                <div>
                  <div className="text-[14px] font-semibold text-[#1B2A4A]">
                    Single-floor dimensioned blueprint (PDF, PNG, or JPG)
                  </div>
                  <p className="text-[13px] text-[#4F5C67]">
                    {selectedFile
                      ? `${selectedFile.name} (${Math.max(1, Math.round(selectedFile.size / 1024))} KB)`
                      : 'Stored privately for authorized project members only (max 12 MB).'}
                  </p>
                </div>
              </div>
              <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-[#D9DEE2] bg-white px-4 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]">
                Choose blueprint file
                <input
                  type="file"
                  data-testid="blueprint-file-input"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  className="sr-only"
                  onChange={handleFileSelected}
                />
              </label>
            </div>

            {selectedFile?.type === 'application/pdf' && (
              <div className="mt-3 flex items-center gap-3 border-t border-[#D9DEE2] pt-3">
                <label htmlFor="bp-plan-page" className="text-[13px] font-medium text-[#1B2A4A]">
                  PDF plan page number
                </label>
                <input
                  id="bp-plan-page"
                  type="number"
                  min={1}
                  value={planPage}
                  onChange={(e) => setPlanPage(Math.max(1, Number(e.target.value) || 1))}
                  className="h-9 w-24 rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[14px] text-[#1B2A4A]"
                />
              </div>
            )}

            {fileError && (
              <div
                role="alert"
                className="mt-3 flex items-center gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] px-3 py-2 text-[13px] font-medium text-[#B42318]"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{fileError}</span>
              </div>
            )}
          </div>

          {/* Interactive 2D Calibration Canvas & Dimension Controls */}
          <div className="rounded-xl border border-[#D9DEE2] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
                <h3 className="text-[16px] font-semibold text-[#1B2A4A]">
                  Scale calibration &amp; wall elevation
                </h3>
              </div>
              <span className="text-[13px] text-[#4F5C67]">
                Click drawing to place Point {placingPoint}
              </span>
            </div>

            {previewImgSrc && (
              <div
                onClick={handleCanvasCalibrationClick}
                className="relative mt-3 cursor-crosshair overflow-hidden rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]"
              >
                <img
                  src={previewImgSrc}
                  alt="Uploaded blueprint calibration preview"
                  className="block max-h-[340px] w-full object-contain select-none"
                />
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <line
                    x1={pointA.x * 100}
                    y1={pointA.y * 100}
                    x2={pointB.x * 100}
                    y2={pointB.y * 100}
                    stroke="#A64011"
                    strokeWidth="0.7"
                    strokeDasharray="2 1"
                  />
                  <circle cx={pointA.x * 100} cy={pointA.y * 100} r="1.8" fill="#1B2A4A" />
                  <circle cx={pointB.x * 100} cy={pointB.y * 100} r="1.8" fill="#A64011" />
                </svg>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <label
                  htmlFor="bp-known-length"
                  className="block text-[13px] font-medium text-[#1B2A4A]"
                >
                  Known distance (A → B) <span className="text-[#B42318]">*</span>
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="bp-known-length"
                    data-testid="calibration-length-input"
                    type="number"
                    min={1}
                    step="any"
                    value={knownLengthInput}
                    onChange={(e) => setKnownLengthInput(e.target.value)}
                    placeholder={unit === 'm' ? 'e.g. 9.6' : unit === 'cm' ? 'e.g. 960' : 'e.g. 9600'}
                    className="h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A]"
                  />
                  <select
                    aria-label="Calibration unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as CalibrationUnit)}
                    className="h-11 rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[14px] font-medium text-[#1B2A4A]"
                  >
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                  </select>
                </div>
                <p className="mt-1 text-[12px] text-[#4F5C67] tabular-nums">
                  {scaleResult.ok
                    ? `Calibrated: ${knownLengthMm.toLocaleString('en-US')} mm (${scaleResult.mmPerPixel.toFixed(2)} mm/px)`
                    : 'Required before processing'}
                </p>
              </div>

              <div>
                <label
                  htmlFor="bp-wall-height"
                  className="block text-[13px] font-medium text-[#1B2A4A]"
                >
                  Wall height (mm)
                </label>
                <input
                  id="bp-wall-height"
                  type="number"
                  min={1800}
                  max={12000}
                  value={wallHeightMm}
                  onChange={(e) => setWallHeightMm(Number(e.target.value) || 3200)}
                  className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A] tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="bp-ext-thick"
                  className="block text-[13px] font-medium text-[#1B2A4A]"
                >
                  Exterior wall (mm)
                </label>
                <input
                  id="bp-ext-thick"
                  type="number"
                  min={50}
                  max={1000}
                  value={exteriorWallMm}
                  onChange={(e) => setExteriorWallMm(Number(e.target.value) || 150)}
                  className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A] tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="bp-int-thick"
                  className="block text-[13px] font-medium text-[#1B2A4A]"
                >
                  Interior wall (mm)
                </label>
                <input
                  id="bp-int-thick"
                  type="number"
                  min={50}
                  max={600}
                  value={interiorWallMm}
                  onChange={(e) => setInteriorWallMm(Number(e.target.value) || 100)}
                  className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A] tabular-nums"
                />
              </div>
            </div>
          </div>

          {uploading && (
            <div className="rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/60 p-3.5">
              <div className="flex justify-between text-[13px] font-medium text-[#1B2A4A]">
                <span>Uploading blueprint &amp; running server extraction…</span>
                <span className="tabular-nums">{uploadPercent}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#D9DEE2]">
                <div
                  className="h-full bg-[#A64011] transition-[width] duration-150"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#D9DEE2] pt-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={uploading}
              data-testid="upload-process-blueprint-btn"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#A64011] px-5 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-55"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              {uploading ? 'Processing…' : 'Upload & generate 3D proposal'}
            </button>
          </div>
        </form>
      ) : (
        /* STAGE B: Durable Processing Status + 2D/3D Review & Publication */
        <div className="space-y-5">
          {/* Durable Job Status Banner */}
          <div
            data-testid="processing-job-status-banner"
            className={`rounded-xl border p-4 ${
              activeJob.status === 'failed'
                ? 'border-[#B42318]/40 bg-[#FEF3F2]'
                : activeJob.status === 'published'
                  ? 'border-[#166534]/35 bg-[#DCFCE7]/50'
                  : 'border-[#D9DEE2] bg-white'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold text-[#1B2A4A]">
                    Processing job: {formatJobStatusLabel(activeJob.status)}
                  </span>
                  <span className="rounded bg-[#F4F3EF] px-2 py-0.5 font-mono text-[12px] text-[#4F5C67]">
                    Attempt #{activeJob.attemptCount}
                  </span>
                </div>
                <div className="mt-0.5 text-[13px] text-[#4F5C67]">
                  Source:{' '}
                  <strong className="text-[#1B2A4A]">
                    {activeAsset
                      ? `${activeAsset.areaName} · ${activeAsset.sheetCode} ${activeAsset.revision} (${activeAsset.fileName})`
                      : activeJob.blueprintAssetId}
                  </strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeJob.status !== 'published' && (
                  <button
                    type="button"
                    disabled={retrying}
                    onClick={() => void handleRetryAi()}
                    data-testid="retry-ai-job-btn"
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3.5 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {retrying ? 'Retrying…' : 'Retry AI extraction'}
                  </button>
                )}
              </div>
            </div>

            {activeJob.status === 'failed' && activeJob.errorMessage && (
              <div className="mt-3 flex items-start gap-2 text-[13px] leading-[19px] text-[#B42318]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <span className="font-semibold">{activeJob.errorCode || 'PROCESSING_FAILED'}:</span>{' '}
                  {activeJob.errorMessage}
                </div>
              </div>
            )}
          </div>

          {/* Explicit Contractor Manual Calibrated Drafting when AI failed/unavailable */}
          {!editingProposal && activeJob.status === 'failed' && activeAsset && (
            <div className="rounded-xl border border-[#D9DEE2] bg-white p-5">
              <h3 className="text-[16px] font-semibold text-[#1B2A4A]">
                Draft calibrated walls manually for review
              </h3>
              <p className="mt-1 text-[13px] leading-[19px] text-[#4F5C67]">
                Automated extraction is unavailable right now and your project remains a draft. You
                can retry once the AI provider is ready, or explicitly enter calibrated outer
                dimensions below to build and inspect the deterministic 3D model yourself.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#1B2A4A]">Width (mm)</label>
                  <input
                    type="number"
                    min={1500}
                    value={manualWidthMm}
                    onChange={(e) => setManualWidthMm(Number(e.target.value) || 6000)}
                    className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#1B2A4A]">Depth (mm)</label>
                  <input
                    type="number"
                    min={1500}
                    value={manualDepthMm}
                    onChange={(e) => setManualDepthMm(Number(e.target.value) || 4000)}
                    className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#1B2A4A]">Primary room</label>
                  <input
                    type="text"
                    value={manualRoomName}
                    onChange={(e) => setManualRoomName(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px]"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={savingProposal}
                    onClick={() => void handleStartManualDraft()}
                    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#A64011] px-4 text-[13px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-50"
                  >
                    Build 3D preview
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Side-by-Side 2D Blueprint + Live 3D Deterministic Review */}
          {activeJob.builtModel && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[#D9DEE2] bg-white p-4">
                <div className="mb-2 flex items-center justify-between text-[14px] font-semibold text-[#1B2A4A]">
                  <span>2D Blueprint Source</span>
                  <span className="text-[12px] font-normal text-[#4F5C67]">
                    {activeAsset?.sheetCode} {activeAsset?.revision}
                  </span>
                </div>
                <div className="flex h-[300px] items-center justify-center overflow-hidden rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]">
                  {previewImgSrc ? (
                    <img
                      src={previewImgSrc}
                      alt="Blueprint review source"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="p-4 text-center text-[13px] text-[#4F5C67]">
                      PDF page {activeAsset?.planPage ?? 1} stored privately ({activeAsset?.fileName})
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#D9DEE2] bg-white p-4">
                <div className="mb-2 flex items-center justify-between text-[14px] font-semibold text-[#1B2A4A]">
                  <span className="inline-flex items-center gap-1.5">
                    <Box className="h-4 w-4 text-[#A64011]" aria-hidden="true" />
                    Deterministic 3D Preview
                  </span>
                  <span className="text-[12px] font-normal text-[#4F5C67] tabular-nums">
                    {activeJob.builtModel.footprintWidthMm.toLocaleString('en-US')} ×{' '}
                    {activeJob.builtModel.footprintDepthMm.toLocaleString('en-US')} mm ·{' '}
                    {activeJob.builtModel.wallCount} walls
                  </span>
                </div>
                <div className="h-[300px] overflow-hidden rounded-lg border border-[#D9DEE2]">
                  <SpatialViewport3D
                    model={activeJob.builtModel}
                    pins={[]}
                    selectedPinId={null}
                    selectedElementId={null}
                    activeRoomId={null}
                    layers={{ civil: true, electrical: true, plumbing: true, pins: false }}
                    createMode={false}
                    pendingHit={null}
                    cameraCommand={null}
                    onSelectPin={() => undefined}
                    onSelectElement={() => undefined}
                    onClearSelection={() => undefined}
                    onCreateSurfaceHit={() => undefined}
                    onCreateVoidClick={() => undefined}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Editable Wall & Room Geometry Inspector */}
          {editingProposal && activeJob.status !== 'published' && (
            <div className="rounded-xl border border-[#D9DEE2] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9DEE2] pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#1B2A4A]" aria-hidden="true" />
                  <h3 className="text-[15px] font-semibold text-[#1B2A4A]">
                    Review &amp; correct wall segments ({editingProposal.walls.length})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddPartitionWall}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#A64011]" aria-hidden="true" />
                    Add partition
                  </button>
                  <button
                    type="button"
                    disabled={savingProposal}
                    onClick={() => void handleSaveProposal()}
                    className="inline-flex min-h-[36px] items-center rounded-lg bg-[#1B2A4A] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1B2A4A]/90 disabled:opacity-50"
                  >
                    {savingProposal ? 'Rebuilding…' : 'Apply edits & rebuild 3D'}
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-[#D9DEE2] text-[#4F5C67]">
                    <tr>
                      <th className="py-2 pr-2 font-medium">Wall</th>
                      <th className="py-2 pr-2 font-medium">Start (X, Z mm)</th>
                      <th className="py-2 pr-2 font-medium">End (X, Z mm)</th>
                      <th className="py-2 pr-2 font-medium">Thick / Height (mm)</th>
                      <th className="py-2 text-right font-medium">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D9DEE2]">
                    {editingProposal.walls.map((w, idx) => (
                      <tr key={w.id}>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={w.label}
                            onChange={(e) => {
                              const next = [...editingProposal.walls];
                              next[idx] = { ...w, label: e.target.value };
                              setEditingProposal({ ...editingProposal, walls: next });
                            }}
                            className="h-9 w-36 rounded border border-[#D9DEE2] px-2 text-[13px]"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={w.startXMm}
                              onChange={(e) => {
                                const next = [...editingProposal.walls];
                                next[idx] = { ...w, startXMm: Number(e.target.value) || 0 };
                                setEditingProposal({ ...editingProposal, walls: next });
                              }}
                              className="h-9 w-20 rounded border border-[#D9DEE2] px-2 tabular-nums"
                            />
                            <input
                              type="number"
                              value={w.startZMm}
                              onChange={(e) => {
                                const next = [...editingProposal.walls];
                                next[idx] = { ...w, startZMm: Number(e.target.value) || 0 };
                                setEditingProposal({ ...editingProposal, walls: next });
                              }}
                              className="h-9 w-20 rounded border border-[#D9DEE2] px-2 tabular-nums"
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={w.endXMm}
                              onChange={(e) => {
                                const next = [...editingProposal.walls];
                                next[idx] = { ...w, endXMm: Number(e.target.value) || 0 };
                                setEditingProposal({ ...editingProposal, walls: next });
                              }}
                              className="h-9 w-20 rounded border border-[#D9DEE2] px-2 tabular-nums"
                            />
                            <input
                              type="number"
                              value={w.endZMm}
                              onChange={(e) => {
                                const next = [...editingProposal.walls];
                                next[idx] = { ...w, endZMm: Number(e.target.value) || 0 };
                                setEditingProposal({ ...editingProposal, walls: next });
                              }}
                              className="h-9 w-20 rounded border border-[#D9DEE2] px-2 tabular-nums"
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={w.thicknessMm}
                              onChange={(e) => {
                                const next = [...editingProposal.walls];
                                next[idx] = { ...w, thicknessMm: Number(e.target.value) || 100 };
                                setEditingProposal({ ...editingProposal, walls: next });
                              }}
                              className="h-9 w-16 rounded border border-[#D9DEE2] px-2 tabular-nums"
                            />
                            <input
                              type="number"
                              value={w.heightMm}
                              onChange={(e) => {
                                const next = [...editingProposal.walls];
                                next[idx] = { ...w, heightMm: Number(e.target.value) || 3200 };
                                setEditingProposal({ ...editingProposal, walls: next });
                              }}
                              className="h-9 w-20 rounded border border-[#D9DEE2] px-2 tabular-nums"
                            />
                          </div>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            disabled={editingProposal.walls.length <= 3}
                            onClick={() =>
                              setEditingProposal({
                                ...editingProposal,
                                walls: editingProposal.walls.filter((item) => item.id !== w.id),
                              })
                            }
                            aria-label={`Remove ${w.label}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-35"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {proposalError && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                >
                  {proposalError}
                </div>
              )}
            </div>
          )}

          {/* Replacement Pin Anchor Impact & Explicit Remap / Revalidation */}
          {affectedPins.length > 0 && activeJob.builtModel && (
            <div
              data-testid="pin-remap-impact-panel"
              className="rounded-xl border border-[#B42318]/35 bg-[#FEF3F2]/60 p-5"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#B42318]" aria-hidden="true" />
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1B2A4A]">
                    Explicit Pin remap or revalidation required ({affectedPins.length})
                  </h3>
                  <p className="mt-1 text-[13px] leading-[19px] text-[#4F5C67]">
                    Existing work Pins and their Before/After evidence are never silently moved or
                    deleted. Choose how to anchor each affected Pin on the new revision before
                    publishing.
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-3">
                {affectedPins.map((imp) => {
                  const decision = pinDecisions[imp.pinId] ?? {
                    pinId: imp.pinId,
                    action: 'revalidate' as const,
                  };
                  const wallOptions = activeJob.builtModel!.elements.filter(
                    (el) => el.category !== 'floor_slab'
                  );

                  return (
                    <li
                      key={imp.pinId}
                      className="rounded-lg border border-[#D9DEE2] bg-white p-3.5 text-[13px]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#1B2A4A]">
                          {imp.title} ({imp.pinId})
                        </span>
                        <span className="text-[#4F5C67]">
                          {imp.evidenceCount} evidence file(s) preserved
                        </span>
                      </div>
                      <p className="mt-1 text-[#B42318]">{imp.reason}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <select
                          aria-label={`Action for ${imp.title}`}
                          value={decision.action}
                          onChange={(e) => {
                            const action = e.target.value as 'remap' | 'revalidate';
                            setPinDecisions((prev) => ({
                              ...prev,
                              [imp.pinId]: {
                                ...decision,
                                action,
                                targetElementId:
                                  action === 'remap'
                                    ? decision.targetElementId || wallOptions[0]?.id
                                    : undefined,
                                targetElementName:
                                  action === 'remap'
                                    ? decision.targetElementName || wallOptions[0]?.name
                                    : undefined,
                              },
                            }));
                          }}
                          className="h-9 rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px]"
                        >
                          <option value="remap">Remap to element in new revision</option>
                          <option value="revalidate">Explicitly revalidate existing anchor</option>
                        </select>

                        {decision.action === 'remap' && (
                          <select
                            aria-label={`Target wall for ${imp.title}`}
                            value={decision.targetElementId || wallOptions[0]?.id || ''}
                            onChange={(e) => {
                              const el = wallOptions.find((w) => w.id === e.target.value);
                              setPinDecisions((prev) => ({
                                ...prev,
                                [imp.pinId]: {
                                  ...decision,
                                  action: 'remap',
                                  targetElementId: el?.id,
                                  targetElementName: el?.name,
                                },
                              }));
                            }}
                            className="h-9 rounded-lg border border-[#D9DEE2] bg-white px-2.5 text-[13px]"
                          >
                            {wallOptions.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name} ({w.id})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Contractor Verification & Publication Gate */}
          {activeJob.builtModel && activeJob.status !== 'published' && (
            <div className="rounded-xl border border-[#D9DEE2] bg-white p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#166534]" aria-hidden="true" />
                <h3 className="text-[16px] font-semibold text-[#1B2A4A]">
                  Contractor verification &amp; publication
                </h3>
              </div>

              <div className="mt-3">
                <label
                  htmlFor="verification-notes-input"
                  className="block text-[13px] font-medium text-[#1B2A4A]"
                >
                  Verification note (optional)
                </label>
                <input
                  id="verification-notes-input"
                  type="text"
                  value={verificationNotes}
                  onChange={(e) => setVerificationNotes(e.target.value)}
                  placeholder="e.g. Checked north-south span and door widths against PDF sheet"
                  className="mt-1 h-10 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px]"
                />
              </div>

              <label className="mt-4 flex items-start gap-2.5 text-[14px] text-[#1B2A4A]">
                <input
                  type="checkbox"
                  data-testid="verify-geometry-checkbox"
                  checked={verifiedChecked}
                  onChange={(e) => setVerifiedChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#D9DEE2]"
                />
                <span>
                  I verify that the calibrated dimensions, walls, openings, and room boundaries
                  match the uploaded blueprint source and are ready to publish.
                </span>
              </label>

              {publishError && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                >
                  {publishError}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[#D9DEE2] pt-4">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  disabled={!verifiedChecked || publishing}
                  onClick={() => void handlePublish()}
                  data-testid="verify-publish-model-btn"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#A64011] px-5 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-50"
                >
                  {publishing
                    ? 'Publishing…'
                    : mode === 'replace'
                      ? 'Verify & activate replacement'
                      : 'Verify & publish model'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
