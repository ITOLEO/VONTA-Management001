import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Eye,
  Globe,
  Lock,
  MapPin,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDemo } from '../context/DemoContext';
import { useDemoAddendum } from '../context/DemoAddendumContext';
import { ApiClientError, privateApi } from '../data/privateApi';
import {
  SpatialViewport3D,
  type CameraFocusCommand,
  type SpatialViewportHandle,
} from '../components/SpatialViewport3D';
import { WorkspaceCompassWidget } from '../components/WorkspaceCompassWidget';
import { resolvePinColorHex } from '../domain/attendanceEngine';
import type { LayerKey, SpatialPin } from '../domain/types';

interface AllowlistedViewerSceneState {
  areaId: string;
  modelVersionId: string;
  roomId: string | null;
  selectedPinId: string | null;
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
  layers: Record<LayerKey, boolean>;
  accessMode: 'restricted' | 'anyone_with_link';
  permission: 'viewer';
  modelAvailable: boolean;
  recoveryMessage: string | null;
}

/**
 * Dedicated read-only 3D shared view page (/share/:shareId and /demo/share/:shareId).
 * - Renders ONLY an allowlisted viewer-only 3D scene directly (never redirects into editable /spatial).
 * - Enforces Restricted (live active membership check) vs Anyone with the link (opaque token, anonymous viewer).
 * - Excludes all edit/drawing tools, Download/Share actions, source blueprint files, attendance,
 *   budgets, team roster, private drawings, and project directory discovery.
 */
