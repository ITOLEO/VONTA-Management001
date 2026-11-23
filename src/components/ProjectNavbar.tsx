import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  FolderKanban,
  Menu,
  PanelLeft,
  X,
} from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { useLayoutShell } from '../context/LayoutShellContext';
import { ResetDemoModal } from './ResetDemoModal';
import { ProfileMenu } from './ProfileMenu';
import { ProjectClock } from './ProjectClock';
import { getProjectRoutes } from '../utils/projectRoutes';

type OpenMenuKey = 'project' | 'warehouse' | 'overflow' | 'profile' | null;

/** Consistent synthetic demo account identity (never uses "Contractor Demo" as a person's name) */
export const DEMO_ACCOUNT_DISPLAY_NAME = 'Budi Santoso';
export const DEMO_ACCOUNT_EMAIL = 'budi.santoso@demo.vonta.local';
export const DEMO_ACCOUNT_AVATAR_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="32" fill="#1B2A4A"/>
      <circle cx="32" cy="24" r="11" fill="#F4F3EF"/>
      <path d="M14 55c2.5-10.5 10.5-16 18-16s15.5 5.5 18 16" fill="#D4652F"/>
    </svg>`
  );

interface ProjectNavbarProps {
  /** When inside a project, show project switcher and module navigation */
  inProjectContext?: boolean;
  /** Optional context label when not inside a project (e.g. "Projects" or "Account") */
  sectionLabel?: string;
  /** Whether the current page renders a left contextual rail (shows mobile drawer trigger) */
  hasContextualRail?: boolean;
}

/**
 * Shared top navigation bar for demo routes (Field Operations Revision):
 * - Top modules: Overview, Workspace, PIN, Warehouse, Accounting, Team, Attendance.
 * - Responsive labeled "More" overflow menu for narrow laptop widths, plus mobile drawer < lg.
 * - Far right: local project clock with seconds before profile block, then portrait + name + email ProfileMenu.
 */
export function ProjectNavbar({
  inProjectContext = true,
  sectionLabel,
  hasContextualRail = true,
}: ProjectNavbarProps) {
  const { state, resetDemo } = useDemo();
  const { toggleMobileRail } = useLayoutShell();
  const location = useLocation();
  const navContainerRef = useRef<HTMLDivElement | null>(null);

  const [openMenu, setOpenMenu] = useState<OpenMenuKey>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const routes = getProjectRoutes(location.pathname, state.project.slug);

  useEffect(() => {
    if (!openMenu && !mobileMenuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setMobileMenuOpen(false);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (navContainerRef.current && !navContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [openMenu, mobileMenuOpen]);

  useEffect(() => {
    setOpenMenu(null);
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  const isOverviewActive =
    location.pathname === routes.overviewPath ||
    location.pathname === `${routes.overviewPath}/` ||
    location.pathname.includes('/blueprints');
  const isWorkspaceActive = location.pathname.endsWith('/spatial');
  const isPinActive =
    location.pathname.includes('/pin') || location.pathname.includes('/work');
  const isWarehouseActive =
    location.pathname.endsWith('/inventory') ||
    location.pathname.endsWith('/store-requests') ||
    location.pathname.endsWith('/purchase-requests') ||
    location.pathname.endsWith('/market-list') ||
    location.pathname.endsWith('/goods-receipts');
  const isAccountingActive = location.pathname.endsWith('/accounting');
  const isTeamActive =
    location.pathname.endsWith('/team') || location.pathname.endsWith('/users');
  const isAttendanceActive = location.pathname.endsWith('/attendance');

  const warehouseItems = [
    { label: 'Inventory', to: routes.modulePath('inventory') },
    { label: 'Store Requests', to: routes.modulePath('store-requests') },
    { label: 'Purchase Requests', to: routes.modulePath('purchase-requests') },
    { label: 'Market List', to: routes.modulePath('market-list') },
    { label: 'Goods Receipts', to: routes.modulePath('goods-receipts') },
  ];

  const toggleMenu = (key: OpenMenuKey) => {
    setOpenMenu((prev) => (prev === key ? null : key));
  };

  const navLinkClass = (active: boolean) =>
    `inline-flex h-[60px] items-center whitespace-nowrap border-b-2 px-2 text-[13.5px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE] xl:px-2.5 xl:text-[14px] ${
      active
        ? 'border-[#D4652F] font-semibold text-[#1B2A4A]'
        : 'border-transparent text-[#4F5C67] hover:text-[#1B2A4A]'
    }`;

  return (
    <>
      <header
        ref={navContainerRef}
        data-testid="vonta-top-bar"
        className="sticky top-0 z-30 shrink-0 border-b border-[#D9DEE2] bg-white"
      >
        <div className="flex h-[60px] w-full items-center justify-between gap-2 px-3 sm:px-4 lg:px-5">
          {/* Left: Mobile Rail Trigger + VONTA + Project Switcher */}
          <div className="flex shrink-0 items-center gap-2">
            {hasContextualRail && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  setMobileMenuOpen(false);
                  toggleMobileRail();
                }}
                aria-label="Open section navigation"
                data-testid="mobile-rail-trigger"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] md:hidden"
              >
                <PanelLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <Link
              to={routes.directoryPath}
              className="shrink-0 whitespace-nowrap rounded text-[18px] leading-[24px] font-bold tracking-tight text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              VONTA
            </Link>

            {inProjectContext ? (
              <>
                <span aria-hidden="true" className="text-[#D9DEE2]">
                  /
                </span>
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleMenu('project')}
                    aria-expanded={openMenu === 'project'}
                    aria-haspopup="menu"
                    data-testid="project-switcher-trigger"
                    className="inline-flex min-h-[42px] max-w-[140px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF]/60 px-2.5 py-1 text-[13.5px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] sm:max-w-[165px] md:min-h-[38px] 2xl:max-w-[195px]"
                  >
                    <span className="truncate">{state.project.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#4F5C67]" aria-hidden="true" />
                  </button>

                  {openMenu === 'project' && (
                    <div
                      role="menu"
                      aria-label="Project switcher"
                      className="absolute left-0 top-full z-40 mt-1.5 w-64 rounded-xl border border-[#D9DEE2] bg-white p-2 shadow-lg"
                    >
                      <div className="px-2.5 py-1.5 text-[13px] leading-[18px] text-[#4F5C67]">
                        Active project
                      </div>
                      <Link
                        to={routes.overviewPath}
                        role="menuitem"
                        className="block rounded-lg bg-[#F4F3EF]/80 px-2.5 py-2 text-left transition-colors hover:bg-[#F4F3EF]"
                      >
                        <div className="text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                          {state.project.name}
                        </div>
                        <div className="text-[13px] leading-[18px] text-[#4F5C67]">
                          {state.project.roleLabel} · {state.project.sheetCode}{' '}
                          {state.project.sheetRevision}
                        </div>
                      </Link>

                      <div className="my-2 border-t border-[#D9DEE2]" />

                      <Link
                        to={routes.directoryPath}
                        role="menuitem"
                        className="flex min-h-[42px] items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] md:min-h-[38px]"
                      >
                        <FolderKanban className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                        All projects
                      </Link>
                    </div>
                  )}
                </div>
              </>
            ) : sectionLabel ? (
              <>
                <span aria-hidden="true" className="text-[#D9DEE2]">
                  /
                </span>
                <span className="truncate text-[14px] leading-[20px] font-medium text-[#4F5C67]">
                  {sectionLabel}
                </span>
              </>
            ) : null}
          </div>

          {/* Center: Top-Bar Module Switcher (Desktop >= lg / 1024px) */}
          {inProjectContext && (
            <nav
              aria-label="Project modules"
              className="hidden items-center gap-0.5 lg:flex xl:gap-1"
            >
              <Link
                to={routes.overviewPath}
                aria-current={isOverviewActive ? 'page' : undefined}
                data-testid="nav-overview-link"
                className={navLinkClass(isOverviewActive)}
              >
                Overview
              </Link>

              <Link
                to={routes.workspacePath}
                aria-current={isWorkspaceActive ? 'page' : undefined}
                data-testid="nav-workspace-link"
                className={navLinkClass(isWorkspaceActive)}
              >
                Workspace
              </Link>

              <Link
                to={routes.pinListPath}
                aria-current={isPinActive ? 'page' : undefined}
                data-testid="nav-pin-link"
                className={navLinkClass(isPinActive)}
              >
                PIN
              </Link>

              {/* Warehouse: direct link + quick-jump caret */}
              <div className="relative flex h-[60px] items-center">
                <Link
                  to={routes.modulePath('inventory')}
                  aria-current={isWarehouseActive ? 'page' : undefined}
                  data-testid="nav-warehouse-link"
                  className={`inline-flex h-[60px] items-center whitespace-nowrap border-b-2 pl-2 pr-1 text-[13.5px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE] xl:pl-2.5 xl:text-[14px] ${
                    isWarehouseActive
                      ? 'border-[#D4652F] font-semibold text-[#1B2A4A]'
                      : 'border-transparent text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  Warehouse
                </Link>
                <button
                  type="button"
                  onClick={() => toggleMenu('warehouse')}
                  aria-expanded={openMenu === 'warehouse'}
                  aria-haspopup="menu"
                  aria-label="Warehouse destinations"
                  className={`inline-flex h-[60px] items-center border-b-2 px-1 text-[#4F5C67] transition-colors hover:text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE] ${
                    isWarehouseActive || openMenu === 'warehouse'
                      ? 'border-[#D4652F] text-[#1B2A4A]'
                      : 'border-transparent'
                  }`}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                {openMenu === 'warehouse' && (
                  <div
                    role="menu"
                    aria-label="Warehouse"
                    className="absolute left-0 top-full z-40 mt-0.5 w-52 rounded-xl border border-[#D9DEE2] bg-white p-1.5 shadow-lg"
                  >
                    {warehouseItems.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        role="menuitem"
                        className="flex min-h-[38px] items-center rounded-lg px-3 py-1.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF]"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                to={routes.modulePath('accounting')}
                aria-current={isAccountingActive ? 'page' : undefined}
                data-testid="nav-accounting-link"
                className={navLinkClass(isAccountingActive)}
              >
                Accounting
              </Link>

              {/* Team & Attendance visible inline on >= xl (1280px); available via labeled More menu on lg (1024-1279px) */}
              <Link
                to={routes.teamPath}
                aria-current={isTeamActive ? 'page' : undefined}
                data-testid="nav-team-link"
                className={`${navLinkClass(isTeamActive)} ${isTeamActive ? 'inline-flex' : 'hidden xl:inline-flex'}`}
              >
                Team
              </Link>

              <Link
                to={routes.attendancePath}
                aria-current={isAttendanceActive ? 'page' : undefined}
                data-testid="nav-attendance-link"
                className={`${navLinkClass(isAttendanceActive)} ${isAttendanceActive ? 'inline-flex' : 'hidden xl:inline-flex'}`}
              >
                Attendance
              </Link>

              {/* Responsive labeled overflow menu for narrow laptop widths (lg..xl) */}
              <div className="relative flex h-[60px] items-center xl:hidden">
                <button
                  type="button"
                  onClick={() => toggleMenu('overflow')}
                  aria-expanded={openMenu === 'overflow'}
                  aria-haspopup="menu"
                  data-testid="nav-more-modules-trigger"
                  className={`inline-flex h-[60px] items-center gap-1 whitespace-nowrap border-b-2 px-2.5 text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE] ${
                    openMenu === 'overflow'
                      ? 'border-[#D4652F] text-[#1B2A4A]'
                      : 'border-transparent text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  <span>More</span>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {openMenu === 'overflow' && (
                  <div
                    role="menu"
                    aria-label="More project modules"
                    className="absolute right-0 top-full z-40 mt-0.5 w-48 rounded-xl border border-[#D9DEE2] bg-white p-1.5 shadow-lg"
                  >
                    <Link
                      to={routes.teamPath}
                      role="menuitem"
                      className={`flex min-h-[38px] items-center rounded-lg px-3 py-1.5 text-[14px] font-medium ${
                        isTeamActive
                          ? 'bg-[#FFF3EB] text-[#A64011]'
                          : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                      }`}
                    >
                      Team
                    </Link>
                    <Link
                      to={routes.attendancePath}
                      role="menuitem"
                      className={`flex min-h-[38px] items-center rounded-lg px-3 py-1.5 text-[14px] font-medium ${
                        isAttendanceActive
                          ? 'bg-[#FFF3EB] text-[#A64011]'
                          : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                      }`}
                    >
                      Attendance
                    </Link>
                  </div>
                )}
              </div>
            </nav>
          )}

          {/* Far Right: Live Project Clock (with seconds) + Profile Block + Mobile Module Switcher */}
          <div className="flex shrink-0 items-center gap-2">
            <ProjectClock timezone={state.project.timezone} />
            <ProfileMenu
              mode="demo"
              displayName={DEMO_ACCOUNT_DISPLAY_NAME}
              emailOrSubtitle={DEMO_ACCOUNT_EMAIL}
              avatarUrl={DEMO_ACCOUNT_AVATAR_SVG}
              badgeText="Demo preview · Local session"
              timezoneLabel={state.project.timezone}
              accountPath="/demo/profile"
              open={openMenu === 'profile'}
              onOpenChange={(next) => setOpenMenu(next ? 'profile' : null)}
              onResetDemo={() => setResetModalOpen(true)}
              triggerTestId="profile-menu-trigger"
            />

            {inProjectContext && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  setMobileMenuOpen((v) => !v);
                }}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close module menu' : 'Open module menu'}
                data-testid="mobile-module-menu-trigger"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] lg:hidden"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile / Tablet Scrollable Module Switcher */}
        {inProjectContext && mobileMenuOpen && (
          <div className="max-h-[calc(100dvh-60px)] overflow-y-auto border-t border-[#D9DEE2] bg-white px-4 py-3 shadow-lg lg:hidden">
            <nav aria-label="Mobile project modules" className="space-y-1">
              {[
                { label: 'Overview', to: routes.overviewPath, active: isOverviewActive },
                { label: 'Workspace', to: routes.workspacePath, active: isWorkspaceActive },
                { label: 'PIN', to: routes.pinListPath, active: isPinActive },
                { label: 'Warehouse', to: routes.modulePath('inventory'), active: isWarehouseActive },
                { label: 'Accounting', to: routes.modulePath('accounting'), active: isAccountingActive },
                { label: 'Team', to: routes.teamPath, active: isTeamActive },
                { label: 'Attendance', to: routes.attendancePath, active: isAttendanceActive },
              ].map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex min-h-[44px] items-center rounded-lg px-3 text-[15px] leading-[22px] font-medium ${
                    item.active
                      ? 'bg-[#FFF3EB] text-[#A64011]'
                      : 'text-[#1B2A4A] hover:bg-[#F4F3EF]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-[#D9DEE2] pt-2">
                <Link
                  to={routes.directoryPath}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-[15px] leading-[22px] text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]"
                >
                  <FolderKanban className="h-4 w-4" aria-hidden="true" />
                  All projects
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <ResetDemoModal
        open={resetModalOpen}
        onCancel={() => setResetModalOpen(false)}
        onConfirm={async () => {
          await resetDemo();
          setResetModalOpen(false);
        }}
      />
    </>
  );
}
