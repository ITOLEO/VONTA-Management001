begin;
-- Use the same four departments in new and existing projects.
create or replace function public.seed_vonta_departments(pid uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.project_departments(project_id, slug, name, default_pin_color, is_default, sort_order)
  select pid, v.* from (values ('civil','Civil','#2563EB',true,1),
    ('electrical','Electrical','#D4652F',true,2),('plumbing','Plumbing','#0D9488',true,3),
    ('finishing','Finishing','#7C3AED',true,4)) as v(slug,name,color,is_default,sort_order)
  on conflict (project_id, slug) do nothing;
$$;
revoke all on function public.seed_vonta_departments(uuid) from public,anon,authenticated;
create or replace function public.seed_new_vonta_project() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform public.seed_vonta_departments(new.id); return new; end;
$$;
create trigger seed_project_departments after insert on public.projects for each row execute function public.seed_new_vonta_project();
select public.seed_vonta_departments(id) from public.projects where deleted_at is null;

create or replace function public.can_access_vonta_budget(pid uuid, writing boolean)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.project_memberships m join public.projects p on p.id=m.project_id
    where p.id=pid and p.deleted_at is null and m.user_id=auth.uid() and m.status='active'
    and (m.role in ('architect','contractor','accounting') or m.has_accounting_grant or (not writing and m.role='owner')));
$$;
revoke all on function public.can_access_vonta_budget(uuid,boolean) from public,anon;
grant execute on function public.can_access_vonta_budget(uuid,boolean) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['department_budget_allocations','department_budget_charges'] loop
    execute format('create policy budget_read on public.%I for select to authenticated using (public.can_access_vonta_budget(project_id,false))',t);
    execute format('create policy budget_post on public.%1$I for insert to authenticated with check (
      public.can_access_vonta_budget(project_id,true) and created_by=auth.uid()
      and exists(select 1 from public.project_departments d where d.id=%1$I.department_id and d.project_id=%1$I.project_id and d.is_active))',t);
    execute format('grant select,insert on public.%I to authenticated',t);
  end loop;
end $$;
grant select on public.project_departments to authenticated;
commit;
