import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Compass,
  Plug,
  FileText,
  HelpCircle,
  MapPin,
  MessageSquare,
  MoreVertical,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ProjectRouteHelpers } from '../utils/projectRoutes';
import {
  runProjectSearch,
  type ProjectSearchResultItem,
  type ProjectSearchSources,
} from '../utils/projectSearch';

type ActiveHeaderAction = 'feedback' | 'search' | 'help' | 'advisor' | 'overflow' | null;

export interface ProjectHeaderActionsProps {
  projectName: string;
  routes: ProjectRouteHelpers;
  searchSources: ProjectSearchSources;
  /** Incrementing signal from parent navbar when another top menu opens */
  externalCloseSignal?: number;
  /** Notifies parent navbar to close its own open menus when a header action opens */
  onAnyActionOpen?: () => void;
}

/**
 * Shared project header actions (Stage 03):
 * - Feedback: compact popup with clear unavailable message.
 * - Search: click or Ctrl/Cmd+K scoped to current project's authorized sources, grouped results,
 *   keyboard navigation, missing-source/no-match states, and instant clear on project switch.
 * - Help: concise help for implemented controls + real project links.
 * - Advisor Center: intended right-side panel with title, close control, and exact unavailable message
 *   ("Advisor Center is not available yet.") — empty of invented findings.
 * - Accessible hover/focus tooltips on every icon button, focus restoration on close, and
 *   responsive overflow button on narrow widths (< md).
 */
