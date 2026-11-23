import type { AuthorizedProject } from './accountTypes';
import type { ProjectDepartment } from './departmentCatalog';
import {
  type BlueprintModelPreviewState,
  type BlueprintSheetRecord,
} from './blueprintRegister';

/**
 * Maps an authenticated live AuthorizedProject's assets/areas/jobs/models into
 * BlueprintSheetRecords strictly from live project data (never injecting demo fixtures).
 */
export function buildLiveBlueprintSheets(
  project: AuthorizedProject,
  departments: ProjectDepartment[],
  blobUrlsByAssetId: Record<string, string>
): BlueprintSheetRecord[] {
  const assets = (project.assets ?? []).filter((a) => a.status !== 'removed');
  const modelVersions = project.modelVersions ?? [];
  const jobs = project.jobs ?? [];
  const defaultCivil = departments.find((d) => d.slug === 'civil') ?? departments[0];

  return assets.map((asset) => {
    const linkedModels = modelVersions.filter((v) => v.blueprintAssetId === asset.id);
    const publishedModel = linkedModels.find((v) => v.status === 'published');
    const supersededModel = linkedModels.find((v) => v.status === 'superseded');
    const latestJob = jobs.find((j) => j.blueprintAssetId === asset.id);

    let modelPreviewState: BlueprintModelPreviewState = 'reference_only';
    let modelPreviewReason: string | null = 'Stored in register — awaiting 3D model build.';
    if (publishedModel) {
      modelPreviewState = 'orbitable';
      modelPreviewReason = `Published model v${publishedModel.versionNumber}`;
    } else if (latestJob?.status === 'failed') {
      modelPreviewState = 'failed';
      modelPreviewReason = latestJob.errorMessage || 'Blueprint extraction failed. Retry or check source calibration.';
    } else if (latestJob?.status === 'queued' || latestJob?.status === 'processing') {
      modelPreviewState = 'processing';
      modelPreviewReason = `Job ${latestJob.id} is ${latestJob.status}.`;
    } else if (latestJob?.status === 'needs_review' || latestJob?.status === 'needs_input') {
      modelPreviewState = 'needs_review';
      modelPreviewReason = 'Draft geometry requires Contractor review before publication.';
    }

    const isSuperseded = Boolean(supersededModel && !publishedModel) || asset.status === 'retired';
    const rawDeptIds = (asset as unknown as { departmentIds?: string[] }).departmentIds;
    const deptIds =
      rawDeptIds && rawDeptIds.length > 0
        ? rawDeptIds
        : defaultCivil
          ? [defaultCivil.id]
          : [];
    const deptNames = deptIds
      .map((id) => departments.find((d) => d.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    const hasElec = deptNames.some((n) => n.toLowerCase() === 'electrical');
    const hasPlumb = deptNames.some((n) => n.toLowerCase() === 'plumbing');

    return {
      id: asset.id,
      projectId: project.id,
      sourceFileId: asset.id,
      sourceFileName: asset.fileName,
      pageNumber: asset.planPage || 1,
      totalPages: asset.planPage || 1,
      sheetCode: asset.sheetCode,
      title: `${asset.areaName} — ${asset.sheetCode}`,
      revision: asset.revision,
      issueDate: new Date(asset.updatedAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      author: project.contractorDisplayName,
      floorLabel: asset.areaName,
      areaId: asset.areaId,
      areaName: asset.areaName,
      departmentIds: deptIds,
      departmentNames: deptNames.length > 0 ? deptNames : ['Unmapped'],
      isCombinedElectricalPlumbing: hasElec && hasPlumb,
      classification: 'plan',
      isSuperseded,
      scaleLabel: `Calibrated ${asset.calibration.knownLengthMm.toLocaleString('en-US')} mm (${asset.calibration.unit})`,
      hasVerifiedNorth: false,
      northAngleDeg: null,
      previewSrc: asset.mimeType === 'application/pdf' ? null : (blobUrlsByAssetId[asset.id] ?? null),
      previewMissingReason:
        asset.mimeType === 'application/pdf'
          ? 'PDF source stored privately — open source or manage calibration in Blueprint management.'
          : blobUrlsByAssetId[asset.id]
            ? null
            : 'Loading private blueprint preview…',
      modelPreviewState,
      modelPreviewReason,
      modelVersionId: publishedModel?.id ?? null,
      processingJobId: latestJob?.id ?? null,
      notes: [
        `Calibrated wall height: ${asset.calibration.wallHeightMm.toLocaleString('en-US')} mm · Exterior ${asset.calibration.exteriorWallMm} mm · Interior ${asset.calibration.interiorWallMm} mm.`,
        ...(publishedModel
          ? [
              `Published footprint: ${publishedModel.geometry.footprintWidthMm.toLocaleString('en-US')} × ${publishedModel.geometry.footprintDepthMm.toLocaleString('en-US')} mm (${publishedModel.geometry.rooms.length} room(s)).`,
            ]
          : []),
      ],
      transcription: {
        identity: [
          { label: 'Drawing code', value: asset.sheetCode, status: 'verified' },
          { label: 'Title', value: `${asset.areaName} (${asset.fileName})`, status: 'verified' },
          { label: 'Sheet / page', value: `Page ${asset.planPage || 1}`, status: 'verified' },
          { label: 'Revision', value: asset.revision, status: 'verified' },
          { label: 'Discipline', value: deptNames.join(' + ') || 'Needs review', status: deptNames.length > 0 ? 'verified' : 'needs_review' },
          { label: 'Project', value: project.name, status: 'verified' },
          { label: 'Floor / area', value: asset.areaName, status: 'verified' },
        ],
        geometryAndCriteria: [
          {
            label: 'Calibration reference',
            value: `${asset.calibration.knownLengthMm.toLocaleString('en-US')} mm (${asset.calibration.unit})`,
            status: 'verified',
          },
          {
            label: 'Wall parameters',
            value: `Height ${asset.calibration.wallHeightMm} mm · Exterior ${asset.calibration.exteriorWallMm} mm · Interior ${asset.calibration.interiorWallMm} mm`,
            status: 'verified',
          },
          { label: 'North reference', value: 'Not specified on this sheet.', status: 'not_specified' },
        ],
        constructionContent: [
          {
            label: 'Extracted rooms',
            value: publishedModel
              ? publishedModel.geometry.rooms.map((r) => r.name).join(', ') || 'Not specified on this sheet.'
              : 'Needs review',
            status: publishedModel ? 'verified' : 'needs_review',
          },
          { label: 'Schedules & notes', value: 'Not specified on this sheet.', status: 'not_specified' },
        ],
        provenance: [
          { label: 'Source file', value: `${asset.fileName} (page ${asset.planPage || 1})`, status: 'verified' },
          { label: 'Review status', value: modelPreviewReason ?? asset.status, status: publishedModel ? 'verified' : 'needs_review' },
        ],
      },
      isDemoFixture: false,
    };
  });
}
