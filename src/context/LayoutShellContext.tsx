import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  DEFAULT_SIDEBAR_MODE,
  readSidebarMode,
  writeSidebarMode,
  type SidebarMode,
} from '../utils/sidebarModePreference';

interface LayoutShellContextValue {
  /** Active desktop project sidebar mode persisted per user or local profile */
  sidebarMode: SidebarMode;
  setSidebarMode: (next: SidebarMode) => void;
  /** Convenience compatibility boolean: true only in persistent Expanded mode */
  railExpanded: boolean;
  setRailExpanded: (next: boolean) => void;
  toggleRailExpanded: () => void;
  /** Mobile (< md) contextual rail drawer state */
  mobileRailOpen: boolean;
  setMobileRailOpen: (next: boolean) => void;
  toggleMobileRail: () => void;
}

const LayoutShellContext = createContext<LayoutShellContextValue | null>(null);

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function LayoutShellProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const profileKey = user?.id ?? 'local';

  const [sidebarMode, setSidebarModeState] = useState<SidebarMode>(() =>
    readSidebarMode(getBrowserStorage(), profileKey)
  );
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  // Sync persisted preference when switching between authenticated users / local demo profile
  useEffect(() => {
    setSidebarModeState(readSidebarMode(getBrowserStorage(), profileKey));
  }, [profileKey]);

  const setSidebarMode = useCallback(
    (next: SidebarMode) => {
      setSidebarModeState(next);
      writeSidebarMode(getBrowserStorage(), next, profileKey);
    },
    [profileKey]
  );

  const railExpanded = sidebarMode === 'expanded';

  const setRailExpanded = useCallback(
    (next: boolean) => {
      setSidebarMode(next ? 'expanded' : DEFAULT_SIDEBAR_MODE);
    },
    [setSidebarMode]
  );

  const toggleRailExpanded = useCallback(() => {
    setSidebarModeState((prev) => {
      const next: SidebarMode = prev === 'expanded' ? DEFAULT_SIDEBAR_MODE : 'expanded';
      writeSidebarMode(getBrowserStorage(), next, profileKey);
      return next;
    });
  }, [profileKey]);

  const toggleMobileRail = useCallback(() => {
    setMobileRailOpen((prev) => !prev);
  }, []);

  const value = useMemo<LayoutShellContextValue>(
    () => ({
      sidebarMode,
      setSidebarMode,
      railExpanded,
      setRailExpanded,
      toggleRailExpanded,
      mobileRailOpen,
      setMobileRailOpen,
      toggleMobileRail,
    }),
    [
      sidebarMode,
      setSidebarMode,
      railExpanded,
      setRailExpanded,
      toggleRailExpanded,
      mobileRailOpen,
      toggleMobileRail,
    ]
  );

  return <LayoutShellContext.Provider value={value}>{children}</LayoutShellContext.Provider>;
}

export function useLayoutShell(): LayoutShellContextValue {
  const ctx = useContext(LayoutShellContext);
  if (!ctx) {
    throw new Error('useLayoutShell must be used inside LayoutShellProvider');
  }
  return ctx;
}
