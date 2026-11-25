import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  History,
  KeyRound,
  Lock,
  Mail,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiClientError, privateApi } from '../data/privateApi';
import { COMMON_TIMEZONES, type AuditEventRecord } from '../domain/accountTypes';
import { PrivateNavbar } from '../components/PrivateNavbar';
import {
  DEMO_ACCOUNT_AVATAR_SVG,
  DEMO_ACCOUNT_DISPLAY_NAME,
  DEMO_ACCOUNT_EMAIL,
  ProjectNavbar,
} from '../components/ProjectNavbar';
import { AuditHistoryList } from '../components/AuditHistoryList';
import { useThemePreference, type ThemeChoice } from '../utils/themePreference';
import { useSectionScrollSpy } from '../utils/scrollSpy';

interface ProfileSettingsPageProps {
  demoMode?: boolean;
}

type AccountSectionId = 'preferences' | 'security' | 'history' | 'danger';

const ACCOUNT_SECTIONS: ReadonlyArray<{
  id: AccountSectionId;
  label: string;
  anchor: string;
}> = [
  { id: 'preferences', label: 'Preferences', anchor: 'account-preferences' },
  { id: 'security', label: 'Security', anchor: 'account-security' },
  { id: 'history', label: 'Account history', anchor: 'account-history' },
  { id: 'danger', label: 'Delete account', anchor: 'account-danger-zone' },
];

const APPEARANCE_CARDS: Array<{
  value: ThemeChoice;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: 'system',
    label: 'System',
    description: 'Match your device display setting.',
    icon: Monitor,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Dark chrome preference when enabled.',
    icon: Moon,
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Default high-legibility light surface.',
    icon: Sun,
  },
];

function resolveSafeReturnPath(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) {
    return raw;
  }
  return fallback;
}

/**
 * Account preferences, appearance, security, account history, and Delete account
 * (Field Operations Revision):
 * - Scrollspy tracks visible section during user scroll without extra history entries or jump loops.
 * - Registered email is strictly read-only (no editable email input or Save email button).
 * - Account password change requires current password + confirmation sent to the registered inbox.
 * - Account history remains preserved.
 */
