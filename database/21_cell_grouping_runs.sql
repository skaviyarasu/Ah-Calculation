-- ============================================
-- Migration: Grading history (Cell Grouping runs)
-- ============================================
-- Version: 21
-- Purpose:
--   Every successful "Assign groups" is recorded: who, when, chemistry, rules version,
--   input, counts per group, and copies of the input and of the grouping report.
--   * cell_grouping_runs: one row per run. Users who may process reports can ADD their
--     own runs; only administrators can READ them. No one can change or delete a run
--     from the app (an audit trail).
--   * Storage bucket "cell-grouping-runs" (private): the input file (or, for LFP per-cell
--     reports, the converted batch) and the grouped CSV. Same rules: processors upload,
--     administrators download.
--
-- Instructions: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Requires migration 19.
-- ============================================

-- 1. Runs table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cell_grouping_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  user_email TEXT,
  chemistry TEXT NOT NULL,
  rules_id UUID REFERENCES cell_grouping_rules(id),
  rules_file_name TEXT,
  input_kind TEXT NOT NULL CHECK (input_kind IN ('machine_export', 'per_cell_reports', 'csv')),
  input_file_name TEXT NOT NULL,          -- file name, or "N per-cell reports"
  input_file_count INTEGER NOT NULL DEFAULT 1,
  input_file_names TEXT[],                -- per-cell reports: every file name
  cells_read INTEGER,                     -- rows in the input (before preprocessing removed any)
  cells_removed INTEGER NOT NULL DEFAULT 0,       -- removed by the rules' drop_rows filter
  cells_not_converted INTEGER NOT NULL DEFAULT 0, -- LFP per-cell reports that could not be converted
  cells_grouped INTEGER NOT NULL,         -- rows in the grouping report
  group_counts JSONB NOT NULL,            -- {"AA": 302, "AG": 82, ...}
  unassigned_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  input_path TEXT,                        -- storage path of the saved input
  report_path TEXT                        -- storage path of the grouped CSV
);

CREATE INDEX IF NOT EXISTS cell_grouping_runs_created_idx ON cell_grouping_runs (created_at DESC);

ALTER TABLE cell_grouping_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Runs added by processors" ON cell_grouping_runs;
DROP POLICY IF EXISTS "Runs read by admins" ON cell_grouping_runs;

CREATE POLICY "Runs added by processors" ON cell_grouping_runs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      is_current_user_admin()
      OR current_user_has_any_permission('process_grading_reports', 'cell_grouping')
    )
  );

CREATE POLICY "Runs read by admins" ON cell_grouping_runs
  FOR SELECT USING (is_current_user_admin());

-- No UPDATE / DELETE policies: runs cannot be changed or removed from the app.

COMMENT ON TABLE cell_grouping_runs IS 'Grading history: one row per successful Assign groups. Insert by processors, read by admins, never updated.';

-- 2. Private storage bucket for the input and report files ----------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('cell-grouping-runs', 'cell-grouping-runs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Run files uploaded by processors" ON storage.objects;
DROP POLICY IF EXISTS "Run files read by admins" ON storage.objects;

CREATE POLICY "Run files uploaded by processors" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'cell-grouping-runs'
    AND (
      is_current_user_admin()
      OR current_user_has_any_permission('process_grading_reports', 'cell_grouping')
    )
  );

CREATE POLICY "Run files read by admins" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'cell-grouping-runs' AND is_current_user_admin()
  );

-- No UPDATE / DELETE policies on the bucket either.

SELECT 'grading history ready' AS status;
