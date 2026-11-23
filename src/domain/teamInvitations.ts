import type { MembershipStatus, ProjectRole } from './accountTypes';

export type RegisteredAccountType =
  | 'owner'
  | 'contractor'
  | 'architect'
  | 'accounting'
  | 'standard_worker';

export interface RegisteredAccountRecord {
  userId: string;
  email: string;
  displayName: string;
  accountType: RegisteredAccountType;
  workerCode?: string;
  profession?: string;
}

export interface ProjectMemberIdentity {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  role: ProjectRole;
  hasMandorGrant: boolean;
  status: MembershipStatus;
}

export interface ScopedInvitationRecord {
  id: string;
  projectId: string;
  projectName: string;
  recipientEmail: string;
  recipientUserId: string;
  recipientDisplayName: string;
  registeredAccountType: RegisteredAccountType;
  assignedRole: ProjectRole;
  assignAsForeman: boolean;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invitedByUserId: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  deliveryStatus: 'sent' | 'simulated_demo' | 'failed';
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isDedicatedAccountType(type: RegisteredAccountType): boolean {
  return type === 'owner' || type === 'contractor' || type === 'architect' || type === 'accounting';
}

export function mapAccountTypeToLockedRole(type: RegisteredAccountType): ProjectRole | null {
  switch (type) {
    case 'owner':
      return 'owner';
    case 'contractor':
      return 'contractor';
    case 'architect':
      return 'architect';
    case 'accounting':
      return 'accounting';
    case 'standard_worker':
      return null;
  }
}

export function formatAccountTypeLabel(type: RegisteredAccountType): string {
  switch (type) {
    case 'owner':
      return 'Owner';
    case 'contractor':
      return 'Contractor';
    case 'architect':
      return 'Architect';
    case 'accounting':
      return 'Accounting';
    case 'standard_worker':
      return 'Standard worker account';
  }
}

export function canInviteToProject(role: ProjectRole, status: MembershipStatus): boolean {
  if (status !== 'active') return false;
  return role === 'owner' || role === 'contractor' || role === 'architect';
}

export function canToggleMemberWorkerForeman(
  actorRole: ProjectRole,
  actorStatus: MembershipStatus,
  targetRole: ProjectRole,
  targetStatus: MembershipStatus
): boolean {
  if (actorStatus !== 'active' || targetStatus !== 'active') return false;
  if (actorRole !== 'owner' && actorRole !== 'contractor' && actorRole !== 'architect') {
    return false;
  }
  // Only standard worker memberships can toggle between Worker and Foreman;
  // dedicated Owner/Contractor/Architect/Accounting roles are strictly protected.
  return targetRole === 'worker';
}

export type ExactEmailLookupResult =
  | {
      ok: true;
      found: true;
      normalizedEmail: string;
      userId: string;
      displayName: string;
      registeredAccountType: RegisteredAccountType;
      registeredTypeStatement: string;
      lockedDedicatedRole: ProjectRole | null;
      existingMembership: {
        role: ProjectRole;
        hasMandorGrant: boolean;
        status: MembershipStatus;
      } | null;
    }
  | {
      ok: true;
      found: false;
      normalizedEmail: string;
      message: string;
    }
  | {
      ok: false;
      code: 'FORBIDDEN' | 'INVALID_EMAIL' | 'RATE_LIMITED';
      message: string;
    };

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Exact normalized server-style email lookup for scoped project invitations.
 * Never performs prefix search, never returns other accounts, and checks inviter authorization.
 */
export function lookupAccountByExactEmail(input: {
  actorRole: ProjectRole;
  actorStatus: MembershipStatus;
  email: string;
  directory: RegisteredAccountRecord[];
  projectMembers: ProjectMemberIdentity[];
  recentLookupCount?: number;
  maxLookupsPerWindow?: number;
}): ExactEmailLookupResult {
  if (!canInviteToProject(input.actorRole, input.actorStatus)) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Only an active Owner, Contractor, or Architect in this project can invite members.',
    };
  }
  const maxAllowed = input.maxLookupsPerWindow ?? 20;
  if ((input.recentLookupCount ?? 0) >= maxAllowed) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many account lookups. Wait a moment before checking another email.',
    };
  }
  const normalized = normalizeInviteEmail(input.email);
  if (!BASIC_EMAIL_RE.test(normalized)) {
    return {
      ok: false,
      code: 'INVALID_EMAIL',
      message: 'Enter a complete valid email address.',
    };
  }

  const found = input.directory.find(
    (entry) => normalizeInviteEmail(entry.email) === normalized
  );
  if (!found) {
    return {
      ok: true,
      found: false,
      normalizedEmail: normalized,
      message: 'Account not registered',
    };
  }

  const existing = input.projectMembers.find(
    (m) =>
      m.userId === found.userId ||
      normalizeInviteEmail(m.email) === normalized
  );

  const lockedDedicatedRole = mapAccountTypeToLockedRole(found.accountType);
  const typeLabel = formatAccountTypeLabel(found.accountType);

  return {
    ok: true,
    found: true,
    normalizedEmail: normalized,
    userId: found.userId,
    displayName: found.displayName,
    registeredAccountType: found.accountType,
    registeredTypeStatement: lockedDedicatedRole
      ? `This account is registered as ${typeLabel}.`
      : 'This account is registered as a standard worker account.',
    lockedDedicatedRole,
    existingMembership: existing
      ? {
          role: existing.role,
          hasMandorGrant: existing.hasMandorGrant,
          status: existing.status,
        }
      : null,
  };
}

