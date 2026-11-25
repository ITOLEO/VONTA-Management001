import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { BudgetDashboardSection } from '../components/BudgetDashboardSection';
import type { AuthorizedProject } from '../domain/accountTypes';
import { isProjectLead } from '../domain/accountTypes';
import type { ProjectDepartment } from '../domain/departmentCatalog';
import type { ProjectBudgetLedger } from '../domain/budgetLedger';

async function readTable(table: string, projectId: string) {
  if (!supabase) throw new Error('The database is unavailable.');
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { error, data } = await supabase
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .order('id')
      .range(offset, offset + 499);
    if (error) throw new Error('The project ledger could not be read.');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
async function loadBudget(projectId: string) {
  const [depts, allocations, charges] = await Promise.all(
    ['project_departments', 'department_budget_allocations', 'department_budget_charges'].map((t) =>
      readTable(t, projectId),
    ),
  );
  const departments: ProjectDepartment[] = depts
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((d) => ({
      id: d.id,
      projectId,
      name: d.name,
      slug: d.slug,
      defaultPinColor: d.default_pin_color,
      isSeeded: d.is_default,
      sortOrder: d.sort_order,
      createdAt: d.created_at,
    }));
  const ledger: ProjectBudgetLedger = {
    projectId,
    currency: 'IDR',
    allocations: allocations.map((a) => ({
      id: a.id,
      projectId,
      departmentId: a.department_id,
      periodMonth: a.effective_date.slice(0, 7),
      amount: a.amount_idr,
      currency: 'IDR',
      actorName: a.created_by,
      recordedAt: a.created_at,
      note: a.note,
    })),
    charges: charges
      .filter((c) => !c.is_committed)
      .map((c) => ({
        id: c.id,
        projectId,
        departmentId: c.department_id,
        periodMonth: c.charge_date.slice(0, 7),
        postedDate: c.charge_date,
        amount: c.amount_idr,
        currency: 'IDR',
        kind: 'internal_usage',
        actorName: c.created_by,
        description: c.description,
        sourceRecordId: c.reference_code || c.id,
      })),
    commitments: charges
      .filter((c) => c.is_committed)
      .map((c) => ({
        id: c.id,
        projectId,
        departmentId: c.department_id,
        periodMonth: c.charge_date.slice(0, 7),
        amount: c.amount_idr,
        currency: 'IDR',
        description: c.description,
        createdAt: c.created_at,
        sourceRecordId: c.reference_code || c.id,
      })),
  };
  return { ledger, departments };
}
export function LiveBudget({
  project,
  editable = false,
}: {
  project: AuthorizedProject;
  editable?: boolean;
}) {
  const { user } = useAuth();
  const write =
    isProjectLead(project.membership.role) ||
    project.membership.role === 'accounting' ||
    project.membership.hasAccountingGrant;
  const visible = write || project.membership.role === 'owner';
  const [data, setData] = useState<Awaited<ReturnType<typeof loadBudget>> | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const requestId = useRef('');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: project.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  useEffect(() => {
    let current = true;
    setData(null);
    if (visible)
      loadBudget(project.id)
        .then((result) => {
          if (current) setData(result);
        })
        .catch((e) => {
          if (current) setMessage(e.message);
        });
    return () => {
      current = false;
    };
  }, [project.id, visible, revision, user?.id]);
  async function post(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !write || pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const alloc = fields.get('kind') === 'allocation';
    const amount = Number(fields.get('amount'));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setMessage('Enter a positive whole number of rupiah.');
      return;
    }
    const id = (requestId.current ||= crypto.randomUUID());
    const row = {
      id,
      project_id: project.id,
      department_id: fields.get('department'),
      amount_idr: amount,
      created_by: user.id,
    };
    setPending(true);
    setMessage('');
    try {
      const request = alloc
        ? supabase
            .from('department_budget_allocations')
            .insert({ ...row, effective_date: fields.get('date'), note: fields.get('note') })
        : supabase
            .from('department_budget_charges')
            .insert({
              ...row,
              charge_date: fields.get('date'),
              description: fields.get('note'),
              reference_code: id,
            });
      const { error } = await request;
      if (error && error.code !== '23505')
        throw new Error('The entry could not be saved. Check your project access and retry.');
      requestId.current = '';
      form.reset();
      setRevision((n) => n + 1);
      setMessage('Entry posted to the department ledger.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The entry could not be saved.');
    } finally {
      setPending(false);
    }
  }
  if (!visible)
    return editable ? <p>Budget access is limited to the project finance team and owner.</p> : null;
  const current = data?.ledger.projectId === project.id ? data : null;
  return (
    <section>
      {message && (
        <p role="status" className="vt-note">
          {message}
        </p>
      )}
      {!current ? (
        <p className="vt-note">
          {message ? (
            <button
              onClick={() => {
                setMessage('');
                setRevision((n) => n + 1);
              }}
            >
              Reload ledger
            </button>
          ) : (
            'Loading project ledger…'
          )}
        </p>
      ) : (
        <>
          {editable && write && (
            <form
              className="vt-ledger-form"
              onSubmit={post}
              onChange={() => {
                requestId.current = '';
              }}
            >
              <h2>Post a budget entry</h2>
              <fieldset disabled={pending}>
                <label>
                  Entry type
                  <select name="kind">
                    <option value="allocation">Additional allocation</option>
                    <option value="charge">Posted spend</option>
                  </select>
                </label>
                <label>
                  Department
                  <select name="department" required>
                    {current.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Entry date
                  <input type="date" name="date" defaultValue={today} required />
                </label>
                <label>
                  Amount (IDR)
                  <input type="number" name="amount" min="1" step="1" required />
                </label>
                <label>
                  Description
                  <input name="note" maxLength={240} required />
                </label>
                <button className="vt-btn solid">{pending ? 'Posting…' : 'Post entry'}</button>
              </fieldset>
            </form>
          )}
          <BudgetDashboardSection
            departments={current.departments}
            ledger={current.ledger}
            projectTimezone={project.timezone}
            defaultSelectedDate={today}
            accountingHref={'/projects/' + project.id + '/accounting'}
            canAddDepartment={false}
          />
        </>
      )}
    </section>
  );
}
