import { demoAccounts, type DemoRole } from '../domain/demoAccounts';
import { isProjectLead } from '../domain/accountTypes';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MembershipStatus, ProjectRole } from '../domain/accountTypes';
import type { Department } from '../domain/types';
import {
  canDecideIzinForShift,
  canDownloadWorkspaceView,
  canDrawLocally,
  canManageWorkspaceOutputGrants,
  canShareWorkspaceView,
  computeDepartmentDailyAttendance,
  computeShiftCutoffUtcMs,
  deriveEffectiveAttendanceStatus,
  evaluateCheckInAttempt,
  formatInstantInProjectZone,
  type AttendanceHistoryEntry,
  type AttendanceRecordState,
  type AttendanceShiftObligation,
  type DepartmentAttendanceDayMetric,
  type IzinRequestRecord,
  type IzinRequestStatus,
} from '../domain/attendanceEngine';
import {
  acceptScopedInvitation,
  canToggleMemberWorkerForeman,
  createScopedInvitation,
  DEMO_REGISTERED_DIRECTORY,
  lookupAccountByExactEmail,
  type ExactEmailLookupResult,
  type ScopedInvitationRecord,
} from '../domain/teamInvitations';
import {
  createDemoBudgetLedger,
  type BudgetAllocationEntry,
  type BudgetPostedCharge,
  type ProjectBudgetLedger,
} from '../domain/budgetLedger';
import { seedDefaultDepartments } from '../domain/departmentCatalog';
import { clearTemporaryDrawingMemory } from '../utils/privateDrawingStore';

export interface DemoPersonaMember {
  accountId: string;
  userId: string;
  membershipId: string;
  workerCode: string;
  displayName: string;
  email: string;
  role: ProjectRole;
  profession: string;
  joinedAt: string;
  status: MembershipStatus;
  hasMandorGrant: boolean;
  hasAccountingGrant: boolean;
  canDownloadWorkspaceView: boolean;
  canShareWorkspaceView: boolean;
  division: Department;
  teamId: string;
}

export interface DemoIzinPhotoItem {
  id: string;
  workerUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewDataUrl: string;
  uploadedAt: string;
}

export interface DemoDailySelfieItem {
  workerUserId: string;
  workDate: string;
  dataUrl: string;
  capturedAt: string;
  capturedByUserId: string;
}

export type WorkspaceShareAccessMode = 'restricted' | 'anyone_with_link';

export interface DemoWorkspaceShare {
  id: string;
  projectId: string;
  projectName?: string;
  modelVersionId: string;
  areaId: string;
  areaName?: string;
  roomId: string | null;
  selectedPinId: string | null;
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
  layers: {
    civil: boolean;
    electrical: boolean;
    plumbing: boolean;
    pins: boolean;
  };
  accessMode: WorkspaceShareAccessMode;
  publicToken: string | null;
  revokedAt: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

const DEMO_SHARES_STORAGE_KEY = 'vonta.demo.workspace.shares.v2';
const DEMO_MEMBERS_STORAGE_KEY = 'vonta.demo.members.v2';
const DEMO_ACTIVE_ACCOUNT_STORAGE_KEY = 'vonta.demo.active_account.v2';

function readStoredDemoShares(): Record<string, DemoWorkspaceShare> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(DEMO_SHARES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DemoWorkspaceShare>;
  } catch {
    return {};
  }
}

function writeStoredDemoShares(map: Record<string, DemoWorkspaceShare>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DEMO_SHARES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function readStoredDemoMembers(fallback: DemoPersonaMember[]): DemoPersonaMember[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(DEMO_MEMBERS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as DemoPersonaMember[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredDemoMembers(members: DemoPersonaMember[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DEMO_MEMBERS_STORAGE_KEY, JSON.stringify(members));
  } catch {
    // Ignore storage errors
  }
}

function readStoredActiveAccountId(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.sessionStorage.getItem(DEMO_ACTIVE_ACCOUNT_STORAGE_KEY) || fallback;
  } catch {
    return fallback;
  }
}

function writeStoredActiveAccountId(accountId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DEMO_ACTIVE_ACCOUNT_STORAGE_KEY, accountId);
  } catch {
    // Ignore storage errors
  }
}

