-- ============================================
-- Migration: Cell Grouping - rerun the NA cells of a run after the rules change
-- ============================================
-- Version: 25
-- Purpose:
--   When new grouping rules are published (e.g. from the Unassigned cells page), runs that
--   still have NA cells can be rerun with them. A rerun regroups only the NA cells of the
--   run's saved report; cells that already have a group keep it. Runs are never changed:
--   the rerun is saved as a NEW run that points to the original (rerun_of), and the original
--   then counts as refreshed. Operators see and rerun these runs as well as admins.
--
--   * cell_grouping_runs.rerun_of: the run this one reruns (one rerun per run).
--   * cell_grouping_rerun_candidates(device key): runs with NA cells, graded with older rules
--     than the newest published ones of their chemistry, and not rerun yet. Checked every
--     time (permission + office network + approved device), like every Group cells call.
--   * Storage: processors may read the saved report of such a run (only that file, only
--     while the run can be rerun), so the browser can regroup it.
--   * cell_grouping_record_run(): also saves rerun_of; for a rerun it checks the original
--     can still be rerun with the newest rules, and keeps the original's input files.
--
-- Instructions: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Requires migrations 21-24.
-- ============================================

-- 1. Column ---------------------------------------------------------------------
ALTER TABLE cell_grouping_runs ADD COLUMN IF NOT EXISTS rerun_of UUID REFERENCES cell_grouping_runs(id);
CREATE UNIQUE INDEX IF NOT EXISTS cell_grouping_runs_rerun_of_idx ON cell_grouping_runs (rerun_of) WHERE rerun_of IS NOT NULL;

-- 2. Newest published rules per chemistry ------------------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_latest_rules_id(p_chemistry TEXT)
RETURNS UUID AS $$
  SELECT id FROM cell_grouping_rules WHERE chemistry = p_chemistry ORDER BY uploaded_at DESC LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 3. Whether a run can be rerun now ----------------------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_run_needs_rerun(r cell_grouping_runs)
RETURNS BOOLEAN AS $$
  SELECT r.unassigned_count > 0
     AND r.report_path IS NOT NULL
     AND cell_grouping_latest_rules_id(r.chemistry) IS NOT NULL
     AND r.rules_id IS DISTINCT FROM cell_grouping_latest_rules_id(r.chemistry)
     AND NOT EXISTS (SELECT 1 FROM cell_grouping_runs c WHERE c.rerun_of = r.id);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 4. Runs to rerun, for operators and admins ---------------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_rerun_candidates(p_device_key TEXT)
RETURNS SETOF JSON AS $$
DECLARE
  problem TEXT := cell_grouping_access_problem(p_device_key);
BEGIN
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION '%', problem USING HINT = 'cell_grouping_access';
  END IF;
  RETURN QUERY
    SELECT json_build_object(
      'id', r.id, 'created_at', r.created_at, 'user_email', r.user_email, 'chemistry', r.chemistry,
      'rules_id', r.rules_id, 'rules_file_name', r.rules_file_name, 'input_kind', r.input_kind,
      'input_file_name', r.input_file_name, 'input_file_count', r.input_file_count,
      'input_file_names', r.input_file_names, 'cells_read', r.cells_read, 'cells_removed', r.cells_removed,
      'cells_not_converted', r.cells_not_converted, 'cells_grouped', r.cells_grouped,
      'group_counts', r.group_counts, 'unassigned_count', r.unassigned_count, 'rejected_count', r.rejected_count,
      'report_path', r.report_path, 'rerun_of', r.rerun_of
    )
    FROM cell_grouping_runs r
    WHERE cell_grouping_run_needs_rerun(r)
    ORDER BY r.created_at DESC
    LIMIT 500;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 5. Processors read the report of a run they can rerun -----------------------------