export const ProjectHeaderActions: React.FC<ProjectHeaderActionsProps> = ({
  projectName,
  routes,
  searchSources,
  externalCloseSignal = 0,
  onAnyActionOpen,
}) => {
  const navigate = useNavigate();
  const [activeAction, setActiveAction] = useState<ActiveHeaderAction>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const feedbackBtnRef = useRef<HTMLButtonElement | null>(null);
  const searchBtnRef = useRef<HTMLButtonElement | null>(null);
  const helpBtnRef = useRef<HTMLButtonElement | null>(null);
  const advisorBtnRef = useRef<HTMLButtonElement | null>(null);
  const overflowBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastOpenerRef = useRef<HTMLElement | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackCloseRef = useRef<HTMLButtonElement | null>(null);
  const helpCloseRef = useRef<HTMLButtonElement | null>(null);
  const advisorCloseRef = useRef<HTMLButtonElement | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);

  const projectScopeKey = searchSources.projectScopeKey;

  // Clear previous project search query & close open header actions immediately when switching projects
  useEffect(() => {
    setSearchQuery('');
    setSelectedIndex(0);
    setActiveAction(null);
  }, [projectScopeKey]);

  // Close when parent navbar opens one of its own menus
  useEffect(() => {
    if (externalCloseSignal > 0) {
      setActiveAction(null);
    }
  }, [externalCloseSignal]);

  const closeActiveAction = useCallback((restoreFocus: boolean) => {
    setActiveAction((prev) => {
      if (!prev) return null;
      return null;
    });
    if (restoreFocus) {
      const target = lastOpenerRef.current;
      window.requestAnimationFrame(() => {
        if (target && target.isConnected) {
          target.focus({ preventScroll: true });
        }
      });
    }
  }, []);

  const openAction = useCallback(
    (next: Exclude<ActiveHeaderAction, null>, opener?: HTMLElement | null) => {
      onAnyActionOpen?.();
      setActiveAction((prev) => {
        if (prev === next) {
          if (opener && opener.isConnected) {
            window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
          }
          return null;
        }
        lastOpenerRef.current =
          opener ??
          (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        return next;
      });
    },
    [onAnyActionOpen]
  );

  // Global Ctrl+K / Cmd+K shortcut for Project Search
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onAnyActionOpen?.();
        setActiveAction((prev) => {
          if (prev === 'search') {
            window.requestAnimationFrame(() => {
              const target = lastOpenerRef.current ?? searchBtnRef.current;
              target?.focus({ preventScroll: true });
            });
            return null;
          }
          lastOpenerRef.current =
            (document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : searchBtnRef.current) ?? null;
          return 'search';
        });
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [onAnyActionOpen]);

  // Focus entry + Escape & outside click handling for active popup/panel
  useEffect(() => {
    if (!activeAction) return;

    const raf = window.requestAnimationFrame(() => {
      if (activeAction === 'search') {
        searchInputRef.current?.focus({ preventScroll: true });
      } else if (activeAction === 'feedback') {
        feedbackCloseRef.current?.focus({ preventScroll: true });
      } else if (activeAction === 'help') {
        helpCloseRef.current?.focus({ preventScroll: true });
      } else if (activeAction === 'advisor') {
        advisorCloseRef.current?.focus({ preventScroll: true });
      } else if (activeAction === 'overflow') {
        overflowMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({
          preventScroll: true,
        });
      }
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeActiveAction(true);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (activeAction === 'search' || activeAction === 'advisor') return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        closeActiveAction(false);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [activeAction, closeActiveAction]);

  const searchResult = useMemo(
    () => runProjectSearch(searchSources, searchQuery),
    [searchSources, searchQuery]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, projectScopeKey]);

  const handleSelectSearchItem = useCallback(
    (item: ProjectSearchResultItem) => {
      setActiveAction(null);
      setSearchQuery('');
      setSelectedIndex(0);
      navigate(item.to);
    },
    [navigate]
  );

  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const total = searchResult.flatItems.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (total > 0) setSelectedIndex((prev) => (prev + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (total > 0) setSelectedIndex((prev) => (prev - 1 + total) % total);
    } else if (e.key === 'Enter') {
      const activeItem = searchResult.flatItems[selectedIndex];
      if (activeItem) {
        e.preventDefault();
        handleSelectSearchItem(activeItem);
      }
    }
  };

  const renderTooltip = (text: string, suppressed: boolean) =>
    suppressed ? null : (
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#1B2A4A]/15 bg-[#1B2A4A] px-2 py-1 text-[11.5px] leading-[15px] font-medium text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {text}
      </span>
    );

  const iconBtnClass = (active: boolean) =>
    `group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
      active
        ? 'bg-[#FFF3EB] text-[#A64011]'
        : 'text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
    }`;

  const groupIcon = (groupId: ProjectSearchResultItem['groupId']) => {
    if (groupId === 'blueprints') return FileText;
    if (groupId === 'pins') return MapPin;
    return Compass;
  };

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Link to={routes.modulePath('integrations')} aria-label="Project integrations" title="Project integrations" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF]"><Plug size={16}/></Link>
      {/* Feedback (visible directly on xl+; accessible via overflow on < xl) */}
      <div className="relative hidden xl:block">
        <button
          ref={feedbackBtnRef}
          type="button"
          onClick={() => openAction('feedback', feedbackBtnRef.current)}
          aria-expanded={activeAction === 'feedback'}
          aria-haspopup="dialog"
          aria-label="Feedback"
          data-testid="header-action-feedback"
          className={iconBtnClass(activeAction === 'feedback')}
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          {renderTooltip('Feedback', activeAction === 'feedback')}
        </button>
      </div>

      {/* Search (always directly visible on desktop and phone; also opens with Ctrl/Cmd+K) */}
      <button
        ref={searchBtnRef}
        type="button"
        onClick={() => openAction('search', searchBtnRef.current)}
        aria-expanded={activeAction === 'search'}
        aria-haspopup="dialog"
        aria-label="Search project (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        data-testid="header-action-search"
        className={iconBtnClass(activeAction === 'search')}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        {renderTooltip('Search (Ctrl+K)', activeAction === 'search')}
      </button>

      {/* Help (visible directly on xl+; accessible via overflow on < xl) */}
      <div className="relative hidden xl:block">
        <button
          ref={helpBtnRef}
          type="button"
          onClick={() => openAction('help', helpBtnRef.current)}
          aria-expanded={activeAction === 'help'}
          aria-haspopup="dialog"
          aria-label="Help"
          data-testid="header-action-help"
          className={iconBtnClass(activeAction === 'help')}
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
          {renderTooltip('Help', activeAction === 'help')}
        </button>
      </div>

      {/* Advisor Center (visible directly on xl+; accessible via overflow on < xl) */}
      <div className="relative hidden xl:block">
        <button
          ref={advisorBtnRef}
          type="button"
          onClick={() => openAction('advisor', advisorBtnRef.current)}
          aria-expanded={activeAction === 'advisor'}
          aria-haspopup="dialog"
          aria-label="Advisor Center"
          data-testid="header-action-advisor"
          className={iconBtnClass(activeAction === 'advisor')}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {renderTooltip('Advisor Center', activeAction === 'advisor')}
        </button>
      </div>

      {/* Responsive Overflow for Feedback, Help & Advisor Center on tight viewports (< xl) */}
      <div className="relative xl:hidden">
        <button
          ref={overflowBtnRef}
          type="button"
          onClick={() => openAction('overflow', overflowBtnRef.current)}
          aria-expanded={activeAction === 'overflow'}
          aria-haspopup="menu"
          aria-label="More project actions"
          data-testid="header-actions-overflow-trigger"
          className={iconBtnClass(activeAction === 'overflow')}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
          {renderTooltip('More actions', activeAction === 'overflow')}
        </button>

        {activeAction === 'overflow' && (
          <div
            ref={overflowMenuRef}
            role="menu"
            aria-label="More project actions"
            data-testid="header-actions-overflow-menu"
            className="fixed right-3 top-[64px] z-50 w-52 rounded-xl border border-[#D9DEE2] bg-white p-1.5 shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              data-testid="header-overflow-feedback"
              onClick={() => {
                lastOpenerRef.current = overflowBtnRef.current;
                setActiveAction('feedback');
              }}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE]"
            >
              <MessageSquare className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
              <span>Feedback</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="header-overflow-help"
              onClick={() => {
                lastOpenerRef.current = overflowBtnRef.current;
                setActiveAction('help');
              }}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE]"
            >
              <HelpCircle className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
              <span>Help</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="header-overflow-advisor"
              onClick={() => {
                lastOpenerRef.current = overflowBtnRef.current;
                setActiveAction('advisor');
              }}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE]"
            >
              <ShieldCheck className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
              <span>Advisor Center</span>
            </button>
          </div>
        )}
      </div>

      {/* Feedback Compact Popup */}
      {activeAction === 'feedback' && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="header-feedback-title"
          data-testid="header-feedback-popup"
          className="fixed right-3 top-[64px] z-50 w-[min(320px,calc(100vw-24px))] rounded-xl border border-[#D9DEE2] bg-white p-4 shadow-xl md:absolute md:right-0 md:top-full md:mt-2 md:w-[320px]"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2
                id="header-feedback-title"
                className="text-[15px] leading-[20px] font-semibold text-[#1B2A4A]"
              >
                Feedback
              </h2>
              <p className="mt-0.5 text-[12px] leading-[16px] text-[#4F5C67]">{projectName}</p>
            </div>
            <button
              ref={feedbackCloseRef}
              type="button"
              onClick={() => closeActiveAction(true)}
              aria-label="Close Feedback"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 text-[13.5px] leading-[20px] text-[#4F5C67]">
            Project feedback is not available yet.
          </p>
        </div>
      )}

      {/* Help Concise Popup */}
      {activeAction === 'help' && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="header-help-title"
          data-testid="header-help-popup"
          className="fixed right-3 top-[64px] z-50 w-[min(350px,calc(100vw-24px))] rounded-xl border border-[#D9DEE2] bg-white p-4 shadow-xl md:absolute md:right-0 md:top-full md:mt-2 md:w-[350px]"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2
                id="header-help-title"
                className="text-[15px] leading-[20px] font-semibold text-[#1B2A4A]"
              >
                Project help
              </h2>
              <p className="mt-0.5 text-[12px] leading-[16px] text-[#4F5C67]">
                Controls available in {projectName}
              </p>
            </div>
            <button
              ref={helpCloseRef}
              type="button"
              onClick={() => closeActiveAction(true)}
              aria-label="Close Help"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <dl className="mt-3 space-y-2 border-t border-[#D9DEE2] pt-3 text-[13px] leading-[18px]">
            <div className="flex items-start justify-between gap-3">
              <dt className="font-medium text-[#1B2A4A]">Project search</dt>
              <dd className="text-right text-[#4F5C67]">Press Ctrl+K / Cmd+K</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="font-medium text-[#1B2A4A]">Sidebar modes</dt>
              <dd className="text-right text-[#4F5C67]">Sidebar control at rail footer</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="font-medium text-[#1B2A4A]">Dismiss panels</dt>
              <dd className="text-right text-[#4F5C67]">Press Escape</dd>
            </div>
          </dl>

          <div className="mt-3 border-t border-[#D9DEE2] pt-3">
            <div className="text-[11.5px] font-semibold tracking-wide text-[#4F5C67] uppercase">
              Quick links
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { label: 'Overview', to: routes.overviewPath },
                { label: 'Workspace', to: routes.workspacePath },
                { label: 'Blueprints', to: routes.blueprintManagementPath },
                { label: 'PIN', to: routes.pinListPath },
                { label: 'Settings', to: routes.settingsPath },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => closeActiveAction(false)}
                  className="rounded-lg border border-[#D9DEE2] px-2.5 py-1 text-[12.5px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Advisor Center Right-Side Panel (Empty of invented findings) */}
      {activeAction === 'advisor' && (
        <aside
          role="dialog"
          aria-modal="false"
          aria-labelledby="advisor-center-title"
          data-testid="advisor-center-panel"
          className="fixed bottom-0 right-0 top-[60px] z-40 flex w-[min(390px,100vw)] flex-col border-l border-[#D9DEE2] bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#D9DEE2] px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4.5 w-4.5 text-[#1B2A4A]" aria-hidden="true" />
              <h2
                id="advisor-center-title"
                className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]"
              >
                Advisor Center
              </h2>
            </div>
            <button
              ref={advisorCloseRef}
              type="button"
              onClick={() => closeActiveAction(true)}
              aria-label="Close Advisor Center"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <ShieldCheck className="h-8 w-8 text-[#4F5C67]/60" aria-hidden="true" />
            <p
              data-testid="advisor-center-message"
              className="mt-3 text-[15px] leading-[22px] font-medium text-[#1B2A4A]"
            >
              Advisor Center is not available yet.
            </p>
          </div>
        </aside>
      )}

      {/* Scoped Project Search Dialog (Click or Ctrl/Cmd+K) */}
      {activeAction === 'search' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-search-dialog-title"
          data-testid="header-search-dialog"
          className="fixed inset-0 z-50 flex items-start justify-center bg-[#1B2A4A]/35 px-3 pt-[10vh] backdrop-blur-[1px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeActiveAction(true);
          }}
        >
          <div className="flex max-h-[72dvh] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl border border-[#D9DEE2] bg-white shadow-2xl">
            <h2 id="project-search-dialog-title" className="sr-only">
              Search {projectName}
            </h2>

            {/* Search Input Header */}
            <div className="flex items-center gap-2.5 border-b border-[#D9DEE2] px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-[#4F5C67]" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-expanded={true}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                placeholder={`Search ${projectName}: modules, blueprint codes, or Pin IDs…`}
                aria-label={`Search ${projectName}`}
                aria-autocomplete="list"
                aria-controls="project-search-results"
                aria-activedescendant={
                  searchResult.flatItems[selectedIndex]
                    ? `project-search-opt-${searchResult.flatItems[selectedIndex].id}`
                    : undefined
                }
                data-testid="header-search-input"
                className="min-w-0 flex-1 rounded-md border-0 bg-transparent! px-1 py-0.5 text-[15px] leading-[22px] text-[#1B2A4A] placeholder:text-[#4F5C67]/75 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search query"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => closeActiveAction(true)}
                aria-label="Close search"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D9DEE2] text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Search Results Body */}
            <div
              id="project-search-results"
              role="listbox"
              aria-label="Project search results"
              data-testid="header-search-results"
              className="flex-1 overflow-y-auto p-2"
            >
              {searchResult.missingSources.length > 0 && (
                <div
                  data-testid="header-search-missing-sources"
                  className="mb-2 rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] px-3 py-2 text-[12px] leading-[16px] text-[#4F5C67]"
                >
                  Some project records are not loaded yet (
                  {searchResult.missingSources.join(', ')}). Showing available project sources.
                </div>
              )}

              {searchResult.totalCount === 0 ? (
                <div
                  data-testid="header-search-no-matches"
                  className="px-4 py-8 text-center"
                >
                  <p className="text-[14px] leading-[20px] font-medium text-[#1B2A4A]">
                    No matches for “{searchResult.query}” in {projectName}.
                  </p>
                  <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                    Try a project section, blueprint code, or Pin ID.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 py-1">
                  {searchResult.groups.map((group) => {
                    const GroupIcon = groupIcon(group.id);
                    return (
                      <div key={group.id} data-testid={`header-search-group-${group.id}`}>
                        <div className="flex items-center justify-between px-2.5 pb-1 text-[11.5px] leading-[16px] font-semibold tracking-wide text-[#4F5C67] uppercase">
                          <span>{group.label}</span>
                          <span className="tabular-nums">{group.items.length}</span>
                        </div>
                        <div className="space-y-0.5">
                          {group.items.map((item) => {
                            const flatIdx = searchResult.flatItems.findIndex(
                              (f) => f.id === item.id
                            );
                            const isSelected = flatIdx === selectedIndex;
                            return (
                              <button
                                key={item.id}
                                id={`project-search-opt-${item.id}`}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                data-testid={`header-search-item-${item.id}`}
                                onMouseEnter={() => {
                                  if (flatIdx >= 0) setSelectedIndex(flatIdx);
                                }}
                                onClick={() => handleSelectSearchItem(item)}
                                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                                  isSelected
                                    ? 'bg-[#FFF3EB] text-[#A64011]'
                                    : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                                }`}
                              >
                                <GroupIcon
                                  className={`h-4 w-4 shrink-0 ${
                                    isSelected ? 'text-[#D4652F]' : 'text-[#4F5C67]'
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[14px] leading-[20px] font-medium">
                                    {item.title}
                                  </span>
                                  <span className="block truncate text-[12px] leading-[16px] text-[#4F5C67]">
                                    {item.subtitle}
                                  </span>
                                </span>
                                {item.badge && (
                                  <span className="shrink-0 rounded bg-[#F4F3EF] px-2 py-0.5 text-[11.5px] leading-[16px] font-medium text-[#4F5C67] tabular-nums">
                                    {item.badge}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Keyboard Hint Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-[#D9DEE2] bg-[#FAF9F6] px-4 py-2 text-[12px] leading-[16px] text-[#4F5C67]">
              <span>Scope: {projectName}</span>
              <span className="hidden sm:inline">↑↓ Select · Enter Open · Esc Close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
