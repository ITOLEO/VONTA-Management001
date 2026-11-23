-- VONTA Management — Migration 202611190001
-- Accounts, Projects, Trusted Memberships, Server-Only Project Secrets, Blueprints, and Append-Only Audit History
-- Enforces strict Row Level Security (RLS) so project rights derive solely from trusted memberships.

create extension if not exists pgcrypto;

-- 1. User Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  phone_number text not null default '',
  phone_status text not null default 'contact_only'
    check (phone_status in ('contact_only', 'verified')),
  display_timezone text not null default 'Asia/Jakarta',
  pending_email text,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Projects (stable UUID primary key so renames never break blueprints, rooms, Pins, or history)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 140),
  contractor_display_name text not null check (char_length(trim(contractor_display_name)) between 1 and 140),
  timezone text not null default 'Asia/Jakarta',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived', 'deleted')),
  draft_step smallint not null default 1 check (draft_step between 1 and 3),
  draft_key text,
  version integer not null default 1 check (version >= 1),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_projects_creator_draft_key
  on public.projects (created_by, draft_key)
  where draft_key is not null and status = 'draft' and deleted_at is null;

-- 3. Project Memberships (sole authority for project access; contractor_display_name grants zero rights)
create table if not exists public.project_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text,
  role text not null check (role in ('contractor', 'owner', 'worker', 'accounting')),
  has_mandor_grant boolean not null default false,
  has_accounting_grant boolean not null default false,
  status text not null default 'active' check (status in ('active', 'invited', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_memberships_subject_chk check (user_id is not null or invited_email is not null)
);

create unique index if not exists idx_project_memberships_unique_user
  on public.project_memberships (project_id, user_id)
  where user_id is not null;

create index if not exists idx_project_memberships_user_status
  on public.project_memberships (user_id, status);

-- 4. Server-Only Project Secrets (salted adaptive scrypt password hash + rate limit counters)
-- RLS enabled with ZERO policies for anon/authenticated: accessible ONLY via server service_role.
create table if not exists public.project_secrets (
  project_id uuid primary key references public.projects (id) on delete cascade,
  password_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- 5. Project Blueprints / Areas metadata (stable project_id FK)
create table if not exists public.project_blueprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  area_name text not null,
  sheet_code text not null,
  revision text not null default 'R00',
  status text not null default 'pending_upload'
    check (status in ('pending_upload', 'uploaded', 'processing', 'published', 'removed')),
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_blueprints_project
  on public.project_blueprints (project_id);

-- 6. Unified Append-Only Audit History (covers project & account scopes + future operational modules)
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  scope text not null check (scope in ('project', 'account')),
  project_id uuid references public.projects (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id),
  actor_name text not null,
  action text not null,
  object_type text not null check (
    object_type in (
      'project',
      'project_access',
      'area',
      'blueprint',
      'model',
      'pin',
      'qc',
      'profile',
      'security',
      'attendance',
      'stock_movement',
      'budget_decision'
    )
  ),
  object_id text not null,
  object_label text not null,
  result text not null check (result in ('success', 'rejected', 'pending', 'failed')),
  reason text,
  before_summary jsonb,
  after_summary jsonb,
  constraint audit_events_scope_project_chk check (
    (scope = 'project' and project_id is not null) or
    (scope = 'account' and project_id is null)
  )
);

create index if not exists idx_audit_events_project_time
  on public.audit_events (project_id, occurred_at desc)
  where scope = 'project';

create index if not exists idx_audit_events_account_time
  on public.audit_events (actor_user_id, occurred_at desc)
  where scope = 'account';

create index if not exists idx_audit_events_object
  on public.audit_events (project_id, object_type, object_id, occurred_at desc);

-- Enforce strict append-only immutability on audit_events at the database trigger level
create or replace function public.prevent_audit_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events is append-only and cannot be updated or deleted';
end;
$$;

drop trigger if exists trg_audit_events_no_update on public.audit_events;
create trigger trg_audit_events_no_update
  before update or delete on public.audit_events
  for each row execute function public.prevent_audit_events_mutation();

-- Helper Functions for Row Level Security
create or replace function public.is_active_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_memberships m
    where m.project_id = p_project_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_project_contractor(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_memberships m
    where m.project_id = p_project_id
      and m.user_id = auth.uid()
      and m.role = 'contractor'
      and m.status = 'active'
  );
$$;

-- Atomic Draft Creation RPC (invoked by trusted server onboarding; idempotent on draft_key)
create or replace function public.create_project_draft_atomic(
  p_creator_user_id uuid,
  p_actor_name text,
  p_name text,
  p_contractor_display_name text,
  p_timezone text,
  p_draft_key text,
  p_password_hash text
)
returns table (
  project_id uuid,
  resumed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_new_id uuid;
begin
  -- Resume existing draft for the same creator + draft_key (idempotent retry)
  if p_draft_key is not null and char_length(trim(p_draft_key)) > 0 then
    select id into v_existing_id
    from public.projects
    where created_by = p_creator_user_id
      and draft_key = p_draft_key
      and status = 'draft'
      and deleted_at is null
    limit 1;

    if v_existing_id is not null then
      return query select v_existing_id, true;
      return;
    end if;
  end if;

  insert into public.projects (
    name,
    contractor_display_name,
    timezone,
    status,
    draft_step,
    draft_key,
    created_by
  )
  values (
    trim(p_name),
    trim(p_contractor_display_name),
    coalesce(nullif(trim(p_timezone), ''), 'Asia/Jakarta'),
    'draft',
    2,
    nullif(trim(p_draft_key), ''),
    p_creator_user_id
  )
  returning id into v_new_id;

  insert into public.project_memberships (
    project_id,
    user_id,
    role,
    status
  )
  values (
    v_new_id,
    p_creator_user_id,
    'contractor',
    'active'
  );

  insert into public.project_secrets (
    project_id,
    password_hash
  )
  values (
    v_new_id,
    p_password_hash
  );

  insert into public.audit_events (
    scope,
    project_id,
    actor_user_id,
    actor_name,
    action,
    object_type,
    object_id,
    object_label,
    result,
    after_summary
  )
  values (
    'project',
    v_new_id,
    p_creator_user_id,
    p_actor_name,
    'project.draft_created',
    'project',
    v_new_id::text,
    trim(p_name),
    'success',
    jsonb_build_object(
      'name', trim(p_name),
      'contractorDisplayName', trim(p_contractor_display_name),
      'timezone', coalesce(nullif(trim(p_timezone), ''), 'Asia/Jakarta'),
      'status', 'draft'
    )
  );

  return query select v_new_id, false;
end;
$$;

-- Enable Row Level Security on all tables
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_memberships enable row level security;
alter table public.project_secrets enable row level security;
alter table public.project_blueprints enable row level security;
alter table public.audit_events enable row level security;

-- Profiles RLS: user can only read/update their own profile
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (user_id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Projects RLS: visible only to active members; editable only by active Contractor
drop policy if exists projects_select_member on public.projects;
create policy projects_select_member on public.projects
  for select using (
    deleted_at is null and public.is_active_project_member(id)
  );

drop policy if exists projects_update_contractor on public.projects;
create policy projects_update_contractor on public.projects
  for update using (
    deleted_at is null and public.is_project_contractor(id)
  )
  with check (public.is_project_contractor(id));

-- Memberships RLS: users read their own memberships (including invited); contractors read/manage project memberships
drop policy if exists memberships_select_self_or_contractor on public.project_memberships;
create policy memberships_select_self_or_contractor on public.project_memberships
  for select using (
    user_id = auth.uid()
    or public.is_project_contractor(project_id)
  );

-- Blueprints RLS: readable by active members; writable only by active Contractor
drop policy if exists blueprints_select_member on public.project_blueprints;
create policy blueprints_select_member on public.project_blueprints
  for select using (public.is_active_project_member(project_id));

drop policy if exists blueprints_write_contractor on public.project_blueprints;
create policy blueprints_write_contractor on public.project_blueprints
  for all using (public.is_project_contractor(project_id))
  with check (public.is_project_contractor(project_id));

-- Audit Events RLS: scoped strictly to own account events OR active project memberships (NO update/delete)
drop policy if exists audit_select_scoped on public.audit_events;
create policy audit_select_scoped on public.audit_events
  for select using (
    (scope = 'account' and actor_user_id = auth.uid())
    or (scope = 'project' and project_id is not null and public.is_active_project_member(project_id))
  );

-- Explicitly ZERO policies on public.project_secrets for anon/authenticated (server service_role only).