function makeOpaqueToken(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const INITIAL_DEMO_MEMBERS: DemoPersonaMember[] = [
  {
    accountId: 'demo-acct-contractor',
    userId: 'demo-user-contractor',
    membershipId: 'mem-demo-01',
    workerCode: 'CTR-001',
    displayName: 'Budi Santoso',
    email: 'budi.santoso@demo.vonta.local',
    role: 'contractor',
    profession: 'Site Contractor',
    joinedAt: '2026-06-12',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: true,
    canShareWorkspaceView: true,
    division: 'Civil',
    teamId: 'team-civil-a',
  },
  {
    accountId: 'demo-acct-architect', userId: 'demo-user-architect', membershipId: 'mem-demo-08',
    workerCode: 'ARC-001', displayName: 'architect-demo', email: 'architect-demo@demo.vonta.example',
    role: 'architect', profession: 'Architect', joinedAt: '2026-06-12', status: 'active',
    hasMandorGrant: false, hasAccountingGrant: true, canDownloadWorkspaceView: true,
    canShareWorkspaceView: true, division: 'Civil', teamId: 'team-civil-a',
  },
  {
    accountId: 'demo-acct-owner',
    userId: 'demo-user-owner',
    membershipId: 'mem-demo-02',
    workerCode: 'OWN-001',
    displayName: 'Nadia Wijaya',
    email: 'owner@demo.vonta.local',
    role: 'owner',
    profession: 'Project Owner',
    joinedAt: '2026-05-01',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: true,
    canShareWorkspaceView: true,
    division: 'Civil',
    teamId: 'team-owner',
  },
  {
    accountId: 'demo-acct-mandor',
    userId: 'demo-user-mandor',
    membershipId: 'mem-demo-03',
    workerCode: 'WRK-014',
    displayName: 'Hendra Kusuma',
    email: 'mandor@demo.vonta.local',
    role: 'worker',
    profession: 'Civil Foreman',
    joinedAt: '2026-07-03',
    status: 'active',
    hasMandorGrant: true,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Civil',
    teamId: 'team-civil-a',
  },
  {
    accountId: 'demo-acct-worker',
    userId: 'demo-user-worker',
    membershipId: 'mem-demo-04',
    workerCode: 'WRK-022',
    displayName: 'Raka Pratama',
    email: 'worker@demo.vonta.local',
    role: 'worker',
    profession: 'Masonry Worker',
    joinedAt: '2026-08-15',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Civil',
    teamId: 'team-civil-a',
  },
  {
    accountId: 'demo-acct-elec-worker',
    userId: 'demo-user-elec-worker',
    membershipId: 'mem-demo-05',
    workerCode: 'WRK-031',
    displayName: 'Hendra Wijaya',
    email: 'hendra.elec@demo.vonta.local',
    role: 'worker',
    profession: 'Electrical Technician',
    joinedAt: '2026-09-02',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Electrical',
    teamId: 'team-elec-a',
  },
  {
    accountId: 'demo-acct-plumb-worker',
    userId: 'demo-user-plumb-worker',
    membershipId: 'mem-demo-06',
    workerCode: 'WRK-045',
    displayName: 'Dedi Kurniawan',
    email: 'dedi.plumb@demo.vonta.local',
    role: 'worker',
    profession: 'Plumbing Installer',
    joinedAt: '2026-09-10',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: false,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Plumbing',
    teamId: 'team-plumb-a',
  },
  {
    accountId: 'demo-acct-accounting',
    userId: 'demo-user-accounting',
    membershipId: 'mem-demo-07',
    workerCode: 'ACC-002',
    displayName: 'Siti Rahma',
    email: 'accounting@demo.vonta.local',
    role: 'accounting',
    profession: 'Project Accountant',
    joinedAt: '2026-06-20',
    status: 'active',
    hasMandorGrant: false,
    hasAccountingGrant: true,
    canDownloadWorkspaceView: false,
    canShareWorkspaceView: false,
    division: 'Finishing',
    teamId: 'team-fin-a',
  },
];

// Synthetic demo shifts for Paviliun Kerja (Asia/Makassar = UTC+8)
// 2026-11-20 08:00 WITA = 2026-11-20T00:00:00Z, cutoff = 09:00 WITA = 2026-11-20T01:00:00Z
export const DEMO_TODAY = '2026-11-20';
export const DEMO_YESTERDAY = '2026-11-19';

const INITIAL_DEMO_SHIFTS: AttendanceShiftObligation[] = [
  {
    id: 'demo-shift-worker-today',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-worker',
    workerName: 'Raka Pratama',
    division: 'Civil',
    teamId: 'team-civil-a',
    workDate: DEMO_TODAY,
    timezone: 'Asia/Makassar',
    shiftLabel: 'Morning Civil Shift (08:00–16:00 WITA)',
    shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
    eligibility: 'scheduled',
    assignedMandorUserIds: ['demo-user-mandor'],
  },
  {
    id: 'demo-shift-mandor-today',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-mandor',
    workerName: 'Hendra Kusuma',
    division: 'Civil',
    teamId: 'team-civil-a',
    workDate: DEMO_TODAY,
    timezone: 'Asia/Makassar',
    shiftLabel: 'Morning Civil Shift (08:00–16:00 WITA)',
    shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
    eligibility: 'scheduled',
    assignedMandorUserIds: ['demo-user-mandor'], // Self-review blocked by engine
  },
  {
    id: 'demo-shift-elec-today',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-elec-worker',
    workerName: 'Hendra Wijaya',
    division: 'Electrical',
    teamId: 'team-elec-a',
    workDate: DEMO_TODAY,
    timezone: 'Asia/Makassar',
    shiftLabel: 'Electrical Rough-In Shift (08:00–16:00 WITA)',
    shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
    eligibility: 'scheduled',
    assignedMandorUserIds: ['demo-user-mandor'],
  },
  {
    id: 'demo-shift-plumb-today',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-plumb-worker',
    workerName: 'Dedi Kurniawan',
    division: 'Plumbing',
    teamId: 'team-plumb-a',
    workDate: DEMO_TODAY,
    timezone: 'Asia/Makassar',
    shiftLabel: 'Plumbing Riser Shift (08:00–16:00 WITA)',
    shiftStartUtcMs: Date.parse('2026-11-20T00:00:00.000Z'),
    eligibility: 'scheduled',
    assignedMandorUserIds: ['demo-user-mandor'],
  },
  {
    id: 'demo-shift-civil-yesterday-1',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-worker',
    workerName: 'Raka Pratama',
    division: 'Civil',
    teamId: 'team-civil-a',
    workDate: DEMO_YESTERDAY,
    timezone: 'Asia/Makassar',
    shiftLabel: 'Morning Civil Shift (08:00–16:00 WITA)',
    shiftStartUtcMs: Date.parse('2026-11-19T00:00:00.000Z'),
    eligibility: 'scheduled',
    assignedMandorUserIds: ['demo-user-mandor'],
  },
  {
    id: 'demo-shift-civil-yesterday-2',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-mandor',
    workerName: 'Hendra Kusuma',
    division: 'Civil',
    teamId: 'team-civil-a',
    workDate: DEMO_YESTERDAY,
    timezone: 'Asia/Makassar',
    shiftLabel: 'Morning Civil Shift (08:00–16:00 WITA)',
    shiftStartUtcMs: Date.parse('2026-11-19T00:00:00.000Z'),
    eligibility: 'scheduled',
    assignedMandorUserIds: ['demo-user-mandor'],
  },
  {
    id: 'demo-shift-elec-yesterday-1',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-elec-worker',
    workerName: 'Hendra Wijaya',
    division: 'Electrical',
    teamId: 'team-elec-a',
    workDate: DEMO_YESTERDAY,
    timezone: 'Asia/Makassar',
    shiftLabel: 'Electrical Rough-In Shift (08:00–16:00 WITA)',
    shiftStartUtcMs: Date.parse('2026-11-19T00:00:00.000Z'),
    eligibility: 'scheduled',
    assignedMandorUserIds: ['demo-user-mandor'],
  },
  {
    id: 'demo-shift-plumb-yesterday-1',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-plumb-worker',
    workerName: 'Dedi Kurniawan',
    division: 'Plumbing',
    teamId: 'team-plumb-a',
    workDate: DEMO_YESTERDAY,
    timezone: 'Asia/Makassar',
    shiftLabel: 'Plumbing Riser Shift (08:00–16:00 WITA)',
    shiftStartUtcMs: Date.parse('2026-11-19T00:00:00.000Z'),
    eligibility: 'scheduled',
    assignedMandorUserIds: ['demo-user-mandor'],
  },
];

const INITIAL_DEMO_RECORDS: Record<string, AttendanceRecordState> = {
  'demo-shift-civil-yesterday-1': {
    obligationId: 'demo-shift-civil-yesterday-1',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-worker',
    workDate: DEMO_YESTERDAY,
    division: 'Civil',
    status: 'present',
    checkInReceivedAtUtcMs: Date.parse('2026-11-19T00:14:00.000Z'),
    effectiveAtUtcMs: Date.parse('2026-11-19T00:14:00.000Z'),
    recordedAtUtcMs: Date.parse('2026-11-19T00:14:00.000Z'),
    markedBy: 'worker',
    version: 1,
  },
  'demo-shift-civil-yesterday-2': {
    obligationId: 'demo-shift-civil-yesterday-2',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-mandor',
    workDate: DEMO_YESTERDAY,
    division: 'Civil',
    status: 'izin',
    checkInReceivedAtUtcMs: null,
    effectiveAtUtcMs: Date.parse('2026-11-19T01:00:00.000Z'),
    recordedAtUtcMs: Date.parse('2026-11-19T01:25:00.000Z'),
    markedBy: 'mandor_approval',
    version: 2,
  },
  'demo-shift-elec-yesterday-1': {
    obligationId: 'demo-shift-elec-yesterday-1',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-elec-worker',
    workDate: DEMO_YESTERDAY,
    division: 'Electrical',
    status: 'alfa',
    checkInReceivedAtUtcMs: null,
    effectiveAtUtcMs: Date.parse('2026-11-19T01:00:00.000Z'),
    recordedAtUtcMs: Date.parse('2026-11-19T01:00:05.000Z'),
    markedBy: 'system_cutoff',
    version: 1,
  },
  'demo-shift-plumb-yesterday-1': {
    obligationId: 'demo-shift-plumb-yesterday-1',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-plumb-worker',
    workDate: DEMO_YESTERDAY,
    division: 'Plumbing',
    status: 'present',
    checkInReceivedAtUtcMs: Date.parse('2026-11-19T00:22:00.000Z'),
    effectiveAtUtcMs: Date.parse('2026-11-19T00:22:00.000Z'),
    recordedAtUtcMs: Date.parse('2026-11-19T00:22:00.000Z'),
    markedBy: 'worker',
    version: 1,
  },
  'demo-shift-elec-today': {
    obligationId: 'demo-shift-elec-today',
    projectId: 'paviliun-kerja',
    workerUserId: 'demo-user-elec-worker',
    workDate: DEMO_TODAY,
    division: 'Electrical',
    status: 'present',
    checkInReceivedAtUtcMs: Date.parse('2026-11-20T00:18:00.000Z'),
    effectiveAtUtcMs: Date.parse('2026-11-20T00:18:00.000Z'),
    recordedAtUtcMs: Date.parse('2026-11-20T00:18:00.000Z'),
    markedBy: 'worker',
    version: 1,
  },
};

export interface DemoAddendumContextValue {
  members: DemoPersonaMember[];
  activePersona: DemoPersonaMember;
  switchPersona: (accountId: string) => void;
  updateDemoMemberGrants: (
    userId: string,
    patch: Partial<
      Pick<
        DemoPersonaMember,
        'canDownloadWorkspaceView' | 'canShareWorkspaceView' | 'hasMandorGrant' | 'status'
      >
    >
  ) => void;
  toggleMemberForemanRole: (
    memberUserId: string,
    makeForeman: boolean
  ) => { ok: boolean; message: string };
  invitations: ScopedInvitationRecord[];
  lookupDemoInviteEmail: (email: string) => ExactEmailLookupResult;
  sendDemoInvitation: (input: {
    email: string;
    requestedStandardRole?: 'worker' | 'foreman' | null;
  }) => { ok: true; invitation: ScopedInvitationRecord } | { ok: false; message: string };
  acceptDemoInvitation: (invitationId: string) => { ok: boolean; message: string };
  revokeDemoInvitation: (invitationId: string) => void;
  capabilities: {
    canDrawLocally: boolean;
    canDownloadWorkspaceView: boolean;
    canShareWorkspaceView: boolean;
    canManageGrants: boolean;
    isMandor: boolean;
  };
  /** Internal demo reference timestamp (kept out of user-facing Attendance UI) */
  demoClockUtcMs: number;
  setDemoClockUtcMs: (utcMs: number) => void;
  shifts: AttendanceShiftObligation[];
  records: Record<string, AttendanceRecordState>;
  izinRequests: IzinRequestRecord[];
  evidencePhotos: Record<string, DemoIzinPhotoItem>;
  dailySelfies: Record<string, DemoDailySelfieItem>;
  history: AttendanceHistoryEntry[];
  checkInDemoShift: (obligationId: string, selfieDataUrl?: string) => { ok: boolean; message: string };
  recordManualSelfieCheckIn: (input: {
    workerUserId: string;
    workDate: string;
    selfieDataUrl: string;
  }) => { ok: boolean; message: string };
  applyManualAttendanceCorrection: (input: {
    obligationId: string;
    nextStatus: 'present' | 'alfa';
    reason: string;
    evidenceNote: string;
  }) => { ok: boolean; message: string };
  uploadDemoIzinPhoto: (file: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    previewDataUrl: string;
  }) => DemoIzinPhotoItem;
  submitDemoIzin: (input: {
    obligationId: string;
    reason: string;
    evidencePhotoIds: string[];
  }) => { ok: boolean; message: string };
  decideDemoIzin: (input: {
    izinId: string;
    decision: 'approve' | 'reject';
    rejectionReason?: string;
  }) => { ok: boolean; message: string };
  getDemoDepartmentAttendance: (division: Department | 'All') => DepartmentAttendanceDayMetric[];
  budgetLedger: ProjectBudgetLedger;
  recordBudgetAllocation: (input: {
    departmentId: string;
    periodMonth: string;
    amount: number;
    note?: string;
  }) => { ok: boolean; message: string };
  postBudgetCharge: (input: {
    departmentId: string;
    periodMonth: string;
    postedDate: string;
    amount: number;
    description: string;
    sourceRecordId: string;
  }) => { ok: boolean; message: string };
  shares: DemoWorkspaceShare[];
  createDemoShare: (
    input: Omit<
      DemoWorkspaceShare,
      'id' | 'createdByUserId' | 'createdByName' | 'createdAt' | 'accessMode' | 'publicToken' | 'revokedAt'
    > & { accessMode?: WorkspaceShareAccessMode }
  ) => DemoWorkspaceShare;
  updateDemoShareAccess: (
    shareId: string,
    accessMode: WorkspaceShareAccessMode
  ) => DemoWorkspaceShare | null;
  revokeDemoShare: (shareId: string) => void;
  resolveDemoShare: (
    shareIdOrToken: string,
    options?: { asAnonymousVisitor?: boolean }
  ) => {
    ok: boolean;
    share?: DemoWorkspaceShare;
    errorCode?: 'NOT_FOUND' | 'ACCESS_DENIED' | 'REVOKED';
    errorMessage?: string;
  };
}

