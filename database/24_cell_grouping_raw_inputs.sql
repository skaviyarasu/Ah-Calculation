-- ============================================
-- Migration: Cell Grouping - keep the raw LFP per-cell files in the grading history
-- ============================================
-- Version: 24
-- Purpose:
--   For LFP per-cell reports, a run saved only the converted batch (machine layout) as its
--   input. It now also saves the raw per-channel files exactly as uploaded, as one ZIP per
--   run. This adds raw_input_path to cell_grouping_runs, lets cell_grouping_record_run()
--   store it, and lets cell_grouping_run_upload_allowed() accept an upload to that path
--   (path: yyyy/mm/<run id>/raw/<file>.zip). Machine-export and CSV runs leave it NULL.
--
-- Instructions: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Requires migrations 21-23.
-- ============================================

-- 1. Column -------------------------------------------------------------------
ALTER TABLE cell_grouping_runs ADD COLUMN IF NOT EXISTS raw_input_path TEXT; -- storage path of the raw per-cell files (ZIP)

-- 2. Record a run, checked every time (same as migration 22, plus raw_input_path) --
CREATE OR REPLACE FUNCTION cell_grouping_record_run(p_device_key TEXT, p_run JSONB)
RETURNS UUID AS $$
DECLARE
  problem TEXT := cell_grouping_access_problem(p_device_key);
  run_id UUID := (p_run ->> 'id')::uuid;
BEGIN
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION '%', problem USING HINT = 'cell_grouping_access';
  END IF;
  INSERT INTO cell_grouping_runs (
    id, user_id, user_email, chemistry, rules_id, rules_file_name, input_kind, input_file_name, input_file_count,
    input_file_names, cells_read, cells_removed, cells_not_converted, cells_grouped, group_counts,
    unassigned_count, rejected_count, input_path, report_path, raw_input_path
  ) VALUES (
    run_id, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
    p_run ->> 'chemistry', NULLIF(p_run ->> 'rules_id', '')::uuid, p_run ->> 'rules_file_name', p_run ->> 'input_kind',
    p_run ->> 'input_file_name', COALESCE((p_run ->> 'input_file_count')::int, 1),
    CASE WHEN jsonb_typeof(p_run -> 'input_file_names') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_run -> 'input_file_names')) END,
    (p_run ->> 'cells_read')::int, COALESCE((p_run ->> 'cells_removed')::int, 0), COALESCE((p_run ->> 'cells_not_converted')::int, 0),
    (p_run ->> 'cells_grouped')::int, COALESCE(p_run -> 'group_counts', '{}'::jsonb),
    COALESCE((p_run ->> 'unassigned_count')::int, 0), COALESCE((p_run ->> 'rejected_count')::int, 0),
    p_run ->> 'input_path', p_run ->> 'report_path', NULLIF(p_run ->> 'raw_input_path', '')
  );
  RETURN run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Run files: only for a run the same user recorded in the last hour --------
CREATE OR REPLACE FUNCTION cell_grouping_run_upload_allowed(p_object_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM cell_grouping_runs r
    WHERE r.id::text = split_part(p_object_name, '/', 3)       -- path: yyyy/mm/<run id>/<kind>/<file>
      AND r.user_id = auth.uid()
      AND r.created_at > TIMEZONE('utc'::text, NOW()) - INTERVAL '1 hour'
      AND p_object_name IN (r.input_path, r.report_path, r.raw_input_path)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 4. Permissions (as migration 23: signed-in users and service_role only) ------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'cell_grouping_record_run(text, jsonb)',
    'cell_grouping_run_upload_allowed(text)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

SELECT 'grading history keeps raw per-cell files' AS status;