export function ProfileSettingsPage({ demoMode = false }: ProfileSettingsPageProps) {
  const [searchParams] = useSearchParams();
  const {
    accessToken,
    profile,
    user,
    refreshProfile,
    setProfileDirect,
    requestAccountPasswordChallenge,
    confirmAccountPasswordChange,
    cancelAccountPasswordChallenge,
  } = useAuth();
  const { theme, setTheme } = useThemePreference();

  const returnFallback = demoMode ? '/demo/projects' : '/projects';
  const backToDashboardPath = resolveSafeReturnPath(
    searchParams.get('returnTo'),
    returnFallback
  );

  const initialSectionParam = searchParams.get('section');
  const initialSection: AccountSectionId =
    initialSectionParam === 'security' ||
    initialSectionParam === 'history' ||
    initialSectionParam === 'danger'
      ? initialSectionParam
      : 'preferences';

  const { activeSection, jumpToSection } = useSectionScrollSpy<AccountSectionId>(
    ACCOUNT_SECTIONS,
    initialSection,
    { readingLineOffsetPx: 118 }
  );

  useEffect(() => {
    if (
      initialSectionParam === 'security' ||
      initialSectionParam === 'history' ||
      initialSectionParam === 'danger'
    ) {
      jumpToSection(initialSectionParam);
    }
    // Only on query param change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSectionParam]);

  const effectiveEmail = demoMode ? DEMO_ACCOUNT_EMAIL : profile?.email ?? user?.email ?? '';
  const effectivePhoneStatus = demoMode ? 'unverified' : profile?.phoneStatus ?? 'unverified';
  const effectiveInitialName = demoMode
    ? DEMO_ACCOUNT_DISPLAY_NAME
    : profile?.displayName ?? '';
  const effectiveInitialPhone = demoMode ? '+62 811 2000 403' : profile?.phoneNumber ?? '';
  const effectiveInitialTz = demoMode
    ? 'Asia/Jakarta'
    : profile?.displayTimezone || 'Asia/Jakarta';
  const effectiveAvatarUrl = demoMode
    ? DEMO_ACCOUNT_AVATAR_SVG
    : typeof user?.user_metadata?.avatar_url === 'string'
      ? user.user_metadata.avatar_url
      : null;

  // 1. Profile information
  const [displayName, setDisplayName] = useState(effectiveInitialName);
  const [phoneNumber, setPhoneNumber] = useState(effectiveInitialPhone);
  const [demoBaselineName, setDemoBaselineName] = useState(DEMO_ACCOUNT_DISPLAY_NAME);
  const [demoBaselinePhone, setDemoBaselinePhone] = useState('+62 811 2000 403');
  const [personalErrors, setPersonalErrors] = useState<{
    displayName?: string;
    phoneNumber?: string;
  }>({});
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [personalStale, setPersonalStale] = useState(false);
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalSaved, setPersonalSaved] = useState<string | null>(null);

  // 2. Display timezone
  const [displayTimezone, setDisplayTimezone] = useState(effectiveInitialTz);
  const [demoBaselineTz, setDemoBaselineTz] = useState('Asia/Jakarta');
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [prefSaved, setPrefSaved] = useState<string | null>(null);

  // 3. Sign-in and security — Two-step confirmed Account password change
  const [currentAccountPw, setCurrentAccountPw] = useState('');
  const [newAccountPw, setNewAccountPw] = useState('');
  const [confirmAccountPw, setConfirmAccountPw] = useState('');
  const [accountPwErrors, setAccountPwErrors] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
    code?: string;
  }>({});
  const [accountPwSaving, setAccountPwSaving] = useState(false);
  const [accountPwError, setAccountPwError] = useState<string | null>(null);
  const [accountPwSuccess, setAccountPwSuccess] = useState<string | null>(null);

  // Pending email confirmation step (never persisted to storage)
  const [pendingChallenge, setPendingChallenge] = useState<{
    challengeId: string;
    registeredEmail: string;
    info: string;
  } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [resendCooldownSec, setResendCooldownSec] = useState(0);

  // 4. Account history
  const [historyEvents, setHistoryEvents] = useState<AuditEventRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // 5. Delete account confirmation modal
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountConfirmInput, setDeleteAccountConfirmInput] = useState('');
  const [deleteAccountFeedback, setDeleteAccountFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode || !profile) return;
    setDisplayName(profile.displayName);
    setPhoneNumber(profile.phoneNumber);
    setDisplayTimezone(profile.displayTimezone || 'Asia/Jakarta');
    setPersonalStale(false);
  }, [demoMode, profile?.userId, profile?.version]);

  useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldownSec]);

  useEffect(() => {
    if (!deleteAccountOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDeleteAccountOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteAccountOpen]);

  const loadAccountHistory = useCallback(async () => {
    if (demoMode || !accessToken) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await privateApi.getAccountHistory(accessToken);
      setHistoryEvents(res.events);
    } catch (err) {
      setHistoryError(
        err instanceof ApiClientError ? err.message : 'Could not load account history.'
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [demoMode, accessToken]);

  useEffect(() => {
    void loadAccountHistory();
  }, [loadAccountHistory]);

  const personalDirty = demoMode
    ? displayName.trim() !== demoBaselineName || phoneNumber.trim() !== demoBaselinePhone
    : Boolean(
        profile &&
          (displayName.trim() !== profile.displayName ||
            phoneNumber.trim() !== profile.phoneNumber)
      );

  const prefDirty = demoMode
    ? displayTimezone !== demoBaselineTz
    : Boolean(profile && displayTimezone !== profile.displayTimezone);

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setPersonalError(null);
    setPersonalSaved(null);
    setPersonalStale(false);

    const errs: { displayName?: string; phoneNumber?: string } = {};
    if (!displayName.trim()) errs.displayName = 'Display name is required.';
    if (phoneNumber.trim() && !/^[+\d()\s-]{6,24}$/.test(phoneNumber.trim())) {
      errs.phoneNumber = 'Enter a valid phone number.';
    }
    if (Object.keys(errs).length > 0) {
      setPersonalErrors(errs);
      return;
    }
    setPersonalErrors({});

    if (demoMode) {
      setDemoBaselineName(displayName.trim());
      setDemoBaselinePhone(phoneNumber.trim());
      setPersonalSaved('Preview profile updated locally for this browser session.');
      return;
    }

    if (!accessToken || !profile) return;
    setPersonalSaving(true);
    try {
      const res = await privateApi.updateProfile(accessToken, {
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        expectedVersion: profile.version,
      });
      setProfileDirect(res.profile);
      setPersonalSaved('Profile information saved.');
      void loadAccountHistory();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.fieldErrors) setPersonalErrors(err.fieldErrors);
        if (err.status === 409) setPersonalStale(true);
        setPersonalError(err.message);
      } else {
        setPersonalError('Could not save profile information. Unsaved input was kept.');
      }
    } finally {
      setPersonalSaving(false);
    }
  };

  const handleCancelPersonal = () => {
    setDisplayName(demoMode ? demoBaselineName : profile?.displayName ?? '');
    setPhoneNumber(demoMode ? demoBaselinePhone : profile?.phoneNumber ?? '');
    setPersonalErrors({});
    setPersonalError(null);
    setPersonalSaved(null);
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefError(null);
    setPrefSaved(null);

    if (demoMode) {
      setDemoBaselineTz(displayTimezone);
      setPrefSaved('Preview display timezone updated for this browser session.');
      return;
    }

    if (!accessToken || !profile) return;
    setPrefSaving(true);
    try {
      const res = await privateApi.updateProfile(accessToken, {
        displayTimezone,
        expectedVersion: profile.version,
      });
      setProfileDirect(res.profile);
      setPrefSaved(
        'Display timezone saved. Project timezones remain preserved for attendance and operational dates.'
      );
      void loadAccountHistory();
    } catch (err) {
      setPrefError(
        err instanceof ApiClientError ? err.message : 'Failed to save timezone preference.'
      );
    } finally {
      setPrefSaving(false);
    }
  };

  const validatePasswordFields = (): boolean => {
    const errs: { current?: string; next?: string; confirm?: string } = {};
    if (!currentAccountPw) errs.current = 'Enter your current account password.';
    if (!newAccountPw) {
      errs.next = 'Enter a new account password.';
    } else if (newAccountPw.length < 8) {
      errs.next = 'New account password must be at least 8 characters.';
    } else if (currentAccountPw && newAccountPw === currentAccountPw) {
      errs.next = 'New account password must differ from your current password.';
    }
    if (!confirmAccountPw) {
      errs.confirm = 'Confirm your new account password.';
    } else if (newAccountPw !== confirmAccountPw) {
      errs.confirm = 'New account passwords do not match.';
    }
    setAccountPwErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRequestPasswordChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountPwError(null);
    setAccountPwSuccess(null);

    if (demoMode) {
      setAccountPwError(
        'Synthetic local demo cannot send a verification email to an inbox. Sign in to a live VONTA account to change your account password.'
      );
      return;
    }

    if (!validatePasswordFields()) return;

    setAccountPwSaving(true);
    try {
      const res = await requestAccountPasswordChallenge({
        currentPassword: currentAccountPw,
        newPassword: newAccountPw,
      });
      if (!res.ok || !res.challengeId) {
        setAccountPwError(
          res.error ??
            'Could not send confirmation email to your registered address. Your password has not changed.'
        );
        void loadAccountHistory();
        return;
      }
      setPendingChallenge({
        challengeId: res.challengeId,
        registeredEmail: res.registeredEmail ?? effectiveEmail,
        info:
          res.info ??
          `Enter the confirmation code sent to ${res.registeredEmail ?? effectiveEmail}.`,
      });
      setVerificationCode('');
      setResendCooldownSec(res.resendAfterSeconds ?? 45);
      void loadAccountHistory();
    } finally {
      setAccountPwSaving(false);
    }
  };

  const handleConfirmPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingChallenge) return;
    setAccountPwError(null);
    setAccountPwSuccess(null);

    if (!verificationCode.trim()) {
      setAccountPwErrors((prev) => ({
        ...prev,
        code: 'Enter the verification code sent to your registered email.',
      }));
      return;
    }
    setAccountPwErrors((prev) => ({ ...prev, code: undefined }));

    setAccountPwSaving(true);
    try {
      const res = await confirmAccountPasswordChange({
        challengeId: pendingChallenge.challengeId,
        verificationCode: verificationCode.trim(),
        newPassword: newAccountPw,
      });
      if (!res.ok) {
        setAccountPwError(
          res.error ?? 'Verification failed. Your current password remains unchanged.'
        );
        void loadAccountHistory();
        return;
      }
      setPendingChallenge(null);
      setVerificationCode('');
      setCurrentAccountPw('');
      setNewAccountPw('');
      setConfirmAccountPw('');
      setAccountPwSuccess(
        res.info ??
          'Account password updated after email confirmation. Project passwords were not changed.'
      );
      void loadAccountHistory();
    } finally {
      setAccountPwSaving(false);
    }
  };

  const handleCancelPasswordChallenge = async () => {
    if (pendingChallenge) {
      await cancelAccountPasswordChallenge(pendingChallenge.challengeId);
    }
    setPendingChallenge(null);
    setVerificationCode('');
    setAccountPwError(null);
    setAccountPwErrors({});
  };

  const expectedDeletePhrase = effectiveEmail
    ? `DELETE ACCOUNT ${effectiveEmail}`
    : 'DELETE ACCOUNT';
  const deleteAccountPhraseMatches =
    deleteAccountConfirmInput.trim() === expectedDeletePhrase;

  const handleSubmitDeleteAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteAccountPhraseMatches) return;
    if (demoMode) {
      setDeleteAccountFeedback(
        'Synthetic demo preview cannot delete a live user account. No project or demo data was removed.'
      );
      return;
    }
    setDeleteAccountFeedback(
      'Account deletion requires administrator verification in your configured identity provider. Your projects remain untouched.'
    );
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      {demoMode ? (
        <ProjectNavbar
          inProjectContext={false}
          sectionLabel="Account"
          hasContextualRail={false}
        />
      ) : (
        <PrivateNavbar
          inProjectContext={false}
          sectionLabel="Account"
          hasContextualRail={false}
        />
      )}

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
          {/* Left local settings column with active scrollspy */}
          <aside
            aria-label="Account navigation"
            className="w-full shrink-0 lg:sticky lg:top-[84px] lg:w-[228px]"
          >
            <Link
              to={backToDashboardPath}
              data-testid="account-back-to-dashboard"
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] leading-[20px] font-medium text-[#4F5C67] transition-colors hover:bg-white hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Back to dashboard</span>
            </Link>

            <div className="mt-4 lg:hidden">
              <label
                htmlFor="account-section-select"
                className="block text-[12px] font-semibold tracking-wide text-[#4F5C67] uppercase"
              >
                Account section
              </label>
              <select
                id="account-section-select"
                value={activeSection}
                onChange={(e) => jumpToSection(e.target.value as AccountSectionId)}
                className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[14px] font-medium text-[#1B2A4A]"
              >
                {ACCOUNT_SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 hidden lg:block">
              <div className="px-3 text-[12px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase">
                Account
              </div>
              <nav className="mt-2 space-y-1" aria-label="Account sections">
                {ACCOUNT_SECTIONS.map((s) => {
                  const active = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      data-testid={`account-nav-${s.id}`}
                      aria-current={active ? 'location' : undefined}
                      onClick={() => jumpToSection(s.id)}
                      className={`flex min-h-[40px] w-full items-center rounded-lg border px-3 py-2 text-left text-[14px] leading-[20px] font-medium transition-colors ${
                        active
                          ? 'border-[#D4652F]/35 bg-[#FFF3EB] font-semibold text-[#A64011]'
                          : 'border-transparent text-[#4F5C67] hover:bg-white hover:text-[#1B2A4A]'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Centered settings stack */}
          <div className="min-w-0 flex-1 max-w-[760px]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="vonta-page-title text-[#1B2A4A]">
                  Preferences
                </h1>
                <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
                  Manage your profile information, appearance, display timezone, and sign-in
                  security.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {/* 1. Profile information */}
              <section
                id="account-preferences"
                aria-labelledby="profile-personal-heading"
                className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white"
              >
                <form onSubmit={handleSavePersonal} noValidate>
                  <div className="border-b border-[#D9DEE2] px-6 py-4">
                    <div className="flex items-center gap-3">
                      {effectiveAvatarUrl ? (
                        <img
                          src={effectiveAvatarUrl}
                          alt=""
                          aria-hidden="true"
                          className="h-10 w-10 rounded-full border border-[#D9DEE2] object-cover"
                        />
                      ) : (
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1B2A4A] text-[14px] font-semibold text-white">
                          <User className="h-5 w-5" aria-hidden="true" />
                        </div>
                      )}
                      <div>
                        <h2
                          id="profile-personal-heading"
                          className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                        >
                          Profile information
                        </h2>
                        <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                          Your name and site coordination contact details across VONTA projects.
                          Daily attendance selfies never overwrite your account portrait.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-[#D9DEE2] px-6">
                    {/* Display name */}
                    <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-6">
                      <label
                        htmlFor="profile-display-name"
                        className="pt-2 text-[14px] font-medium text-[#1B2A4A]"
                      >
                        Display name
                      </label>
                      <div>
                        <input
                          id="profile-display-name"
                          type="text"
                          value={displayName}
                          onChange={(e) => {
                            setDisplayName(e.target.value);
                            setPersonalSaved(null);
                            if (personalErrors.displayName) {
                              setPersonalErrors((p) => ({ ...p, displayName: undefined }));
                            }
                          }}
                          aria-invalid={Boolean(personalErrors.displayName)}
                          className="h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                        />
                        {personalErrors.displayName && (
                          <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                            {personalErrors.displayName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Registered email (read-only) */}
                    <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[200px_1fr] sm:items-center sm:gap-6">
                      <span className="text-[14px] font-medium text-[#1B2A4A]">
                        Registered email
                      </span>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          data-testid="profile-readonly-email"
                          className="text-[14px] font-medium text-[#1B2A4A]"
                        >
                          {effectiveEmail || 'Not configured'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-[#F4F3EF] px-2 py-0.5 text-[12px] font-medium text-[#4F5C67]">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          Fixed account email
                        </span>
                      </div>
                    </div>

                    {/* Contact phone */}
                    <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-6">
                      <div className="pt-1">
                        <label
                          htmlFor="profile-phone"
                          className="block text-[14px] font-medium text-[#1B2A4A]"
                        >
                          Contact phone
                        </label>
                        <span
                          data-testid="phone-verification-badge"
                          className={`mt-1 inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                            effectivePhoneStatus === 'verified'
                              ? 'bg-[#DCFCE7] text-[#166534]'
                              : 'bg-[#F4F3EF] text-[#4F5C67]'
                          }`}
                        >
                          {effectivePhoneStatus === 'verified' ? 'Verified' : 'Contact-only'}
                        </span>
                      </div>
                      <div>
                        <input
                          id="profile-phone"
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => {
                            setPhoneNumber(e.target.value);
                            setPersonalSaved(null);
                            if (personalErrors.phoneNumber) {
                              setPersonalErrors((p) => ({ ...p, phoneNumber: undefined }));
                            }
                          }}
                          placeholder="+62 812 0000 0000"
                          aria-invalid={Boolean(personalErrors.phoneNumber)}
                          className="h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                        />
                        <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                          {effectivePhoneStatus === 'verified'
                            ? 'Verified by provider.'
                            : 'Contact-only number for site coordination (not SMS-verified).'}
                        </p>
                        {personalErrors.phoneNumber && (
                          <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                            {personalErrors.phoneNumber}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {personalError && (
                    <div className="px-6 pb-4">
                      <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                      >
                        <span>{personalError}</span>
                        {personalStale && (
                          <button
                            type="button"
                            onClick={() => void refreshProfile()}
                            className="rounded-lg border border-[#B42318]/30 bg-white px-3 py-1.5 font-semibold"
                          >
                            Reload profile
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {personalSaved && (
                    <div className="px-6 pb-4">
                      <div
                        role="status"
                        className="flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] text-[#166534]"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{personalSaved}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#D9DEE2] bg-[#F4F3EF]/35 px-6 py-3.5">
                    {personalDirty && (
                      <span className="mr-auto text-[13px] font-medium text-[#A64011]">
                        Unsaved changes
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={personalSaving || !personalDirty}
                      onClick={handleCancelPersonal}
                      className="inline-flex min-h-[40px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={personalSaving || !personalDirty}
                      className="inline-flex min-h-[40px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-50"
                    >
                      {personalSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </section>

              {/* 2. Appearance */}
              <section
                aria-labelledby="profile-appearance-heading"
                className="rounded-xl border border-[#D9DEE2] bg-white p-6"
              >
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                  <h2
                    id="profile-appearance-heading"
                    className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                  >
                    Appearance
                  </h2>
                </div>
                <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                  Choose how VONTA displays on this device. Light is the default surface and stays
                  in sync with the top-bar profile menu.
                </p>

                <div
                  role="radiogroup"
                  aria-label="Appearance theme"
                  className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
                >
                  {APPEARANCE_CARDS.map((card) => {
                    const Icon = card.icon;
                    const selected = theme === card.value;
                    return (
                      <button
                        key={card.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setTheme(card.value)}
                        data-testid={`appearance-card-${card.value}`}
                        className={`flex flex-col rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                          selected
                            ? 'border-[#D4652F] bg-[#FFF3EB]/55'
                            : 'border-[#D9DEE2] bg-white hover:bg-[#F4F3EF]/50'
                        }`}
                      >
                        <div
                          aria-hidden="true"
                          className="mb-3 h-16 w-full overflow-hidden rounded-lg border border-[#D9DEE2]"
                        >
                          {card.value === 'light' && (
                            <div className="flex h-full bg-[#F4F3EF]">
                              <div className="w-5 border-r border-[#D9DEE2] bg-white" />
                              <div className="flex flex-1 flex-col gap-1.5 p-2">
                                <div className="h-2 w-12 rounded bg-[#1B2A4A]/70" />
                                <div className="flex-1 rounded border border-[#D9DEE2] bg-white" />
                              </div>
                            </div>
                          )}
                          {card.value === 'dark' && (
                            <div className="flex h-full bg-[#1B2A4A]">
                              <div className="w-5 border-r border-white/15 bg-[#121D34]" />
                              <div className="flex flex-1 flex-col gap-1.5 p-2">
                                <div className="h-2 w-12 rounded bg-white/80" />
                                <div className="flex-1 rounded border border-white/15 bg-[#23355A]" />
                              </div>
                            </div>
                          )}
                          {card.value === 'system' && (
                            <div className="grid h-full grid-cols-2">
                              <div className="flex flex-col gap-1.5 bg-[#F4F3EF] p-2">
                                <div className="h-2 w-8 rounded bg-[#1B2A4A]/70" />
                                <div className="flex-1 rounded border border-[#D9DEE2] bg-white" />
                              </div>
                              <div className="flex flex-col gap-1.5 bg-[#1B2A4A] p-2">
                                <div className="h-2 w-8 rounded bg-white/80" />
                                <div className="flex-1 rounded border border-white/15 bg-[#23355A]" />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#1B2A4A]">
                            <Icon className="h-3.5 w-3.5 text-[#4F5C67]" aria-hidden="true" />
                            {card.label}
                          </span>
                          {selected && (
                            <span className="text-[12px] font-semibold text-[#A64011]">Active</span>
                          )}
                        </div>
                        <p className="mt-1 text-[12px] leading-[17px] text-[#4F5C67]">
                          {card.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 3. Display timezone */}
              <section
                aria-labelledby="profile-timezone-heading"
                className="rounded-xl border border-[#D9DEE2] bg-white"
              >
                <form onSubmit={handleSavePreferences} noValidate>
                  <div className="border-b border-[#D9DEE2] px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                      <h2
                        id="profile-timezone-heading"
                        className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                      >
                        Display timezone
                      </h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 px-6 py-5 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-6">
                    <label
                      htmlFor="profile-display-timezone"
                      className="pt-2 text-[14px] font-medium text-[#1B2A4A]"
                    >
                      Timezone
                    </label>
                    <div>
                      <select
                        id="profile-display-timezone"
                        value={displayTimezone}
                        onChange={(e) => {
                          setDisplayTimezone(e.target.value);
                          setPrefSaved(null);
                        }}
                        className="h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                      >
                        {COMMON_TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[13px] leading-[18px] text-[#4F5C67]">
                        Formats timestamps in your personal views. Each project preserves its own
                        project timezone for daily attendance and operational dates.
                      </p>
                    </div>
                  </div>

                  {prefError && (
                    <div className="px-6 pb-4">
                      <div
                        role="alert"
                        className="rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                      >
                        {prefError}
                      </div>
                    </div>
                  )}
                  {prefSaved && (
                    <div className="px-6 pb-4">
                      <div
                        role="status"
                        className="flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] text-[#166534]"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{prefSaved}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#D9DEE2] bg-[#F4F3EF]/35 px-6 py-3.5">
                    <button
                      type="button"
                      disabled={prefSaving || !prefDirty}
                      onClick={() => {
                        setDisplayTimezone(
                          demoMode ? demoBaselineTz : profile?.displayTimezone || 'Asia/Jakarta'
                        );
                        setPrefError(null);
                        setPrefSaved(null);
                      }}
                      className="inline-flex min-h-[40px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={prefSaving || !prefDirty}
                      className="inline-flex min-h-[40px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-50"
                    >
                      {prefSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </section>

              {/* 4. Sign-in and security (Fixed email + Confirmed Account Password Change) */}
              <section
                id="account-security"
                aria-labelledby="profile-security-heading"
                className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white"
              >
                <div className="border-b border-[#D9DEE2] px-6 py-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                    <h2
                      id="profile-security-heading"
                      className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                    >
                      Sign-in and security
                    </h2>
                  </div>
                </div>

                {/* Locked Registered Email */}
                <div
                  data-testid="security-locked-email-block"
                  className="border-b border-[#D9DEE2] px-6 py-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1B2A4A]">
                      <Mail className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                      Registered email address
                    </div>
                    <span className="inline-flex items-center gap-1 rounded border border-[#D9DEE2] bg-[#F4F3EF] px-2 py-0.5 text-[12px] font-medium text-[#4F5C67]">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      Read-only
                    </span>
                  </div>
                  <p className="mt-1.5 text-[14px] font-semibold text-[#1B2A4A]">
                    {effectiveEmail || 'Not configured'}
                  </p>
                  <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                    Your registered account email is permanently bound to your VONTA identity and
                    project memberships, and cannot be changed in Account Settings. Password
                    confirmations are sent exclusively to this verified address.
                  </p>
                </div>

                {/* Confirmed Account Password Change */}
                <div className="px-6 py-5">
                  <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1B2A4A]">
                    <KeyRound className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                    Account password
                  </div>
                  <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                    Changing your account password requires your current password and a single-use
                    confirmation code sent to <strong>{effectiveEmail || 'your registered email'}</strong>.
                    Project passwords remain completely separate.
                  </p>

                  {demoMode && (
                    <div
                      role="status"
                      data-testid="demo-password-disclosure"
                      className="mt-3 rounded-lg border border-[#D4652F]/35 bg-[#FFF3EB] p-3 text-[13px] leading-[18px] text-[#A64011]"
                    >
                      Demo preview cannot send confirmation emails or modify a live account
                      password. Sign in to a live VONTA account to test the verified password flow.
                    </div>
                  )}

                  {!pendingChallenge ? (
                    <form
                      onSubmit={handleRequestPasswordChallenge}
                      noValidate
                      data-testid="account-password-step1-form"
                      className="mt-4"
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <label
                            htmlFor="account-pw-current"
                            className="block text-[14px] font-medium text-[#1B2A4A]"
                          >
                            Current password
                          </label>
                          <input
                            id="account-pw-current"
                            type="password"
                            disabled={demoMode}
                            autoComplete="current-password"
                            value={currentAccountPw}
                            onChange={(e) => setCurrentAccountPw(e.target.value)}
                            className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A] disabled:bg-[#F4F3EF]/60"
                          />
                          {accountPwErrors.current && (
                            <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                              {accountPwErrors.current}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="account-pw-new"
                            className="block text-[14px] font-medium text-[#1B2A4A]"
                          >
                            New password
                          </label>
                          <input
                            id="account-pw-new"
                            type="password"
                            disabled={demoMode}
                            autoComplete="new-password"
                            value={newAccountPw}
                            onChange={(e) => setNewAccountPw(e.target.value)}
                            className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A] disabled:bg-[#F4F3EF]/60"
                          />
                          {accountPwErrors.next && (
                            <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                              {accountPwErrors.next}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="account-pw-confirm"
                            className="block text-[14px] font-medium text-[#1B2A4A]"
                          >
                            Confirm new password
                          </label>
                          <input
                            id="account-pw-confirm"
                            type="password"
                            disabled={demoMode}
                            autoComplete="new-password"
                            value={confirmAccountPw}
                            onChange={(e) => setConfirmAccountPw(e.target.value)}
                            className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[15px] text-[#1B2A4A] disabled:bg-[#F4F3EF]/60"
                          />
                          {accountPwErrors.confirm && (
                            <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                              {accountPwErrors.confirm}
                            </p>
                          )}
                        </div>
                      </div>

                      {accountPwError && (
                        <div
                          role="alert"
                          className="mt-4 flex items-center gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{accountPwError}</span>
                        </div>
                      )}

                      {accountPwSuccess && (
                        <div
                          role="status"
                          className="mt-4 flex items-center gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] text-[#166534]"
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{accountPwSuccess}</span>
                        </div>
                      )}

                      <div className="mt-4 flex justify-end">
                        <button
                          type="submit"
                          disabled={accountPwSaving || demoMode}
                          data-testid="request-pw-confirmation-btn"
                          className="inline-flex min-h-[40px] items-center rounded-lg bg-[#1B2A4A] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#1B2A4A]/90 disabled:opacity-50"
                        >
                          {accountPwSaving
                            ? 'Sending confirmation…'
                            : 'Send email confirmation'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form
                      onSubmit={handleConfirmPasswordChange}
                      noValidate
                      data-testid="account-password-step2-form"
                      className="mt-4 rounded-xl border border-[#D4652F]/40 bg-[#FFF3EB]/45 p-4"
                    >
                      <div className="text-[14px] font-semibold text-[#1B2A4A]">
                        Confirm password change via {pendingChallenge.registeredEmail}
                      </div>
                      <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                        {pendingChallenge.info} Your current password remains active until this
                        confirmation succeeds.
                      </p>

                      <div className="mt-3 max-w-sm">
                        <label
                          htmlFor="account-pw-code"
                          className="block text-[13px] font-medium text-[#1B2A4A]"
                        >
                          Verification code
                        </label>
                        <input
                          id="account-pw-code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                          placeholder="Enter 6-digit code"
                          className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] tracking-widest text-[#1B2A4A]"
                        />
                        {accountPwErrors.code && (
                          <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                            {accountPwErrors.code}
                          </p>
                        )}
                      </div>

                      {accountPwError && (
                        <div
                          role="alert"
                          className="mt-3 flex items-center gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{accountPwError}</span>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={resendCooldownSec > 0 || accountPwSaving}
                          onClick={(e) => void handleRequestPasswordChallenge(e)}
                          className="inline-flex min-h-[38px] items-center rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-50"
                        >
                          {resendCooldownSec > 0
                            ? `Resend available in ${resendCooldownSec}s`
                            : 'Resend confirmation code'}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={accountPwSaving}
                            onClick={() => void handleCancelPasswordChallenge()}
                            className="inline-flex min-h-[40px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={accountPwSaving}
                            data-testid="confirm-pw-change-btn"
                            className="inline-flex min-h-[40px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-50"
                          >
                            {accountPwSaving ? 'Confirming…' : 'Confirm password change'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </section>

              {/* 5. Account history (kept intact) */}
              <section
                id="account-history"
                aria-labelledby="profile-history-heading"
                className="scroll-mt-[84px] rounded-xl border border-[#D9DEE2] bg-white p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#D9DEE2] pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                      <h2
                        id="profile-history-heading"
                        className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
                      >
                        Account history
                      </h2>
                    </div>
                    <p className="mt-0.5 text-[13px] leading-[18px] text-[#4F5C67]">
                      Your personal profile and security changes. Secrets, passwords, and
                      verification codes are never recorded.
                    </p>
                  </div>
                  {!demoMode && (
                    <button
                      type="button"
                      onClick={() => void loadAccountHistory()}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Refresh
                    </button>
                  )}
                </div>

                <div className="mt-4">
                  <AuditHistoryList
                    events={historyEvents}
                    loading={historyLoading}
                    error={historyError}
                    onRetry={() => void loadAccountHistory()}
                    displayTimezone={displayTimezone}
                    emptyTitle={
                      demoMode
                        ? 'No persistent account history in demo mode'
                        : 'No account history recorded yet'
                    }
                    emptyDescription="Profile updates, timezone changes, and verified account password changes appear here for signed-in accounts."
                  />
                </div>
              </section>

              {/* 6. Delete account */}
              <section
                id="account-danger-zone"
                aria-labelledby="delete-account-heading"
                className="scroll-mt-[84px] rounded-xl border border-[#B42318]/35 bg-white p-6"
              >
                <div className="flex items-center gap-2 border-b border-[#B42318]/20 pb-3.5">
                  <AlertTriangle className="h-4 w-4 text-[#B42318]" aria-hidden="true" />
                  <h2
                    id="delete-account-heading"
                    className="text-[18px] leading-[24px] font-semibold text-[#B42318]"
                  >
                    Danger zone
                  </h2>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-[#1B2A4A]">Delete account</div>
                    <p className="mt-1 text-[13px] leading-[19px] text-[#4F5C67]">
                      Permanently close your VONTA user account ({effectiveEmail || 'current user'}
                      ). This affects only your personal account sign-in and never deletes a
                      project.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteAccountConfirmInput('');
                      setDeleteAccountFeedback(null);
                      setDeleteAccountOpen(true);
                    }}
                    data-testid="open-delete-account-btn"
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-[#B42318] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#912018]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete account
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Account Confirmation Modal */}
      {deleteAccountOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-modal-title"
          data-testid="delete-account-modal"
        >
          <div className="w-full max-w-lg rounded-xl border border-[#D9DEE2] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#B42318]" aria-hidden="true" />
                <h2
                  id="delete-account-modal-title"
                  className="text-[18px] font-semibold text-[#1B2A4A]"
                >
                  Delete account
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close delete account dialog"
                onClick={() => setDeleteAccountOpen(false)}
                className="rounded-lg p-1 text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/60 p-3.5 text-[13px] text-[#1B2A4A]">
              <div>
                <strong>Account:</strong> {displayName || effectiveInitialName}
              </div>
              <div>
                <strong>Email:</strong> {effectiveEmail || 'Current user'}
              </div>
            </div>

            <p className="mt-3 text-[13px] leading-[19px] text-[#4F5C67]">
              This action applies strictly to your personal user account and never triggers project
              deletion. Type{' '}
              <code className="font-semibold text-[#1B2A4A]">{expectedDeletePhrase}</code> below to
              confirm.
            </p>

            <form onSubmit={handleSubmitDeleteAccount} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="delete-account-confirm-input"
                  className="block text-[13px] font-medium text-[#1B2A4A]"
                >
                  Confirmation phrase
                </label>
                <input
                  id="delete-account-confirm-input"
                  type="text"
                  value={deleteAccountConfirmInput}
                  onChange={(e) => setDeleteAccountConfirmInput(e.target.value)}
                  placeholder={expectedDeletePhrase}
                  className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] px-3 text-[14px] text-[#1B2A4A]"
                />
              </div>

              {deleteAccountFeedback && (
                <div
                  role="status"
                  data-testid="delete-account-feedback"
                  className="rounded-lg border border-[#D4652F]/40 bg-[#FFF3EB] p-3 text-[13px] text-[#A64011]"
                >
                  {deleteAccountFeedback}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#D9DEE2] pt-4">
                <button
                  type="button"
                  onClick={() => setDeleteAccountOpen(false)}
                  className="inline-flex min-h-[42px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!deleteAccountPhraseMatches}
                  data-testid="confirm-delete-account-btn"
                  className="inline-flex min-h-[42px] items-center rounded-lg bg-[#B42318] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#912018] disabled:opacity-50"
                >
                  Confirm account deletion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
