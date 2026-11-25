import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Box,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Layers,
  Menu,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { DEFAULT_BLUEPRINT_SRC } from '../domain/demoStore';
import { useAuth } from '../context/AuthContext';

export type PublicSection = 'overview' | '3d-workspace' | 'accounting';
type DropdownMenuKey = 'product' | 'workflows' | null;

interface NavMenuItem {
  title: string;
  description: string;
  to: string;
  icon: typeof Box;
  tag?: string;
}

const PRODUCT_MENU_ITEMS: NavMenuItem[] = [
  {
    title: '3D Workspace',
    description: 'Inspect areas, rooms, and surface-anchored Pins.',
    to: '/features/3d-workspace',
    icon: Box,
  },
  {
    title: 'Materials & Accounting',
    description: 'Track Pin material demand, receipts, and department budgets.',
    to: '/features/accounting',
    icon: Wallet,
  },
  {
    title: 'Blueprint-to-3D',
    description: 'Convert dimensioned floor sheets into calibrated models.',
    to: '/#blueprint-to-3d',
    icon: Layers,
  },
];

const WORKFLOW_MENU_ITEMS: NavMenuItem[] = [
  {
    title: 'Field PIN & QC',
    description: 'Assign one worker per Pin with Before/After photo proof.',
    to: '/#field-pin-qc',
    icon: ClipboardCheck,
  },
  {
    title: 'Team & Attendance',
    description: 'Isolate Owner, Contractor, Foreman, and Accounting scopes.',
    to: '/#role-oversight',
    icon: Users,
  },
  {
    title: 'Sample Workspace',
    description: 'Explore Paviliun Kerja (A-03 R00) in an isolated local session.',
    to: '/demo/projects',
    icon: Compass,
    tag: 'Sample',
  },
];

/**
 * Shared single-grid wrapper: ~72% content width at 1920px (1384px),
 * preserving crisp side gutters on 1440px laptops and narrow screens.
 */
const GRID_CONTAINER = 'mx-auto w-full max-w-[1384px] px-5 sm:px-8 lg:px-12 xl:px-14';

