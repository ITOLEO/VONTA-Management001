import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react';
import {
  formatAccountTypeLabel,
  type ExactEmailLookupResult,
  type ScopedInvitationRecord,
} from '../domain/teamInvitations';

interface InviteMemberModalProps {
  open: boolean;
  projectName: string;
  onClose: () => void;
  onLookupEmail: (email: string) => ExactEmailLookupResult;
  onSendInvitation: (input: {
    email: string;
    requestedStandardRole?: 'worker' | 'foreman' | null;
  }) => { ok: true; invitation: ScopedInvitationRecord } | { ok: false; message: string };
  pendingInvitations?: ScopedInvitationRecord[];
  onAcceptDemoInvitation?: (invitationId: string) => { ok: boolean; message: string };
  onRevokeInvitation?: (invitationId: string) => void;
  isDemo?: boolean;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  open,
  projectName,
  onClose,
  onLookupEmail,
  onSendInvitation,
  pendingInvitations = [],
  onAcceptDemoInvitation,
  onRevokeInvitation,
  isDemo = false,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [lookupResult, setLookupResult] = useState<ExactEmailLookupResult | null>(null);
  const [standardRoleChoice, setStandardRoleChoice] = useState<'worker' | 'foreman' | ''>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  if (!open) return null;

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setStandardRoleChoice('');
    const result = onLookupEmail(emailInput);
    setLookupResult(result);
  };

  const handleConfirmInvite = () => {
    if (!lookupResult || !lookupResult.ok || !lookupResult.found) return;
    setSubmitError(null);
    setSubmitSuccess(null);

    const isDedicated = Boolean(lookupResult.lockedDedicatedRole);
    if (!isDedicated && !standardRoleChoice) {
      setSubmitError('Select Worker or Foreman for this standard worker account before confirming.');
      return;
    }

    const res = onSendInvitation({
      email: lookupResult.normalizedEmail,
      requestedStandardRole: isDedicated ? null : (standardRoleChoice as 'worker' | 'foreman'),
    });
    if (!res.ok) {
      setSubmitError(res.message);
      return;
    }

    setSubmitSuccess(
      `Pending invitation created for ${res.invitation.recipientDisplayName} (${res.invitation.recipientEmail}) as ${
        res.invitation.assignAsForeman
          ? 'Foreman'
          : formatAccountTypeLabel(res.invitation.registeredAccountType)
      }. Membership activates only after recipient acceptance.`
    );
    setLookupResult(null);
    setEmailInput('');
    setStandardRoleChoice('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-member-modal-title"
      data-testid="invite-member-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111B2E]/60 p-4"
    >
      <div className="w-full max-w-[540px] max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#D9DEE2] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#D9DEE2] px-5 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#A64011]" aria-hidden="true" />
            <div>
              <h2
                id="invite-member-modal-title"
                className="text-[17px] font-semibold text-[#1B2A4A]"
              >
                Invite to {projectName}
              </h2>
              <p className="text-[12px] text-[#4F5C67]">
                Exact email verification required. Dedicated account types retain their registered
                role.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close invite modal"
            className="rounded-lg p-1.5 text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Step 1: Exact Email Lookup */}
          <form onSubmit={handleLookup} className="space-y-2">
            <label
              htmlFor="invite-email-lookup-input"
              className="block text-[13px] font-semibold text-[#1B2A4A]"
            >
              Registered account email
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4F5C67]"
                  aria-hidden="true"
                />
                <input
                  id="invite-email-lookup-input"
                  data-testid="invite-email-input"
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setLookupResult(null);
                    setSubmitError(null);
                  }}
                  placeholder="Enter exact email (e.g. arin.putri@studio.vonta.local)"
                  className="w-full rounded-lg border border-[#D9DEE2] py-2 pl-9 pr-3 text-[13px] text-[#1B2A4A] focus:border-[#A64011] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                data-testid="invite-check-email-btn"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#1B2A4A]/90"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                Check email
              </button>
            </div>
            {isDemo && (
              <p className="text-[11px] text-[#4F5C67]">
                Demo test emails: <code>arin.putri@studio.vonta.local</code> (Architect),{' '}
                <code>daniels.owner@client.vonta.local</code> (Owner),{' '}
                <code>fajar.site@crew.vonta.local</code> (Standard worker).
              </p>
            )}
          </form>

          {/* Lookup Result */}
          {lookupResult && !lookupResult.ok && (
            <div
              role="alert"
              data-testid="invite-lookup-error"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{lookupResult.message}</span>
            </div>
          )}

          {lookupResult && lookupResult.ok && !lookupResult.found && (
            <div
              role="status"
              data-testid="invite-not-registered"
              className="rounded-xl border border-[#D9DEE2] bg-[#FAF9F6] p-4 text-[13px] text-[#1B2A4A]"
            >
              <p className="font-semibold">Account not registered</p>
              <p className="mt-1 text-[#4F5C67]">
                No registered VONTA account matches <strong>{lookupResult.normalizedEmail}</strong>.
                Ask the user to register first or check another address.
              </p>
            </div>
          )}

          {lookupResult && lookupResult.ok && lookupResult.found && (
            <div
              data-testid="invite-lookup-confirmed"
              className="space-y-3 rounded-xl border border-[#D9DEE2] bg-[#FAF9F6] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[14px] font-semibold text-[#1B2A4A]">
                    {lookupResult.displayName}
                  </p>
                  <p className="text-[12px] text-[#4F5C67]">{lookupResult.normalizedEmail}</p>
                </div>
                <span className="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1B2A4A] border border-[#D9DEE2]">
                  {formatAccountTypeLabel(lookupResult.registeredAccountType)}
                </span>
              </div>

              <div className="rounded-lg border border-[#D9DEE2] bg-white px-3 py-2 text-[13px]">
                <p className="font-medium text-[#1B2A4A]" data-testid="invite-registered-type-statement">
                  {lookupResult.registeredTypeStatement}
                </p>
              </div>

              {lookupResult.existingMembership && lookupResult.existingMembership.status === 'active' ? (
                <div className="rounded-lg border border-amber-300 bg-[#FFF8EB] px-3 py-2 text-[13px] text-amber-900">
                  Already an active project member ({lookupResult.existingMembership.role}).
                  Existing memberships cannot be duplicated or downgraded here.
                </div>
              ) : lookupResult.lockedDedicatedRole ? (
                <div
                  data-testid="invite-locked-dedicated-role"
                  className="flex items-center justify-between gap-2 rounded-lg border border-[#1B2A4A]/20 bg-white px-3 py-2.5 text-[13px]"
                >
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                      Target project assignment
                    </div>
                    <div className="mt-0.5 font-semibold text-[#1B2A4A]">
                      {formatAccountTypeLabel(lookupResult.registeredAccountType)} (Locked)
                    </div>
                  </div>
                  <Lock className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                </div>
              ) : (
                <fieldset className="space-y-2">
                  <legend className="text-[12px] font-semibold text-[#1B2A4A]">
                    Select target project assignment (required)
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(['worker', 'foreman'] as const).map((choice) => (
                      <label
                        key={choice}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors ${
                          standardRoleChoice === choice
                            ? 'border-[#A64011] bg-[#FFF3EB] text-[#1B2A4A]'
                            : 'border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="standard-invite-role"
                          value={choice}
                          checked={standardRoleChoice === choice}
                          onChange={() => setStandardRoleChoice(choice)}
                          className="accent-[#A64011]"
                        />
                        <span>{choice === 'foreman' ? 'Foreman' : 'Worker'}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {(!lookupResult.existingMembership ||
                lookupResult.existingMembership.status !== 'active') && (
                <button
                  type="button"
                  data-testid="invite-confirm-send-btn"
                  onClick={handleConfirmInvite}
                  className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg bg-[#A64011] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#8C350E]"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Send project invitation
                </button>
              )}
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div
              role="status"
              data-testid="invite-sent-confirmation"
              className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-[#ECFDF3] px-3.5 py-2.5 text-[13px] text-emerald-900"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitSuccess}</span>
            </div>
          )}

          {/* Pending Invitations List */}
          {pendingInvitations.length > 0 && (
            <div className="border-t border-[#D9DEE2] pt-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                Pending invitations ({pendingInvitations.length})
              </h3>
              <ul className="mt-2 space-y-2">
                {pendingInvitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] px-3 py-2 text-[12px]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1B2A4A]">
                        {inv.recipientDisplayName} ·{' '}
                        {inv.assignAsForeman
                          ? 'Foreman'
                          : formatAccountTypeLabel(inv.registeredAccountType)}
                      </div>
                      <div className="truncate text-[#4F5C67]">{inv.recipientEmail}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isDemo && onAcceptDemoInvitation && inv.status === 'pending' && (
                        <button
                          type="button"
                          data-testid={`accept-demo-invite-${inv.id}`}
                          onClick={() => {
                            const r = onAcceptDemoInvitation(inv.id);
                            if (r.ok) setSubmitSuccess(r.message);
                            else setSubmitError(r.message);
                          }}
                          className="rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
                        >
                          Simulate accept
                        </button>
                      )}
                      {onRevokeInvitation && inv.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => onRevokeInvitation(inv.id)}
                          className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
