-- VONTA Management — Migration 202611190002
-- Blueprint-backed Project Creation, Durable Processing Jobs, Immutable Model Versions,
-- Areas, Verified Closed-Boundary Rooms, Work Pins & Replacement Remap, and Logical Deletion Access Revocation.

-- 1. Extend project setup status to include 'ready' (set when first verified model is published)
alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (status in ('draft', 'ready', 'active', 'archived', 'deleted'));

-- Extend project_blueprints status to include 'retired' (preserving historical versions referenced by work/evidence)
alter table public.project_blueprints
  drop constraint if exists project_blueprints_status_check;

alter table public.project_blueprints
  add constraint project_blueprints_status_check
  check (status in ('pending_upload', 'uploaded', 'processing', 'published', 'retired', 'removed'));

-- 2. Project Areas (real named areas belonging strictly to one project)
create table if not exists public.project_areas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 140),
  sort_order integer not null default 0,
  is_registered_in_common_frame boolean not null default false,
  frame_offset_x_m double precision not null default 0,
  frame_offset_y_m double precision not null default 0,
  frame_offset_z_m double precision not null default 0,
  active_model_version_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_areas_project
  on public.project_areas (project_id);

-- 3. Private Blueprint Source Assets (original file stored privately; access checked via active project membership)
create table if not exists public.blueprint_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  area_id uuid not null references public.project_areas (id) on delete cascade,
  sheet_code text not null,
  revision text not null default 'R00',
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  storage_path text not null,
  plan_page integer not null default 1 check (plan_page >= 1),
  plan_region jsonb not null default '{"x":0,"y":0,"width":1,"height":1}'::jsonb,
  calibration jsonb not null,
  status text not null default 'uploaded'
    check (status in ('draft', 'uploaded', 'published', 'retired', 'removed')),
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_blueprint_assets_project_area
  on public.blueprint_assets (project_id, area_id);

-- 4. Durable Processing Jobs (one job per submission_key; actual state persists across refresh)
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  area_id uuid not null references public.project_areas (id) on delete cascade,
  blueprint_asset_id uuid not null references public.blueprint_assets (id) on delete cascade,
  submission_key text not null,
  mode text not null default 'initial' check (mode in ('initial', 'replacement')),
  replaces_model_version_id uuid,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'needs_input', 'needs_review', 'failed', 'verified', 'published')),
  ai_provider text,
  ai_model text,
  error_code text,
  error_message text,
  proposal_json jsonb,
  built_model_json jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_processing_jobs_submission_key
  on public.processing_jobs (project_id, submission_key);

-- 5. Immutable Model Versions (retain blueprint, revision, calibration, geometry, verified rooms)
create table if not exists public.model_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  area_id uuid not null references public.project_areas (id) on delete cascade,
  blueprint_asset_id uuid not null references public.blueprint_assets (id),
  processing_job_id uuid references public.processing_jobs (id),
  version_number integer not null default 1 check (version_number >= 1),
  sheet_code text not null,
  revision text not null,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'verified', 'published', 'superseded', 'retired')),
  calibration_snapshot jsonb not null,
  geometry_spec jsonb not null,
  rooms_json jsonb not null default '[]'::jsonb,
  cross_check_json jsonb not null,
  supersedes_version_id uuid references public.model_versions (id),
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  published_by uuid references auth.users (id),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_model_versions_project_area
  on public.model_versions (project_id, area_id, status);

-- 6. Project Spatial Pins (anchored to specific area + model_version; never silently moved on revision)
create table if not exists public.project_pins (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  area_id uuid not null references public.project_areas (id) on delete cascade,
  model_version_id uuid not null references public.model_versions (id),
  title text not null,
  description text not null default '',
  room_id text not null,
  room_name text not null,
  element_id text not null,
  element_name text not null,
  surface_side text not null,
  position_json jsonb not null,
  normal_json jsonb not null,
  department text not null default 'Civil',
  assignee_name text not null default 'Unassigned',
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'pending_review', 'approved')),
  cycle_number integer not null default 1,
  anchor_status text not null default 'valid'
    check (anchor_status in ('valid', 'needs_remap', 'remapped')),
  remapped_from_version_id uuid references public.model_versions (id),
  materials_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '{"before":null,"after":null}'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_pins_project_area
  on public.project_pins (project_id, area_id);

-- 7. Enable RLS on all new tables; revoke ordinary member access automatically if project is logically deleted
alter table public.project_areas enable row level security;
alter table public.blueprint_assets enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.model_versions enable row level security;
alter table public.project_pins enable row level security;

create or replace function public.has_active_live_project_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.project_memberships m on m.project_id = p.id
    where p.id = p_project_id
      and p.status <> 'deleted'
      and p.deleted_at is null
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

drop policy if exists project_areas_member_select on public.project_areas;
create policy project_areas_member_select on public.project_areas
  for select using (public.has_active_live_project_access(project_id));

drop policy if exists blueprint_assets_member_select on public.blueprint_assets;
create policy blueprint_assets_member_select on public.blueprint_assets
  for select using (public.has_active_live_project_access(project_id));

drop policy if exists processing_jobs_member_select on public.processing_jobs;
create policy processing_jobs_member_select on public.processing_jobs
  for select using (public.has_active_live_project_access(project_id));

drop policy if exists model_versions_member_select on public.model_versions;
create policy model_versions_member_select on public.model_versions
  for select using (public.has_active_live_project_access(project_id));

drop policy if exists project_pins_member_select on public.project_pins;
create policy project_pins_member_select on public.project_pins
  for select using (public.has_active_live_project_access(project_id));
