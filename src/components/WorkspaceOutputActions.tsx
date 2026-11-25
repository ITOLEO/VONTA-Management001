import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Link2,
  Lock,
  Share2,
  ShieldOff,
  UserPlus,
  X,
} from 'lucide-react';
import type { SpatialViewportHandle } from './SpatialViewport3D';
import { resolveWorkspaceOutputVisibility } from '../domain/workspaceControls';

export type ShareAccessMode = 'restricted' | 'anyone_with_link';

export interface CreatedShareResult {
  shareId: string;
  shareUrl: string;
  accessMode: ShareAccessMode;
  publicToken?: string | null;
}

interface WorkspaceOutputActionsProps {
  canDownload: boolean;
  canShare: boolean;
  canInvite?: boolean;
  onOpenInviteModal?: () => void;
  projectName: string;
  projectId: string;
  accountId: string;
  modelVersionId: string;
  areaId: string;
  viewportRef: React.RefObject<SpatialViewportHandle | null>;
  onAuthorizeDownload: () => Promise<{ suggestedFileName: string }>;
  onCreateShareLink: (
    camera: {
      position: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
    },
    accessMode: ShareAccessMode
  ) => Promise<CreatedShareResult>;
  onUpdateShareAccess?: (
    shareId: string,
    accessMode: ShareAccessMode
  ) => Promise<CreatedShareResult>;
  onRevokeShareLink?: (shareId: string) => Promise<void>;
}

/**
 * Authorized Workspace Download View (clean PNG) and Share View (Restricted vs Anyone with the link).
 * - Preserves separate download vs share entitlements (Doc 05).
 * - Share defaults to Restricted (signed-in active project members only) with fixed Viewer permission.
 * - Optional Anyone with the link generates an opaque read-only viewer link with Change to restricted
 *   and Disable link revocation actions, plus Invite to project entry point.
 */
