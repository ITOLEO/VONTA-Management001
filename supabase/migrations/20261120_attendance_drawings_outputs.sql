-- VONTA Management Addendum Migration (20 November 2026)
-- Adds durable tables, RLS policies, private storage rules, and pg_cron automatic Alfa cutoff job.
-- Private device-local 3D drawings are intentionally NOT stored in the database (device-local IndexedDB only).

-- 1. Extend project_memberships with independent Workspace output grants & team/division scope
ALTER TABLE public.project_memberships
  ADD COLUMN IF NOT EXISTS can_download_workspace_view boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_share_workspace_view boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS division text NOT NULL DEFAULT 'Civil',
  ADD COLUMN IF NOT EXISTS team_id text NOT NULL DEFAULT 'team-default';

-- 2. Scheduled attendance shift obligations (project IANA timezone + exact UTC shift start)
CREATE TABLE IF NOT EXISTS public.attendance_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  worker_user_id uuid NOT NULL,
  division text NOT NULL,
  team_id text NOT NULL,
  work_date date NOT NULL,
  timezone text NOT NULL,
  eligibility text NOT NULL CHECK (
    eligibility IN ('scheduled', 'day_off', 'cancelled', 'attendance_disabled', 'missing_schedule', 'ambiguous_schedule')
  ),
  shift_start_utc timestamptz,
  cutoff_utc timestamptz GENERATED ALWAYS AS (
    CASE WHEN eligibility = 'scheduled' AND shift_start_utc IS NOT NULL
      THEN ((shift_start_utc at time zone 'UTC') + interval '1 hour') at time zone 'UTC'
      ELSE NULL
    END
  ) STORED,
  shift_label text NOT NULL DEFAULT '08:00–17:00',
  assigned_mandor_user_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, worker_user_id, work_date, shift_label)
);

-- 3. Effective attendance records (one active outcome per obligation)
CREATE TABLE IF NOT EXISTS public.attendance_records (
  obligation_id uuid PRIMARY KEY REFERENCES public.attendance_shifts(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  worker_user_id uuid NOT NULL,
  work_date date NOT NULL,
  division text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('no_record_yet', 'present', 'alfa', 'izin', 'schedule_unavailable', 'not_scheduled')
  ),
  check_in_received_at_utc timestamptz,
  effective_at_utc timestamptz,
  recorded_at_utc timestamptz NOT NULL DEFAULT now(),
  marked_by text CHECK (marked_by IN ('worker', 'system_cutoff', 'mandor_approval', 'reconciliation')),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Private izin photo evidence metadata (objects stored in private bucket 'vonta-izin-evidence')
CREATE TABLE IF NOT EXISTS public.izin_evidence_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  worker_user_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Photo-based izin requests (strictly separate from attendance_records)
CREATE TABLE IF NOT EXISTS public.izin_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.attendance_shifts(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  worker_user_id uuid NOT NULL,
  division text NOT NULL,
  team_id text NOT NULL,
  work_date date NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  evidence_photo_ids uuid[] NOT NULL CHECK (cardinality(evidence_photo_ids) >= 1),
  status text NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'awaiting_mandor_assignment', 'conflict_requires_correction')
  ),
  submitted_at_utc timestamptz NOT NULL DEFAULT now(),
  reviewed_at_utc timestamptz,
  reviewed_by_user_id uuid,
  rejection_reason text,
  requires_correction_workflow boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  CHECK (status <> 'rejected' OR length(trim(coalesce(rejection_reason, ''))) > 0),
  CHECK (reviewed_by_user_id IS NULL OR reviewed_by_user_id <> worker_user_id)
);

-- 6. Append-only attendance & izin history (no private photo URLs or raw medical notes)
CREATE TABLE IF NOT EXISTS public.attendance_history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  obligation_id uuid NOT NULL REFERENCES public.attendance_shifts(id) ON DELETE RESTRICT,
  worker_user_id uuid NOT NULL,
  work_date date NOT NULL,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('worker', 'mandor', 'system')),
  actor_user_id uuid,
  actor_name text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 7. Protected allowlisted Workspace shared-view references (zero drawings/photos/tokens)
