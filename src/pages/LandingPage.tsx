import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, ChevronDown, ChevronLeft, ChevronRight, Layers3, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './public-site.css';

export type PublicSection = 'overview' | '3d-workspace' | 'accounting';
const sample = '/demo/projects/paviliun-kerja';
const steps = [
  {
    name: 'Drawing',
    heading: 'Start with the dimensioned sheet.',
    text: 'Open the A-03 floor plan. Match two points to a known dimension before you review walls, openings, and room boundaries.',
    image: '/media/paviliun-a03.png',
    alt: 'Dimensioned A-03 architectural sheet',
    path: '/blueprints',
    action: 'Open drawing register',
  },
  {
    name: 'Model',
    heading: 'Find the room on site.',
    text: 'Orbit the Paviliun Kerja model. Select a wall or isolate a room to check where the team will work.',
    image: '/media/detail.webp',
    alt: 'Paviliun Kerja model with selectable walls and field Pins',
    path: '/spatial',
    action: 'Inspect sample model',
  },
  {
    name: 'Field Pin',
    heading: 'Follow one job through inspection.',
    text: 'Open the wall preparation Pin. Check its location, assigned work, material requirements, and evidence before the QC decision.',
    image: '/media/detail.webp',
    alt: 'Paviliun model showing the locations of field Pins',
    path: '/pin/wall-surface-preparation',
    action: 'Inspect sample Pin',
  },
];
const groups = {
  Product: [
    ['3D workspace', '/features/3d-workspace'],
    ['Field Pins and QC', '/#field-pin-qc'],
    ['Materials and accounting', '/features/accounting'],
  ],
  Workflows: [
    ['Drawing to model', '/#blueprint-to-3d'],
    ['Team and attendance', '/#role-oversight'],
    ['CAD and Google tools', '/integrations'],
  ],
};
export function Brand() {
  return (
    <Link to="/" className="vt-brand" aria-label="VONTA home">
      <span aria-hidden="true" className="vt-symbol" />
      VONTA
    </Link>
  );
}
export function LandingPage({ section = 'overview' }: { section?: PublicSection }) {
  const { user } = useAuth();
  const location = useLocation();
  const [menu, setMenu] = useState<keyof typeof groups | null>(null);
  const [mobile, setMobile] = useState(false);
  const [step, setStep] = useState(0);
  const nav = useRef<HTMLElement>(null);
  const selected = steps[step];
  const access = user ? '/projects' : '/auth/sign-in';
  useEffect(() => {
    setMenu(null);
    setMobile(false);
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [location.key]);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (!nav.current?.contains(event.target as Node)) {
        setMenu(null);
        setMobile(false);
      }
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const developer =
    user?.app_metadata?.vonta_platform_role === 'developer' && !user.app_metadata.vonta_demo;
  return (
    <div className="vt-site" id="top">
      <a className="vt-skip" href="#content">
        Skip to content
      </a>
      <header
        ref={nav}
        className="vt-nav"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            nav.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus();
            setMenu(null);
            setMobile(false);
          }
        }}
      >
        <Brand />
        <nav aria-label="Main navigation" className={mobile ? 'vt-links vt-open' : 'vt-links'}>
          {(Object.keys(groups) as Array<keyof typeof groups>).map((group) => (
            <div
              className="vt-navgroup"
              key={group}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setMenu(null);
              }}
            >
              <button
                aria-expanded={menu === group}
                onClick={() => setMenu(menu === group ? null : group)}
              >
                {group}
                <ChevronDown size={14} />
              </button>
              {menu === group && (
                <div className="vt-drop">
                  {groups[group].map(([label, path]) => (
                    <Link key={path} to={path}>
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Link to="/integrations">Integrations</Link>
        </nav>
        <div className="vt-actions">
          <Link className="vt-sign" to={access}>
            {user ? 'My projects' : 'Sign in'}
          </Link>
          <Link className="vt-btn solid" to="/demo/access">
            Try demo
          </Link>
          <button
            className="vt-mobile"
            onClick={() => setMobile(!mobile)}
            aria-label="Toggle navigation"
            aria-expanded={mobile}
          >
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="content">
        {section === 'overview' ? (
          <>
            <figure className="vt-panorama">
              <img
                src="/media/hero.webp"
                alt="A construction crew at work on a concrete building in Indonesia, illustrated in ink"
                fetchPriority="high"
              />
            </figure>
            <section className="vt-intro">
              <h1>
                From drawing set
                <br />
                to <em>job site.</em>
              </h1>
              <p>
                Locate the work on a 3D model. Give each task a Pin, track its materials, and review
                the evidence from site.
              </p>
              <div className="vt-buttons">
                <Link className="vt-btn solid" to={sample}>
                  Explore sample project
                </Link>
                <Link className="vt-btn quiet" to={access}>
                  {user ? 'Open my projects' : 'Sign in to workspace'}
                </Link>
              </div>
            </section>
            <section id="blueprint-to-3d" className="vt-tour vt-inner">
              <div className="vt-heading">
                <div>
                  <span className="vt-label">Sample project · A-03</span>
                  <h2>Inside Paviliun Kerja</h2>
                </div>
                <div className="vt-pager" aria-label="Sample project steps">
                  <button
                    aria-label="Previous step"
                    disabled={step === 0}
                    onClick={() => setStep(step - 1)}
                  >
                    <ChevronLeft />
                  </button>
                  <span>
                    {step + 1} / {steps.length}
                  </span>
                  <button
                    aria-label="Next step"
                    disabled={step === steps.length - 1}
                    onClick={() => setStep(step + 1)}
                  >
                    <ChevronRight />
                  </button>
                </div>
              </div>
              <div className="vt-tourgrid">
                <div className="vt-plate">
                  <img loading="lazy" src={selected.image} alt={selected.alt} />
                </div>
                <div className="vt-tourtext">
                  <div className="vt-tabs">
                    {steps.map((item, i) => (
                      <button key={item.name} aria-pressed={i === step} onClick={() => setStep(i)}>
                        {item.name}
                      </button>
                    ))}
                  </div>
                  <div aria-live="polite">
                    <h3>{selected.heading}</h3>
                    <p>{selected.text}</p>
                    <Link className="vt-under" to={sample + selected.path}>
                      {selected.action}
                    </Link>
                  </div>
                </div>
              </div>
            </section>
            <section id="field-pin-qc" className="vt-band">
              <div className="vt-inner vt-split">
                <div>
                  <span className="vt-label">Field operations</span>
                  <h2>
                    What changed
                    <br />
                    in this room?
                  </h2>
                </div>
                <div>
                  <p>
                    A Pin keeps the location, department, and work record together. Review
                    before-and-after evidence and see which Pins still need inspection.
                  </p>
                  <Link className="vt-under" to={sample + '/pin'}>
                    Open the sample Pin board
                  </Link>
                </div>
              </div>
            </section>
            <section className="vt-inner vt-work" id="role-oversight">
              <span className="vt-label">Project controls</span>
              <h2>Follow the work beyond the drawing.</h2>
              <div className="vt-rows">
                {[
                  [
                    'Materials and budgets',
                    'Inspect material requirements on a Pin. In the sample ledger, compare allocations with posted spend by department.',
                    '/features/accounting',
                  ],
                  [
                    'Team and attendance',
                    'Review the project roster, daily attendance, and leave requests. Open a role demo to see the tools available to that person.',
                    sample + '/attendance',
                  ],
                  [
                    'CAD and Google tools',
                    'Prepare a plan view in SketchUp, plot the dimensioned layout in AutoCAD, and bring the sheet into VONTA.',
                    '/integrations',
                  ],
                ].map(([title, text, path]) => (
                  <Link key={title} to={path}>
                    <h3>{title}</h3>
                    <p>{text}</p>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="vt-inner vt-feature">
            <Link className="vt-under" to="/">
              Project overview
            </Link>
            {section === '3d-workspace' ? (
              <>
                <Box />
                <h1>
                  Inspect the model
                  <br />
                  room by room.
                </h1>
                <p>
                  Open a published model, isolate a room, and select a wall or Pin to read its
                  details. Use the drawing tools to mark a private view.
                </p>
                <img alt="A-03 sample model in the spatial workspace" src="/media/detail.webp" />
                <Link className="vt-btn solid" to={sample + '/spatial'}>
                  Open sample workspace
                </Link>
              </>
            ) : (
              <>
                <Layers3 />
                <h1>
                  Trace the cost of
                  <br />
                  field work.
                </h1>
                <p>
                  Start with the materials listed on a Pin. In Paviliun Kerja, open the sample
                  accounting ledger to inspect allocations, dated charges, and balances for each
                  department.
                </p>
                <Link className="vt-btn solid" to={sample + '/accounting'}>
                  Open sample ledger
                </Link>
              </>
            )}
          </section>
        )}
      </main>
      <footer className="vt-footer">
        <div className="vt-inner">
          <div className="vt-footgrid">
            <div>
              <Brand />
              <p>Precision at Every Pin.</p>
            </div>
            <div>
              <strong>Product</strong>
              <Link to="/features/3d-workspace">3D workspace</Link>
              <Link to="/features/accounting">Materials and budgets</Link>
              <Link to="/integrations">Integrations</Link>
            </div>
            <div>
              <strong>Workspace</strong>
              <Link to={access}>{user ? 'Projects' : 'Sign in'}</Link>
              <Link to="/demo/access">Demo accounts</Link>
              <Link to={sample}>Paviliun Kerja</Link>
            </div>
          </div>
          <div className="vt-footbase">
            <span>VONTA Management</span>
            <div>
              {developer && <Link to="/admin">Administration</Link>}
              <a href="#top">Back to top</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