export function WorkspaceOutputActions({
  canDownload,
  canShare,
  canInvite = false,
  onOpenInviteModal,
  projectName,
  modelVersionId,
  areaId,
  viewportRef,
  onAuthorizeDownload,
  onCreateShareLink,
  onUpdateShareAccess,
  onRevokeShareLink,
}: WorkspaceOutputActionsProps) {
  const visibility = resolveWorkspaceOutputVisibility({ canDownload, canShare });
  const [expanded, setExpanded] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [updatingShare, setUpdatingShare] = useState(false);
  const [selectedAccessMode, setSelectedAccessMode] = useState<ShareAccessMode>('restricted');
  const [activeShare, setActiveShare] = useState<CreatedShareResult | null>(null);
  const [revokedNotice, setRevokedNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!visibility.showToggle) {
    return null;
  }

  const handleDownloadView = async () => {
    setOutputError(null);
    setDownloadSuccess(null);
    setDownloading(true);
    try {
      const auth = await onAuthorizeDownload();
      const handle = viewportRef.current;
      if (!handle) {
        throw new Error('3D viewport is still initializing. Try again in a moment.');
      }

      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
      const { blob } = await handle.captureCleanPng({
        provenanceBanner: `${projectName} · ${areaId} · ${modelVersionId} · ${timestamp} · Clean view (private marks excluded)`,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = auth.suggestedFileName || `vonta-${areaId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setDownloadSuccess(`Clean PNG saved (${auth.suggestedFileName}). Private local drawings excluded.`);
      window.setTimeout(() => setDownloadSuccess(null), 5000);
    } catch (err) {
      setOutputError(err instanceof Error ? err.message : 'Download failed. Please retry.');
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenShareModal = async () => {
    setOutputError(null);
    setRevokedNotice(null);
    setCopied(false);
    setShareModalOpen(true);

    if (activeShare) return;

    const handle = viewportRef.current;
    const camera = handle?.getCameraSnapshot();
    if (!camera) {
      setOutputError('3D camera state is not ready yet. Try again in a moment.');
      return;
    }

    setSharing(true);
    try {
      const created = await onCreateShareLink(camera, 'restricted');
      setActiveShare(created);
      setSelectedAccessMode(created.accessMode);
    } catch (err) {
      setOutputError(err instanceof Error ? err.message : 'Could not create shared view link.');
    } finally {
      setSharing(false);
    }
  };

  const handleChangeAccessMode = async (nextMode: ShareAccessMode) => {
    if (!activeShare || nextMode === activeShare.accessMode) {
      setSelectedAccessMode(nextMode);
      return;
    }
    setOutputError(null);
    setRevokedNotice(null);
    setCopied(false);
    setUpdatingShare(true);
    try {
      if (onUpdateShareAccess) {
        const updated = await onUpdateShareAccess(activeShare.shareId, nextMode);
        setActiveShare(updated);
        setSelectedAccessMode(updated.accessMode);
      } else {
        const camera = viewportRef.current?.getCameraSnapshot();
        if (!camera) throw new Error('3D camera state unavailable.');
        const recreated = await onCreateShareLink(camera, nextMode);
        setActiveShare(recreated);
        setSelectedAccessMode(recreated.accessMode);
      }
    } catch (err) {
      setOutputError(err instanceof Error ? err.message : 'Could not update share access mode.');
    } finally {
      setUpdatingShare(false);
    }
  };

  const handleDisableLink = async () => {
    if (!activeShare) return;
    setOutputError(null);
    setUpdatingShare(true);
    try {
      if (onRevokeShareLink) {
        await onRevokeShareLink(activeShare.shareId);
      }
      setActiveShare(null);
      setSelectedAccessMode('restricted');
      setRevokedNotice('Shared view link disabled. Existing links can no longer open this view.');
    } catch (err) {
      setOutputError(err instanceof Error ? err.message : 'Could not disable share link.');
    } finally {
      setUpdatingShare(false);
    }
  };

  const handleCreateFreshLink = async () => {
    const camera = viewportRef.current?.getCameraSnapshot();
    if (!camera) {
      setOutputError('3D camera state is not ready yet.');
      return;
    }
    setOutputError(null);
    setRevokedNotice(null);
    setSharing(true);
    try {
      const created = await onCreateShareLink(camera, selectedAccessMode);
      setActiveShare(created);
      setSelectedAccessMode(created.accessMode);
    } catch (err) {
      setOutputError(err instanceof Error ? err.message : 'Could not create share link.');
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!activeShare?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(activeShare.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      data-testid="workspace-output-actions"
      data-expanded={expanded ? 'true' : 'false'}
      className="pointer-events-auto flex flex-col items-end gap-1.5"
    >
      <div className="flex items-center gap-1">
        {expanded && (
          <div
            data-testid="workspace-output-tray"
            className="flex items-center gap-1.5 rounded-xl border border-[#D9DEE2] bg-white/95 p-1 shadow-sm backdrop-blur"
          >
            {visibility.showDownload && (
              <button
                type="button"
                disabled={downloading}
                data-testid="workspace-download-view-btn"
                onClick={() => void handleDownloadView()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5 text-[#A64011]" aria-hidden="true" />
                <span>{downloading ? 'Exporting…' : 'Download view'}</span>
              </button>
            )}

            {visibility.showDownload && visibility.showShare && (
              <div className="h-5 w-px bg-[#D9DEE2]" aria-hidden="true" />
            )}

            {visibility.showShare && (
              <button
                type="button"
                disabled={sharing}
                data-testid="workspace-share-view-btn"
                onClick={() => void handleOpenShareModal()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] disabled:opacity-50"
              >
                <Share2 className="h-3.5 w-3.5 text-[#1B2A4A]" aria-hidden="true" />
                <span>{sharing ? 'Creating link…' : 'Share view'}</span>
              </button>
            )}
          </div>
        )}

        {/* Small right-edge arrow toggle to show or hide Download view / Share view */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={
            expanded ? 'Hide Download and Share actions' : 'Show Download and Share actions'
          }
          title={expanded ? 'Hide view output actions' : 'Show view output actions'}
          data-testid="workspace-output-toggle"
          className="inline-flex h-[40px] w-7 items-center justify-center rounded-l-lg rounded-r-md border border-[#D9DEE2] bg-white/95 text-[#4F5C67] shadow-sm backdrop-blur transition-colors hover:bg-[#F4F3EF] hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
        >
          {expanded ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {downloadSuccess && (
        <div
          role="status"
          data-testid="workspace-download-success"
          className="max-w-[320px] rounded-lg border border-[#166534]/35 bg-white px-3 py-2 text-[12px] font-medium text-[#166534] shadow-sm"
        >
          {downloadSuccess}
        </div>
      )}

      {outputError && !shareModalOpen && (
        <div
          role="alert"
          data-testid="workspace-output-error"
          className="flex max-w-[320px] items-start gap-2 rounded-lg border border-[#B42318]/40 bg-white px-3 py-2 text-[12px] font-medium text-[#B42318] shadow-sm"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{outputError}</span>
        </div>
      )}

      {/* Share View Modal (Restricted vs Anyone with the link · Viewer-only + Invite to project) */}
      {shareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2A4A]/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label="Share Workspace view"
          data-testid="workspace-share-modal"
        >
          <div className="w-full max-w-[500px] rounded-2xl border border-[#D9DEE2] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#D9DEE2] pb-3.5">
              <div>
                <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                  Share Workspace view
                </h2>
                <p className="mt-0.5 text-[13px] text-[#4F5C67]">
                  Read-only 3D viewer link. Private local drawings, source files, attendance, and
                  budgets are never included.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                aria-label="Close Share modal"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Access Mode Selector + Fixed Viewer Permission Badge */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                    Link access
                  </span>
                  <span
                    data-testid="share-permission-badge"
                    className="inline-flex items-center rounded-md border border-[#D9DEE2] bg-[#F4F3EF] px-2 py-0.5 text-[11px] font-semibold text-[#1B2A4A]"
                  >
                    Permission: Viewer (read-only)
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={updatingShare || sharing}
                    data-testid="share-mode-restricted"
                    aria-pressed={selectedAccessMode === 'restricted'}
                    onClick={() => void handleChangeAccessMode('restricted')}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      selectedAccessMode === 'restricted'
                        ? 'border-[#1B2A4A] bg-[#F4F3EF] text-[#1B2A4A]'
                        : 'border-[#D9DEE2] bg-white text-[#4F5C67] hover:bg-[#F4F3EF]/60'
                    }`}
                  >
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#1B2A4A]" aria-hidden="true" />
                    <div>
                      <div className="text-[13px] font-semibold text-[#1B2A4A]">Restricted</div>
                      <div className="mt-0.5 text-[11px] leading-[15px] text-[#4F5C67]">
                        Only signed-in active project members can open.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={updatingShare || sharing}
                    data-testid="share-mode-anyone"
                    aria-pressed={selectedAccessMode === 'anyone_with_link'}
                    onClick={() => void handleChangeAccessMode('anyone_with_link')}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      selectedAccessMode === 'anyone_with_link'
                        ? 'border-[#D4652F] bg-[#FFF3EB] text-[#1B2A4A]'
                        : 'border-[#D9DEE2] bg-white text-[#4F5C67] hover:bg-[#F4F3EF]/60'
                    }`}
                  >
                    <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[#A64011]" aria-hidden="true" />
                    <div>
                      <div className="text-[13px] font-semibold text-[#1B2A4A]">
                        Anyone with the link
                      </div>
                      <div className="mt-0.5 text-[11px] leading-[15px] text-[#4F5C67]">
                        Viewer-only 3D scene; no login, no membership, no project discovery.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {outputError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-[#B42318]/40 bg-[#FEF3F2] p-3 text-[12px] text-[#B42318]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{outputError}</span>
                </div>
              )}

              {revokedNotice && (
                <div
                  role="status"
                  data-testid="share-revoked-notice"
                  className="rounded-lg border border-[#D4652F]/40 bg-[#FFF3EB] p-3 text-[12px] text-[#A64011]"
                >
                  {revokedNotice}
                </div>
              )}

              {/* Generated Link Area */}
              {sharing ? (
                <div className="rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/50 px-3 py-4 text-center text-[13px] text-[#4F5C67]">
                  Generating viewer link…
                </div>
              ) : activeShare ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/60 px-2.5 py-2">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-[#4F5C67]" aria-hidden="true" />
                      <input
                        type="text"
                        readOnly
                        data-testid="workspace-share-url-input"
                        value={activeShare.shareUrl}
                        aria-label="Shared Workspace view link"
                        className="w-full min-w-0 bg-transparent text-[12px] text-[#1B2A4A] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      data-testid="workspace-share-copy-btn"
                      onClick={() => void handleCopyShareUrl()}
                      className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#1B2A4A]/90"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Copy link
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quick open + Revocation actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <a
                      href={activeShare.shareUrl}
                      data-testid="workspace-share-open-link"
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#A64011] hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Open read-only viewer
                    </a>

                    <div className="flex flex-wrap items-center gap-2">
                      {activeShare.accessMode === 'anyone_with_link' && (
                        <button
                          type="button"
                          disabled={updatingShare}
                          data-testid="share-change-to-restricted-btn"
                          onClick={() => void handleChangeAccessMode('restricted')}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#D9DEE2] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                        >
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                          Change to restricted
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={updatingShare}
                        data-testid="share-disable-link-btn"
                        onClick={() => void handleDisableLink()}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#B42318]/35 bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                      >
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                        Disable link
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-dashed border-[#D9DEE2] bg-[#F4F3EF]/40 p-3">
                  <span className="text-[12px] text-[#4F5C67]">
                    No active share link. Generate a fresh link for this view.
                  </span>
                  <button
                    type="button"
                    data-testid="share-create-new-btn"
                    onClick={() => void handleCreateFreshLink()}
                    className="rounded-lg bg-[#A64011] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#8C350E]"
                  >
                    Create link
                  </button>
                </div>
              )}

              {/* Scoped Invitation Bridge (Doc 04 & Doc 05: one scoped invitation flow from Team and Share) */}
              {canInvite && onOpenInviteModal && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#D9DEE2] pt-3.5">
                  <div className="text-[12px] text-[#4F5C67]">
                    Need to grant ongoing project membership instead of a viewer link?
                  </div>
                  <button
                    type="button"
                    data-testid="share-invite-to-project-btn"
                    onClick={() => {
                      setShareModalOpen(false);
                      onOpenInviteModal();
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#1B2A4A] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1B2A4A] hover:bg-[#F4F3EF]"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Invite to project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
