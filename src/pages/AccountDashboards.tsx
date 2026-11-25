import { useEffect, useState, createContext, useContext } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { demoAccounts, demoProject, isDeveloper, type DemoRole } from '../domain/demoAccounts';
import { useAuth } from '../context/AuthContext';
import { Brand } from './LandingPage';

export const SampleRole = createContext<DemoRole | null>(null);
export async function endSampleSession() {
  const response = await fetch('/api/demo/logout', { method: 'POST' });
  if (!response.ok) throw new Error('Could not close the demo session.');
  sessionStorage.removeItem('vonta.demo.active_account.v2');
  window.location.assign('/demo/access');
}
export function SampleSession({
  children,
}: {
  children: (role: DemoRole | null) => React.ReactNode;
}) {
  const [role, setRole] = useState<DemoRole | null | undefined>();
  const location = useLocation();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/demo/session', { signal: controller.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setRole(demoAccounts.some((a) => a.role === data.role) ? data.role : null))
      .catch(() => {
        if (!controller.signal.aborted) setRole(null);
      });
    return () => controller.abort();
  }, []);
  if (role === undefined)
    return (
      <div role="status" className="vt-screen">
        Opening sample workspace…
      </div>
    );
  const module = location.pathname.match(/^\/demo\/projects\/[^/]+(?:\/([^/]+))?/)?.[1];
  if (role === 'admin' && location.pathname !== '/demo/dashboard')
    return <Navigate to="/demo/dashboard" replace />;
  if (role && role !== 'architect' && role !== 'contractor' && module) {
    const permitted = demoAccounts
      .find((a) => a.role === role)
      ?.tasks.some(([, slug]) => slug === module || (module === 'work' && slug === 'pin'));
    if (!permitted && module !== 'integrations') return <Navigate to="/demo/dashboard" replace />;
  }
  return <SampleRole.Provider value={role}>{children(role)}</SampleRole.Provider>;
}
export function ConsoleShell({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="vt-console">
      <header>
        <Brand />
        {action || <Link to="/">Home</Link>}
      </header>
      <main>
        <h1>{title}</h1>
        {subtitle && <p className="vt-lead">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}
export function DemoAccessPage() {
  return (
    <ConsoleShell
      title="Choose a demo account"
      subtitle="Open Paviliun Kerja as a member of the project team. Each account starts at its own dashboard."
    >
      <p className="vt-note">
        Demo password <code>demo123123</code>
      </p>
      <div className="vt-list">
        {demoAccounts.map((a) => (
          <Link key={a.role} to={'/auth/sign-in?demo=' + a.role}>
            <div>
              <strong>{a.title}</strong>
              <small>{a.email}</small>
            </div>
            <ChevronRight />
          </Link>
        ))}
      </div>
      <Link className="vt-under" to="/demo/projects">
        Browse the sample without an account
      </Link>
    </ConsoleShell>
  );
}
interface Directory {
  demos: Array<{ name: string; email: string; title: string; lastSignIn?: string | null }>;
  accounts: Array<{ id: string; email: string; createdAt: string; lastSignIn?: string | null }>;
  nextPage: number | null;
}
function DateCell({ value }: { value?: string | null }) {
  return <>{value ? new Date(value).toLocaleString() : 'No sign-in recorded'}</>;
}
export function DeveloperDashboard() {
  const { user, accessToken } = useAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Directory | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const allowed = isDeveloper(user?.app_metadata);
  useEffect(() => {
    if (!allowed || !accessToken) return;
    const controller = new AbortController();
    setData(null);
    setError('');
    fetch('/api/admin/directory?page=' + page, {
      headers: { Authorization: 'Bearer ' + accessToken },
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || 'Access unavailable.');
        if (!controller.signal.aborted) setData(body);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [allowed, accessToken, page, retry]);
  if (!allowed) return <Navigate to="/projects" replace />;
  return (
    <ConsoleShell
      title="Account administration"
      subtitle="Review registered users and the six isolated demo accounts."
      action={<Link to="/projects">My projects</Link>}
    >
      {error && (
        <p role="alert">
          {error}{' '}
          <button className="vt-under" onClick={() => setRetry((i) => i + 1)}>
            Retry
          </button>
        </p>
      )}
      {!error && !data && <p role="status">Loading directory…</p>}
      {data && (
        <>
          <h2>Registered users</h2>
          <div className="vt-table">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>
                      <DateCell value={u.createdAt} />
                    </td>
                    <td>
                      <DateCell value={u.lastSignIn} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="vt-pager">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>{page}</span>
            <button disabled={!data.nextPage} onClick={() => setPage(data.nextPage!)}>
              Next
            </button>
          </div>
          <h2>Demo accounts</h2>
          <div className="vt-table">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {data.demos.map((a) => (
                  <tr key={a.email}>
                    <td>{a.email}</td>
                    <td>{a.title}</td>
                    <td>
                      <DateCell value={a.lastSignIn} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ConsoleShell>
  );
}
export function DemoDashboard() {
  const role = useContext(SampleRole);
  const [directory, setDirectory] = useState<typeof demoAccounts | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (role !== 'admin') return;
    const controller = new AbortController();
    fetch('/api/demo/directory', { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Sign in to the developer demo to view this directory.');
        setDirectory((await r.json()).accounts);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [role]);
  const account = demoAccounts.find((a) => a.role === role);
  if (!account) return <Navigate to="/demo/access" replace />;
  return (
    <ConsoleShell
      title={account.title + ' dashboard'}
      subtitle={account.name + ' · Paviliun Kerja sample workspace'}
      action={
        <button onClick={() => void endSampleSession().catch((e) => setError(e.message))}>
          Sign out
        </button>
      }
    >
      {error && <p role="alert">{error}</p>}
      {role === 'admin' ? (
        <>
          <h2>Demo account directory</h2>
          <div className="vt-list">
            {directory?.map((a) => (
              <div key={a.role}>
                <div>
                  <strong>{a.name}</strong>
                  <small>{a.email}</small>
                </div>
                <span>{a.title}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2>Project tools</h2>
          <div className="vt-list">
            {account.tasks.map(([name, path]) => (
              <Link key={name} to={demoProject + (path ? '/' + path : '')}>
                <strong>{name}</strong>
                <ChevronRight />
              </Link>
            ))}
          </div>
          <Link className="vt-under" to={demoProject + '/integrations'}>
            Project integrations
          </Link>
        </>
      )}
    </ConsoleShell>
  );
}