const DemoAddendumContext = createContext<DemoAddendumContextValue | null>(null);

export const DemoAddendumProvider: React.FC<{ children: React.ReactNode; lockedRole?: DemoRole | null }> = ({ children, lockedRole }) => {
  const [members, setMembers] = useState<DemoPersonaMember[]>(() => {
    const saved = readStoredDemoMembers(INITIAL_DEMO_MEMBERS);
    return [...saved, ...INITIAL_DEMO_MEMBERS.filter(member=>!saved.some(m=>m.accountId===member.accountId))];
  });
  const [activeAccountId, setActiveAccountId] = useState<string>(() =>
    readStoredActiveAccountId('demo-acct-contractor')
  );
  const [demoClockUtcMs, setDemoClockUtcMs] = useState<number>(
    Date.parse('2026-11-20T00:45:00.000Z')
  );
  const [shifts] = useState<AttendanceShiftObligation[]>(INITIAL_DEMO_SHIFTS);
  const [records, setRecords] = useState<Record<string, AttendanceRecordState>>(INITIAL_DEMO_RECORDS);
  const [izinRequests, setIzinRequests] = useState<IzinRequestRecord[]>([]);
  const [evidencePhotos, setEvidencePhotos] = useState<Record<string, DemoIzinPhotoItem>>({});
  const [dailySelfies, setDailySelfies] = useState<Record<string, DemoDailySelfieItem>>({});
  const [invitations, setInvitations] = useState<ScopedInvitationRecord[]>([]);
  const [budgetLedger, setBudgetLedger] = useState<ProjectBudgetLedger>(() =>
    createDemoBudgetLedger('proj-paviliun-kerja-a03', seedDefaultDepartments('proj-paviliun-kerja-a03'))
  );
  const [sharesMap, setSharesMap] = useState<Record<string, DemoWorkspaceShare>>(() =>
    readStoredDemoShares()
  );
  const [history, setHistory] = useState<AttendanceHistoryEntry[]>([
    {
      id: 'demo-hist-1',
      projectId: 'paviliun-kerja',
      obligationId: 'demo-shift-civil-yesterday-1',
      workerUserId: 'demo-user-worker',
      workDate: DEMO_YESTERDAY,
      eventType: 'checkin_accepted',
      actorType: 'worker',
      actorUserId: 'demo-user-worker',
      actorName: 'Raka Pratama',
      occurredAt: '2026-11-19T00:14:00.000Z',
      summary: 'Checked in Present at 08:14 WITA.',
      metadata: {},
    },
  ]);

  const activePersona = useMemo(
    () => {
      const account = demoAccounts.find(a=>a.role===lockedRole);
      const member = members.find(m=>m.accountId === (account ? 'demo-acct-'+lockedRole : activeAccountId)) ?? members[0];
      return account ? {...member, displayName:account.name, email:account.email} : member;
    },
    [members, activeAccountId, lockedRole]
  );

  const switchPersona = useCallback((nextAccountId: string) => {
    if (lockedRole) return;
    clearTemporaryDrawingMemory();
    writeStoredActiveAccountId(nextAccountId);
    setActiveAccountId(nextAccountId);
  }, [lockedRole]);

  const updateDemoMemberGrants = useCallback(
    (
      userId: string,
      patch: Partial<
        Pick<
          DemoPersonaMember,
          'canDownloadWorkspaceView' | 'canShareWorkspaceView' | 'hasMandorGrant' | 'status'
        >
      >
    ) => {
      setMembers((prev) => {
        const next = prev.map((m) => (m.userId === userId ? { ...m, ...patch } : m));
        writeStoredDemoMembers(next);
        return next;
      });
    },
    []
  );

  const toggleMemberForemanRole = useCallback(
    (memberUserId: string, makeForeman: boolean): { ok: boolean; message: string } => {
      const target = members.find((m) => m.userId === memberUserId);
      if (!target) return { ok: false, message: 'Member not found.' };
      if (!canToggleMemberWorkerForeman(activePersona.role, activePersona.status, target.role, target.status)) {
        return {
          ok: false,
          message:
            target.role !== 'worker'
              ? `Dedicated ${target.role} accounts cannot be switched between Worker and Foreman.`
              : 'Only an active Owner, Contractor, or Architect can change Worker/Foreman assignments.',
        };
      }
      setMembers((prev) => {
        const next = prev.map((m) =>
          m.userId === memberUserId ? { ...m, hasMandorGrant: makeForeman } : m
        );
        writeStoredDemoMembers(next);
        return next;
      });
      return {
        ok: true,
        message: `${target.displayName} is now assigned as ${makeForeman ? 'Foreman' : 'Worker'}.`,
      };
    },
    [members, activePersona.role, activePersona.status]
  );

  const lookupDemoInviteEmail = useCallback(
    (email: string): ExactEmailLookupResult =>
      lookupAccountByExactEmail({
        actorRole: activePersona.role,
        actorStatus: activePersona.status,
        email,
        directory: DEMO_REGISTERED_DIRECTORY,
        projectMembers: members.map((m) => ({
          membershipId: m.membershipId,
          userId: m.userId,
          email: m.email,
          displayName: m.displayName,
          role: m.role,
          hasMandorGrant: m.hasMandorGrant,
          status: m.status,
        })),
      }),
    [activePersona.role, activePersona.status, members]
  );

  const sendDemoInvitation = useCallback(
    (input: { email: string; requestedStandardRole?: 'worker' | 'foreman' | null }) => {
      const res = createScopedInvitation({
        projectId: 'proj-paviliun-kerja-a03',
        projectName: 'Paviliun Kerja',
        actorUserId: activePersona.userId,
        actorName: activePersona.displayName,
        actorRole: activePersona.role,
        actorStatus: activePersona.status,
        recipientEmail: input.email,
        requestedStandardRole: input.requestedStandardRole,
        directory: DEMO_REGISTERED_DIRECTORY,
        projectMembers: members.map((m) => ({
          membershipId: m.membershipId,
          userId: m.userId,
          email: m.email,
          displayName: m.displayName,
          role: m.role,
          hasMandorGrant: m.hasMandorGrant,
          status: m.status,
        })),
        existingInvitations: invitations,
        deliveryMode: 'simulated_demo',
      });
      if (!res.ok) return { ok: false as const, message: res.message };
      setInvitations((prev) => [res.invitation, ...prev]);
      return { ok: true as const, invitation: res.invitation };
    },
    [activePersona, members, invitations]
  );

  const acceptDemoInvitation = useCallback(
    (invitationId: string): { ok: boolean; message: string } => {
      const inv = invitations.find((i) => i.id === invitationId);
      if (!inv) return { ok: false, message: 'Invitation not found.' };
      const res = acceptScopedInvitation({
        invitation: inv,
        recipientEmail: inv.recipientEmail,
        recipientUserId: inv.recipientUserId,
      });
      if (!res.ok) return { ok: false, message: res.message };
      setInvitations((prev) =>
        prev.map((i) => (i.id === invitationId ? res.updatedInvitation : i))
      );
      const dirEntry = DEMO_REGISTERED_DIRECTORY.find((d) => d.userId === inv.recipientUserId);
      const todayIso = new Date().toISOString().slice(0, 10);
      setMembers((prev) => {
        if (prev.some((m) => m.userId === inv.recipientUserId)) return prev;
        const added: DemoPersonaMember = {
          accountId: `demo-acct-${inv.recipientUserId}`,
          userId: inv.recipientUserId,
          membershipId: `mem-${Date.now().toString(36)}`,
          workerCode: dirEntry?.workerCode ?? `MEM-${String(prev.length + 1).padStart(3, '0')}`,
          displayName: inv.recipientDisplayName,
          email: inv.recipientEmail,
          role: res.grantedMembership.role,
          profession: dirEntry?.profession ?? inv.assignedRole,
          joinedAt: todayIso,
          status: 'active',
          hasMandorGrant: res.grantedMembership.hasMandorGrant,
          hasAccountingGrant: res.grantedMembership.role === 'accounting',
          canDownloadWorkspaceView:
            res.grantedMembership.role === 'owner' || isProjectLead(res.grantedMembership.role),
          canShareWorkspaceView:
            res.grantedMembership.role === 'owner' || isProjectLead(res.grantedMembership.role),
          division: 'Civil',
          teamId: 'team-civil-a',
        };
        const next = [...prev, added];
        writeStoredDemoMembers(next);
        return next;
      });
      return {
        ok: true,
        message: `${inv.recipientDisplayName} joined Paviliun Kerja as ${
          res.grantedMembership.hasMandorGrant ? 'Foreman' : res.grantedMembership.role
        }.`,
      };
    },
    [invitations]
  );

  const revokeDemoInvitation = useCallback((invitationId: string) => {
    setInvitations((prev) =>
      prev.map((i) =>
        i.id === invitationId
          ? { ...i, status: 'revoked', revokedAt: new Date().toISOString() }
          : i
      )
    );
  }, []);

  const capabilities = useMemo(
    () => ({
      canDrawLocally: canDrawLocally(activePersona),
      canDownloadWorkspaceView: canDownloadWorkspaceView(activePersona),
      canShareWorkspaceView: canShareWorkspaceView(activePersona),
      canManageGrants: canManageWorkspaceOutputGrants(activePersona),
      isMandor: activePersona.hasMandorGrant && activePersona.status === 'active',
    }),
    [activePersona]
  );

  const checkInDemoShift = useCallback(
    (obligationId: string, selfieDataUrl?: string): { ok: boolean; message: string } => {
      const shift = shifts.find((s) => s.id === obligationId);
      if (!shift) return { ok: false, message: 'Shift not found.' };
      const existingRecord = records[shift.id] ?? null;
      const existingIzin = izinRequests.find((r) => r.obligationId === shift.id) ?? null;

      const evalRes = evaluateCheckInAttempt({
        shift,
        existingRecord,
        existingIzin,
        serverReceiptUtcMs: demoClockUtcMs,
      });

      if (!evalRes.accepted) {
        if (evalRes.code === 'PAST_CUTOFF' && !existingRecord) {
          const cutoff = computeShiftCutoffUtcMs(shift)!;
          setRecords((prev) => ({
            ...prev,
            [shift.id]: {
              obligationId: shift.id,
              projectId: shift.projectId,
              workerUserId: shift.workerUserId,
              workDate: shift.workDate,
              division: shift.division,
              status: 'alfa',
              checkInReceivedAtUtcMs: null,
              effectiveAtUtcMs: cutoff,
              recordedAtUtcMs: demoClockUtcMs,
              markedBy: 'system_cutoff',
              version: 1,
            },
          }));
        }
        return { ok: false, message: evalRes.message };
      }

      setRecords((prev) => ({ ...prev, [shift.id]: evalRes.nextRecord }));
      if (selfieDataUrl) {
        const key = `${shift.workerUserId}::${shift.workDate}`;
        setDailySelfies((prev) => ({
          ...prev,
          [key]: {
            workerUserId: shift.workerUserId,
            workDate: shift.workDate,
            dataUrl: selfieDataUrl,
            capturedAt: new Date(demoClockUtcMs).toISOString(),
            capturedByUserId: activePersona.userId,
          },
        }));
      }
      setHistory((prev) => [
        {
          id: `demo-hist-${Date.now()}`,
          projectId: shift.projectId,
          obligationId: shift.id,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          eventType: 'checkin_accepted',
          actorType: 'worker',
          actorUserId: activePersona.userId,
          actorName: activePersona.displayName,
          occurredAt: new Date(demoClockUtcMs).toISOString(),
          summary: `Checked in Present for ${shift.workerName} at ${formatInstantInProjectZone(demoClockUtcMs, shift.timezone)}.`,
          metadata: { selfieCaptured: Boolean(selfieDataUrl) },
        },
        ...prev,
      ]);
      return {
        ok: true,
        message: `Checked in Present for ${shift.workerName} (${formatInstantInProjectZone(demoClockUtcMs, shift.timezone)}).`,
      };
    },
    [shifts, records, izinRequests, demoClockUtcMs, activePersona]
  );

  const recordManualSelfieCheckIn = useCallback(
    (input: {
      workerUserId: string;
      workDate: string;
      selfieDataUrl: string;
    }): { ok: boolean; message: string } => {
      const targetMember = members.find((m) => m.userId === input.workerUserId);
      if (!targetMember) return { ok: false, message: 'Worker ID not found in this project.' };
      if (targetMember.role === 'owner') {
        return {
          ok: false,
          message: 'Project Owners are exempt from daily worker attendance schedules.',
        };
      }
      if (!input.selfieDataUrl || !input.selfieDataUrl.startsWith('data:image/')) {
        return {
          ok: false,
          message: 'Capture a fresh daily selfie before confirming attendance.',
        };
      }
      const isSelf = activePersona.userId === targetMember.userId;
      const canRecordForOther =
        isProjectLead(activePersona.role) ||
        (activePersona.hasMandorGrant && activePersona.division === targetMember.division);
      if (!isSelf && !canRecordForOther) {
        return {
          ok: false,
          message: 'Workers can only record attendance for themselves. Foreman/Contractor authority is required for team check-in.',
        };
      }
      const shift = shifts.find(
        (s) => s.workerUserId === input.workerUserId && s.workDate === input.workDate
      );
      if (!shift) {
        return {
          ok: false,
          message: `No scheduled shift found for ${targetMember.displayName} on ${input.workDate}.`,
        };
      }
      return checkInDemoShift(shift.id, input.selfieDataUrl);
    },
    [members, activePersona, shifts, checkInDemoShift]
  );

  const applyManualAttendanceCorrection = useCallback(
    (input: {
      obligationId: string;
      nextStatus: 'present' | 'alfa';
      reason: string;
      evidenceNote: string;
    }): { ok: boolean; message: string } => {
      const shift = shifts.find((s) => s.id === input.obligationId);
      if (!shift) return { ok: false, message: 'Shift record not found.' };
      const reason = input.reason.trim();
      const evidenceNote = input.evidenceNote.trim();
      if (!reason) return { ok: false, message: 'A correction reason is required.' };
      if (!evidenceNote) return { ok: false, message: 'Validated daily evidence reference is required.' };
      const canCorrect =
        isProjectLead(activePersona.role) ||
        (activePersona.hasMandorGrant && shift.assignedMandorUserIds.includes(activePersona.userId));
      if (!canCorrect) {
        return {
          ok: false,
          message: 'Only an authorized Contractor or assigned Foreman can apply manual attendance corrections.',
        };
      }

      const prevRec = records[shift.id] ?? null;
      const formerStatus = prevRec?.status ?? 'no_record_yet';
      const nowIso = new Date().toISOString();

      setRecords((prev) => ({
        ...prev,
        [shift.id]: {
          obligationId: shift.id,
          projectId: shift.projectId,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate, // Preserve original project-local work date!
          division: shift.division,
          status: input.nextStatus,
          checkInReceivedAtUtcMs: prevRec?.checkInReceivedAtUtcMs ?? null,
          effectiveAtUtcMs: prevRec?.effectiveAtUtcMs ?? computeShiftCutoffUtcMs(shift) ?? Date.now(),
          recordedAtUtcMs: Date.now(),
          markedBy: 'manual_correction',
          version: (prevRec?.version ?? 0) + 1,
        },
      }));

      setHistory((prev) => [
        {
          id: `demo-hist-${Date.now()}`,
          projectId: shift.projectId,
          obligationId: shift.id,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          eventType: 'manual_correction',
          actorType: 'mandor',
          actorUserId: activePersona.userId,
          actorName: activePersona.displayName,
          occurredAt: nowIso,
          summary: `Manual correction for ${shift.workerName} (${shift.workDate}): ${formerStatus} → ${input.nextStatus}. Reason: ${reason}`,
          metadata: {
            formerStatus,
            nextStatus: input.nextStatus,
            evidenceRef: evidenceNote,
          },
        },
        ...prev,
      ]);

      return {
        ok: true,
        message: `Updated ${shift.workerName} on ${shift.workDate} from ${formerStatus} to ${input.nextStatus} (original work date preserved).`,
      };
    },
    [shifts, records, activePersona]
  );

  const uploadDemoIzinPhoto = useCallback(
    (file: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      previewDataUrl: string;
    }): DemoIzinPhotoItem => {
      const item: DemoIzinPhotoItem = {
        id: `demo-photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        workerUserId: activePersona.userId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        previewDataUrl: file.previewDataUrl,
        uploadedAt: new Date(demoClockUtcMs).toISOString(),
      };
      setEvidencePhotos((prev) => ({ ...prev, [item.id]: item }));
      return item;
    },
    [activePersona.userId, demoClockUtcMs]
  );

  const submitDemoIzin = useCallback(
    (input: {
      obligationId: string;
      reason: string;
      evidencePhotoIds: string[];
    }): { ok: boolean; message: string } => {
      const shift = shifts.find((s) => s.id === input.obligationId);
      if (!shift) return { ok: false, message: 'Shift not found.' };
      const reason = input.reason.trim();
      if (!reason) return { ok: false, message: 'Enter a short reason for your izin request.' };
      if (input.evidencePhotoIds.length === 0) {
        return { ok: false, message: 'Attach at least one photo or PDF document before submitting izin.' };
      }

      const existingRec = records[shift.id] ?? null;
      const isConflict = existingRec?.status === 'present';
      const hasEligibleMandor = shift.assignedMandorUserIds.some((mid) => {
        if (mid === shift.workerUserId) return false;
        const m = members.find((mem) => mem.userId === mid);
        return Boolean(m && m.status === 'active' && m.hasMandorGrant);
      });

      const status: IzinRequestStatus = isConflict
        ? 'conflict_requires_correction'
        : hasEligibleMandor
          ? 'pending'
          : 'awaiting_mandor_assignment';

      const req: IzinRequestRecord = {
        id: `demo-izin-${Date.now()}`,
        obligationId: shift.id,
        projectId: shift.projectId,
        workerUserId: shift.workerUserId,
        workerName: shift.workerName,
        division: shift.division,
        teamId: shift.teamId,
        workDate: shift.workDate,
        reason,
        evidencePhotoIds: [...input.evidencePhotoIds],
        status,
        submittedAtUtcMs: demoClockUtcMs,
        reviewedAtUtcMs: null,
        reviewedByUserId: null,
        reviewedByName: null,
        rejectionReason: null,
        requiresCorrectionWorkflow: isConflict,
        version: 1,
      };

      setIzinRequests((prev) => [req, ...prev.filter((r) => r.obligationId !== shift.id)]);
      setHistory((prev) => [
        {
          id: `demo-hist-${Date.now()}`,
          projectId: shift.projectId,
          obligationId: shift.id,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          eventType: isConflict ? 'izin_conflict_routed_to_correction' : 'izin_submitted',
          actorType: 'worker',
          actorUserId: activePersona.userId,
          actorName: activePersona.displayName,
          occurredAt: new Date(demoClockUtcMs).toISOString(),
          summary: isConflict
            ? 'Leave request submitted for an already-Present shift — routed to correction workflow.'
            : `Leave request submitted with ${input.evidencePhotoIds.length} private file(s) — Leave request pending.`,
          metadata: {},
        },
        ...prev,
      ]);

      const derived = deriveEffectiveAttendanceStatus({
        shift,
        record: existingRec,
        izin: req,
        nowUtcMs: demoClockUtcMs,
      });

      return {
        ok: true,
        message: isConflict
          ? 'Routed to attendance correction workflow (shift already marked Present).'
          : `Leave request submitted (Leave request pending; Attendance remains ${
              derived.attendanceStatus === 'no_record_yet'
                ? 'Pending check-in'
                : derived.attendanceStatus === 'alfa'
                  ? 'Absent'
                  : derived.attendanceStatus === 'izin'
                    ? 'Approved leave'
                    : derived.attendanceStatus
            }).`,
      };
    },
    [shifts, records, members, demoClockUtcMs, activePersona]
  );

  const decideDemoIzin = useCallback(
    (input: {
      izinId: string;
      decision: 'approve' | 'reject';
      rejectionReason?: string;
    }): { ok: boolean; message: string } => {
      const izin = izinRequests.find((r) => r.id === input.izinId);
      if (!izin) return { ok: false, message: 'Izin request not found.' };
      const shift = shifts.find((s) => s.id === izin.obligationId);
      if (!shift) return { ok: false, message: 'Shift not found.' };

      const authCheck = canDecideIzinForShift({
        reviewerUserId: activePersona.userId,
        reviewerMembership: activePersona,
        shift,
      });
      if (!authCheck.allowed) {
        return { ok: false, message: authCheck.reason };
      }

      if (input.decision === 'reject') {
        const reason = (input.rejectionReason ?? '').trim();
        if (!reason) {
          return { ok: false, message: 'Provide a rejection reason before rejecting.' };
        }
        setIzinRequests((prev) =>
          prev.map((r) =>
            r.id === izin.id
              ? {
                  ...r,
                  status: 'rejected',
                  reviewedAtUtcMs: demoClockUtcMs,
                  reviewedByUserId: activePersona.userId,
                  reviewedByName: activePersona.displayName,
                  rejectionReason: reason,
                  version: r.version + 1,
                }
              : r
          )
        );
        setHistory((prev) => [
          {
            id: `demo-hist-${Date.now()}`,
            projectId: shift.projectId,
            obligationId: shift.id,
            workerUserId: shift.workerUserId,
            workDate: shift.workDate,
            eventType: 'izin_rejected',
            actorType: 'mandor',
            actorUserId: activePersona.userId,
            actorName: activePersona.displayName,
            occurredAt: new Date(demoClockUtcMs).toISOString(),
            summary: `Leave request rejected by Foreman (${activePersona.displayName}).`,
            metadata: {},
          },
          ...prev,
        ]);
        return { ok: true, message: 'Leave request rejected. Attendance status remains unchanged.' };
      }

      const existingRec = records[shift.id] ?? null;
      if (existingRec?.status === 'present') {
        return {
          ok: false,
          message: 'Shift is already marked Present. Resolve via attendance correction workflow.',
        };
      }

      setIzinRequests((prev) =>
        prev.map((r) =>
          r.id === izin.id
            ? {
                ...r,
                status: 'approved',
                reviewedAtUtcMs: demoClockUtcMs,
                reviewedByUserId: activePersona.userId,
                reviewedByName: activePersona.displayName,
                rejectionReason: null,
                version: r.version + 1,
              }
            : r
        )
      );

      setRecords((prev) => ({
        ...prev,
        [shift.id]: {
          obligationId: shift.id,
          projectId: shift.projectId,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          division: shift.division,
          status: 'izin',
          checkInReceivedAtUtcMs: existingRec?.checkInReceivedAtUtcMs ?? null,
          effectiveAtUtcMs:
            existingRec?.effectiveAtUtcMs ?? computeShiftCutoffUtcMs(shift) ?? demoClockUtcMs,
          recordedAtUtcMs: demoClockUtcMs,
          markedBy: 'mandor_approval',
          version: (existingRec?.version ?? 0) + 1,
        },
      }));

      setHistory((prev) => [
        {
          id: `demo-hist-${Date.now()}`,
          projectId: shift.projectId,
          obligationId: shift.id,
          workerUserId: shift.workerUserId,
          workDate: shift.workDate,
          eventType: 'izin_approved',
          actorType: 'mandor',
          actorUserId: activePersona.userId,
          actorName: activePersona.displayName,
          occurredAt: new Date(demoClockUtcMs).toISOString(),
          summary: `Leave approved by Foreman (${activePersona.displayName}). Original workday (${shift.workDate}) marked Approved leave.`,
          metadata: {},
        },
        ...prev,
      ]);

      return {
        ok: true,
        message: 'Leave approved. Attendance updated to Approved leave for the original workday.',
      };
    },
    [izinRequests, shifts, activePersona, demoClockUtcMs, records]
  );

  const getDemoDepartmentAttendance = useCallback(
    (division: Department | 'All'): DepartmentAttendanceDayMetric[] => {
      const recMap = new Map<string, AttendanceRecordState>(Object.entries(records));
      const izinMap = new Map<string, IzinRequestRecord>();
      for (const req of izinRequests) {
        izinMap.set(req.obligationId, req);
      }
      return [DEMO_TODAY, DEMO_YESTERDAY].map((workDate) =>
        computeDepartmentDailyAttendance({
          shifts,
          recordsByObligationId: recMap,
          izinByObligationId: izinMap,
          workDate,
          timezone: 'Asia/Makassar',
          division,
          nowUtcMs: demoClockUtcMs,
        })
      );
    },
    [shifts, records, izinRequests, demoClockUtcMs]
  );

  const recordBudgetAllocation = useCallback(
    (input: { departmentId: string; periodMonth: string; amount: number; note?: string }) => {
      if (!isProjectLead(activePersona.role) && activePersona.role !== 'accounting' && !activePersona.hasAccountingGrant) return {ok:false,message:'Accounting access is required.'};
      if (!Number.isFinite(input.amount) || input.amount < 0) {
        return { ok: false, message: 'Allocation amount must be 0 or greater.' };
      }
      const entry: BudgetAllocationEntry = {
        id: `alloc-${input.periodMonth}-${input.departmentId}`,
        projectId: budgetLedger.projectId,
        departmentId: input.departmentId,
        periodMonth: input.periodMonth,
        amount: Math.round(input.amount),
        currency: budgetLedger.currency,
        actorName: activePersona.displayName,
        recordedAt: new Date().toISOString(),
        note: input.note?.trim(),
      };
      setBudgetLedger((prev) => ({
        ...prev,
        allocations: [
          ...prev.allocations.filter((a) => a.id !== entry.id),
          entry,
        ],
      }));
      return { ok: true, message: `Recorded monthly allocation for ${input.periodMonth}.` };
    },
    [budgetLedger.projectId, budgetLedger.currency, activePersona]
  );

  const postBudgetCharge = useCallback(
    (input: {
      departmentId: string;
      periodMonth: string;
      postedDate: string;
      amount: number;
      description: string;
      sourceRecordId: string;
    }) => {
      if (!isProjectLead(activePersona.role) && activePersona.role !== 'accounting' && !activePersona.hasAccountingGrant) return {ok:false,message:'Accounting access is required.'};
      if (!Number.isFinite(input.amount) || input.amount === 0) {
        return { ok: false, message: 'Charge amount must be non-zero.' };
      }
      const charge: BudgetPostedCharge = {
        id: `chg-${Date.now().toString(36)}`,
        sourceRecordId: input.sourceRecordId.trim() || `ISS-${Date.now()}`,
        projectId: budgetLedger.projectId,
        departmentId: input.departmentId,
        periodMonth: input.periodMonth,
        postedDate: input.postedDate,
        amount: Math.round(input.amount),
        currency: budgetLedger.currency,
        kind: input.amount < 0 ? 'reversal' : 'internal_usage',
        description: input.description.trim() || 'Posted department material usage',
        actorName: activePersona.displayName,
      };
      setBudgetLedger((prev) => ({
        ...prev,
        charges: [charge, ...prev.charges],
      }));
      return { ok: true, message: 'Posted department usage to budget ledger.' };
    },
    [budgetLedger.projectId, budgetLedger.currency, activePersona]
  );

  const createDemoShare = useCallback(
    (
      input: Omit<
        DemoWorkspaceShare,
        'id' | 'createdByUserId' | 'createdByName' | 'createdAt' | 'accessMode' | 'publicToken' | 'revokedAt'
      > & { accessMode?: WorkspaceShareAccessMode }
    ): DemoWorkspaceShare => {
      const accessMode: WorkspaceShareAccessMode = input.accessMode ?? 'restricted';
      const id = `demo-share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const share: DemoWorkspaceShare = {
        ...input,
        id,
        accessMode,
        publicToken: accessMode === 'anyone_with_link' ? makeOpaqueToken() : null,
        revokedAt: null,
        createdByUserId: activePersona.userId,
        createdByName: activePersona.displayName,
        createdAt: new Date().toISOString(),
      };
      const all = { ...readStoredDemoShares(), [share.id]: share };
      writeStoredDemoShares(all);
      setSharesMap(all);
      return share;
    },
    [activePersona]
  );

  const updateDemoShareAccess = useCallback(
    (shareId: string, accessMode: WorkspaceShareAccessMode): DemoWorkspaceShare | null => {
      const all = readStoredDemoShares();
      const existing = all[shareId];
      if (!existing) return null;
      const updated: DemoWorkspaceShare = {
        ...existing,
        accessMode,
        // Changing to restricted invalidates any previous public token immediately
        publicToken: accessMode === 'anyone_with_link' ? makeOpaqueToken() : null,
        revokedAt: null,
      };
      all[shareId] = updated;
      writeStoredDemoShares(all);
      setSharesMap({ ...all });
      return updated;
    },
    []
  );

  const revokeDemoShare = useCallback((shareId: string) => {
    const all = readStoredDemoShares();
    const existing = all[shareId];
    if (!existing) return;
    all[shareId] = {
      ...existing,
      revokedAt: new Date().toISOString(),
      publicToken: null,
    };
    writeStoredDemoShares(all);
    setSharesMap({ ...all });
  }, []);

  const resolveDemoShare = useCallback(
    (shareIdOrToken: string, options?: { asAnonymousVisitor?: boolean }) => {
      const all = readStoredDemoShares();
      // Match either by share ID or by active opaque public token
      const found =
        all[shareIdOrToken] ??
        Object.values(all).find((s) => s.publicToken && s.publicToken === shareIdOrToken);
      if (!found) {
        return {
          ok: false,
          errorCode: 'NOT_FOUND' as const,
          errorMessage: 'This shared view link does not exist or is no longer active.',
        };
      }
      if (found.revokedAt) {
        return {
          ok: false,
          errorCode: 'REVOKED' as const,
          errorMessage: 'This shared view link has been disabled by the project team.',
        };
      }
      if (found.accessMode === 'anyone_with_link') {
        // Must match active public token or share ID when active
        if (!found.publicToken) {
          return {
            ok: false,
            errorCode: 'REVOKED' as const,
            errorMessage: 'Public access to this link was revoked.',
          };
        }
        return { ok: true, share: found };
      }
      // Restricted mode: anonymous visitor denied; signed-in user must have active membership
      if (options?.asAnonymousVisitor || activePersona.status !== 'active') {
        return {
          ok: false,
          errorCode: 'ACCESS_DENIED' as const,
          errorMessage:
            'Restricted view. Sign in with an active project membership to open this shared view.',
        };
      }
      return { ok: true, share: found };
    },
    [activePersona.status]
  );

  const shares = useMemo(
    () => Object.values(sharesMap).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sharesMap]
  );

  const value = useMemo<DemoAddendumContextValue>(
    () => ({
      members,
      activePersona,
      switchPersona,
      updateDemoMemberGrants,
      toggleMemberForemanRole,
      invitations,
      lookupDemoInviteEmail,
      sendDemoInvitation,
      acceptDemoInvitation,
      revokeDemoInvitation,
      capabilities,
      demoClockUtcMs,
      setDemoClockUtcMs,
      shifts,
      records,
      izinRequests,
      evidencePhotos,
      dailySelfies,
      history,
      checkInDemoShift,
      recordManualSelfieCheckIn,
      applyManualAttendanceCorrection,
      uploadDemoIzinPhoto,
      submitDemoIzin,
      decideDemoIzin,
      getDemoDepartmentAttendance,
      budgetLedger,
      recordBudgetAllocation,
      postBudgetCharge,
      shares,
      createDemoShare,
      updateDemoShareAccess,
      revokeDemoShare,
      resolveDemoShare,
    }),
    [
      members,
      activePersona,
      switchPersona,
      updateDemoMemberGrants,
      toggleMemberForemanRole,
      invitations,
      lookupDemoInviteEmail,
      sendDemoInvitation,
      acceptDemoInvitation,
      revokeDemoInvitation,
      capabilities,
      demoClockUtcMs,
      shifts,
      records,
      izinRequests,
      evidencePhotos,
      dailySelfies,
      history,
      checkInDemoShift,
      recordManualSelfieCheckIn,
      applyManualAttendanceCorrection,
      uploadDemoIzinPhoto,
      submitDemoIzin,
      decideDemoIzin,
      getDemoDepartmentAttendance,
      budgetLedger,
      recordBudgetAllocation,
      postBudgetCharge,
      shares,
      createDemoShare,
      updateDemoShareAccess,
      revokeDemoShare,
      resolveDemoShare,
    ]
  );

  return <DemoAddendumContext.Provider value={value}>{children}</DemoAddendumContext.Provider>;
};

export function useOptionalDemoAddendum() { return useContext(DemoAddendumContext); }

export function useDemoAddendum(): DemoAddendumContextValue {
  const ctx = useContext(DemoAddendumContext);
  if (!ctx) {
    throw new Error('useDemoAddendum must be used within DemoAddendumProvider');
  }
  return ctx;
}