export function LandingPage({ section = 'overview' }: { section?: PublicSection }) {
  const location = useLocation();
  const { user, isConfigured } = useAuth();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const navAreaRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [navClickTick, setNavClickTick] = useState(0);
  const [openMenu, setOpenMenu] = useState<DropdownMenuKey>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isSignedIn = Boolean(isConfigured && user);
  const primaryCtaTo = isSignedIn ? '/projects' : '/auth/sign-in';
  const primaryCtaLabel = isSignedIn ? 'Open projects' : 'Sign in';

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openDropdown = (menu: Exclude<DropdownMenuKey, null>) => {
    clearCloseTimer();
    setOpenMenu(menu);
  };

  const scheduleCloseDropdown = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpenMenu(null);
    }, 150);
  };

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  // Scroll to hash or top and focus destination heading on route change
  useEffect(() => {
    setOpenMenu(null);
    setMobileMenuOpen(false);
    if (location.hash) {
      const targetId = location.hash.slice(1);
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    const raf = window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [location.pathname, location.hash, section, navClickTick]);

  // Dismiss dropdown or mobile menu on Escape or outside pointer click
  useEffect(() => {
    if (!openMenu && !mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setMobileMenuOpen(false);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (navAreaRef.current && !navAreaRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [openMenu, mobileMenuOpen]);

  const handleNavItemClick = () => {
    setOpenMenu(null);
    setMobileMenuOpen(false);
    setNavClickTick((n) => n + 1);
  };

  const handleNavFocusOut = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpenMenu(null);
    }
  };

  const renderDropdownPanel = (menuKey: Exclude<DropdownMenuKey, null>, items: NavMenuItem[]) => {
    if (openMenu !== menuKey) return null;
    return (
      <div
        role="region"
        aria-label={menuKey === 'product' ? 'Product menu' : 'Workflows menu'}
        data-testid={`landing-menu-panel-${menuKey}`}
        onMouseEnter={() => openDropdown(menuKey)}
        onMouseLeave={scheduleCloseDropdown}
        className="absolute left-0 top-full z-40 w-[340px] pt-2"
      >
        <div className="rounded-xl border border-[#D9DEE2] bg-white p-2 shadow-lg">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <Link
                    to={item.to}
                    onClick={handleNavItemClick}
                    className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE]"
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D9DEE2] bg-[#FAF9F6] text-[#1B2A4A] transition-colors group-hover:border-[#D4652F]/40 group-hover:text-[#A64011]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[14px] leading-[20px] font-semibold text-[#1B2A4A]">
                        <span>{item.title}</span>
                        {item.tag && (
                          <span className="rounded bg-[#FFF3EB] px-1.5 py-0.5 text-[12px] leading-[14px] font-medium text-[#A64011]">
                            {item.tag}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-[18px] text-[#4F5C67]">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      {/* Aligned Single-Grid Public Header: Brand + Product Menus on Left | Account Actions on Far Right */}
      <header className="sticky top-0 z-30 border-b border-[#D9DEE2] bg-white/95 backdrop-blur-xs">
        <div className={`${GRID_CONTAINER} flex h-16 items-center justify-between gap-4`}>
          <div
            ref={navAreaRef}
            onBlur={handleNavFocusOut}
            className="flex min-w-0 items-center gap-6 lg:gap-8"
          >
            <Link
              to="/"
              onClick={handleNavItemClick}
              className="font-display shrink-0 whitespace-nowrap rounded text-[20px] leading-[24px] font-extrabold tracking-tight text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              VONTA
            </Link>

            <nav aria-label="Public navigation" className="hidden items-center gap-1 md:flex">
              {/* Product dropdown */}
              <div
                className="relative"
                onMouseEnter={() => openDropdown('product')}
                onMouseLeave={scheduleCloseDropdown}
              >
                <button
                  type="button"
                  data-testid="landing-nav-product"
                  aria-expanded={openMenu === 'product'}
                  aria-haspopup="true"
                  onFocus={() => openDropdown('product')}
                  onClick={() => setOpenMenu((cur) => (cur === 'product' ? null : 'product'))}
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 py-2 text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                    openMenu === 'product' || section !== 'overview'
                      ? 'bg-[#F4F3EF] font-semibold text-[#1B2A4A]'
                      : 'text-[#4F5C67] hover:bg-[#F4F3EF]/70 hover:text-[#1B2A4A]'
                  }`}
                >
                  <span>Product</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-150 ${
                      openMenu === 'product' ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {renderDropdownPanel('product', PRODUCT_MENU_ITEMS)}
              </div>

              {/* Workflows dropdown */}
              <div
                className="relative"
                onMouseEnter={() => openDropdown('workflows')}
                onMouseLeave={scheduleCloseDropdown}
              >
                <button
                  type="button"
                  data-testid="landing-nav-workflows"
                  aria-expanded={openMenu === 'workflows'}
                  aria-haspopup="true"
                  onFocus={() => openDropdown('workflows')}
                  onClick={() => setOpenMenu((cur) => (cur === 'workflows' ? null : 'workflows'))}
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 py-2 text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                    openMenu === 'workflows'
                      ? 'bg-[#F4F3EF] font-semibold text-[#1B2A4A]'
                      : 'text-[#4F5C67] hover:bg-[#F4F3EF]/70 hover:text-[#1B2A4A]'
                  }`}
                >
                  <span>Workflows</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-150 ${
                      openMenu === 'workflows' ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {renderDropdownPanel('workflows', WORKFLOW_MENU_ITEMS)}
              </div>

              <Link
                to="/features/3d-workspace"
                onClick={handleNavItemClick}
                aria-current={section === '3d-workspace' ? 'page' : undefined}
                className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-2 text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                  section === '3d-workspace'
                    ? 'font-semibold text-[#A64011]'
                    : 'text-[#4F5C67] hover:bg-[#F4F3EF]/70 hover:text-[#1B2A4A]'
                }`}
              >
                3D workspace
              </Link>

              <Link
                to="/features/accounting"
                onClick={handleNavItemClick}
                aria-current={section === 'accounting' ? 'page' : undefined}
                className={`inline-flex min-h-[40px] items-center rounded-lg px-3 py-2 text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                  section === 'accounting'
                    ? 'font-semibold text-[#A64011]'
                    : 'text-[#4F5C67] hover:bg-[#F4F3EF]/70 hover:text-[#1B2A4A]'
                }`}
              >
                Accounting
              </Link>
            </nav>
          </div>

          {/* Far Right: Sample Entry + Primary Account Action + Mobile Toggle */}
          <div className="flex shrink-0 items-center gap-2.5">
            <Link
              to="/demo/projects"
              data-testid="landing-header-sample"
              className="hidden min-h-[40px] items-center whitespace-nowrap rounded-lg border border-[#D9DEE2] bg-white px-3.5 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] sm:inline-flex"
            >
              Try sample
            </Link>
            <Link
              to={primaryCtaTo}
              data-testid="landing-header-cta"
              className="inline-flex min-h-[40px] items-center whitespace-nowrap rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              {primaryCtaLabel}
            </Link>
            <button
              type="button"
              data-testid="landing-mobile-menu-toggle"
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D9DEE2] bg-white text-[#1B2A4A] hover:bg-[#F4F3EF] md:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Menu */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile public navigation"
            data-testid="landing-mobile-nav"
            className="border-t border-[#D9DEE2] bg-white px-5 py-4 md:hidden"
          >
            <div className="space-y-4">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                  Product
                </div>
                <ul className="mt-2 space-y-1">
                  {PRODUCT_MENU_ITEMS.map((item) => (
                    <li key={item.title}>
                      <Link
                        to={item.to}
                        onClick={handleNavItemClick}
                        className="flex min-h-[42px] items-center justify-between rounded-lg px-2.5 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                      >
                        <span>{item.title}</span>
                        <ArrowRight className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-[#E6E8EB] pt-3">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-[#4F5C67]">
                  Workflows &amp; Sample
                </div>
                <ul className="mt-2 space-y-1">
                  {WORKFLOW_MENU_ITEMS.map((item) => (
                    <li key={item.title}>
                      <Link
                        to={item.to}
                        onClick={handleNavItemClick}
                        className="flex min-h-[42px] items-center justify-between rounded-lg px-2.5 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                      >
                        <span>{item.title}</span>
                        {item.tag ? (
                          <span className="rounded bg-[#FFF3EB] px-2 py-0.5 text-[12px] font-medium text-[#A64011]">
                            {item.tag}
                          </span>
                        ) : (
                          <ArrowRight className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        {section === 'overview' && (
          <>
            {/* Hero: Wide Single-Grid Composition (Left Headline + Verb CTA | Right Concise Explanation) */}
            <section className="bg-[#F4F3EF]">
              <div className={`${GRID_CONTAINER} py-14 sm:py-20 lg:py-24 xl:py-28`}>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-x-12">
                  <div className="lg:col-span-7">
                    <h1
                      ref={headingRef}
                      tabIndex={-1}
                      className="vonta-display text-[#1B2A4A] focus:outline-none"
                    >
                      See every pin on site.
                    </h1>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <Link
                        to={primaryCtaTo}
                        data-testid="landing-hero-cta"
                        className="inline-flex min-h-[46px] items-center gap-2 rounded-lg bg-[#A64011] px-5 py-2.5 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                      >
                        <span>{primaryCtaLabel}</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      <Link
                        to="/demo/projects"
                        data-testid="landing-demo-link"
                        className="inline-flex min-h-[46px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#FAF9F6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                      >
                        Explore sample project
                      </Link>
                    </div>
                    <p className="mt-3 text-[13px] leading-[18px] text-[#4F5C67]">
                      Sample access opens Paviliun Kerja (A-03 R00) in an isolated local session.
                    </p>
                  </div>

                  <div className="lg:col-span-5 lg:pb-1">
                    <p className="vonta-body max-w-[46ch] text-[#4F5C67] lg:text-[17px] lg:leading-[27px]">
                      Find any issued drawing, open its calibrated 3D area, anchor work directly to
                      building surfaces, and track attendance and departmental budgets in one
                      spatial record.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Primary Feature Band — Clean Hairline Grid, No Excess Nested Cards */}
            <section
              id="blueprint-to-3d"
              aria-label="Core capabilities"
              className="scroll-mt-20 border-t border-[#D9DEE2] bg-white"
            >
              <div className={`${GRID_CONTAINER} py-12 sm:py-16 lg:py-20`}>
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
                  {/* Left 7 cols: Blueprint-to-3D Drawing + Calibrated Model Diagram */}
                  <div className="lg:col-span-7">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="vonta-section-title text-[#1B2A4A]">Blueprint-to-3D</h2>
                      <span className="text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
                        8,400 × 6,000 mm · Cross-check 2,875 mm
                      </span>
                    </div>
                    <p className="vonta-body mt-2 max-w-[60ch] text-[#4F5C67]">
                      Turn dimensioned architectural sheets into selectable walls, openings, and
                      rooms tied directly to their issued revision.
                    </p>

                    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-12">
                      <figure className="sm:col-span-7">
                        <div className="overflow-hidden rounded-xl border border-[#D9DEE2] bg-[#FAF9F6] p-3">
                          <img
                            src={DEFAULT_BLUEPRINT_SRC}
                            alt="Architectural sheet A-03 R00 for Paviliun Kerja showing ground floor plan and wall sections"
                            className="h-44 w-full object-contain sm:h-48"
                          />
                        </div>
                        <figcaption className="mt-2 text-[13px] leading-[18px] text-[#4F5C67]">
                          Paviliun Kerja · Sheet A-03 R00 (Synthetic sample source)
                        </figcaption>
                      </figure>

                      <div className="sm:col-span-5" aria-hidden="true">
                        <div className="overflow-hidden rounded-xl border border-[#D9DEE2] bg-[#EDECE7] p-3">
                          <svg
                            viewBox="0 0 220 140"
                            className="h-44 w-full sm:h-48"
                            role="img"
                            aria-label="Calibrated 3D greybox building schematic"
                          >
                            <polygon
                              points="24,96 112,126 196,90 108,64"
                              fill="#DCDAD2"
                              stroke="#4F5C67"
                              strokeWidth="1.2"
                            />
                            <polygon
                              points="24,96 112,126 112,74 24,46"
                              fill="#FFFFFF"
                              stroke="#1B2A4A"
                              strokeWidth="1.4"
                            />
                            <polygon
                              points="112,126 196,90 196,42 112,74"
                              fill="#F4F3EF"
                              stroke="#1B2A4A"
                              strokeWidth="1.4"
                            />
                            <polygon
                              points="68,60 152,86 152,44 68,20"
                              fill="#FFFFFF"
                              fillOpacity="0.88"
                              stroke="#1B2A4A"
                              strokeWidth="1.3"
                            />
                            <circle cx="96" cy="54" r="5" fill="#D4652F" />
                            <circle cx="128" cy="64" r="5" fill="#1B2A4A" />
                            <text
                              x="12"
                              y="18"
                              fill="#4F5C67"
                              fontSize="9"
                              fontFamily="Inter, sans-serif"
                              fontWeight="600"
                            >
                              GREYBOX MODEL · R00
                            </text>
                          </svg>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[13px] leading-[18px] text-[#4F5C67]">
                          <span>Calibrated surfaces</span>
                          <span className="font-medium text-[#1B2A4A]">3 rooms</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right 5 cols: Spatial Workspace & Field PIN / QC separated by clean divider */}
                  <div className="flex flex-col justify-between divide-y divide-[#D9DEE2] border-t border-[#D9DEE2] pt-8 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
                    <div className="pb-7">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="vonta-section-title text-[#1B2A4A]">Spatial Workspace</h2>
                        <Link
                          to="/features/3d-workspace"
                          className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#A64011] hover:underline"
                        >
                          <span>Inspect 3D</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </div>
                      <p className="vonta-body mt-2 text-[#4F5C67]">
                        Jump to any room and anchor independent Pins to the exact wall or floor face
                        where work occurs.
                      </p>

                      <dl className="mt-4 divide-y divide-[#E6E8EB] border-y border-[#E6E8EB] text-[14px] leading-[20px]">
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <dt className="font-semibold text-[#1B2A4A] tabular-nums">A03-PIN-01</dt>
                          <dd className="text-[#4F5C67]">Ruang Rapat · Skim coat</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <dt className="font-semibold text-[#A64011] tabular-nums">A03-PIN-02</dt>
                          <dd className="text-[#4F5C67]">Ruang Rapat · Switch box</dd>
                        </div>
                      </dl>
                    </div>

                    <div id="field-pin-qc" className="scroll-mt-24 pt-7">
                      <h2 className="vonta-section-title text-[#1B2A4A]">Field PIN &amp; QC</h2>
                      <p className="vonta-body mt-2 text-[#4F5C67]">
                        Each Pin tracks one assigned worker, department scope, material readiness,
                        and Before/After photo proof.
                      </p>
                      <dl className="mt-4 divide-y divide-[#E6E8EB] border-t border-[#E6E8EB] text-[14px] leading-[20px]">
                        <div className="flex items-center justify-between gap-4 py-2">
                          <dt className="text-[#4F5C67]">Evidence</dt>
                          <dd className="font-medium text-[#1B2A4A]">Before &amp; After slots</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 py-2">
                          <dt className="text-[#4F5C67]">Review states</dt>
                          <dd className="font-medium text-[#1B2A4A]">
                            Open · Pending QC · Approved
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Secondary Capability Band: Materials & Accounting | Role-Isolated Oversight */}
            <section
              id="role-oversight"
              aria-label="Operations and oversight"
              className="scroll-mt-20 border-t border-[#D9DEE2] bg-[#F4F3EF]"
            >
              <div className={`${GRID_CONTAINER} py-12 sm:py-16 lg:py-20`}>
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
                  {/* Left 6 cols: Materials & Accounting */}
                  <div className="lg:col-span-6">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="vonta-section-title text-[#1B2A4A]">
                        Warehouse, materials &amp; accounting
                      </h2>
                      <Link
                        to="/features/accounting"
                        className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#A64011] hover:underline"
                      >
                        <span>Review accounting</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                    <p className="vonta-body mt-2 text-[#4F5C67]">
                      Trace material requests from the Pin that triggered them through warehouse
                      stock, purchasing, receiving costs, and monthly departmental budgets.
                    </p>

                    <div className="mt-6 grid grid-cols-1 gap-5 border-t border-[#D9DEE2] pt-5 sm:grid-cols-3">
                      <div>
                        <h3 className="text-[14px] font-semibold text-[#1B2A4A]">Pin demand</h3>
                        <p className="mt-1 text-[13px] leading-[19px] text-[#4F5C67]">
                          Requirements stay linked to room, surface, and work order.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-[#1B2A4A]">
                          Receiving costs
                        </h3>
                        <p className="mt-1 text-[13px] leading-[19px] text-[#4F5C67]">
                          Supplier receipts benchmarked against Market List prices.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-[#1B2A4A]">
                          Department spend
                        </h3>
                        <p className="mt-1 text-[13px] leading-[19px] text-[#4F5C67]">
                          Separate warehouse stock from Civil, Electrical, and Plumbing usage.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right 6 cols: Role-Isolated Oversight */}
                  <div className="border-t border-[#D9DEE2] pt-8 lg:col-span-6 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
                    <h2 className="vonta-section-title text-[#1B2A4A]">
                      Verified progress for every role
                    </h2>
                    <p className="vonta-body mt-2 text-[#4F5C67]">
                      Dedicated accounts keep their registered role across invited projects, while
                      standard worker accounts move cleanly between Worker and Foreman scopes.
                    </p>

                    <div className="mt-6 grid grid-cols-2 gap-5 border-t border-[#D9DEE2] pt-5 sm:grid-cols-4">
                      <div>
                        <h3 className="text-[14px] font-semibold text-[#1B2A4A]">Owner</h3>
                        <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                          Verified progress
                        </p>
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-[#1B2A4A]">Contractor</h3>
                        <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                          Models &amp; teams
                        </p>
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-[#1B2A4A]">
                          Worker / Foreman
                        </h3>
                        <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                          Tasks &amp; attendance
                        </p>
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-[#1B2A4A]">Accounting</h3>
                        <p className="mt-1 text-[13px] leading-[18px] text-[#4F5C67]">
                          Stock &amp; budgets
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {section === '3d-workspace' && (
          <>
            <section className="bg-[#F4F3EF]">
              <div className={`${GRID_CONTAINER} py-14 sm:py-20 lg:py-24`}>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
                  <div className="lg:col-span-7">
                    <p className="text-[13px] leading-[18px] font-semibold uppercase tracking-wide text-[#A64011]">
                      VONTA · 3D workspace
                    </p>
                    <h1
                      ref={headingRef}
                      tabIndex={-1}
                      className="vonta-display mt-3 text-[#1B2A4A] focus:outline-none"
                    >
                      Work in 3D.
                    </h1>
                  </div>
                  <div className="lg:col-span-5">
                    <p className="vonta-body max-w-[46ch] text-[#4F5C67] lg:text-[17px] lg:leading-[27px]">
                      Select an area, jump to a room, anchor work to a wall or floor surface Pin,
                      track required materials, and verify Before/After photos in one spatial model.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="border-t border-[#D9DEE2] bg-white">
              <div className={`${GRID_CONTAINER} py-12 sm:py-16 lg:py-20`}>
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start lg:gap-12">
                  <div className="lg:col-span-6">
                    <dl className="divide-y divide-[#D9DEE2] border-y border-[#D9DEE2]">
                      <div className="py-5">
                        <dt className="vonta-section-title text-[#1B2A4A]">
                          Blueprint review and area selector
                        </dt>
                        <dd className="vonta-body mt-1.5 text-[#4F5C67]">
                          Browse issued sheets by department and revision on Project Overview, then
                          switch building areas directly inside the 3D viewport.
                        </dd>
                      </div>
                      <div className="py-5">
                        <dt className="vonta-section-title text-[#1B2A4A]">
                          Rooms and surface-anchored Pins
                        </dt>
                        <dd className="vonta-body mt-1.5 text-[#4F5C67]">
                          Jump straight to Ruang Kerja, Ruang Rapat, or Ruang Arsip. Place multiple
                          independent Pins on the same wall — such as skim coating (A03-PIN-01) and
                          a switch box (A03-PIN-02).
                        </dd>
                      </div>
                      <div className="py-5">
                        <dt className="vonta-section-title text-[#1B2A4A]">
                          Ownership, materials, and QC
                        </dt>
                        <dd className="vonta-body mt-1.5 text-[#4F5C67]">
                          Each Pin carries one assigned worker, its department scope, isolated
                          material requirements, and Before/After evidence slots.
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="lg:col-span-6">
                    <figure>
                      <div className="overflow-hidden rounded-xl border border-[#D9DEE2] bg-[#FAF9F6] p-4">
                        <img
                          src={DEFAULT_BLUEPRINT_SRC}
                          alt="Paviliun Kerja A-03 R00 architectural blueprint used for the sample 3D workspace"
                          className="h-auto w-full object-contain"
                        />
                      </div>
                      <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[13px] leading-[18px] text-[#4F5C67]">
                        <span>Paviliun Kerja · Sheet A-03 R00 (Synthetic sample source)</span>
                        <span className="tabular-nums">Ruang Rapat check: 2,875 mm</span>
                      </figcaption>
                    </figure>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {section === 'accounting' && (
          <>
            <section className="bg-[#F4F3EF]">
              <div className={`${GRID_CONTAINER} py-14 sm:py-20 lg:py-24`}>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
                  <div className="lg:col-span-7">
                    <p className="text-[13px] leading-[18px] font-semibold uppercase tracking-wide text-[#A64011]">
                      VONTA · Materials and accounting
                    </p>
                    <h1
                      ref={headingRef}
                      tabIndex={-1}
                      className="vonta-display mt-3 text-[#1B2A4A] focus:outline-none"
                    >
                      Materials and accounting.
                    </h1>
                  </div>
                  <div className="lg:col-span-5">
                    <p className="vonta-body max-w-[46ch] text-[#4F5C67] lg:text-[17px] lg:leading-[27px]">
                      Follow material requests from the Spatial Pin that triggered them through
                      warehouse stock, purchasing, actual receiving costs, and departmental usage.
                    </p>
                    <p className="mt-3 text-[13px] leading-[18px] font-medium text-[#A64011]">
                      Pin material requirements and department budget ledgers are active; warehouse
                      receiving workflows remain in development.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="border-t border-[#D9DEE2] bg-white">
              <div className={`${GRID_CONTAINER} py-12 sm:py-16 lg:py-20`}>
                <div className="grid grid-cols-1 divide-y divide-[#D9DEE2] border-y border-[#D9DEE2] md:grid-cols-3 md:divide-x md:divide-y-0">
                  <div className="py-6 md:pr-8">
                    <h2 className="vonta-section-title text-[#1B2A4A]">Requests from Pins</h2>
                    <p className="vonta-body mt-2 text-[#4F5C67]">
                      When a Civil Pin requires skim coat compound in Ruang Rapat, the Store Request
                      links directly back to that Pin so warehouse staff see where stock goes.
                    </p>
                  </div>

                  <div className="py-6 md:px-8">
                    <h2 className="vonta-section-title text-[#1B2A4A]">
                      Purchasing and receiving cost
                    </h2>
                    <p className="vonta-body mt-2 text-[#4F5C67]">
                      Shortages move from Store Requests to Purchase Requests benchmarked against
                      Market List prices while Goods Receipts record actual supplier costs.
                    </p>
                  </div>

                  <div className="py-6 md:pl-8">
                    <h2 className="vonta-section-title text-[#1B2A4A]">Departmental usage</h2>
                    <p className="vonta-body mt-2 text-[#4F5C67]">
                      Accounting separates warehouse purchases from Civil, Electrical, and Plumbing
                      usage so owners review verified spend against monthly allocations.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Aligned Single-Grid Footer */}
      <footer className="border-t border-[#D9DEE2] bg-white">
        <div className={`${GRID_CONTAINER} py-10`}>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-6">
              <div className="font-display text-[19px] leading-[24px] font-extrabold tracking-tight text-[#1B2A4A]">
                VONTA
              </div>
              <p className="mt-2 max-w-sm text-[14px] leading-[20px] text-[#4F5C67]">
                Spatial construction operations for owners, contractors, field teams, warehouse, and
                accounting.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 md:col-span-6 md:justify-items-end">
              <div>
                <h2 className="text-[13px] leading-[18px] font-semibold uppercase tracking-wide text-[#1B2A4A]">
                  Product
                </h2>
                <ul className="mt-2.5 space-y-2 text-[14px] leading-[20px]">
                  <li>
                    <Link
                      to="/"
                      onClick={handleNavItemClick}
                      className="text-[#4F5C67] hover:text-[#1B2A4A]"
                    >
                      Overview
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/features/3d-workspace"
                      onClick={handleNavItemClick}
                      className="text-[#4F5C67] hover:text-[#1B2A4A]"
                    >
                      3D workspace
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/features/accounting"
                      onClick={handleNavItemClick}
                      className="text-[#4F5C67] hover:text-[#1B2A4A]"
                    >
                      Accounting
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <h2 className="text-[13px] leading-[18px] font-semibold uppercase tracking-wide text-[#1B2A4A]">
                  Access
                </h2>
                <ul className="mt-2.5 space-y-2 text-[14px] leading-[20px]">
                  <li>
                    <Link to={primaryCtaTo} className="text-[#4F5C67] hover:text-[#1B2A4A]">
                      {primaryCtaLabel}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/demo/projects"
                      className="font-medium text-[#A64011] underline underline-offset-4 hover:text-[#8C350E]"
                    >
                      Explore sample project
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