CREATE OR REPLACE FUNCTION cell_grouping_rerun_read_allowed(p_object_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT (is_current_user_admin() OR current_user_has_any_permission('process_grading_reports', 'cell_grouping'))
     AND EXISTS (
       SELECT 1 FROM cell_grouping_runs r
       WHERE r.id::text = split_part(p_object_name, '/', 3)     -- path: yyyy/mm/<run id>/<kind>/<file>
         AND r.report_path = p_object_name
         AND cell_grouping_run_needs_rerun(r)
     );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "Rerun reports read by processors" ON storage.objects;
CREATE POLICY "Rerun reports read by processors" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'cell-grouping-runs' AND cell_grouping_rerun_read_allowed(name)
  );

-- 6. Record a run (as migration 24, plus rerun_of) -----------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_record_run(p_device_key TEXT, p_run JSONB)
RETURNS UUID AS $$
DECLARE
  problem TEXT := cell_grouping_access_problem(p_device_key);
  run_id UUID := (p_run ->> 'id')::uuid;
  original_id UUID := NULLIF(p_run ->> 'rerun_of', '')::uuid;
  original cell_grouping_runs;
  v_input_path TEXT := p_run ->> 'input_path';
  v_raw_path TEXT := NULLIF(p_run ->> 'raw_input_path', '');
BEGIN
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION '%', problem USING HINT = 'cell_grouping_access';
  END IF;
  IF original_id IS NOT NULL THEN
    SELECT * INTO original FROM cell_grouping_runs WHERE id = original_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The run to rerun was not found.';
    END IF;
    IF NOT cell_grouping_run_needs_rerun(original) THEN
      RAISE EXCEPTION 'This run was already rerun, has no NA cells, or already uses the newest rules.';
    END IF;
    IF original.chemistry IS DISTINCT FROM p_run ->> 'chemistry'
       OR NULLIF(p_run ->> 'rules_id', '')::uuid IS DISTINCT FROM cell_grouping_latest_rules_id(original.chemistry) THEN
      RAISE EXCEPTION 'A rerun must use the newest published % rules. Reload the page and try again.', original.chemistry;
    END IF;
    -- a rerun keeps the original's input; only its report is new
    v_input_path := original.input_path;
    v_raw_path := original.raw_input_path;
  END IF;
  INSERT INTO cell_grouping_runs (
    id, user_id, user_email, chemistry, rules_id, rules_file_name, input_kind, input_file_name, input_file_count,
    input_file_names, cells_read, cells_removed, cells_not_converted, cells_grouped, group_counts,
    unassigned_count, rejected_count, input_path, report_path, raw_input_path, rerun_of
  ) VALUES (
    run_id, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
    p_run ->> 'chemistry', NULLIF(p_run ->> 'rules_id', '')::uuid, p_run ->> 'rules_file_name', p_run ->> 'input_kind',
    p_run ->> 'input_file_name', COALESCE((p_run ->> 'input_file_count')::int, 1),
    CASE WHEN jsonb_typeof(p_run -> 'input_file_names') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_run -> 'input_file_names')) END,
    (p_run ->> 'cells_read')::int, COALESCE((p_run ->> 'cells_removed')::int, 0), COALESCE((p_run ->> 'cells_not_converted')::int, 0),
    (p_run ->> 'cells_grouped')::int, COALESCE(p_run -> 'group_counts', '{}'::jsonb),
    COALESCE((p_run ->> 'unassigned_count')::int, 0), COALESCE((p_run ->> 'rejected_count')::int, 0),
    v_input_path, p_run ->> 'report_path', v_raw_path, original_id
  );
  RETURN run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Permissions (as migration 23: signed-in users and service_role only) ------------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'cell_grouping_latest_rules_id(text)',
    'cell_grouping_run_needs_rerun(cell_grouping_runs)',
    'cell_grouping_rerun_candidates(text)',
    'cell_grouping_rerun_read_allowed(text)',
    'cell_grouping_record_run(text, jsonb)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

SELECT 'NA cells can be rerun with the newest rules' AS status;
