import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { ApiClientError, privateApi } from '../data/privateApi';
import type { AuthorizedProject, PendingInvitationRecord } from '../domain/accountTypes';

interface PrivateProjectsContextValue {
  projects: AuthorizedProject[];
  pendingInvitations: PendingInvitationRecord[];
  activeDraft: AuthorizedProject | null;
  activeProject: AuthorizedProject | null;
  directoryLoading: boolean;
  directoryError: ApiClientError | null;
  activeProjectLoading: boolean;
  activeProjectError: ApiClientError | null;
  refreshDirectory: () => Promise<void>;
  loadActiveProject: (projectId: string) => Promise<AuthorizedProject | null>;
  syncProjectInCache: (updated: AuthorizedProject) => void;
  removeProjectFromCache: (projectId: string) => void;
  clearActiveProject: () => void;
}

const PrivateProjectsContext = createContext<PrivateProjectsContextValue | null>(null);

/**
 * Holds strictly authenticated private project data in memory.
 * Never reads DemoProvider, never falls back to demo fixtures, and clears all
 * cached private state on sign-out, access revocation (401/403), or project switch.
 */
export function PrivateProjectsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, sessionEpoch, status } = useAuth();
  const [projects, setProjects] = useState<AuthorizedProject[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitationRecord[]>([]);
  const [activeDraft, setActiveDraft] = useState<AuthorizedProject | null>(null);
  const [activeProject, setActiveProject] = useState<AuthorizedProject | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<ApiClientError | null>(null);
  const [activeProjectLoading, setActiveProjectLoading] = useState(false);
  const [activeProjectError, setActiveProjectError] = useState<ApiClientError | null>(null);

  const clearAllPrivateState = useCallback(() => {
    setProjects([]);
    setPendingInvitations([]);
    setActiveDraft(null);
    setActiveProject(null);
    setDirectoryError(null);
    setActiveProjectError(null);
  }, []);

  // Wipe private memory whenever auth session changes or signs out
  useEffect(() => {
    if (!accessToken || status !== 'authenticated') {
      clearAllPrivateState();
    }
  }, [accessToken, sessionEpoch, status, clearAllPrivateState]);

  const refreshDirectory = useCallback(async () => {
    if (!accessToken) {
      clearAllPrivateState();
      return;
    }
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const res = await privateApi.listProjects(accessToken);
      setProjects(res.projects);
      setPendingInvitations(res.pendingInvitations);
      setActiveDraft(res.activeDraft);
    } catch (err) {
      const apiErr =
        err instanceof ApiClientError
          ? err
          : new ApiClientError({ status: 500, code: 'UNKNOWN', message: 'Failed to load projects.' });
      if (apiErr.status === 401) {
        clearAllPrivateState();
      }
      setDirectoryError(apiErr);
    } finally {
      setDirectoryLoading(false);
    }
  }, [accessToken, clearAllPrivateState]);

  const loadActiveProject = useCallback(
    async (projectId: string): Promise<AuthorizedProject | null> => {
      if (!accessToken) {
        setActiveProject(null);
        return null;
      }
      // Clear previous project immediately when switching projects so stale project data never flashes
      setActiveProject((prev) => (prev && prev.id === projectId ? prev : null));
      setActiveProjectLoading(true);
      setActiveProjectError(null);
      try {
        const res = await privateApi.getProject(accessToken, projectId);
        setActiveProject(res.project);
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === res.project.id);
          return exists
            ? prev.map((p) => (p.id === res.project.id ? res.project : p))
            : [res.project, ...prev];
        });
        return res.project;
      } catch (err) {
        const apiErr =
          err instanceof ApiClientError
            ? err
            : new ApiClientError({
                status: 500,
                code: 'UNKNOWN',
                message: 'Could not load this project.',
              });
        setActiveProject(null);
        setActiveProjectError(apiErr);
        if (apiErr.status === 401 || apiErr.status === 403) {
          // Clear revoked project from local directory cache immediately
          setProjects((prev) => prev.filter((p) => p.id !== projectId));
        }
        return null;
      } finally {
        setActiveProjectLoading(false);
      }
    },
    [accessToken]
  );

  const syncProjectInCache = useCallback((updated: AuthorizedProject) => {
    setActiveProject((prev) => (prev?.id === updated.id ? updated : prev));
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      return exists
        ? prev.map((p) => (p.id === updated.id ? updated : p))
        : [updated, ...prev];
    });
    if (updated.status === 'draft') {
      setActiveDraft(updated);
    }
  }, []);

  const removeProjectFromCache = useCallback((projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setActiveProject((prev) => (prev?.id === projectId ? null : prev));
    setActiveDraft((prev) => (prev?.id === projectId ? null : prev));
  }, []);

  const clearActiveProject = useCallback(() => {
    setActiveProject(null);
    setActiveProjectError(null);
  }, []);

  const value = useMemo<PrivateProjectsContextValue>(
    () => ({
      projects,
      pendingInvitations,
      activeDraft,
      activeProject,
      directoryLoading,
      directoryError,
      activeProjectLoading,
      activeProjectError,
      refreshDirectory,
      loadActiveProject,
      syncProjectInCache,
      removeProjectFromCache,
      clearActiveProject,
    }),
    [
      projects,
      pendingInvitations,
      activeDraft,
      activeProject,
      directoryLoading,
      directoryError,
      activeProjectLoading,
      activeProjectError,
      refreshDirectory,
      loadActiveProject,
      syncProjectInCache,
      removeProjectFromCache,
      clearActiveProject,
    ]
  );

  return (
    <PrivateProjectsContext.Provider value={value}>{children}</PrivateProjectsContext.Provider>
  );
}

export function usePrivateProjects(): PrivateProjectsContextValue {
  const ctx = useContext(PrivateProjectsContext);
  if (!ctx) {
    throw new Error('usePrivateProjects must be used inside PrivateProjectsProvider');
  }
  return ctx;
}
