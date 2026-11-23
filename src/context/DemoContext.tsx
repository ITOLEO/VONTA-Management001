import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildA03PaviliunKerjaModel, type A03ModelBuild } from '../domain/a03Geometry';
import {
  addMaterialRequirementToPin,
  attachEvidencePhotoToPin,
  computeOverviewSummary,
  createDemoPinOnSurface,
  createInitialDemoState,
  removeEvidencePhotoFromPin,
  updateDemoPinColor,
  updateDemoPinStatus,
  type AddMaterialInput,
  type AttachEvidenceInput,
  type CreatePinInput,
} from '../domain/demoStore';
import {
  addProjectDepartment,
  propagateDepartmentColorToPins,
  seedDefaultDepartments,
  updateDepartmentPinColor,
  type ProjectDepartment,
} from '../domain/departmentCatalog';
import {
  buildBuildingSummarySlides,
  createDemoBlueprintRegister,
  type BlueprintModelPreviewState,
  type BlueprintSheetClassification,
  type BlueprintSheetRecord,
  type BuildingSummarySlide,
} from '../domain/blueprintRegister';
import type { DemoState, OverviewSummary, PinWorkStatus, SpatialPin } from '../domain/types';
import { localDemoRepository } from '../data/demoRepository';

export interface UploadDemoBlueprintInput {
  sheetCode: string;
  title: string;
  revision: string;
  areaId: string;
  areaName: string;
  floorLabel: string;
  departmentIds: string[];
  isCombinedElectricalPlumbing: boolean;
  classification: BlueprintSheetClassification;
  fileName: string;
  previewDataUrl?: string | null;
  scaleLabel?: string;
  notes?: string;
}

interface DemoContextValue {
  state: DemoState;
  isHydrated: boolean;
  storageWarning: string | null;
  summary: OverviewSummary;
  model: A03ModelBuild;
  activeBlueprintSrc: string;
  departments: ProjectDepartment[];
  blueprintSheets: BlueprintSheetRecord[];
  buildingSummary: {
    wholeBuilding: BuildingSummarySlide;
    departmentStrip: BuildingSummarySlide[];
  };
  addDepartment: (input: {
    name: string;
    defaultPinColor?: string;
  }) => { ok: true; created: ProjectDepartment } | { ok: false; error: string };
  updateDepartmentColor: (
    deptId: string,
    colorHex: string
  ) => { ok: true; updated: ProjectDepartment } | { ok: false; error: string };
  uploadBlueprintSheet: (
    input: UploadDemoBlueprintInput
  ) => { ok: true; sheet: BlueprintSheetRecord } | { ok: false; error: string };
  retryBlueprintSheet: (sheetId: string) => void;
  publishBlueprintSheetDraft: (sheetId: string) => void;
  addMaterial: (pinId: string, input: AddMaterialInput) => { ok: true } | { ok: false; error: string };
  attachEvidence: (
    pinId: string,
    input: AttachEvidenceInput
  ) => { ok: true } | { ok: false; error: string };
  removeEvidence: (pinId: string, slot: 'before' | 'after') => void;
  createPin: (
    input: CreatePinInput
  ) => { ok: true; createdPin: SpatialPin } | { ok: false; error: string };
  updatePinColor: (pinId: string, colorHex: string, isManualOverride?: boolean) => void;
  updatePinStatus: (
    pinId: string,
    nextStatus: PinWorkStatus,
    options?: { actorName?: string; hasQcAuthority?: boolean }
  ) => { ok: true } | { ok: false; error: string };
  setCustomBlueprint: (dataUrl: string, fileName: string) => void;
  clearCustomBlueprint: () => void;
  resetDemo: () => Promise<void>;
}

const DEMO_DEPARTMENTS_STORAGE_KEY = 'vonta_demo_departments_v1';
const DEMO_BLUEPRINTS_EXTRA_KEY = 'vonta_demo_blueprints_extra_v1';

const DemoContext = createContext<DemoContextValue | null>(null);

