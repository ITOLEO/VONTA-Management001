begin;
create or replace function public.vonta_team(pid uuid)
returns table (id uuid, display_name text, role text, status text, joined_at timestamptz, has_mandor_grant boolean)
language sql stable security definer set search_path=public as $$
  select m.id, coalesce(nullif(p.display_name,''), m.invited_email, u.email, 'Member'), m.role,m.status,m.created_at,m.has_mandor_grant
  from public.project_memberships m
  left join public.profiles p on p.user_id=m.user_id left join auth.users u on u.id=m.user_id
  where m.project_id=pid and m.status<>'revoked' and public.has_active_live_project_access(pid)
    and (m.user_id=auth.uid() or exists(select 1 from public.project_memberships actor where actor.user_id=auth.uid()
      and actor.project_id=pid and actor.status='active' and (actor.role in ('owner','contractor','architect') or actor.has_mandor_grant)))
  order by m.created_at,m.id;
$$;

create or replace function public.vonta_invite_member(pid uuid, address text, project_role text)
returns void language plpgsql security definer set search_path=public as $$
declare target uuid; saved_role text; member_id uuid;
begin
  if not public.has_active_live_project_access(pid) or not exists(select 1 from public.project_memberships
    where project_id=pid and user_id=auth.uid() and status='active' and role in ('owner','architect','contractor'))
  then raise exception 'Project invitation access required.'; end if;
  if project_role is null or project_role not in ('owner','architect','contractor','accounting','worker') then raise exception 'Choose a project role.'; end if;
  select id,raw_app_meta_data->>'vonta_profession' into target,saved_role from auth.users
    where lower(email)=lower(trim(address)) and email_confirmed_at is not null;
  if target is null then raise exception 'Ask the member to register and verify this email first.'; end if;
  if saved_role in ('owner','architect','contractor','accounting') and saved_role<>project_role then raise exception 'Choose the registered profession for this member.'; end if;
  insert into public.project_memberships as m(project_id,user_id,invited_email,role,status)
    values(pid,target,lower(trim(address)),project_role,'invited')
    on conflict (project_id,user_id) where user_id is not null do update
    set invited_email=excluded.invited_email,role=excluded.role,status='invited',has_mandor_grant=false,has_accounting_grant=false,
        can_download_workspace_view=false,can_share_workspace_view=false,updated_at=now()
    where m.status in ('invited','revoked') returning id into member_id;
  if member_id is null then raise exception 'This account already has active project access.'; end if;
end;
$$;
create or replace function public.vonta_accept_invite(mid uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.project_memberships m set status='active',updated_at=now(),user_id=auth.uid()
  where m.id=mid and m.status='invited' and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
    and (m.user_id=u.id or (m.user_id is null and lower(m.invited_email)=lower(u.email))))
    and exists(select 1 from public.projects p where p.id=m.project_id and p.deleted_at is null);
  if not found then raise exception 'This invitation is unavailable.'; end if;
end;
$$;
revoke all on function public.vonta_team(uuid),public.vonta_invite_member(uuid,text,text),public.vonta_accept_invite(uuid) from public,anon;
grant execute on function public.vonta_team(uuid),public.vonta_invite_member(uuid,text,text),public.vonta_accept_invite(uuid) to authenticated;
commit;
