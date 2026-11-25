import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { privateApi } from '../data/privateApi';
import { demoProject } from '../domain/demoAccounts';
import {
  createGmailDraft,
  googleConfigured,
  prepareGoogle,
  saveDriveBrief,
} from '../lib/googleWorkspace';
import { ConsoleShell } from './AccountDashboards';

export function IntegrationsPage({ mode = 'public' }: { mode?: 'public' | 'sample' | 'live' }) {
  const { project } = useParams();
  const { accessToken } = useAuth();
  const [live, setLive] = useState<{
    id: string;
    name: string;
    drawings: number;
    token: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [driveLink, setDriveLink] = useState('');
  const [ready, setReady] = useState(false);
  const sample = mode === 'sample' && project === 'paviliun-kerja';
  const currentLive =
    mode === 'live' && live?.id === project && live?.token === accessToken ? live : null;
  const name = sample ? 'Paviliun Kerja (sample)' : currentLive?.name;
  const base = sample ? demoProject : '/projects/' + encodeURIComponent(project || '');
  useEffect(() => {
    setLive(null);
    setMessage('');
    setDriveLink('');
    if (mode !== 'live' || !project || !accessToken) return;
    let active = true;
    privateApi
      .getProject(accessToken, project)
      .then(({ project: p }) => {
        if (active)
          setLive({ id: p.id, name: p.name, drawings: p.blueprints.length, token: accessToken });
      })
      .catch(() => {
        if (active) setMessage('This project is unavailable for the current account.');
      });
    return () => {
      active = false;
    };
  }, [project, accessToken, mode]);
  useEffect(() => {
    if (!name || !googleConfigured) return;
    let active = true;
    prepareGoogle()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [name]);
  const url = window.location.origin + base;
  const brief = {
    name: name || '',
    url,
    text: [
      name,
      'Project workspace: ' + url,
      'Drawing register: ' + url + '/blueprints',
      ...(currentLive ? ['Registered drawings: ' + currentLive.drawings] : []),
    ].join('\n'),
  };
  async function publish(kind: 'gmail' | 'drive') {
    if (!name || busy || !ready) return;
    setBusy(true);
    setMessage('');
    setDriveLink('');
    try {
      if (kind === 'gmail') {
        await createGmailDraft(brief);
        setMessage('Draft saved. Review its recipients and content in Gmail.');
      } else {
        const link = await saveDriveBrief(brief);
        setDriveLink(link);
        setMessage('Project handoff saved to Google Drive.');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Google could not complete the request.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConsoleShell
      title="Integrations"
      subtitle="Bring a dimensioned sheet into the workspace. Share a project handoff with the people who need it."
      action={<Link to={name ? base : '/'}>{name ? 'Back to project' : 'Home'}</Link>}
    >
      <div className="vt-tools">
        <section>
          <h2>SketchUp</h2>
          <p>
            Install the extension through Extension Manager. Under Extensions, choose{' '}
            <b>VONTA — Prepare plan for AutoCAD</b>. Export a full-scale DWG or DXF using File →
            Export → 2D Graphic.
          </p>
          <a className="vt-under" href="/plugins/vonta-plan.rbz" download>
            Download SketchUp extension
          </a>
        </section>
        <section>
          <h2>AutoCAD</h2>
          <p>
            Open the CAD drawing, add dimensions, and select the sheet layout. On Windows, load the
            VONTA routine with APPLOAD. Run <b>VONTAPDF</b> to plot a PDF. On macOS, plot the layout
            to PDF from the Print dialog.
          </p>
          <a className="vt-under" href="/plugins/vonta-sheet.lsp" download>
            Download AutoCAD routine
          </a>{' '}
          <Link className="vt-under" to={name ? base + (sample ? '/blueprints' : '/settings') : '/projects/new'}>
            {name ? (sample ? 'Open drawing register' : 'Open blueprint settings') : 'Start a project with the sheet'}
          </Link>
        </section>
        <section>
          <h2>Gmail</h2>
          <p>
            Create a draft with the project name and workspace links. Add recipients and review the
            message in Gmail.
          </p>
          {name ? (
            googleConfigured ? (
              <button
                className="vt-under"
                disabled={!ready || busy}
                onClick={() => void publish('gmail')}
              >
                Save Gmail draft
              </button>
            ) : (
              <a
                className="vt-under"
                target="_blank"
                rel="noreferrer"
                href={
                  'https://mail.google.com/mail/?view=cm&fs=1&su=' +
                  encodeURIComponent(name + ' — project handoff') +
                  '&body=' +
                  encodeURIComponent(brief.text)
                }
              >
                Compose in Gmail
              </a>
            )
          ) : (
            <Link className="vt-under" to="/projects">
              Choose a project
            </Link>
          )}
        </section>
        <section>
          <h2>Google Workspace</h2>
          <p>
            Save a project handoff to your Google Drive. The text file contains the project name and
            links. Opening a private link requires project access.
          </p>
          {name ? (
            googleConfigured ? (
              <button
                className="vt-under"
                disabled={!ready || busy}
                onClick={() => void publish('drive')}
              >
                Save handoff to Drive
              </button>
            ) : (
              <p className="vt-note">
                Drive connection requires the Google OAuth client in this deployment.
              </p>
            )
          ) : (
            <Link className="vt-under" to={demoProject + '/integrations'}>
              View sample project integrations
            </Link>
          )}
        </section>
      </div>
      {name && (
        <details className="vt-brief">
          <summary>Preview project handoff</summary>
          <pre>{brief.text}</pre>
        </details>
      )}
      <div role="status">
        {busy ? 'Waiting for Google…' : message}{' '}
        {driveLink && (
          <a className="vt-under" href={driveLink} target="_blank" rel="noreferrer">
            Open in Drive
          </a>
        )}
      </div>
    </ConsoleShell>
  );
}