function loadStoredDepartments(projectId: string): ProjectDepartment[] {
  try {
    const raw = window.localStorage.getItem(DEMO_DEPARTMENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectDepartment[];
      if (Array.isArray(parsed) && parsed.length >= 4) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return seedDefaultDepartments(projectId);
}

function loadStoredExtraBlueprints(): BlueprintSheetRecord[] {
  try {
    const raw = window.localStorage.getItem(DEMO_BLUEPRINTS_EXTRA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BlueprintSheetRecord[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState>(() => createInitialDemoState());
  const [isHydrated, setIsHydrated] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [departments, setDepartments] = useState<ProjectDepartment[]>(() =>
    typeof window !== 'undefined'
      ? loadStoredDepartments('proj-paviliun-kerja-a03')
      : seedDefaultDepartments('proj-paviliun-kerja-a03')
  );
  const [extraBlueprints, setExtraBlueprints] = useState<BlueprintSheetRecord[]>(() =>
    typeof window !== 'undefined' ? loadStoredExtraBlueprints() : []
  );
  const [sheetStateOverrides, setSheetStateOverrides] = useState<
    Record<string, { modelPreviewState: BlueprintModelPreviewState; modelPreviewReason?: string | null }>
  >({});

  const model = useMemo(() => buildA03PaviliunKerjaModel(), []);

  useEffect(() => {
    let active = true;
    localDemoRepository.loadState().then((loaded) => {
      if (!active) return;
      setState(loaded);
      setIsHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const persistNext = useCallback((next: DemoState) => {
    setState(next);
    void localDemoRepository.saveState(next).then((result) => {
      setStorageWarning(result.warning ?? null);
    });
  }, []);

  const persistDepartments = useCallback((next: ProjectDepartment[]) => {
    setDepartments(next);
    try {
      window.localStorage.setItem(DEMO_DEPARTMENTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const addDepartment = useCallback(
    (input: { name: string; defaultPinColor?: string }) => {
      const res = addProjectDepartment(departments, state.project.id, input);
      if (!res.ok) return res;
      persistDepartments(res.departments);
      return { ok: true as const, created: res.created };
    },
    [departments, state.project.id, persistDepartments]
  );

  const updateDepartmentColor = useCallback(
    (deptId: string, colorHex: string) => {
      const res = updateDepartmentPinColor(departments, deptId, colorHex);
      if (!res.ok) return res;
      persistDepartments(res.departments);
      // Propagate to inheriting demo Pins without altering explicit overrides
      const nextPins = propagateDepartmentColorToPins(
        state.pins,
        res.updated.name,
        res.updated.defaultPinColor
      );
      persistNext({
        ...state,
        pins: nextPins,
        lastUpdatedAt: new Date().toISOString(),
      });
      return { ok: true as const, updated: res.updated };
    },
    [departments, state, persistDepartments, persistNext]
  );

  const baseBlueprintSheets = useMemo(
    () => createDemoBlueprintRegister(state.project.id, departments),
    [state.project.id, departments]
  );

  const blueprintSheets = useMemo<BlueprintSheetRecord[]>(() => {
    const merged = [...baseBlueprintSheets, ...extraBlueprints];
    return merged.map((sheet) => {
      const override = sheetStateOverrides[sheet.id];
      if (!override) return sheet;
      return {
        ...sheet,
        modelPreviewState: override.modelPreviewState,
        modelPreviewReason: override.modelPreviewReason,
      };
    });
  }, [baseBlueprintSheets, extraBlueprints, sheetStateOverrides]);

  const buildingSummary = useMemo(
    () =>
      buildBuildingSummarySlides(blueprintSheets, departments, {
        projectName: state.project.name,
        storyCount: 2,
        hasVerifiedElevationModel: true,
        floorLabels: ['Ground Floor (0.00 m)', 'Level 2 (+3.20 m)', 'Roof (+6.40 m)'],
      }),
    [blueprintSheets, departments, state.project.name]
  );

  const uploadBlueprintSheet = useCallback(
    (input: UploadDemoBlueprintInput) => {
      const sheetCode = input.sheetCode.trim().toUpperCase();
      const title = input.title.trim();
      const revision = input.revision.trim() || 'R00';
      if (!sheetCode) {
        return { ok: false as const, error: 'Drawing code is required (for example A-06 or MEP-103).' };
      }
      if (!title) {
        return { ok: false as const, error: 'Drawing title is required.' };
      }
      if (!input.departmentIds || input.departmentIds.length === 0) {
        return {
          ok: false as const,
          error: 'Select a department or the combined Electrical + Plumbing mapping before uploading.',
        };
      }
      const deptNames = input.departmentIds
        .map((id) => departments.find((d) => d.id === id)?.name)
        .filter((n): n is string => Boolean(n));
      if (deptNames.length === 0) {
        return { ok: false as const, error: 'Selected department was not found in the project catalog.' };
      }

      const id = `bp-upload-${Date.now().toString(36)}`;
      const nowDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const previewState: BlueprintModelPreviewState =
        input.classification === 'plan' || input.classification === 'coordination'
          ? 'needs_review'
          : 'reference_only';

      const sheet: BlueprintSheetRecord = {
        id,
        projectId: state.project.id,
        sourceFileId: `src-${id}`,
        sourceFileName: input.fileName || `${sheetCode}-${revision}.pdf`,
        pageNumber: 1,
        totalPages: 1,
        sheetCode,
        title,
        revision,
        issueDate: nowDate,
        author: 'Budi Santoso (Demo Upload)',
        floorLabel: input.floorLabel.trim() || 'Ground Floor (0.00 m)',
        areaId: input.areaId || state.areas[0]?.id || 'area-a03-ground',
        areaName: input.areaName.trim() || 'Ground Floor',
        departmentIds: input.departmentIds,
        departmentNames: deptNames,
        isCombinedElectricalPlumbing: input.isCombinedElectricalPlumbing,
        classification: input.classification,
        isSuperseded: false,
        scaleLabel: input.scaleLabel?.trim() || '1:50 (mm)',
        hasVerifiedNorth: false,
        northAngleDeg: null,
        previewSrc: input.previewDataUrl ?? null,
        modelPreviewState: previewState,
        modelPreviewReason:
          previewState === 'needs_review'
            ? 'Demo upload accepted — draft geometry ready for Contractor verification before publication.'
            : 'Reference-only drawing stored in register; supports existing area models.',
        processingJobId: `job-${id}`,
        notes: [
          input.notes?.trim() ||
            `Uploaded into ${deptNames.join(' + ')} (${input.fileName || 'local fixture'}).`,
        ],
        transcription: {
          identity: [
            { label: 'Drawing code', value: sheetCode, status: 'verified' },
            { label: 'Title', value: title, status: 'verified' },
            { label: 'Sheet / page', value: 'Page 1 of 1', status: 'verified' },
            { label: 'Revision', value: revision, status: 'verified' },
            { label: 'Issue date', value: nowDate, status: 'verified' },
            { label: 'Discipline', value: deptNames.join(' + '), status: 'verified' },
            { label: 'Floor / area', value: `${input.areaName} (${input.floorLabel})`, status: 'verified' },
          ],
          geometryAndCriteria: [
            { label: 'Scale and units', value: input.scaleLabel?.trim() || 'Needs review', status: input.scaleLabel ? 'verified' : 'needs_review' },
            { label: 'Grid axes', value: 'Not specified on this sheet.', status: 'not_specified' },
            { label: 'North reference', value: 'Not specified on this sheet.', status: 'not_specified' },
          ],
          constructionContent: [
            { label: 'Named elements', value: 'Needs review — pending Contractor verification.', status: 'needs_review' },
            { label: 'Material specifications', value: 'Not specified on this sheet.', status: 'not_specified' },
          ],
          provenance: [
            { label: 'Source file', value: input.fileName || `${sheetCode}-${revision}.pdf`, status: 'verified' },
            { label: 'Review status', value: previewState === 'needs_review' ? 'Needs review' : 'Reference only', status: previewState === 'needs_review' ? 'needs_review' : 'verified' },
          ],
        },
        isDemoFixture: true,
      };

      const nextExtra = [sheet, ...extraBlueprints];
      setExtraBlueprints(nextExtra);
      try {
        window.localStorage.setItem(DEMO_BLUEPRINTS_EXTRA_KEY, JSON.stringify(nextExtra));
      } catch {
        // ignore quota errors
      }
      return { ok: true as const, sheet };
    },
    [departments, state.project.id, state.areas, extraBlueprints]
  );

  const retryBlueprintSheet = useCallback((sheetId: string) => {
    setSheetStateOverrides((prev) => ({
      ...prev,
      [sheetId]: {
        modelPreviewState: 'needs_review',
        modelPreviewReason: 'Retry succeeded in demo mode — draft geometry ready for Contractor verification.',
      },
    }));
  }, []);

  const publishBlueprintSheetDraft = useCallback((sheetId: string) => {
    setSheetStateOverrides((prev) => ({
      ...prev,
      [sheetId]: {
        modelPreviewState: 'orbitable',
        modelPreviewReason: 'Verified and published in demo session.',
      },
    }));
  }, []);

  const addMaterial = useCallback(
    (pinId: string, input: AddMaterialInput) => {
      const result = addMaterialRequirementToPin(state, pinId, input);
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }
      persistNext(result.state);
      return { ok: true as const };
    },
    [state, persistNext]
  );

  const attachEvidence = useCallback(
    (pinId: string, input: AttachEvidenceInput) => {
      const result = attachEvidencePhotoToPin(state, pinId, input);
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }
      persistNext(result.state);
      return { ok: true as const };
    },
    [state, persistNext]
  );

  const removeEvidence = useCallback(
    (pinId: string, slot: 'before' | 'after') => {
      const next = removeEvidencePhotoFromPin(state, pinId, slot);
      persistNext(next);
    },
    [state, persistNext]
  );

  const createPin = useCallback(
    (input: CreatePinInput) => {
      const result = createDemoPinOnSurface(state, input);
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }
      persistNext(result.state.state);
      return { ok: true as const, createdPin: result.state.createdPin };
    },
    [state, persistNext]
  );

  const updatePinColor = useCallback(
    (pinId: string, colorHex: string, isManualOverride = true) => {
      persistNext(updateDemoPinColor(state, pinId, colorHex, isManualOverride));
    },
    [state, persistNext]
  );

  const updatePinStatus = useCallback(
    (
      pinId: string,
      nextStatus: PinWorkStatus,
      options?: { actorName?: string; hasQcAuthority?: boolean }
    ) => {
      const res = updateDemoPinStatus(state, pinId, nextStatus, options);
      if (!res.ok) return { ok: false as const, error: res.error };
      persistNext(res.state);
      return { ok: true as const };
    },
    [state, persistNext]
  );

  const setCustomBlueprint = useCallback(
    (dataUrl: string, fileName: string) => {
      persistNext({
        ...state,
        customBlueprintDataUrl: dataUrl,
        customBlueprintFileName: fileName,
        lastUpdatedAt: new Date().toISOString(),
      });
    },
    [state, persistNext]
  );

  const clearCustomBlueprint = useCallback(() => {
    persistNext({
      ...state,
      customBlueprintDataUrl: null,
      customBlueprintFileName: null,
      lastUpdatedAt: new Date().toISOString(),
    });
  }, [state, persistNext]);

  const resetDemo = useCallback(async () => {
    const fresh = await localDemoRepository.resetState();
    setState(fresh);
    setStorageWarning(null);
    const defaultDepts = seedDefaultDepartments(fresh.project.id);
    setDepartments(defaultDepts);
    setExtraBlueprints([]);
    setSheetStateOverrides({});
    try {
      window.localStorage.removeItem(DEMO_DEPARTMENTS_STORAGE_KEY);
      window.localStorage.removeItem(DEMO_BLUEPRINTS_EXTRA_KEY);
    } catch {
      // ignore
    }
  }, []);

  const summary = useMemo(() => computeOverviewSummary(state.pins), [state.pins]);

  const activeBlueprintSrc =
    state.customBlueprintDataUrl ?? state.project.defaultBlueprintSrc;

  const value = useMemo<DemoContextValue>(
    () => ({
      state,
      isHydrated,
      storageWarning,
      summary,
      model,
      activeBlueprintSrc,
      departments,
      blueprintSheets,
      buildingSummary,
      addDepartment,
      updateDepartmentColor,
      uploadBlueprintSheet,
      retryBlueprintSheet,
      publishBlueprintSheetDraft,
      addMaterial,
      attachEvidence,
      removeEvidence,
      createPin,
      updatePinColor,
      updatePinStatus,
      setCustomBlueprint,
      clearCustomBlueprint,
      resetDemo,
    }),
    [
      state,
      isHydrated,
      storageWarning,
      summary,
      model,
      activeBlueprintSrc,
      departments,
      blueprintSheets,
      buildingSummary,
      addDepartment,
      updateDepartmentColor,
      uploadBlueprintSheet,
      retryBlueprintSheet,
      publishBlueprintSheetDraft,
      addMaterial,
      attachEvidence,
      removeEvidence,
      createPin,
      updatePinColor,
      updatePinStatus,
      setCustomBlueprint,
      clearCustomBlueprint,
      resetDemo,
    ]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error('useDemo must be used within DemoProvider');
  }
  return ctx;
}