CREATE TABLE IF NOT EXISTS public.workspace_view_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  model_version_id uuid NOT NULL,
  area_id uuid NOT NULL,
  room_id text,
  selected_pin_id text,
  camera_json jsonb NOT NULL,
  layers_json jsonb NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Row-Level Security
ALTER TABLE public.attendance_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.izin_evidence_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.izin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_history_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_view_shares ENABLE ROW LEVEL SECURITY;

-- Private izin evidence: ONLY owning worker or assigned active Mandor for the shift
CREATE POLICY "izin_evidence_worker_or_assigned_mandor" ON public.izin_evidence_files
  FOR SELECT USING (
    auth.uid() = worker_user_id
    OR EXISTS (
      SELECT 1
      FROM public.izin_requests ir
      JOIN public.attendance_shifts sh ON sh.id = ir.obligation_id
      JOIN public.project_memberships pm
        ON pm.project_id = ir.project_id
       AND pm.user_id = auth.uid()
       AND pm.status = 'active'
       AND pm.has_mandor_grant = true
      WHERE ir.project_id = izin_evidence_files.project_id
        AND izin_evidence_files.id = ANY(ir.evidence_photo_ids)
        AND auth.uid() = ANY(sh.assigned_mandor_user_ids)
        AND auth.uid() <> ir.worker_user_id
    )
  );

-- Protected Workspace view shares: live active project membership re-evaluated on every read
CREATE POLICY "workspace_shares_active_member_read" ON public.workspace_view_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = workspace_view_shares.project_id
        AND pm.user_id = auth.uid()
        AND pm.status = 'active'
    )
  );

-- Automatic Alfa Cutoff Sweep Function (idempotent; safe for pg_cron every 1 minute)
CREATE OR REPLACE FUNCTION public.run_vonta_attendance_cutoff_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  marked_count integer := 0;
BEGIN
  WITH overdue AS (
    SELECT sh.id, sh.project_id, sh.worker_user_id, sh.work_date, sh.division, sh.cutoff_utc
    FROM public.attendance_shifts sh
    LEFT JOIN public.attendance_records ar ON ar.obligation_id = sh.id
    LEFT JOIN public.izin_requests ir
      ON ir.obligation_id = sh.id AND ir.status = 'approved'
    WHERE sh.eligibility = 'scheduled'
      AND sh.cutoff_utc IS NOT NULL
      AND now() >= sh.cutoff_utc
      AND (ar.obligation_id IS NULL OR ar.status = 'no_record_yet')
      AND ir.id IS NULL
  ),
  upserted AS (
    INSERT INTO public.attendance_records (
      obligation_id, project_id, worker_user_id, work_date, division,
      status, effective_at_utc, recorded_at_utc, marked_by, version
    )
    SELECT
      id, project_id, worker_user_id, work_date, division,
      'alfa', cutoff_utc, now(), 'system_cutoff', 1
    FROM overdue
    ON CONFLICT (obligation_id) DO UPDATE
      SET status = 'alfa',
          effective_at_utc = EXCLUDED.effective_at_utc,
          recorded_at_utc = now(),
          marked_by = 'system_cutoff',
          version = public.attendance_records.version + 1,
          updated_at = now()
      WHERE public.attendance_records.status = 'no_record_yet'
    RETURNING obligation_id, project_id, worker_user_id, work_date, effective_at_utc
  )
  INSERT INTO public.attendance_history_events (
    project_id, obligation_id, worker_user_id, work_date,
    event_type, actor_type, actor_name, summary, metadata
  )
  SELECT
    project_id, obligation_id, worker_user_id, work_date,
    'alfa_auto_marked', 'system', 'Attendance Scheduler',
    'Automatically marked Alfa after 1-hour shift cutoff elapsed.',
    jsonb_build_object('effectiveAtUtc', effective_at_utc, 'recordedAtUtc', now())
  FROM upserted;

  GET DIAGNOSTICS marked_count = ROW_COUNT;
  RETURN marked_count;
END;
$$;

-- Schedule via pg_cron (when pg_cron extension is enabled in Supabase):
-- SELECT cron.schedule('vonta-alfa-cutoff-sweep', '* * * * *', $$SELECT public.run_vonta_attendance_cutoff_sweep();$$);
