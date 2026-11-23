import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search, UserPlus, Users } from 'lucide-react';
import { ProjectNavbar } from '../components/ProjectNavbar';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { ContextualRail } from '../components/ContextualRail';
import { InviteMemberModal } from '../components/InviteMemberModal';
import { useDemo } from '../context/DemoContext';
import { useDemoAddendum } from '../context/DemoAddendumContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import { formatRoleLabel, type ProjectRole } from '../domain/accountTypes';
import { deriveEffectiveAttendanceStatus } from '../domain/attendanceEngine';
import {
  canInviteToProject,
  canToggleMemberWorkerForeman,
  type ExactEmailLookupResult,
} from '../domain/teamInvitations';
import { buildTeamRailGroups } from '../utils/moduleNavConfig';
import { getProjectRoutes } from '../utils/projectRoutes';

function formatProjectTenure(joinedAtIso: string, referenceIso = '2026-11-20'): string {
  const start = Date.parse(joinedAtIso);
  const end = Date.parse(referenceIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 'Recently joined';
  const days = Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const remMo = months % 12;
  return remMo > 0 ? `${years} yr ${remMo} mo` : `${years} yr`;
}

export const DemoUsersAccessPage: React.FC = () => {
  const { state, departments } = useDemo();
  const addendum = useDemoAddendum();
  const routes = getProjectRoutes('/demo/projects', state.project.slug);
  const railGroups = useMemo(() => buildTeamRailGroups(routes, 'team'), [routes]);

  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const canInvite = canInviteToProject(addendum.activePersona.role, addendum.activePersona.status);
  const hasAccountingMember = addendum.members.some((m) => m.role === 'accounting');

  // Compute Attendance % per member for reporting period (Nov 2026): Present / (Present + Alfa)
  // Owner is exempt and displays em dash "—"
  const attendancePctByUser = useMemo(() => {
    const map: Record<string, string> = {};
    for (const member of addendum.members) {
      if (member.role === 'owner') {
        map[member.userId] = '—';
        continue;
      }
      const memberShifts = addendum.shifts.filter((s) => s.workerUserId === member.userId);
      let present = 0;
      let alfa = 0;
      for (const shift of memberShifts) {
        const rec = addendum.records[shift.id] ?? null;
        const izin = addendum.izinRequests.find((r) => r.obligationId === shift.id) ?? null;
        const derived = deriveEffectiveAttendanceStatus({
          shift,
          record: rec,
          izin,
          nowUtcMs: addendum.demoClockUtcMs,
        });
        if (derived.attendanceStatus === 'present') present += 1;
        else if (derived.attendanceStatus === 'alfa') alfa += 1;
      }
      const denom = present + alfa;
      map[member.userId] = denom > 0 ? `${Math.round((present / denom) * 100)}%` : '—';
    }
    return map;
  }, [addendum.members, addendum.shifts, addendum.records, addendum.izinRequests, addendum.demoClockUtcMs]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return addendum.members.filter((m) => {
      if (m.status === 'revoked') return false;
      if (deptFilter !== 'all' && m.division.toLowerCase() !== deptFilter.toLowerCase()) {
        return false;
      }
      if (roleFilter !== 'all') {
        if (roleFilter === 'foreman') {
          if (!(m.role === 'worker' && m.hasMandorGrant)) return false;
        } else if (roleFilter === 'worker') {
          if (!(m.role === 'worker' && !m.hasMandorGrant)) return false;
        } else if (m.role !== roleFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${m.displayName} ${m.email} ${m.profession} ${m.division}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [addendum.members, deptFilter, roleFilter, searchQuery]);

  const pendingInvites = useMemo(
    () => addendum.invitations.filter((i) => i.status === 'pending'),
    [addendum.invitations]
  );

  return (
    <div className="min-h-dvh bg-[#F4F3EF] flex flex-col text-[#1B2A4A]">
      <ProjectNavbar inProjectContext hasContextualRail />

      <div className="flex flex-1 min-h-[calc(100dvh-60px)]">
        <ContextualRail
          moduleLabel="Team"
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
        />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1360px] space-y-5">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-[24px] leading-[30px] font-bold text-[#1B2A4A]">Team</h1>
                <p className="mt-1 text-[14px] text-[#4F5C67]">
                  Active project members for {state.project.name}. Attendance % reflects finalized
                  Present / (Present + Alfa) worker-days for Nov 2026 (Owners exempt).
                </p>
              </div>

              {canInvite && (
                <button
                  type="button"
                  data-testid="team-invite-member-btn"
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Invite member
                </button>
              )}
            </div>

            {notice && (
              <div
                role="status"
                data-testid="team-action-notice"
                className={`rounded-xl border px-4 py-2.5 text-[13px] font-medium ${
                  notice.kind === 'ok'
                    ? 'border-emerald-300 bg-[#ECFDF3] text-emerald-900'
                    : 'border-red-300 bg-[#FEF2F2] text-red-800'
                }`}
              >
                {notice.text}
              </div>
            )}

            {/* Filters above full-width table */}
            <section
              aria-label="Filter team members"
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[#D9DEE2] bg-white p-3.5"
            >
              <div className="relative min-w-[200px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search member name or profession…"
                  aria-label="Search team members"
                  className="w-full rounded-lg border border-[#D9DEE2] py-2 pl-9 pr-3 text-[13px] text-[#1B2A4A] focus:border-[#A64011] focus:outline-none"
                />
              </div>

              <select
                aria-label="Department"
                data-testid="team-dept-filter"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] font-medium text-[#1B2A4A]"
              >
                <option value="all">Department: All</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Profession"
                data-testid="team-profession-filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px] font-medium text-[#1B2A4A]"
              >
                <option value="all">Profession: All</option>
                <option value="owner">Owner</option>
                <option value="contractor">Contractor</option>
                <option value="architect">Architect</option>
                <option value="foreman">Foreman</option>
                <option value="worker">Worker</option>
                {hasAccountingMember && <option value="accounting">Accounting</option>}
              </select>

              <span className="text-[12px] font-medium text-[#4F5C67] tabular-nums">
                {filteredMembers.length} member{filteredMembers.length === 1 ? '' : 's'} · Period:
                Nov 2026
              </span>
            </section>

            {/* Full-Width Four-Column Team Table */}
            <div className="overflow-x-auto rounded-xl border border-[#D9DEE2] bg-white">
              <div className="max-h-[560px] overflow-y-auto">
                <table
                  data-testid="team-four-column-table"
                  className="w-full min-w-[640px] border-collapse text-left"
                >
                  <thead className="sticky top-0 z-10 border-b border-[#D9DEE2] bg-[#FAF9F6] text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                    <tr>
                      <th scope="col" className="w-[34%] px-5 py-3.5">
                        Name
                      </th>
                      <th scope="col" className="w-[26%] px-5 py-3.5">
                        Role
                      </th>
                      <th scope="col" className="w-[22%] px-5 py-3.5">
                        Project tenure
                      </th>
                      <th scope="col" className="w-[18%] px-5 py-3.5 text-right">
                        Attendance %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E8EB] text-[14px]">
                    {filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-10 text-center text-[#4F5C67]">
                          No team members match the current department or profession filter.
                        </td>
                      </tr>
                    ) : (
                      filteredMembers.map((m) => {
                        const canToggle = canToggleMemberWorkerForeman(
                          addendum.activePersona.role,
                          addendum.activePersona.status,
                          m.role,
                          m.status
                        );
                        const tenure = formatProjectTenure(m.joinedAt);
                        const pct = attendancePctByUser[m.userId] ?? '—';

                        return (
                          <tr
                            key={m.membershipId}
                            data-testid={`team-member-row-${m.membershipId}`}
                            className="h-[60px] hover:bg-[#FAF9F6]"
                          >
                            {/* Col 1: Name */}
                            <td className="px-5 py-3 align-middle">
                              <div className="font-semibold text-[#1B2A4A]">{m.displayName}</div>
                              <div className="text-[12px] text-[#4F5C67]">
                                {m.division} · {m.profession}
                              </div>
                            </td>

                            {/* Col 2: Role (inline Worker/Foreman toggle for eligible standard workers) */}
                            <td className="px-5 py-3 align-middle">
                              {canToggle ? (
                                <select
                                  aria-label={`Role for ${m.displayName}`}
                                  data-testid={`team-role-select-${m.userId}`}
                                  value={m.hasMandorGrant ? 'foreman' : 'worker'}
                                  onChange={(e) => {
                                    const res = addendum.toggleMemberForemanRole(
                                      m.userId,
                                      e.target.value === 'foreman'
                                    );
                                    setNotice({
                                      kind: res.ok ? 'ok' : 'err',
                                      text: res.message,
                                    });
                                  }}
                                  className="rounded-lg border border-[#D9DEE2] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[#1B2A4A] focus:border-[#A64011] focus:outline-none"
                                >
                                  <option value="worker">Worker</option>
                                  <option value="foreman">Foreman</option>
                                </select>
                              ) : (
                                <span
                                  data-testid={`team-role-badge-${m.userId}`}
                                  className="inline-flex items-center rounded-md border border-[#D9DEE2] bg-[#FAF9F6] px-2.5 py-1 text-[13px] font-medium text-[#1B2A4A]"
                                >
                                  {formatRoleLabel(m.role, {
                                    hasMandorGrant: m.hasMandorGrant,
                                    hasAccountingGrant: m.hasAccountingGrant,
                                  })}
                                </span>
                              )}
                            </td>

                            {/* Col 3: Project tenure */}
                            <td
                              className="px-5 py-3 align-middle text-[#1B2A4A]"
                              title={`Joined ${m.joinedAt}`}
                            >
                              <div className="font-medium tabular-nums">{tenure}</div>
                              <div className="text-[11px] text-[#4F5C67]">
                                Joined {m.joinedAt}
                              </div>
                            </td>

                            {/* Col 4: Attendance % */}
                            <td
                              data-testid={`team-attendance-pct-${m.userId}`}
                              className="px-5 py-3 text-right align-middle font-semibold tabular-nums text-[#1B2A4A]"
                              title={
                                m.role === 'owner'
                                  ? 'Owner exempt from attendance schedules'
                                  : 'Present / (Present + Alfa) for Nov 2026'
                              }
                            >
                              {pct}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      <InviteMemberModal
        open={inviteOpen}
        projectName={state.project.name}
        onClose={() => setInviteOpen(false)}
        onLookupEmail={addendum.lookupDemoInviteEmail}
        onSendInvitation={addendum.sendDemoInvitation}
        pendingInvitations={pendingInvites}
        onAcceptDemoInvitation={addendum.acceptDemoInvitation}
        onRevokeInvitation={addendum.revokeDemoInvitation}
        isDemo
      />
    </div>
  );
};

export const PrivateUsersAccessPage: React.FC = () => {
  const { project: projectId = '' } = useParams<{ project: string }>();
  const { projects, activeProject } = usePrivateProjects();
  const project = projects.find((p) => p.id === projectId) ?? activeProject;
  const routes = getProjectRoutes('/projects', projectId);
  const railGroups = useMemo(() => buildTeamRailGroups(routes, 'team'), [routes]);
  const [inviteOpen, setInviteOpen] = useState(false);

  const memberRole: ProjectRole = project?.membership.role ?? 'worker';
  const canInvite = canInviteToProject(memberRole, project?.membership.status ?? 'active');

  const handleLiveLookup = (): ExactEmailLookupResult => ({
    ok: false,
    code: 'FORBIDDEN',
    message:
      'Live registered-account lookup requires a configured Supabase identity backend in this environment.',
  });

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
          moduleLabel="Team"
          groups={railGroups}
          projectSettingsPath={routes.settingsPath}
        />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1360px] space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#A64011]" aria-hidden="true" />
                <div>
                  <h1 className="text-[24px] leading-[30px] font-bold text-[#1B2A4A]">Team</h1>
                  <p className="text-[14px] text-[#4F5C67]">
                    Active members of {project?.name ?? 'this project'}.
                  </p>
                </div>
              </div>
              {canInvite && (
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Invite member
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#D9DEE2] bg-white">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead className="border-b border-[#D9DEE2] bg-[#FAF9F6] text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                  <tr>
                    <th scope="col" className="w-[34%] px-5 py-3.5">
                      Name
                    </th>
                    <th scope="col" className="w-[26%] px-5 py-3.5">
                      Role
                    </th>
                    <th scope="col" className="w-[22%] px-5 py-3.5">
                      Project tenure
                    </th>
                    <th scope="col" className="w-[18%] px-5 py-3.5 text-right">
                      Attendance %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E8EB] text-[14px]">
                  <tr className="h-[60px]">
                    <td className="px-5 py-3 font-semibold text-[#1B2A4A]">
                      {project?.contractorDisplayName ?? 'Current Member'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-md border border-[#D9DEE2] bg-[#FAF9F6] px-2.5 py-1 text-[13px] font-medium text-[#1B2A4A]">
                        {formatRoleLabel(memberRole, project?.membership)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#4F5C67]">
                      {project?.createdAt ? formatProjectTenure(project.createdAt.slice(0, 10)) : 'Active'}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#1B2A4A]">
                      —
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Link
              to={routes.overviewPath}
              className="inline-flex text-[14px] font-semibold text-[#A64011] hover:underline"
            >
              Back to Project Overview
            </Link>
          </div>
        </main>
      </div>

      <InviteMemberModal
        open={inviteOpen}
        projectName={project?.name ?? 'Project'}
        onClose={() => setInviteOpen(false)}
        onLookupEmail={handleLiveLookup}
        onSendInvitation={() => ({
          ok: false,
          message: 'Live invitation delivery requires a configured Supabase identity & SMTP provider.',
        })}
      />
    </div>
  );
};