export const SharedWorkspaceViewPage: React.FC<{ demoMode?: boolean }> = ({
  demoMode = false,
}) => {
  const { shareId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { accessToken, status: authStatus } = useAuth();
  const isAuthenticated = authStatus === 'authenticated';
  const authLoading = authStatus === 'loading';
  const { state: demoState, model: demoModel } = useDemo();
  const { resolveDemoShare } = useDemoAddendum();

  const viewportRef = useRef<SpatialViewportHandle | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'sign_in_required' | 'denied' | 'unavailable'
  >('loading');
  const [message, setMessage] = useState<string>('');
  const [viewerScene, setViewerScene] = useState<AllowlistedViewerSceneState | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraFocusCommand | null>(null);
  const [cameraAzimuthDeg, setCameraAzimuthDeg] = useState(0);
  const [showGroundCompass, setShowGroundCompass] = useState(false);
  const pinCardRef = useRef<HTMLElement | null>(null);
  const pinCardOpenerRef = useRef<HTMLElement | null>(null);
  const prevPinCardOpenRef = useRef(false);

  useEffect(() => {
    const isOpen = Boolean(selectedPinId);
    const wasOpen = prevPinCardOpenRef.current;
    prevPinCardOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (active && active !== document.body && !pinCardRef.current?.contains(active)) {
        pinCardOpenerRef.current = active;
      }
      const raf = window.requestAnimationFrame(() => {
        pinCardRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(raf);
    }

    if (!isOpen && wasOpen) {
      const opener = pinCardOpenerRef.current;
      pinCardOpenerRef.current = null;
      if (opener && opener.isConnected) {
        window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
      }
    }
  }, [selectedPinId]);

  useEffect(() => {
    if (!selectedPinId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedPinId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPinId]);

  // Anonymous visitor simulation toggle for demo verification (`?visitor=anonymous`)
  const asAnonymousVisitor = searchParams.get('visitor') === 'anonymous';

  useEffect(() => {
    if (!shareId) {
      setStatus('denied');
      setMessage('Invalid shared view link.');
      return;
    }

    if (demoMode) {
      const res = resolveDemoShare(shareId, { asAnonymousVisitor });
      if (!res.ok || !res.share) {
        setStatus(res.errorCode === 'ACCESS_DENIED' ? 'denied' : 'unavailable');
        setMessage(res.errorMessage || 'This shared view link is restricted or disabled.');
        setViewerScene(null);
        return;
      }
      setViewerScene({
        areaId: res.share.areaId,
        modelVersionId: res.share.modelVersionId,
        roomId: res.share.roomId,
        selectedPinId: res.share.selectedPinId,
        camera: res.share.camera,
        layers: res.share.layers,
        accessMode: res.share.accessMode,
        permission: 'viewer',
        modelAvailable: true,
        recoveryMessage: null,
      });
      setSelectedPinId(res.share.selectedPinId);
      setStatus('ready');
      return;
    }

    if (authLoading) return;

    let cancelled = false;
    const resolveLive = async () => {
      // 1. If authenticated, try member-authorized resolution first
      if (isAuthenticated && accessToken && !asAnonymousVisitor) {
        try {
          const res = await privateApi.resolveWorkspaceShare(accessToken, shareId);
          if (cancelled) return;
          if (!res.modelAvailable) {
            setStatus('unavailable');
            setMessage(
              res.recoveryMessage || 'The published model referenced by this share link is no longer active.'
            );
            return;
          }
          setViewerScene({
            areaId: res.share.areaId,
            modelVersionId: res.share.modelVersionId,
            roomId: res.share.roomId,
            selectedPinId: res.share.selectedPinId,
            camera: res.share.camera,
            layers: res.share.layers,
            accessMode: res.share.accessMode,
            permission: 'viewer',
            modelAvailable: res.modelAvailable,
            recoveryMessage: res.recoveryMessage,
          });
          setSelectedPinId(res.share.selectedPinId);
          setStatus('ready');
          return;
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiClientError) {
            setStatus(err.status === 403 ? 'denied' : 'unavailable');
            setMessage(err.message);
            return;
          }
        }
      }

      // 2. Anonymous visitor: attempt public allowlisted viewer token resolution ONLY
      try {
        const pub = await privateApi.resolvePublicWorkspaceShare(shareId);
        if (cancelled) return;
        if (!pub.modelAvailable) {
          setStatus('unavailable');
          setMessage(
            pub.recoveryMessage || 'The published model referenced by this share link is no longer active.'
          );
          return;
        }
        setViewerScene({
          areaId: pub.viewerShare.areaId,
          modelVersionId: pub.viewerShare.modelVersionId,
          roomId: pub.viewerShare.roomId,
          selectedPinId: pub.viewerShare.selectedPinId,
          camera: pub.viewerShare.camera,
          layers: pub.viewerShare.layers,
          accessMode: 'anyone_with_link',
          permission: 'viewer',
          modelAvailable: pub.modelAvailable,
          recoveryMessage: pub.recoveryMessage,
        });
        setSelectedPinId(pub.viewerShare.selectedPinId);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (!isAuthenticated) {
          setStatus('sign_in_required');
          setMessage(
            err instanceof ApiClientError
              ? err.message
              : 'This shared Workspace view is restricted to active project members.'
          );
        } else {
          setStatus('denied');
          setMessage(
            err instanceof ApiClientError
              ? err.message
              : 'This shared view link is restricted or has been disabled.'
          );
        }
      }
    };

    void resolveLive();
    return () => {
      cancelled = true;
    };
  }, [shareId, demoMode, isAuthenticated, accessToken, authLoading, asAnonymousVisitor, resolveDemoShare]);

  // Apply saved camera snapshot once the read-only 3D canvas mounts
  useEffect(() => {
    if (status !== 'ready' || !viewerScene?.camera) return;
    const cam = viewerScene.camera;
    const timer = window.setTimeout(() => {
      viewportRef.current?.applyCameraSnapshot(cam);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [status, viewerScene]);

  // Allowlisted Pin markers ONLY (strips worker names, materials, budgets, and QC internal notes for viewer-only safety)
  const allowlistedPins = useMemo<SpatialPin[]>(() => {
    if (!viewerScene || !demoMode) return [];
    return demoState.pins
      .filter((p) => !viewerScene.areaId || viewerScene.areaId === 'all' || p.areaId === viewerScene.areaId)
      .map((p) => ({
        ...p,
        assigneeName: 'Project team',
        description: '',
        materials: [],
        evidence: { before: null, after: null },
      }));
  }, [viewerScene, demoMode, demoState.pins]);

  const selectedPin = useMemo(
    () => allowlistedPins.find((p) => p.id === selectedPinId) ?? null,
    [allowlistedPins, selectedPinId]
  );

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F4F3EF] p-6 text-[#1B2A4A]">
        <div className="w-full max-w-md rounded-xl border border-[#D9DEE2] bg-white p-8 text-center">
          <div className="text-[15px] font-semibold">Opening read-only Workspace view…</div>
          <p className="mt-1.5 text-[13px] text-[#4F5C67]">
            Checking link permissions and loading allowlisted 3D scene data.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'sign_in_required') {
    return (
      <div
        data-testid="shared-view-sign-in-required"
        className="flex min-h-dvh items-center justify-center bg-[#F4F3EF] p-6 text-[#1B2A4A]"
      >
        <div className="w-full max-w-md rounded-xl border border-[#D9DEE2] bg-white p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-[#1B2A4A]" aria-hidden="true" />
          <h1 className="mt-3 text-[22px] leading-[28px] font-bold">Sign in to view</h1>
          <p className="mt-2 text-[14px] leading-[20px] text-[#4F5C67]">
            {message || 'This shared view is restricted to active project members.'}
          </p>
          <div className="mt-6 flex justify-center">
            <Link
              to={`/auth/sign-in?redirect=${encodeURIComponent(`/share/${shareId}`)}`}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-[#A64011] px-5 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'denied' || status === 'unavailable' || !viewerScene) {
    return (
      <div
        data-testid={status === 'denied' ? 'shared-view-denied' : 'shared-view-unavailable'}
        className="flex min-h-dvh items-center justify-center bg-[#F4F3EF] p-6 text-[#1B2A4A]"
      >
        <div className="w-full max-w-md rounded-xl border border-[#D9DEE2] bg-white p-8 text-center">
          {status === 'denied' ? (
            <ShieldAlert className="mx-auto h-8 w-8 text-[#B42318]" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mx-auto h-8 w-8 text-[#A64011]" aria-hidden="true" />
          )}
          <h1 className="mt-3 text-[22px] leading-[28px] font-bold">
            {status === 'denied' ? 'Access denied' : 'Shared view unavailable'}
          </h1>
          <p className="mt-2 text-[14px] leading-[20px] text-[#4F5C67]">
            {message || 'This shared view link is restricted or has been disabled.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="shared-readonly-viewer-page"
      data-access-mode={viewerScene.accessMode}
      data-permission={viewerScene.permission}
      className="flex h-dvh flex-col bg-[#F4F3EF] text-[#1B2A4A]"
    >
      {/* Minimal isolated header — NO project directory link, NO module tabs, NO edit/download/share actions */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#D9DEE2] bg-white px-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#1B2A4A] text-[12px] font-bold text-white">
            V
          </span>
          <div>
            <div className="text-[14px] leading-[18px] font-semibold text-[#1B2A4A]">
              Shared 3D View
            </div>
            <div className="text-[11px] leading-[14px] text-[#4F5C67]">
              Viewer only · Private marks, source files & operational data excluded
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="shared-viewer-mode-badge"
            className="inline-flex items-center gap-1 rounded-md border border-[#D9DEE2] bg-[#F4F3EF] px-2.5 py-1 text-[12px] font-semibold text-[#1B2A4A]"
          >
            {viewerScene.accessMode === 'anyone_with_link' ? (
              <>
                <Globe className="h-3.5 w-3.5 text-[#A64011]" aria-hidden="true" />
                Anyone with the link · Viewer
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5 text-[#1B2A4A]" aria-hidden="true" />
                Restricted · Viewer
              </>
            )}
          </span>
        </div>
      </header>

      {/* Isolated Read-Only 3D Viewport */}
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1">
          {demoMode ? (
            <SpatialViewport3D
              ref={viewportRef}
              model={demoModel}
              pins={allowlistedPins}
              selectedPinId={selectedPinId}
              selectedElementId={null}
              activeRoomId={viewerScene.roomId as any}
              layers={viewerScene.layers}
              createMode={false}
              pendingHit={null}
              cameraCommand={cameraCommand}
              onSelectPin={(pid) => setSelectedPinId(pid)}
              onSelectElement={() => {}}
              onClearSelection={() => setSelectedPinId(null)}
              onCreateSurfaceHit={() => {}}
              onCreateVoidClick={() => {}}
              annotations={[]}
              canDraw={false}
              hideLocalDrawings={true}
              readOnlyViewer={true}
              northAngleDeg={0}
              showGroundCompass={showGroundCompass}
              onCameraAzimuthChange={setCameraAzimuthDeg}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#EDECE7] p-6">
              <div className="max-w-md rounded-xl border border-[#D9DEE2] bg-white p-6 text-center shadow-sm">
                <Eye className="mx-auto h-7 w-7 text-[#1B2A4A]" aria-hidden="true" />
                <h2 className="mt-2.5 text-[17px] font-semibold text-[#1B2A4A]">
                  Verified Read-Only Scene
                </h2>
                <p className="mt-1 text-[13px] text-[#4F5C67]">
                  Model version <strong className="text-[#1B2A4A]">{viewerScene.modelVersionId}</strong>{' '}
                  · Area <strong className="text-[#1B2A4A]">{viewerScene.areaId}</strong>
                </p>
                <p className="mt-2 text-[12px] text-[#4F5C67]">
                  Viewer-only snapshot loaded. Camera position and allowlisted layers are active;
                  no edit tools, source files, or project directory links are exposed.
                </p>
              </div>
            </div>
          )}

          {/* Top-right read-only compass */}
          <div className="pointer-events-none absolute right-3 top-3 z-20">
            <WorkspaceCompassWidget
              cameraAzimuthDeg={cameraAzimuthDeg}
              northAngleDeg={demoMode ? 0 : null}
              showGroundCompass={showGroundCompass}
              onToggleGroundCompass={() => setShowGroundCompass((v) => !v)}
            />
          </div>

          {/* Minimal read-only bottom view reset */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[#D9DEE2] bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={() => setCameraCommand({ id: Date.now(), kind: 'overall' })}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                <Eye className="h-3.5 w-3.5 text-[#4F5C67]" aria-hidden="true" />
                Reset view
              </button>
            </div>
          </div>
        </div>

        {/* Allowlisted read-only Pin summary overlay (no edit actions, no worker/budget/evidence leaks) */}
        {selectedPin && (
          <aside
            ref={pinCardRef}
            tabIndex={-1}
            aria-label="Read-only Pin summary"
            data-testid="shared-viewer-pin-card"
            className="fixed inset-x-0 bottom-0 z-30 max-h-[60dvh] overflow-y-auto rounded-t-2xl border-t border-[#D9DEE2] bg-white p-4 shadow-xl outline-none md:absolute md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:z-30 md:h-full md:max-h-none md:w-[320px] md:rounded-none md:border-l md:border-t-0 md:shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: resolvePinColorHex(selectedPin.color) }}
                />
                <div>
                  <h2 className="text-[15px] font-semibold text-[#1B2A4A]">{selectedPin.title}</h2>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[#4F5C67]">
                    <MapPin className="h-3.5 w-3.5 text-[#D4652F]" aria-hidden="true" />
                    <span>
                      {selectedPin.roomName} · {selectedPin.department}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPinId(null)}
                aria-label="Close read-only Pin summary"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-3 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/60 p-2.5 text-[12px] text-[#4F5C67]">
              Viewer-only mode. Editing, QC actions, material requests, and private records are
              unavailable on shared view links.
            </p>
          </aside>
        )}
      </main>
    </div>
  );
};
