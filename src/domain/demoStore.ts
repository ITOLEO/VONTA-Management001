import type {
  AreaDefinition,
  DemoState,
  Department,
  EvidencePhoto,
  OverviewFilterKey,
  OverviewSummary,
  RoomDefinition,
  SpatialPin,
  SurfaceHitCandidate,
} from './types';

export const DEFAULT_AREA_ID = 'area-a03-ground';

export const DEMO_SCHEMA_VERSION = 1;
export const DEFAULT_BLUEPRINT_SRC = '/media/paviliun-a03.png';

export const DEMO_DEPARTMENTS: Department[] = ['Civil', 'Electrical', 'Plumbing', 'Finishing'];

export const DEMO_WORKERS: Array<{ name: string; department: Department }> = [
  { name: 'Budi Santoso (Demo)', department: 'Finishing' },
  { name: 'Hendra Wijaya (Demo)', department: 'Electrical' },
  { name: 'Agus Pratama (Demo)', department: 'Civil' },
  { name: 'Dedi Kurniawan (Demo)', department: 'Plumbing' },
];

export function createInitialDemoState(): DemoState {
  const createdAt = '2026-11-19T08:00:00.000Z';

  return {
    schemaVersion: DEMO_SCHEMA_VERSION,
    project: {
      id: 'proj-paviliun-kerja-a03',
      slug: 'paviliun-kerja',
      name: 'Paviliun Kerja',
      sheetCode: 'A-03',
      sheetRevision: 'R00',
      sheetDate: '17 Nov 2026',
      roleLabel: 'Contractor',
      demoLabel: 'DEMO DATA — NOT A LIVE PROJECT',
      geometryNotice: 'SYNTHETIC GEOMETRY — NOT BLUEPRINT VERIFIED',
      modelVersionId: 'a03-r00-demo-v1',
      modelVersionLabel: 'A-03 R00 Demo Model (v1)',
      locationLabel: 'Ground Floor · Single-Storey Pavilion',
      timezone: 'Asia/Makassar',
      defaultBlueprintSrc: DEFAULT_BLUEPRINT_SRC,
    },
    areas: [
      {
        id: DEFAULT_AREA_ID,
        name: 'Ground Floor',
        sheetLabel: 'Sheet A-03 R00 · 17 Nov 2026',
        blueprintStatus: 'Simulated sheet attached',
        modelStatus: 'Synthetic Demo',
        modelVersionId: 'a03-r00-demo-v1',
        isRegisteredInCommonFrame: true,
        blueprintSrc: DEFAULT_BLUEPRINT_SRC,
      },
    ],
    customBlueprintDataUrl: null,
    customBlueprintFileName: null,
    pins: [
      {
        id: 'A03-PIN-01',
        slug: 'wall-surface-preparation',
        projectId: 'proj-paviliun-kerja-a03',
        areaId: DEFAULT_AREA_ID,
        modelVersionId: 'a03-r00-demo-v1',
        title: 'Wall surface preparation & skim coat',
        description:
          'Clean masonry face, level mortar joints, and apply base skim coat along the western section of the shared Ruang Rapat / Ruang Arsip partition (demo sample).',
        roomId: 'ruang-rapat',
        roomName: 'Ruang Rapat',
        elementId: 'W-PART-RAPAT-ARSIP',
        elementName: 'Shared Partition Wall (Ruang Rapat / Ruang Arsip)',
        surfaceSide: 'Ruang Rapat side (North face)',
        position: { x: 1.25, y: 1.65, z: -0.05 },
        normal: { x: 0, y: 0, z: -1 },
        department: 'Finishing',
        assigneeName: 'Budi Santoso (Demo)',
        status: 'open',
        cycleNumber: 1,
        materials: [
          {
            id: 'mat-a03-01-1',
            name: 'Skim coat mortar (25 kg bag)',
            unit: 'bag',
            requiredQty: 3,
            issuedQty: 0,
            addedAt: createdAt,
            isDemoSample: true,
          },
          {
            id: 'mat-a03-01-2',
            name: 'Finishing sandpaper #180',
            unit: 'sheet',
            requiredQty: 12,
            issuedQty: 0,
            addedAt: createdAt,
            isDemoSample: true,
          },
        ],
        evidence: {
          before: null,
          after: null,
        },
        createdAt,
        isDemoSeed: true,
        color: '#D4652F',
      },
      {
        id: 'A03-PIN-02',
        slug: 'switch-box-placement',
        projectId: 'proj-paviliun-kerja-a03',
        areaId: DEFAULT_AREA_ID,
        modelVersionId: 'a03-r00-demo-v1',
        title: 'Switch box recess & mounting',
        description:
          'Mark mounting elevation at +1,250 mm, cut flush recess, and seat switch box housing on the Ruang Rapat face of the shared partition. Conduit routing is not drawn without a source sheet (demo sample).',
        roomId: 'ruang-rapat',
        roomName: 'Ruang Rapat',
        elementId: 'W-PART-RAPAT-ARSIP',
        elementName: 'Shared Partition Wall (Ruang Rapat / Ruang Arsip)',
        surfaceSide: 'Ruang Rapat side (North face)',
        position: { x: 2.95, y: 1.25, z: -0.05 },
        normal: { x: 0, y: 0, z: -1 },
        department: 'Electrical',
        assigneeName: 'Hendra Wijaya (Demo)',
        status: 'open',
        cycleNumber: 1,
        materials: [
          {
            id: 'mat-a03-02-1',
            name: 'Flush-mount switch box (inbow dus)',
            unit: 'pcs',
            requiredQty: 2,
            issuedQty: 0,
            addedAt: createdAt,
            isDemoSample: true,
          },
          {
            id: 'mat-a03-02-2',
            name: 'Patching cement mix',
            unit: 'kg',
            requiredQty: 5,
            issuedQty: 0,
            addedAt: createdAt,
            isDemoSample: true,
          },
        ],
        evidence: {
          before: null,
          after: null,
        },
        createdAt,
        isDemoSeed: true,
        color: '#0B63CE',
      },
    ],
    lastUpdatedAt: createdAt,
  };
}

