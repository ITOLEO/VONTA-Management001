import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { DEFAULT_BLUEPRINT_SRC } from '../domain/demoStore';
import { useAuth } from '../context/AuthContext';

export type PublicSection = 'overview' | '3d-workspace' | 'accounting';

const PUBLIC_NAV_ITEMS: Array<{ key: PublicSection; label: string; to: string }> = [
  { key: 'overview', label: 'Overview', to: '/' },
  { key: '3d-workspace', label: '3D workspace', to: '/features/3d-workspace' },
  { key: 'accounting', label: 'Accounting', to: '/features/accounting' },
];

export function LandingPage({ section = 'overview' }: { section?: PublicSection }) {
  const location = useLocation();
  const { user, isConfigured } = useAuth();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [navClickTick, setNavClickTick] = useState(0);

  const isSignedIn = Boolean(isConfigured && user);
  const primaryCtaTo = isSignedIn ? '/projects' : '/auth/sign-in';
  const primaryCtaLabel = isSignedIn ? 'Open projects' : 'Sign in';

  // Scroll to top and focus destination heading on route change or repeated navbar click
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    const raf = window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [location.pathname, section, navClickTick]);

  const handleNavItemClick = () => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setNavClickTick((n) => n + 1);
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
      {/* Public Header (60 px, aligned to max-w-[1200px], Layout System Figures 1–3) */}
      <header className="sticky top-0 z-30 border-b border-[#D9DEE2] bg-white">
        <div className="mx-auto flex h-[60px] max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            onClick={handleNavItemClick}
            className="shrink-0 whitespace-nowrap rounded text-[18px] leading-[24px] font-bold tracking-tight text-[#1B2A4A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
          >
            VONTA
          </Link>

          <nav aria-label="Public navigation" className="hidden items-center gap-7 md:flex">
            {PUBLIC_NAV_ITEMS.map((item) => {
              const active = section === item.key;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  onClick={handleNavItemClick}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex h-[60px] items-center whitespace-nowrap border-b-2 text-[14px] leading-[20px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B63CE] ${
                    active
                      ? 'border-[#D4652F] font-semibold text-[#1B2A4A]'
                      : 'border-transparent text-[#4F5C67] hover:text-[#1B2A4A]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="shrink-0">
            <Link
              to={primaryCtaTo}
              data-testid="landing-header-cta"
              className="inline-flex min-h-[40px] items-center whitespace-nowrap rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
            >
              {primaryCtaLabel}
            </Link>
          </div>
        </div>

        {/* Mobile Public Route Navigation */}
        <nav
          aria-label="Mobile public navigation"
          className="flex items-center gap-1.5 overflow-x-auto border-t border-[#D9DEE2] px-4 py-1.5 md:hidden"
        >
          {PUBLIC_NAV_ITEMS.map((item) => {
            const active = section === item.key;
            return (
              <Link
                key={item.key}
                to={item.to}
                onClick={handleNavItemClick}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-[40px] items-center whitespace-nowrap rounded-lg px-3 text-[14px] leading-[20px] font-medium transition-colors ${
                  active
                    ? 'bg-[#FFF3EB] font-semibold text-[#A64011]'
                    : 'text-[#4F5C67] hover:bg-[#F4F3EF]/70 hover:text-[#1B2A4A]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1">
        {section === 'overview' && (
          <>
            {/* Two-Column Desktop Hero (Phone order: Headline -> Explanation -> CTA) */}
            <section className="mx-auto max-w-[1200px] px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14 lg:px-8">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-5">
                <div className="lg:col-span-6 lg:col-start-1 lg:row-start-1">
                  <p className="text-[13px] leading-[18px] font-semibold tracking-wide text-[#A64011] uppercase">
                    VONTA Management · Precision at Every Pin
                  </p>
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="mt-3 text-[34px] leading-[40px] font-bold tracking-[-0.025em] text-[#1B2A4A] text-balance focus:outline-none sm:text-[48px] sm:leading-[52px]"
                  >
                    See what’s happening on site.
                  </h1>
                </div>

                <div className="lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:self-end">
                  <p className="text-[16px] leading-[24px] text-[#4F5C67] sm:text-[17px] sm:leading-[26px]">
                    Track work, materials and progress across your construction projects from a
                    single spatial record. Inspect source drawings, anchor tasks directly to
                    building surfaces, and review verified Before/After evidence without searching
                    through chat threads.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:col-span-6 lg:col-start-1 lg:row-start-2">
                  <Link
                    to={primaryCtaTo}
                    data-testid="landing-hero-cta"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#A64011] px-5 py-2.5 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                  >
                    {primaryCtaLabel}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    to="/demo/projects"
                    data-testid="landing-demo-link"
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
                  >
                    Open synthetic A-03 demo
                  </Link>
                </div>
              </div>
            </section>

            {/* 4-Column Desktop Feature Grid (Layout System Figures 1–2) */}
            <section
              aria-label="Core capabilities"
              className="mx-auto max-w-[1200px] px-4 pb-14 sm:px-6 sm:pb-16 lg:px-8"
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                {/* Tile 1 (2 cols): Blueprint-to-3D with cleared A-03 drawing + greybox diagram */}
                <article className="flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-5 md:col-span-2">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                        Blueprint-to-3D
                      </h2>
                      <span className="text-[13px] leading-[18px] text-[#4F5C67] tabular-nums">
                        8,400 × 6,000 mm · Check 2,875 mm
                      </span>
                    </div>
                    <p className="mt-1.5 text-[15px] leading-[22px] text-[#4F5C67]">
                      Turn dimensioned single-floor architectural sheets into a calibrated 3D model
                      with selectable walls, openings, and rooms.
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <figure className="overflow-hidden rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] p-2 sm:col-span-7">
                      <img
                        src={DEFAULT_BLUEPRINT_SRC}
                        alt="Synthetic architectural sheet A-03 R00 for Paviliun Kerja showing ground floor plan and wall sections"
                        className="h-36 w-full rounded border border-[#D9DEE2] bg-white object-contain"
                      />
                      <figcaption className="mt-1.5 truncate text-[12px] leading-[16px] text-[#4F5C67]">
                        Paviliun Kerja · A-03 R00 (Synthetic drawing)
                      </figcaption>
                    </figure>

                    <div
                      aria-hidden="true"
                      className="flex flex-col justify-between rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] p-2.5 sm:col-span-5"
                    >
                      <svg
                        viewBox="0 0 220 140"
                        className="h-36 w-full rounded border border-[#D9DEE2] bg-[#EDECE7]"
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
                          x="14"
                          y="18"
                          fill="#4F5C67"
                          fontSize="9"
                          fontFamily="Inter, sans-serif"
                          fontWeight="600"
                        >
                          GREYBOX MODEL · R00
                        </text>
                      </svg>
                      <div className="mt-1.5 flex items-center justify-between text-[12px] leading-[16px] text-[#4F5C67]">
                        <span>Calibrated meshes</span>
                        <span className="font-medium text-[#1B2A4A]">3 rooms</span>
                      </div>
                    </div>
                  </div>
                </article>

                {/* Tile 2 (1 col): Spatial Workspace */}
                <article className="flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-5">
                  <div>
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      Spatial Workspace
                    </h2>
                    <p className="mt-1.5 text-[15px] leading-[22px] text-[#4F5C67]">
                      Pick an area, jump to a room, and place independent Pins on the exact wall or
                      floor surface where work happens.
                    </p>
                  </div>

                  <div className="mt-4 rounded-lg border border-[#D9DEE2] bg-[#F4F3EF] p-3">
                    <div className="text-[12px] leading-[16px] font-semibold text-[#4F5C67] uppercase">
                      Shared partition · Ruang Rapat
                    </div>
                    <ul className="mt-2 space-y-2 text-[13px] leading-[18px]">
                      <li className="flex items-center justify-between gap-2 rounded-md border border-[#D9DEE2] bg-white px-2.5 py-1.5">
                        <span className="font-medium text-[#1B2A4A]">A03-PIN-01</span>
                        <span className="text-[#4F5C67]">Skim coat</span>
                      </li>
                      <li className="flex items-center justify-between gap-2 rounded-md border border-[#D4652F]/45 bg-[#FFF3EB] px-2.5 py-1.5">
                        <span className="font-semibold text-[#A64011]">A03-PIN-02</span>
                        <span className="text-[#1B2A4A]">Switch box</span>
                      </li>
                    </ul>
                  </div>
                </article>

                {/* Tile 3 (1 col): Work & QC */}
                <article className="flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-5">
                  <div>
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      Work &amp; QC
                    </h2>
                    <p className="mt-1.5 text-[15px] leading-[22px] text-[#4F5C67]">
                      Every Pin tracks one assigned worker, department scope, material readiness,
                      and Before/After photo proof.
                    </p>
                  </div>

                  <dl className="mt-4 divide-y divide-[#D9DEE2] border-t border-[#D9DEE2] text-[13px] leading-[18px]">
                    <div className="flex items-start justify-between gap-3 py-2">
                      <dt className="shrink-0 text-[#4F5C67]">Evidence</dt>
                      <dd className="text-right font-medium text-[#1B2A4A]">
                        Before &amp; After slots
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3 py-2">
                      <dt className="shrink-0 text-[#4F5C67]">Review states</dt>
                      <dd className="text-right font-medium text-[#1B2A4A]">
                        Open · Pending QC · Approved
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3 pt-2">
                      <dt className="shrink-0 text-[#4F5C67]">Mobile field view</dt>
                      <dd className="text-right font-medium text-[#1B2A4A]">
                        Room &amp; Pin capture
                      </dd>
                    </div>
                  </dl>
                </article>

                {/* Tile 4 (2 cols): Warehouse & Materials + Accounting */}
                <article className="flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-5 md:col-span-2">
                  <div>
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      Warehouse, materials &amp; accounting
                    </h2>
                    <p className="mt-1.5 text-[15px] leading-[22px] text-[#4F5C67]">
                      Trace every material requirement from the Spatial Pin that requested it
                      through warehouse stock, Store Requests, Purchase Requests, Goods Receipts,
                      and departmental budgets.
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#D9DEE2] pt-3.5 text-[13px] leading-[18px] sm:grid-cols-3">
                    <div>
                      <div className="font-semibold text-[#1B2A4A]">Pin demand</div>
                      <p className="mt-0.5 text-[#4F5C67]">
                        Materials stay tied to room, surface, and work order.
                      </p>
                    </div>
                    <div>
                      <div className="font-semibold text-[#1B2A4A]">Receiving costs</div>
                      <p className="mt-0.5 text-[#4F5C67]">
                        Actual supplier receipts benchmarked against Market List.
                      </p>
                    </div>
                    <div>
                      <div className="font-semibold text-[#1B2A4A]">Internal usage</div>
                      <p className="mt-0.5 text-[#4F5C67]">
                        Separate warehouse stock from Civil, Electrical, and Plumbing spend.
                      </p>
                    </div>
                  </div>
                </article>

                {/* Tile 5 (2 cols): Verified Progress & Team Oversight */}
                <article className="flex flex-col justify-between rounded-xl border border-[#D9DEE2] bg-white p-5 md:col-span-2">
                  <div>
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      Verified progress for every role
                    </h2>
                    <p className="mt-1.5 text-[15px] leading-[22px] text-[#4F5C67]">
                      Owners inspect verified progress directly against the project drawing and
                      evidence. Contractors manage blueprints, team access, and Mandor grants in one
                      project-isolated workspace.
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#D9DEE2] pt-3.5 text-[13px] leading-[18px] sm:grid-cols-4">
                    <div>
                      <div className="font-semibold text-[#1B2A4A]">Owner</div>
                      <div className="mt-0.5 text-[#4F5C67]">Verified progress</div>
                    </div>
                    <div>
                      <div className="font-semibold text-[#1B2A4A]">Contractor</div>
                      <div className="mt-0.5 text-[#4F5C67]">Models &amp; teams</div>
                    </div>
                    <div>
                      <div className="font-semibold text-[#1B2A4A]">Worker / Mandor</div>
                      <div className="mt-0.5 text-[#4F5C67]">Tasks &amp; photos</div>
                    </div>
                    <div>
                      <div className="font-semibold text-[#1B2A4A]">Accounting</div>
                      <div className="mt-0.5 text-[#4F5C67]">Stock &amp; budgets</div>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </>
        )}

        {section === '3d-workspace' && (
          <>
            <section className="mx-auto max-w-[1200px] px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14 lg:px-8">
              <div className="max-w-2xl">
                <p className="text-[13px] leading-[18px] font-semibold tracking-wide text-[#A64011] uppercase">
                  VONTA Management · 3D workspace
                </p>
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-3 text-[34px] leading-[40px] font-bold tracking-[-0.025em] text-[#1B2A4A] text-balance focus:outline-none sm:text-[48px] sm:leading-[52px]"
                >
                  Work in 3D
                </h1>
                <p className="mt-4 text-[16px] leading-[24px] text-[#4F5C67] sm:text-[17px] sm:leading-[26px]">
                  Select an area, jump to a room, anchor work to a wall or floor surface Pin, track
                  required materials, and review before-and-after photos in one spatial model.
                </p>
              </div>
            </section>

            <section className="border-t border-[#D9DEE2] bg-white py-12 sm:py-16">
              <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
                  <div className="space-y-6 lg:col-span-6">
                    <dl className="divide-y divide-[#D9DEE2] border-y border-[#D9DEE2] text-[15px] leading-[22px]">
                      <div className="py-4">
                        <dt className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                          Blueprint review and area selector
                        </dt>
                        <dd className="mt-1 text-[#4F5C67]">
                          Browse architectural sheets by area and revision on Project Overview, then
                          switch building areas directly from the upper-left area selector inside
                          the 3D viewport.
                        </dd>
                      </div>
                      <div className="py-4">
                        <dt className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                          Rooms and surface-anchored Pins
                        </dt>
                        <dd className="mt-1 text-[#4F5C67]">
                          Jump straight to Ruang Kerja, Ruang Rapat, or Ruang Arsip. Place multiple
                          independent Pins on the same wall — such as skim coating (A03-PIN-01) and
                          a flush electrical switch box (A03-PIN-02) on the Ruang Rapat partition.
                        </dd>
                      </div>
                      <div className="py-4">
                        <dt className="text-[16px] leading-[22px] font-semibold text-[#1B2A4A]">
                          Ownership, materials, Before/After photos, and QC
                        </dt>
                        <dd className="mt-1 text-[#4F5C67]">
                          Each Pin carries one assigned worker, its department, isolated material
                          requirements, and Before/After photo slots.
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="lg:col-span-6">
                    <figure className="overflow-hidden rounded-xl border border-[#D9DEE2] bg-[#F4F3EF] p-3">
                      <img
                        src={DEFAULT_BLUEPRINT_SRC}
                        alt="Paviliun Kerja A-03 R00 architectural blueprint used for the synthetic 3D workspace"
                        className="h-auto w-full rounded-lg border border-[#D9DEE2] bg-white object-contain"
                      />
                      <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] leading-[18px] text-[#4F5C67]">
                        <span>Paviliun Kerja · Sheet A-03 R00 (Synthetic 3D demo source)</span>
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
            <section className="mx-auto max-w-[1200px] px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14 lg:px-8">
              <div className="max-w-2xl">
                <p className="text-[13px] leading-[18px] font-semibold tracking-wide text-[#A64011] uppercase">
                  VONTA Management · Materials and accounting
                </p>
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-3 text-[34px] leading-[40px] font-bold tracking-[-0.025em] text-[#1B2A4A] text-balance focus:outline-none sm:text-[48px] sm:leading-[52px]"
                >
                  Materials and accounting
                </h1>
                <p className="mt-4 text-[16px] leading-[24px] text-[#4F5C67] sm:text-[17px] sm:leading-[26px]">
                  Follow material requests from the exact Spatial Pin that triggered them through
                  warehouse stock, purchasing, actual receiving costs, and departmental usage.
                </p>
                <p className="mt-3 text-[13px] leading-[18px] font-semibold text-[#A64011]">
                  Status: Pin-level material requirements are available in the workspace preview;
                  Warehouse and Accounting workflows are currently in development.
                </p>
              </div>
            </section>

            <section className="border-t border-[#D9DEE2] bg-white py-12 sm:py-16">
              <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 divide-y divide-[#D9DEE2] border-y border-[#D9DEE2] md:grid-cols-3 md:divide-x md:divide-y-0">
                  <div className="py-6 md:pr-6">
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      Requests from Pins
                    </h2>
                    <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
                      When a Civil Pin requires 3 bags of skim coat compound in Ruang Rapat, the
                      Store Request links directly back to that Pin so warehouse staff know where
                      material is going.
                    </p>
                  </div>

                  <div className="py-6 md:px-6">
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      Purchasing and receiving cost
                    </h2>
                    <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
                      Shortages move from Store Requests to Purchase Requests benchmarked against
                      Market List reference prices, while Goods Receipts capture actual supplier
                      receiving costs.
                    </p>
                  </div>

                  <div className="py-6 md:pl-6">
                    <h2 className="text-[18px] leading-[24px] font-semibold text-[#1B2A4A]">
                      Departmental usage
                    </h2>
                    <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
                      Accounting separates warehouse purchases from internal Civil, Electrical, and
                      Plumbing department usage so project owners see verified spending against
                      budget.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Aligned Grouped Footer (Layout System Figure 3 — no social/logos/newsletters/pricing) */}
      <footer className="border-t border-[#D9DEE2] bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-6">
              <div className="text-[18px] leading-[24px] font-bold tracking-tight text-[#1B2A4A]">
                VONTA
              </div>
              <p className="mt-1.5 max-w-sm text-[13px] leading-[18px] text-[#4F5C67]">
                VONTA Management · Precision at Every Pin. Spatial construction operations for
                owners, contractors, field teams, warehouse, and accounting.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 md:col-span-6 md:justify-items-end">
              <div>
                <h2 className="text-[13px] leading-[18px] font-semibold text-[#1B2A4A]">
                  Product
                </h2>
                <ul className="mt-2 space-y-1.5 text-[13px] leading-[18px]">
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
                <h2 className="text-[13px] leading-[18px] font-semibold text-[#1B2A4A]">Access</h2>
                <ul className="mt-2 space-y-1.5 text-[13px] leading-[18px]">
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
                      Synthetic A-03 demo
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
