export type SeededDepartment = 'Civil' | 'Electrical' | 'Plumbing' | 'Finishing';
export type Department = SeededDepartment | (string & {});

export type PinWorkStatus = 'open' | 'in_progress' | 'pending_review' | 'approved';

export type A03RoomId = 'ruang-kerja' | 'ruang-rapat' | 'ruang-arsip';
export type RoomId = string;

export type RoomVerificationStatus = 'verified' | 'draft' | 'unverified';

export type OverviewFilterKey =
  | 'all'
  | 'open'
  | 'in_progress'
  | 'pending_review'
  | 'approved'
  | 'material_exceptions';

export type CameraViewMode = 'overall' | 'fit' | 'room' | 'pin';

export type LayerKey = 'civil' | 'electrical' | 'plumbing' | 'pins';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BuildingBoxSpec {
  id: string;
  elementId: string;
  kind: 'wall' | 'slab' | 'frame' | 'glass' | 'door_leaf';
  center: Vec3;
  size: Vec3;
}

export interface OpeningSpec {
  id: string;
  code: string;
  kind: 'door' | 'window';
  elementId: string;
  roomLabel: string;
  widthMm: number;
  sillMm: number;
  topMm: number;
  positionNote: string;
  isEstimatedPosition: boolean;
}

export interface BuildingElementSpec {
  id: string;
  name: string;
  category: 'exterior_wall' | 'interior_partition' | 'floor_slab';
  thicknessMm: number;
  heightMm: number;
  lengthMm: number;
  gridAxis: string;
  rooms: string[];
  description: string;
  boxes: BuildingBoxSpec[];
}

export interface AreaDefinition {
  id: string;
  name: string;
  sheetLabel: string;
  blueprintStatus: string;
  modelStatus: 'Published' | 'Verified' | 'Draft' | 'Synthetic Demo';
  modelVersionId: string;
  isRegisteredInCommonFrame: boolean;
  blueprintSrc: string | null;
}

export interface RoomDefinition {
  id: RoomId;
  areaId: string;
  name: string;
  areaLabel: string;
  verificationStatus: RoomVerificationStatus;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  /** Closed polygon boundary in world X/Z meters when defined on a calibrated blueprint */
  polygon?: Array<{ x: number; z: number }>;
  areaSqm?: number;
  center: Vec3;
  cameraPosition: Vec3;
  cameraTarget: Vec3;
}

export interface CrossCheckMeasurement {
  label: string;
  method: string;
  referenceMm: number;
  actualMm: number;
  deltaMm: number;
  northFaceZ: number;
  southFaceZ: number;
  sourceElements: [string, string];
}

export interface MaterialRequirement {
  id: string;
  name: string;
  unit: string;
  requiredQty: number;
  issuedQty: number;
  addedAt: string;
  isDemoSample?: boolean;
}

export interface EvidencePhoto {
  id: string;
  slot: 'before' | 'after';
  cycleNumber: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  uploadedAt: string;
  note: string;
}

export interface PinStatusHistoryEntry {
  status: PinWorkStatus;
  at: string;
  actor?: string;
}

export interface SpatialPin {
  id: string;
  slug: string;
  projectId: string;
  areaId: string;
  modelVersionId: string;
  title: string;
  description: string;
  roomId: RoomId;
  roomName: string;
  elementId: string;
  elementName: string;
  surfaceSide: string;
  position: Vec3;
  normal: Vec3;
  department: Department;
  assigneeName: string;
  status: PinWorkStatus;
  cycleNumber: number;
  materials: MaterialRequirement[];
  evidence: {
    before: EvidencePhoto | null;
    after: EvidencePhoto | null;
  };
  createdAt: string;
  updatedAt?: string;
  statusHistory?: PinStatusHistoryEntry[];
  isDemoSeed: boolean;
  color?: string;
  pinColorOverride?: boolean;
}

export interface DemoProject {
  id: string;
  slug: string;
  name: string;
  sheetCode: string;
  sheetRevision: string;
  sheetDate: string;
  roleLabel: 'Contractor';
  demoLabel: 'DEMO DATA — NOT A LIVE PROJECT';
  geometryNotice: 'SYNTHETIC GEOMETRY — NOT BLUEPRINT VERIFIED';
  modelVersionId: string;
  modelVersionLabel: string;
  locationLabel: string;
  timezone: string;
  defaultBlueprintSrc: string;
  northAngleDeg?: number | null;
}

export interface DemoState {
  schemaVersion: number;
  project: DemoProject;
  areas: AreaDefinition[];
  customBlueprintDataUrl: string | null;
  customBlueprintFileName: string | null;
  pins: SpatialPin[];
  lastUpdatedAt: string;
}

export interface OverviewSummary {
  totalPins: number;
  openCount: number;
  inProgressCount: number;
  pendingReviewCount: number;
  approvedCount: number;
  verifiedProgressPercent: number;
  totalMaterialLines: number;
  totalIssuedLines: number;
  materialExceptionCount: number;
  beforePhotoCount: number;
  afterPhotoCount: number;
  hasQcDecisions: boolean;
  hasWarehouseIssues: boolean;
}

export interface SurfaceHitCandidate {
  elementId: string;
  elementName: string;
  roomId: RoomId;
  roomName: string;
  surfaceSide: string;
  point: Vec3;
  normal: Vec3;
}