export function pinHasMaterialException(pin: SpatialPin): boolean {
  return pin.materials.some((m) => m.issuedQty < m.requiredQty);
}

export function computeOverviewSummary(pins: SpatialPin[]): OverviewSummary {
  const totalPins = pins.length;
  let openCount = 0;
  let inProgressCount = 0;
  let pendingReviewCount = 0;
  let approvedCount = 0;
  let totalMaterialLines = 0;
  let totalIssuedLines = 0;
  let materialExceptionCount = 0;
  let beforePhotoCount = 0;
  let afterPhotoCount = 0;

  for (const pin of pins) {
    if (pin.status === 'open') openCount += 1;
    else if (pin.status === 'in_progress') inProgressCount += 1;
    else if (pin.status === 'pending_review') pendingReviewCount += 1;
    else if (pin.status === 'approved') approvedCount += 1;

    totalMaterialLines += pin.materials.length;
    totalIssuedLines += pin.materials.filter((m) => m.issuedQty > 0).length;
    if (pinHasMaterialException(pin)) {
      materialExceptionCount += 1;
    }

    if (pin.evidence.before) beforePhotoCount += 1;
    if (pin.evidence.after) afterPhotoCount += 1;
  }

  const verifiedProgressPercent =
    totalPins === 0 ? 0 : Math.round((approvedCount / totalPins) * 100);

  return {
    totalPins,
    openCount,
    inProgressCount,
    pendingReviewCount,
    approvedCount,
    verifiedProgressPercent,
    totalMaterialLines,
    totalIssuedLines,
    materialExceptionCount,
    beforePhotoCount,
    afterPhotoCount,
    hasQcDecisions: approvedCount > 0 || pendingReviewCount > 0,
    hasWarehouseIssues: totalIssuedLines > 0,
  };
}

export function filterPinsByOverviewMetric(
  pins: SpatialPin[],
  filter: OverviewFilterKey
): SpatialPin[] {
  switch (filter) {
    case 'all':
      return pins;
    case 'open':
      return pins.filter((p) => p.status === 'open');
    case 'in_progress':
      return pins.filter((p) => p.status === 'in_progress');
    case 'pending_review':
      return pins.filter((p) => p.status === 'pending_review');
    case 'approved':
      return pins.filter((p) => p.status === 'approved');
    case 'material_exceptions':
      return pins.filter(pinHasMaterialException);
  }
}

export function filterRoomsByQuery(
  rooms: RoomDefinition[],
  query: string
): RoomDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return rooms;
  return rooms.filter(
    (room) =>
      room.name.toLowerCase().includes(q) ||
      room.areaLabel.toLowerCase().includes(q) ||
      room.id.toLowerCase().includes(q)
  );
}

/**
 * Determines whether "All areas" can show a single registered 3D scene or must
 * render separate area previews with "Placement not verified" to avoid
 * superimposing unrelated models at the origin.
 */
export function resolveAllAreasDisplayMode(areas: AreaDefinition[]): {
  mode: 'single_registered_scene' | 'separate_unverified_previews';
  unverifiedAreaIds: string[];
} {
  const unverified = areas
    .filter((a) => !a.isRegisteredInCommonFrame)
    .map((a) => a.id);
  if (unverified.length > 0 && areas.length > 1) {
    return {
      mode: 'separate_unverified_previews',
      unverifiedAreaIds: unverified,
    };
  }
  return {
    mode: 'single_registered_scene',
    unverifiedAreaIds: unverified,
  };
}

