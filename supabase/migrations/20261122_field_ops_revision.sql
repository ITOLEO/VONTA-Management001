-- =============================================================================
-- VONTA Field Operations Revision (22 Nov 2026) — Strictly Additive Migration
-- =============================================================================
-- Preserves all existing memberships, blueprint source files, calibrated 3D
-- geometry, Spatial Pins, QC Before/After evidence, stock ledgers, budget
-- commitments, and audit history. Zero destructive drops.
-- =============================================================================

-- 1. Shared project department catalog (seeded with Civil, Electrical, Plumbing, Finishing)
CREATE TABLE IF NOT EXISTS public.project_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  default_pin_color TEXT NOT NULL DEFAULT '#D4652F' CHECK (default_pin_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, slug)
);

ALTER TABLE public.project_departments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_departments' AND policyname = 'project_departments_member_select'
  ) THEN
    CREATE POLICY project_departments_member_select ON public.project_departments
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.project_memberships pm
          WHERE pm.project_id = project_departments.project_id
            AND pm.user_id = auth.uid()
            AND pm.status = 'active'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_departments' AND policyname = 'project_departments_contractor_manage'
  ) THEN
    CREATE POLICY project_departments_contractor_manage ON public.project_departments
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.project_memberships pm
          WHERE pm.project_id = project_departments.project_id
            AND pm.user_id = auth.uid()
            AND pm.status = 'active'
            AND pm.role = 'contractor'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.project_memberships pm
          WHERE pm.project_id = project_departments.project_id
            AND pm.user_id = auth.uid()
            AND pm.status = 'active'
            AND pm.role = 'contractor'
        )
      );
  END IF;
END $$;

-- 2. Blueprint sheet register & mandatory department mapping (supports combined Electrical + Plumbing)
CREATE TABLE IF NOT EXISTS public.blueprint_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  blueprint_asset_id UUID,
  area_id TEXT NOT NULL,
  area_name TEXT NOT NULL,
  sheet_code TEXT NOT NULL,
  title TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT 'R00',
  page_number INTEGER NOT NULL DEFAULT 1,
  total_pages INTEGER NOT NULL DEFAULT 1,
  floor_label TEXT NOT NULL DEFAULT 'Ground Floor',
  classification TEXT NOT NULL DEFAULT 'plan' CHECK (classification IN ('plan', 'elevation', 'section', 'detail', 'coordination', 'reference')),
  is_combined_mep BOOLEAN NOT NULL DEFAULT FALSE,
  is_superseded BOOLEAN NOT NULL DEFAULT FALSE,
  scale_label TEXT,
  has_verified_north BOOLEAN NOT NULL DEFAULT FALSE,
  north_angle_deg NUMERIC(6, 2),
  model_preview_state TEXT NOT NULL DEFAULT 'queued' CHECK (model_preview_state IN ('ready', 'queued', 'processing', 'needs_review', 'reference_only', 'failed')),
  model_preview_reason TEXT,
  transcription_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blueprint_sheet_departments (
  sheet_id UUID NOT NULL REFERENCES public.blueprint_sheets(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.project_departments(id) ON DELETE CASCADE,
  PRIMARY KEY (sheet_id, department_id)
);

ALTER TABLE public.blueprint_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_sheet_departments ENABLE ROW LEVEL SECURITY;

-- 3. Scoped exact-email project invitations (dedicated roles locked; standard worker accounts receive worker/foreman)
CREATE TABLE IF NOT EXISTS public.project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_user_id UUID REFERENCES auth.users(id),
  registered_account_type TEXT NOT NULL CHECK (registered_account_type IN ('owner', 'contractor', 'architect', 'accounting', 'standard_worker')),
  assigned_project_role TEXT NOT NULL CHECK (assigned_project_role IN ('owner', 'contractor', 'architect', 'accounting', 'worker', 'foreman')),
  department_id UUID REFERENCES public.project_departments(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_project_invitations_project_email
  ON public.project_invitations (project_id, lower(invitee_email));

ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- 4. Attendance daily selfies & PDF Izin evidence support
CREATE TABLE IF NOT EXISTS public.attendance_daily_selfies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  worker_user_id UUID NOT NULL REFERENCES auth.users(id),
  worker_code TEXT NOT NULL,
  work_date DATE NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  captured_by UUID REFERENCES auth.users(id),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, worker_user_id, work_date)
);

ALTER TABLE public.attendance_daily_selfies ENABLE ROW LEVEL SECURITY;

-- Expand izin_evidence_files MIME allowlist if table already exists (allows application/pdf + images)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'izin_evidence_files'
  ) THEN
    ALTER TABLE public.izin_evidence_files
      DROP CONSTRAINT IF EXISTS izin_evidence_files_mime_type_check;
    ALTER TABLE public.izin_evidence_files
      ADD CONSTRAINT izin_evidence_files_mime_type_check
      CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));
  END IF;
END $$;

-- 5. Department budgets & dated ledger entries (allocations, charges, commitments)
CREATE TABLE IF NOT EXISTS public.department_budget_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.project_departments(id) ON DELETE CASCADE,
  amount_idr BIGINT NOT NULL CHECK (amount_idr >= 0),
  effective_date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.department_budget_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.project_departments(id) ON DELETE CASCADE,
  amount_idr BIGINT NOT NULL CHECK (amount_idr >= 0),
  charge_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'material',
  reference_code TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_committed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.department_budget_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_budget_charges ENABLE ROW LEVEL SECURITY;

-- 6. Additive columns on workspace_shares for Restricted vs Anyone-with-link viewer-only sharing
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workspace_shares'
  ) THEN
    ALTER TABLE public.workspace_shares
      ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'restricted'
        CHECK (access_mode IN ('restricted', 'anyone_with_link')),
      ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'viewer'
        CHECK (permission = 'viewer'),
      ADD COLUMN IF NOT EXISTS public_token_hash TEXT,
      ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_shares_public_token_hash
      ON public.workspace_shares (public_token_hash)
      WHERE public_token_hash IS NOT NULL AND revoked_at IS NULL;
  END IF;
END $$;

-- 7. Additive columns on spatial_pins for department color inheritance vs explicit override
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'spatial_pins'
  ) THEN
    ALTER TABLE public.spatial_pins
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.project_departments(id),
      ADD COLUMN IF NOT EXISTS pin_color_override BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
