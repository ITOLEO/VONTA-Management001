import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface LayoutShellContextValue {
  /** Desktop left rail persistent pinned expansion state (click/Enter/Space toggle). Starts false. */
  railExpanded: boolean;
  setRailExpanded: (next: boolean) => void;
  toggleRailExpanded: () => void;
  /** Mobile (< md) contextual rail drawer state */
  mobileRailOpen: boolean;
  setMobileRailOpen: (next: boolean) => void;
  toggleMobileRail: () => void;
}

const LayoutShellContext = createContext<LayoutShellContextValue | null>(null);

export function LayoutShellProvider({ children }: { children: React.ReactNode }) {
  const [railExpanded, setRailExpanded] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const toggleRailExpanded = useCallback(() => {
    setRailExpanded((prev) => !prev);
  }, []);

  const toggleMobileRail = useCallback(() => {
    setMobileRailOpen((prev) => !prev);
  }, []);

  const value = useMemo<LayoutShellContextValue>(
    () => ({
      railExpanded,
      setRailExpanded,
      toggleRailExpanded,
      mobileRailOpen,
      setMobileRailOpen,
      toggleMobileRail,
    }),
    [railExpanded, mobileRailOpen, toggleRailExpanded, toggleMobileRail]
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