export interface AddMaterialInput {
  name: string;
  unit: string;
  requiredQty: number;
}

export type DomainResult<T> = { ok: true; state: T } | { ok: false; error: string };

export function addMaterialRequirementToPin(
  state: DemoState,
  pinId: string,
  input: AddMaterialInput
): DomainResult<DemoState> {
  const name = input.name.trim();
  const unit = input.unit.trim();
  const qty = Number(input.requiredQty);

  if (!name) {
    return { ok: false, error: 'Material name is required.' };
  }
  if (!unit) {
    return { ok: false, error: 'Unit is required (for example: pcs, bag, m).' };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'Required quantity must be a positive number.' };
  }

  const targetExists = state.pins.some((p) => p.id === pinId);
  if (!targetExists) {
    return { ok: false, error: `Pin ${pinId} was not found in the active project.` };
  }

  const now = new Date().toISOString();
  const newLineId = `mat-${pinId.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const nextPins = state.pins.map((pin) => {
    if (pin.id !== pinId) return pin;
    return {
      ...pin,
      materials: [
        ...pin.materials,
        {
          id: newLineId,
          name,
          unit,
          requiredQty: Math.round(qty * 1000) / 1000,
          issuedQty: 0, // Adding a requirement never issues warehouse stock
          addedAt: now,
          isDemoSample: false,
        },
      ],
    };
  });

  return {
    ok: true,
    state: {
      ...state,
      pins: nextPins,
      lastUpdatedAt: now,
    },
  };
}

export interface AttachEvidenceInput {
  slot: 'before' | 'after';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export function attachEvidencePhotoToPin(
  state: DemoState,
  pinId: string,
  input: AttachEvidenceInput
): DomainResult<DemoState> {
  if (!input.mimeType.startsWith('image/')) {
    return { ok: false, error: 'Please select an image file (PNG, JPG, or WebP).' };
  }
  if (!input.dataUrl || !input.dataUrl.startsWith('data:image/')) {
    return { ok: false, error: 'Image could not be read. Please choose another file.' };
  }

  const target = state.pins.find((p) => p.id === pinId);
  if (!target) {
    return { ok: false, error: `Pin ${pinId} was not found.` };
  }

  const now = new Date().toISOString();
  const photo: EvidencePhoto = {
    id: `ev-${pinId}-${input.slot}-c${target.cycleNumber}-${Date.now()}`,
    slot: input.slot,
    cycleNumber: target.cycleNumber,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    dataUrl: input.dataUrl,
    uploadedAt: now,
    note: 'Simulated local evidence input (demo only — does not approve work or change progress)',
  };

  // Strictly attach ONLY to target pinId and current cycle; NEVER change status or progress
  const nextPins = state.pins.map((pin) => {
    if (pin.id !== pinId) return pin;
    return {
      ...pin,
      evidence: {
        ...pin.evidence,
        [input.slot]: photo,
      },
    };
  });

  return {
    ok: true,
    state: {
      ...state,
      pins: nextPins,
      lastUpdatedAt: now,
    },
  };
}

export function removeEvidencePhotoFromPin(
  state: DemoState,
  pinId: string,
  slot: 'before' | 'after'
): DemoState {
  const now = new Date().toISOString();
  return {
    ...state,
    pins: state.pins.map((pin) =>
      pin.id === pinId
        ? {
            ...pin,
            evidence: {
              ...pin.evidence,
              [slot]: null,
            },
          }
        : pin
    ),
    lastUpdatedAt: now,
  };
}

export interface CreatePinInput {
  hit: SurfaceHitCandidate | null;
  title: string;
  department: Department;
  assigneeName: string;
  description?: string;
  color?: string;
  pinColorOverride?: boolean;
}

function slugifyPinTitle(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base ? `${base}-${id.toLowerCase()}` : id.toLowerCase();
}

export function createDemoPinOnSurface(
  state: DemoState,
  input: CreatePinInput
): DomainResult<{ state: DemoState; createdPin: SpatialPin }> {
  if (!input.hit) {
    return {
      ok: false,
      error: 'No building surface selected. Click a wall or floor surface on the 3D model before saving.',
    };
  }

  const { point, normal } = input.hit;
  const coordsFinite =
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z) &&
    Number.isFinite(normal.x) &&
    Number.isFinite(normal.y) &&
    Number.isFinite(normal.z);

  if (!coordsFinite) {
    return { ok: false, error: 'Invalid 3D surface coordinates. Please pick a surface again.' };
  }

  const title = input.title.trim();
  const assigneeName = input.assigneeName.trim();
  if (!title) {
    return { ok: false, error: 'Work title is required.' };
  }
  if (!assigneeName) {
    return { ok: false, error: 'Demo assignee is required.' };
  }

  // Generate next stable demo Pin ID (e.g. A03-PIN-03)
  const existingNumbers = state.pins
    .map((p) => {
      const m = p.id.match(/^A03-PIN-(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const nextNumber = (existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0) + 1;
  const id = `A03-PIN-${String(nextNumber).padStart(2, '0')}`;
  const slug = slugifyPinTitle(title, id);
  const now = new Date().toISOString();

  const createdPin: SpatialPin = {
    id,
    slug,
    projectId: state.project.id,
    areaId: DEFAULT_AREA_ID,
    modelVersionId: state.project.modelVersionId,
    title,
    description:
      input.description?.trim() ||
      `Demo work item anchored on ${input.hit.elementName} (${input.hit.surfaceSide}).`,
    roomId: input.hit.roomId,
    roomName: input.hit.roomName,
    elementId: input.hit.elementId,
    elementName: input.hit.elementName,
    surfaceSide: input.hit.surfaceSide,
    position: {
      x: Math.round(point.x * 1000) / 1000,
      y: Math.round(point.y * 1000) / 1000,
      z: Math.round(point.z * 1000) / 1000,
    },
    normal: {
      x: Math.round(normal.x * 1000) / 1000,
      y: Math.round(normal.y * 1000) / 1000,
      z: Math.round(normal.z * 1000) / 1000,
    },
    department: input.department,
    assigneeName,
    status: 'open',
    cycleNumber: 1,
    materials: [],
    evidence: {
      before: null,
      after: null,
    },
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: 'open', at: now, actor: assigneeName }],
    isDemoSeed: false,
    color: input.color || '#D4652F',
    pinColorOverride: input.pinColorOverride ?? false,
  };

  return {
    ok: true,
    state: {
      state: {
        ...state,
        pins: [...state.pins, createdPin],
        lastUpdatedAt: now,
      },
      createdPin,
    },
  };
}

export function updateDemoPinColor(
  state: DemoState,
  pinId: string,
  colorHex: string,
  pinColorOverride = true
): DemoState {
  const now = new Date().toISOString();
  return {
    ...state,
    pins: state.pins.map((pin) =>
      pin.id === pinId ? { ...pin, color: colorHex, pinColorOverride, updatedAt: now } : pin
    ),
    lastUpdatedAt: now,
  };
}

export function updateDemoPinStatus(
  state: DemoState,
  pinId: string,
  nextStatus: SpatialPin['status'],
  options?: { actorName?: string; hasQcAuthority?: boolean }
): DomainResult<DemoState> {
  const target = state.pins.find((p) => p.id === pinId);
  if (!target) {
    return { ok: false, error: `Pin ${pinId} was not found.` };
  }
  if (target.status === nextStatus) {
    return { ok: true, state };
  }
  // Enforce canonical QC transitions:
  // - Cannot jump directly to approved without both before+after evidence and QC authority
  if (nextStatus === 'approved') {
    if (target.status !== 'pending_review') {
      return {
        ok: false,
        error: 'A Pin must enter Pending QC review before it can be approved.',
      };
    }
    if (!target.evidence.before || !target.evidence.after) {
      return {
        ok: false,
        error: 'Both Before and After QC photos are required before approving a Pin.',
      };
    }
    if (options?.hasQcAuthority === false) {
      return {
        ok: false,
        error: 'Only an authorized QC reviewer (Contractor or Owner) can approve this Pin.',
      };
    }
  }
  if (nextStatus === 'pending_review') {
    if (!target.evidence.before || !target.evidence.after) {
      return {
        ok: false,
        error: 'Attach both Before and After photos before submitting this Pin for QC review.',
      };
    }
  }
  const now = new Date().toISOString();
  const nextPins = state.pins.map((pin) => {
    if (pin.id !== pinId) return pin;
    const history = [
      ...(pin.statusHistory ?? [{ status: pin.status, at: pin.createdAt }]),
      { status: nextStatus, at: now, actor: options?.actorName ?? 'Budi Santoso' },
    ];
    return {
      ...pin,
      status: nextStatus,
      updatedAt: now,
      statusHistory: history,
    };
  });
  return {
    ok: true,
    state: {
      ...state,
      pins: nextPins,
      lastUpdatedAt: now,
    },
  };
}

export function formatStatusLabel(status: SpatialPin['status']): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'in_progress':
      return 'In Progress';
    case 'pending_review':
      return 'Pending Review';
    case 'approved':
      return 'Approved';
  }
}

export function formatCoordsMeters(pos: { x: number; y: number; z: number }): string {
  return `X ${pos.x.toFixed(2)} m · Y ${pos.y.toFixed(2)} m · Z ${pos.z.toFixed(2)} m`;
}
