begin;
alter table public.project_memberships drop constraint if exists project_memberships_role_check;
alter table public.project_memberships add constraint project_memberships_role_check
  check (role in ('owner','contractor','architect','worker','accounting'));
create or replace function public.is_project_contractor(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_memberships
    where project_id = p_project_id and user_id = auth.uid()
    and role in ('contractor','architect') and status = 'active');
$$;
alter policy project_departments_contractor_manage on public.project_departments
  using (public.is_project_contractor(project_id)) with check (public.is_project_contractor(project_id));
revoke execute on function public.create_project_draft_atomic(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_project_draft_atomic(uuid,text,text,text,text,text,text) to service_role;

create table if not exists public.demo_account_activity (
  role text primary key check (role in ('worker','accounting','contractor','architect','owner','admin')),
  last_sign_in_at timestamptz not null
);
alter table public.demo_account_activity enable row level security;
revoke all on public.demo_account_activity from anon, authenticated;
grant select,insert,update on public.demo_account_activity to service_role;
commit;
