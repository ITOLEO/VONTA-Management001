import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePrivateProjects } from '../context/PrivateProjectsContext';
import { ApiClientError, privateApi } from '../data/privateApi';
import {
  COMMON_TIMEZONES,
  validateProjectDraftInput,
  type AuthorizedProject,
  type ProjectDetailsValidationErrors,
} from '../domain/accountTypes';
import { PrivateNavbar } from '../components/PrivateNavbar';
import { BlueprintReviewStudio } from '../components/BlueprintReviewStudio';

const WIZARD_STEPS = [
  { num: 1 as const, label: 'Project details' },
  { num: 2 as const, label: 'Upload blueprint' },
  { num: 3 as const, label: 'Review and publish' },
];

function getOrCreateDraftKey(userId: string): string {
  const storageKey = `vonta_project_draft_key_${userId}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const created = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return `draft-${Date.now()}`;
  }
}

export function NewProjectWizardPage() {
  const navigate = useNavigate();
  const { user, profile, accessToken } = useAuth();
  const { syncProjectInCache } = usePrivateProjects();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [draftProject, setDraftProject] = useState<AuthorizedProject | null>(null);
  const [resumedNotice, setResumedNotice] = useState(false);

  // Step 1 fields (passwords are NEVER persisted to browser storage)
  const [name, setName] = useState('');
  const [contractorDisplayName, setContractorDisplayName] = useState('');
  const [projectPassword, setProjectPassword] = useState('');
  const [confirmProjectPassword, setConfirmProjectPassword] = useState('');
  const [timezone, setTimezone] = useState(profile?.displayTimezone || 'Asia/Jakarta');
  const [step1Errors, setStep1Errors] = useState<ProjectDetailsValidationErrors>({});
  const [step1GeneralError, setStep1GeneralError] = useState<string | null>(null);
  const [savingStep1, setSavingStep1] = useState(false);

  const draftKey = useMemo(
    () => (user?.id ? getOrCreateDraftKey(user.id) : 'draft-session'),
    [user?.id]
  );

  // Latest durable processing job on this draft (survives browser refresh)
  const latestDraftJob = useMemo(() => {
    const jobs = draftProject?.jobs ?? [];
    if (jobs.length === 0) return null;
    const active = jobs.find((j) => j.status !== 'published');
    return active ?? jobs[0] ?? null;
  }, [draftProject?.jobs]);

  const effectiveStep: 1 | 2 | 3 = useMemo(() => {
    if (step === 1) return 1;
    if (latestDraftJob?.proposal || latestDraftJob?.builtModel) return 3;
    return 2;
  }, [step, latestDraftJob]);

  // Load any existing server-side resumable draft for the signed-in user
  useEffect(() => {
    if (!accessToken) {
      setLoadingDraft(false);
      return;
    }
    let mounted = true;
    privateApi
      .getActiveDraft(accessToken)
      .then(({ draft }) => {
        if (!mounted) return;
        if (draft) {
          setDraftProject(draft);
          setName(draft.name);
          setContractorDisplayName(draft.contractorDisplayName);
          setTimezone(draft.timezone);
          const hasReviewableJob = Boolean(
            draft.jobs?.some((j) => Boolean(j.proposal || j.builtModel))
          );
          setStep(hasReviewableJob ? 3 : 2);
          setResumedNotice(true);
        } else if (profile?.displayName && !contractorDisplayName) {
          setContractorDisplayName(profile.displayName);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoadingDraft(false);
      });

    return () => {
      mounted = false;
    };
  }, [accessToken]);

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep1GeneralError(null);

    const validation = validateProjectDraftInput({
      name,
      contractorDisplayName,
      projectPassword,
      confirmProjectPassword,
      timezone,
      requirePassword: !draftProject,
    });
    if (Object.keys(validation).length > 0) {
      setStep1Errors(validation);
      return;
    }
    setStep1Errors({});

    if (!accessToken) {
      setStep1GeneralError('Sign in to save a project draft.');
      return;
    }

    setSavingStep1(true);
    try {
      const res = await privateApi.createOrResumeDraft(accessToken, {
        name,
        contractorDisplayName,
        projectPassword,
        confirmProjectPassword,
        timezone,
        draftKey,
        existingDraftProjectId: draftProject?.id,
      });
      setDraftProject(res.project);
      syncProjectInCache(res.project);
      setProjectPassword('');
      setConfirmProjectPassword('');
      setResumedNotice(res.resumed);
      setStep(2);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.fieldErrors) setStep1Errors(err.fieldErrors);
        setStep1GeneralError(err.message);
      } else {
        setStep1GeneralError('Could not save draft. Your entered fields have been preserved.');
      }
    } finally {
      setSavingStep1(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      <PrivateNavbar inProjectContext={false} />

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="pb-4">
          <Link
            to="/projects"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] leading-[20px] font-medium text-[#4F5C67] hover:text-[#1B2A4A]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Projects
          </Link>
        </div>

        <h1 className="text-[26px] leading-[32px] font-bold tracking-tight text-[#1B2A4A]">
          Create new project
        </h1>
        <p className="mt-1 text-[15px] leading-[22px] text-[#4F5C67]">
          Enter project details, upload and calibrate a single-floor blueprint, review the
          deterministic 3D model, and publish to open your project Overview.
        </p>

        {/* Stepper */}
        <ol
          aria-label="New project steps"
          className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {WIZARD_STEPS.map((s) => {
            const completed = effectiveStep > s.num;
            const current = effectiveStep === s.num;
            return (
              <li
                key={s.num}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                  current
                    ? 'border-[#D4652F] bg-white'
                    : completed
                      ? 'border-[#1B2A4A]/25 bg-white'
                      : 'border-[#D9DEE2] bg-white/60'
                }`}
              >
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
                    completed
                      ? 'bg-[#1B2A4A] text-white'
                      : current
                        ? 'bg-[#A64011] text-white'
                        : 'bg-[#F4F3EF] text-[#4F5C67]'
                  }`}
                >
                  {completed ? <Check className="h-4 w-4" aria-hidden="true" /> : s.num}
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] leading-[16px] text-[#4F5C67]">Step {s.num}</div>
                  <div className="truncate text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                    {s.label}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {resumedNotice && draftProject && (
          <div
            role="status"
            data-testid="draft-resumed-notice"
            className="mt-5 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#D4652F]/40 bg-white px-4 py-3 text-[14px] leading-[20px] text-[#1B2A4A]"
          >
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]" aria-hidden="true" />
              <span>
                Resumed your existing draft <strong>{draftProject.name}</strong> (ID:{' '}
                <code className="text-[12px]">{draftProject.id}</code>)
                {latestDraftJob
                  ? ` · Durable blueprint job ${latestDraftJob.id} (${latestDraftJob.status.replace('_', ' ')})`
                  : ''}
                .
              </span>
            </div>
            <Link
              to={`/projects/${draftProject.id}`}
              className="text-[13px] font-semibold text-[#A64011] underline-offset-4 hover:underline"
            >
              View draft Overview
            </Link>
          </div>
        )}

        {loadingDraft ? (
          <div className="mt-6 rounded-xl border border-[#D9DEE2] bg-white p-8 text-center text-[15px] text-[#4F5C67]">
            Checking for an existing draft…
          </div>
        ) : step === 1 ? (
          <section className="mt-6 max-w-[820px] rounded-xl border border-[#D9DEE2] bg-white p-6">
            <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
              Step 1 · Project details
            </h2>
            <p className="mt-1 text-[14px] leading-[20px] text-[#4F5C67]">
              Creating a project establishes your Contractor membership and an isolated project
              password stored as a salted server hash.
            </p>

            <form onSubmit={handleStep1Submit} noValidate className="mt-5 space-y-5">
              <div>
                <label
                  htmlFor="wizard-project-name"
                  className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                >
                  Project name <span className="text-[#B42318]">*</span>
                </label>
                <input
                  id="wizard-project-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (step1Errors.name) setStep1Errors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="e.g. Sentra Office Block B"
                  aria-invalid={Boolean(step1Errors.name)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                />
                {step1Errors.name && (
                  <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                    {step1Errors.name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="wizard-contractor-name"
                  className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                >
                  Contractor name <span className="text-[#B42318]">*</span>
                </label>
                <input
                  id="wizard-contractor-name"
                  type="text"
                  value={contractorDisplayName}
                  onChange={(e) => {
                    setContractorDisplayName(e.target.value);
                    if (step1Errors.contractorDisplayName) {
                      setStep1Errors((p) => ({ ...p, contractorDisplayName: undefined }));
                    }
                  }}
                  placeholder="e.g. PT Konstruksi Nusantara"
                  aria-invalid={Boolean(step1Errors.contractorDisplayName)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                />
                <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                  Display metadata only. Project permissions are enforced strictly from trusted
                  membership records.
                </p>
                {step1Errors.contractorDisplayName && (
                  <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                    {step1Errors.contractorDisplayName}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="wizard-project-timezone"
                  className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                >
                  Project timezone <span className="text-[#B42318]">*</span>
                </label>
                <select
                  id="wizard-project-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                  Preserved for project attendance logs and operational dates regardless of personal
                  display timezone.
                </p>
                {step1Errors.timezone && (
                  <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                    {step1Errors.timezone}
                  </p>
                )}
              </div>

              {!draftProject ? (
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-[#D9DEE2] bg-[#F4F3EF]/50 p-4 sm:grid-cols-2">
                  <div className="sm:col-span-2 flex items-start gap-2 text-[13px] leading-[18px] text-[#4F5C67]">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2A4A]" aria-hidden="true" />
                    <span>
                      The project password is separate from your account password and cannot grant
                      membership by itself.
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="wizard-project-password"
                      className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                    >
                      Project password <span className="text-[#B42318]">*</span>
                    </label>
                    <input
                      id="wizard-project-password"
                      type="password"
                      autoComplete="new-password"
                      value={projectPassword}
                      onChange={(e) => {
                        setProjectPassword(e.target.value);
                        if (step1Errors.projectPassword) {
                          setStep1Errors((p) => ({ ...p, projectPassword: undefined }));
                        }
                      }}
                      placeholder="Minimum 8 characters"
                      aria-invalid={Boolean(step1Errors.projectPassword)}
                      className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                    />
                    {step1Errors.projectPassword && (
                      <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                        {step1Errors.projectPassword}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="wizard-confirm-project-password"
                      className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                    >
                      Confirm project password <span className="text-[#B42318]">*</span>
                    </label>
                    <input
                      id="wizard-confirm-project-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmProjectPassword}
                      onChange={(e) => {
                        setConfirmProjectPassword(e.target.value);
                        if (step1Errors.confirmProjectPassword) {
                          setStep1Errors((p) => ({ ...p, confirmProjectPassword: undefined }));
                        }
                      }}
                      placeholder="Re-enter project password"
                      aria-invalid={Boolean(step1Errors.confirmProjectPassword)}
                      className="mt-1.5 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                    />
                    {step1Errors.confirmProjectPassword && (
                      <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                        {step1Errors.confirmProjectPassword}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/60 px-4 py-3 text-[13px] leading-[18px] text-[#4F5C67]">
                  Project password is already saved on this draft. You can update it later in
                  Project settings → Project access.
                </div>
              )}

              {step1GeneralError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] text-[#B42318]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{step1GeneralError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#D9DEE2] pt-4">
                <button
                  type="submit"
                  disabled={savingStep1}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#A64011] px-5 py-2 text-[14px] leading-[20px] font-semibold text-white hover:bg-[#8C350E] disabled:opacity-60"
                >
                  {savingStep1 ? 'Saving draft…' : 'Save draft & continue to Blueprint'}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </form>
          </section>
        ) : draftProject && accessToken ? (
          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-3.5 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Edit project details
              </button>
              <Link
                to={`/projects/${draftProject.id}`}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-[#D9DEE2] bg-white px-3.5 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                Save as draft & open Overview
              </Link>
            </div>

            <BlueprintReviewStudio
              accessToken={accessToken}
              project={draftProject}
              mode="initial"
              initialJob={latestDraftJob}
              onProjectUpdated={(updated) => {
                setDraftProject(updated);
                syncProjectInCache(updated);
              }}
              onPublished={(res) => {
                syncProjectInCache(res.project);
                navigate(`/projects/${res.project.id}`, { replace: true });
              }}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
