-- ============================================
-- Migration: Cell Grouping - functions for signed-in users only
-- ============================================
-- Version: 23
-- Purpose:
--   Postgres lets everyone (PUBLIC) execute new functions, and Supabase also grants
--   them to the anonymous role by default. The Cell Grouping functions from migrations
--   19-22 are meant for signed-in users only, so take that right away from PUBLIC and
--   anon, and grant it to authenticated users. service_role is granted explicitly too,
--   so server-side code keeps access even if it only had it through PUBLIC. (The
--   functions still check roles, office network and device themselves; this only
--   stops signed-out callers.)
--
-- Instructions: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Requires migrations 19-22.
-- ============================================

DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'current_user_has_any_permission(text, text)',
    'request_client_ip()',
    'cell_grouping_request_from_office()',
    'cell_grouping_office_status()',
    'cell_grouping_key_hash(text)',
    'cell_grouping_device_approval_on()',
    'cell_grouping_access_problem(text)',
    'cell_grouping_device_status(text)',
    'cell_grouping_request_device(text, text, text)',
    'cell_grouping_decide_device(uuid, text, text, text, text)',
    'cell_grouping_published_rules(text)',
    'cell_grouping_record_run(text, jsonb)',
    'cell_grouping_run_upload_allowed(text)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

SELECT 'cell grouping functions: signed-in users only' AS status;
