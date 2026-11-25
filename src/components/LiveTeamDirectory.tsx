import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatRoleLabel, type AuthorizedProject, type ProjectRole } from '../domain/accountTypes';
import { canInviteToProject } from '../domain/teamInvitations';

interface TeamRow {
  id: string;
  display_name: string;
  role: ProjectRole;
  status: string;
  joined_at: string;
  has_mandor_grant: boolean;
}
export function LiveTeamDirectory({ project }: { project: AuthorizedProject }) {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setLoaded(false);
    setRows([]);
    supabase?.rpc('vonta_team', { pid: project.id }).then(({ data, error }) => {
      if (current) {
        setLoaded(true);
        if (error) setNotice('The project directory could not be loaded.');
        else setRows(data || []);
      }
    });
    return () => {
      current = false;
    };
  }, [project.id, revision]);
  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setPending(true);
    setNotice('');
    try {
      const { error } = await supabase.rpc('vonta_invite_member', {
        pid: project.id,
        address: fields.get('email'),
        project_role: fields.get('role'),
      });
      if (error) {
        setNotice(error.message);
        return;
      }
      form.reset();
      setNotice('Invitation available in the member’s Projects directory.');
      setRevision((v) => v + 1);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <h1 className="vonta-page-title">Project team</h1>
      {canInviteToProject(project.membership.role, project.membership.status) && (
        <form className="vt-ledger-form" onSubmit={invite}>
          <h2>Invite a registered member</h2>
          <fieldset disabled={pending}>
            <label>
              Verified email
              <input type="email" name="email" required />
            </label>
            <label>
              Project role
              <select name="role" defaultValue="worker">
                {(['worker', 'accounting', 'architect', 'contractor', 'owner'] as const).map(
                  (role) => (
                    <option key={role} value={role}>
                      {formatRoleLabel(role)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button className="vt-btn solid">Issue invitation</button>
          </fieldset>
        </form>
      )}
      <p role="status">{notice}</p>
      <div className="vt-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Project role</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.display_name}</td>
                <td>{formatRoleLabel(m.role, { hasMandorGrant: m.has_mandor_grant })}</td>
                <td>{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loaded && <p>Loading members…</p>}
    </>
  );
}