export function createScopedInvitation(input: {
  projectId: string;
  projectName: string;
  actorUserId: string;
  actorName: string;
  actorRole: ProjectRole;
  actorStatus: MembershipStatus;
  recipientEmail: string;
  requestedStandardRole?: 'worker' | 'foreman' | null;
  directory: RegisteredAccountRecord[];
  projectMembers: ProjectMemberIdentity[];
  existingInvitations: ScopedInvitationRecord[];
  deliveryMode: 'sent' | 'simulated_demo' | 'failed';
  nowMs?: number;
}): { ok: true; invitation: ScopedInvitationRecord } | { ok: false; code: string; message: string } {
  const lookup = lookupAccountByExactEmail({
    actorRole: input.actorRole,
    actorStatus: input.actorStatus,
    email: input.recipientEmail,
    directory: input.directory,
    projectMembers: input.projectMembers,
  });

  if (!lookup.ok) {
    return { ok: false, code: lookup.code, message: lookup.message };
  }
  if (!lookup.found) {
    return { ok: false, code: 'NOT_REGISTERED', message: 'Account not registered.' };
  }
  if (lookup.existingMembership && lookup.existingMembership.status === 'active') {
    return {
      ok: false,
      code: 'ALREADY_MEMBER',
      message: `${lookup.displayName} is already an active member of this project.`,
    };
  }

  const duplicatePending = input.existingInvitations.find(
    (inv) =>
      inv.projectId === input.projectId &&
      normalizeInviteEmail(inv.recipientEmail) === lookup.normalizedEmail &&
      inv.status === 'pending'
  );
  if (duplicatePending) {
    return {
      ok: false,
      code: 'DUPLICATE_PENDING',
      message: `A pending invitation already exists for ${lookup.normalizedEmail} in this project.`,
    };
  }

  // Enforce dedicated role lock vs explicit Worker/Foreman choice for standard accounts
  let assignedRole: ProjectRole;
  let assignAsForeman = false;
  if (lookup.lockedDedicatedRole) {
    // Dedicated accounts retain their exact dedicated role; cannot be downgraded to worker/foreman
    if (input.requestedStandardRole) {
      return {
        ok: false,
        code: 'DEDICATED_ROLE_LOCKED',
        message: `Dedicated ${formatAccountTypeLabel(lookup.registeredAccountType)} accounts cannot be downgraded to Worker or Foreman.`,
      };
    }
    assignedRole = lookup.lockedDedicatedRole;
    assignAsForeman = false;
  } else {
    if (input.requestedStandardRole !== 'worker' && input.requestedStandardRole !== 'foreman') {
      return {
        ok: false,
        code: 'ROLE_SELECTION_REQUIRED',
        message: 'Select Worker or Foreman for a standard worker account before confirming.',
      };
    }
    assignedRole = 'worker';
    assignAsForeman = input.requestedStandardRole === 'foreman';
  }

  if (input.deliveryMode === 'failed') {
    return {
      ok: false,
      code: 'DELIVERY_FAILED',
      message: 'Invitation email could not be delivered. No invitation or membership was created.',
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const expiresMs = nowMs + 7 * 24 * 60 * 60 * 1000; // 7 days

  const invitation: ScopedInvitationRecord = {
    id: `inv-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    projectId: input.projectId,
    projectName: input.projectName,
    recipientEmail: lookup.normalizedEmail,
    recipientUserId: lookup.userId,
    recipientDisplayName: lookup.displayName,
    registeredAccountType: lookup.registeredAccountType,
    assignedRole,
    assignAsForeman,
    status: 'pending',
    invitedByUserId: input.actorUserId,
    invitedByName: input.actorName,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    acceptedAt: null,
    revokedAt: null,
    deliveryStatus: input.deliveryMode,
  };

  return { ok: true, invitation };
}

export function acceptScopedInvitation(input: {
  invitation: ScopedInvitationRecord;
  recipientEmail: string;
  recipientUserId: string;
  nowMs?: number;
}):
  | {
      ok: true;
      updatedInvitation: ScopedInvitationRecord;
      grantedMembership: {
        projectId: string;
        userId: string;
        role: ProjectRole;
        hasMandorGrant: boolean;
        status: 'active';
      };
    }
  | { ok: false; code: string; message: string } {
  const nowMs = input.nowMs ?? Date.now();
  if (input.invitation.status === 'revoked') {
    return { ok: false, code: 'INVITATION_REVOKED', message: 'This invitation has been revoked.' };
  }
  if (input.invitation.status === 'accepted') {
    return { ok: false, code: 'ALREADY_ACCEPTED', message: 'This invitation has already been accepted.' };
  }
  if (input.invitation.status === 'expired' || nowMs > Date.parse(input.invitation.expiresAt)) {
    return { ok: false, code: 'INVITATION_EXPIRED', message: 'This invitation has expired.' };
  }
  if (normalizeInviteEmail(input.recipientEmail) !== normalizeInviteEmail(input.invitation.recipientEmail)) {
    return {
      ok: false,
      code: 'RECIPIENT_MISMATCH',
      message: 'Sign in with the invited email address to accept this invitation.',
    };
  }

  const lockedRole = mapAccountTypeToLockedRole(input.invitation.registeredAccountType);
  const finalRole: ProjectRole = lockedRole ?? input.invitation.assignedRole;
  const finalForeman = lockedRole ? false : input.invitation.assignAsForeman;

  return {
    ok: true,
    updatedInvitation: {
      ...input.invitation,
      status: 'accepted',
      acceptedAt: new Date(nowMs).toISOString(),
    },
    grantedMembership: {
      projectId: input.invitation.projectId,
      userId: input.recipientUserId,
      role: finalRole,
      hasMandorGrant: finalForeman,
      status: 'active',
    },
  };
}

/**
 * Sample demo registered directory containing dedicated accounts (Owner, Contractor, Architect, Accounting)
 * and standard worker accounts so Team & Share invitation flows can be exercised end-to-end.
 */
export const DEMO_REGISTERED_DIRECTORY: RegisteredAccountRecord[] = [
  {
    userId: 'demo-user-contractor',
    email: 'budi.santoso@demo.vonta.local',
    displayName: 'Budi Santoso',
    accountType: 'contractor',
    profession: 'Site Contractor',
  },
  {
    userId: 'demo-user-owner',
    email: 'owner@demo.vonta.local',
    displayName: 'Nadia Wijaya',
    accountType: 'owner',
    profession: 'Project Owner',
  },
  {
    userId: 'demo-user-architect-ext',
    email: 'arin.putri@studio.vonta.local',
    displayName: 'Arin Putri',
    accountType: 'architect',
    profession: 'Principal Architect',
  },
  {
    userId: 'demo-user-owner-ext',
    email: 'daniels.owner@client.vonta.local',
    displayName: 'Daniel Sutanto',
    accountType: 'owner',
    profession: 'Project Owner',
  },
  {
    userId: 'demo-user-accounting-ext',
    email: 'maya.finance@vonta.local',
    displayName: 'Maya Lestari',
    accountType: 'accounting',
    profession: 'Project Accountant',
  },
  {
    userId: 'demo-user-worker-ext',
    email: 'fajar.site@crew.vonta.local',
    displayName: 'Fajar Hidayat',
    accountType: 'standard_worker',
    workerCode: 'WRK-109',
    profession: 'Electrical Technician',
  },
  {
    userId: 'demo-user-worker-ext-2',
    email: 'dimas.plumb@crew.vonta.local',
    displayName: 'Dimas Saputra',
    accountType: 'standard_worker',
    workerCode: 'WRK-112',
    profession: 'Plumbing Installer',
  },
];
