import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { validateDeleteProjectPhrase } from '../domain/accountTypes';

export interface DeleteProjectImpactCounts {
  areaCount?: number;
  blueprintCount?: number;
  publishedModelCount?: number;
  pinCount?: number;
}

interface DeleteProjectModalProps {
  open: boolean;
  projectName: string;
  projectId: string;
  impact?: DeleteProjectImpactCounts;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (payload: { keyword: string; typedProjectName: string }) => void;
}

export function DeleteProjectModal({
  open,
  projectName,
  projectId,
  impact,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: DeleteProjectModalProps) {
  const [keyword, setKeyword] = useState('');
  const [typedProjectName, setTypedProjectName] = useState('');
  const [submittedAttempt, setSubmittedAttempt] = useState(false);

  useEffect(() => {
    if (open) {
      setKeyword('');
      setTypedProjectName('');
      setSubmittedAttempt(false);
    }
  }, [open, projectId, projectName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const phraseCheck = validateDeleteProjectPhrase({
    keyword,
    typedProjectName,
    actualProjectName: projectName,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedAttempt(true);
    if (!phraseCheck.valid) return;
    onConfirm({ keyword, typedProjectName });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-title"
      data-testid="delete-project-modal"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#D9DEE2] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-[#B42318]" aria-hidden="true" />
            <h2
              id="delete-project-title"
              className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]"
            >
              Delete project
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close delete project dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-[15px] leading-[22px] text-[#4F5C67]">
          You are about to delete{' '}
          <strong className="font-semibold text-[#1B2A4A]">{projectName}</strong>{' '}
          (<span className="font-mono text-[13px]">{projectId}</span>).
        </p>

        {/* Impact Summary & Logical Deletion Disclosure */}
        <div className="mt-3 rounded-lg border border-[#B42318]/25 bg-[#FEF3F2]/70 p-3.5 text-[13px] leading-[19px] text-[#1B2A4A]">
          <div className="font-semibold text-[#B42318]">Logical deletion &amp; access revocation</div>
          <p className="mt-1 text-[#4F5C67]">
            This project will be logically deleted: it disappears from every member’s directory, all
            project routes and private blueprint files lose access immediately, and a restricted
            deletion audit record is preserved in History.
          </p>
          {impact && (
            <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-[#B42318]/20 pt-2.5 text-[12px] sm:grid-cols-4">
              <div>
                <dt className="text-[#4F5C67]">Areas</dt>
                <dd className="font-semibold text-[#1B2A4A] tabular-nums">{impact.areaCount ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[#4F5C67]">Blueprints</dt>
                <dd className="font-semibold text-[#1B2A4A] tabular-nums">
                  {impact.blueprintCount ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-[#4F5C67]">Published models</dt>
                <dd className="font-semibold text-[#1B2A4A] tabular-nums">
                  {impact.publishedModelCount ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-[#4F5C67]">Work Pins</dt>
                <dd className="font-semibold text-[#1B2A4A] tabular-nums">{impact.pinCount ?? 0}</dd>
              </div>
            </dl>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <div>
            <div className="text-[13px] leading-[18px] text-[#4F5C67]">
              Required confirmation phrase (exact case and spaces):
            </div>
            <div
              data-testid="expected-delete-phrase"
              className="mt-1 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] px-3 py-2 font-mono text-[13px] font-semibold text-[#1B2A4A] select-all"
            >
              {phraseCheck.expectedPhrase}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_auto_1fr] sm:items-end">
            <div>
              <label
                htmlFor="delete-project-keyword-input"
                className="block text-[13px] font-medium text-[#1B2A4A]"
              >
                Type DELETE
              </label>
              <input
                id="delete-project-keyword-input"
                data-testid="delete-keyword-input"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={submittedAttempt && Boolean(phraseCheck.keywordError)}
                className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 font-mono text-[14px] text-[#1B2A4A]"
              />
            </div>

            <div className="flex h-11 items-center justify-center rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] px-3 font-mono text-[13px] font-semibold text-[#1B2A4A]">
              PROJECT
            </div>

            <div>
              <label
                htmlFor="delete-project-name-input"
                className="block text-[13px] font-medium text-[#1B2A4A]"
              >
                Exact project name
              </label>
              <input
                id="delete-project-name-input"
                data-testid="delete-name-input"
                type="text"
                value={typedProjectName}
                onChange={(e) => setTypedProjectName(e.target.value)}
                placeholder={projectName}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={submittedAttempt && Boolean(phraseCheck.projectNameError)}
                className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
              />
            </div>
          </div>

          {(submittedAttempt && (phraseCheck.keywordError || phraseCheck.projectNameError)) && (
            <div role="alert" className="text-[13px] leading-[18px] font-medium text-[#B42318]">
              {phraseCheck.keywordError || phraseCheck.projectNameError}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[#B42318]/35 bg-[#FEF3F2] p-3 text-[13px] leading-[18px] font-medium text-[#B42318]"
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !phraseCheck.valid}
              data-testid="confirm-delete-project-btn"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-[#B42318] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white hover:bg-[#912018] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? 'Deleting…' : 'Delete project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
