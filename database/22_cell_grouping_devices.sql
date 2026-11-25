-- ============================================
-- Migration: Cell Grouping - approved devices
-- ============================================
-- Version: 22
-- Purpose:
--   Group cells works only on devices (PCs / laptops) approved by an administrator,
--   on top of the office-network rule (migration 20). Administrators are exempt.
--
--   * A device asks for access with a random secret key created in its browser. Only a
--     SHA-256 hash of the key is stored. Admins approve / reject / revoke.
--   * Device approval switches ON when the first device is approved (until then only the
--     office network rule applies). Revoking or rejecting is final for that key: the
--     device must request again with a new key and be approved again.
--   * Operators read the published rules and record runs ONLY through functions that check
--     permission + office network + approved device every time:
--       cell_grouping_published_rules(device_key), cell_grouping_record_run(device_key, run)
--   * Saved run files can only be uploaded for a run the same user just recorded.
--
-- Instructions: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Requires migrations 19, 20 and 21.
-- ============================================

-- 1. Devices ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cell_grouping_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,           -- sha256 of the browser's secret key (hex)
  name TEXT NOT NULL,                      -- e.g. 'Grading station 1'
  asset_tag TEXT,                          -- label, e.g. 'DM-PC-014'
  mac_address TEXT,                        -- label only (browsers cannot read it), e.g. for the firewall list
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'revoked')),
  user_agent TEXT,
  requested_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  requested_by_email TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  decided_by UUID REFERENCES auth.users(id),
  decided_by_email TEXT,
  decided_at TIMESTAMP WITH TIME ZONE,
  revoked_by UUID REFERENCES auth.users(id),
  revoked_by_email TEXT,
  revoked_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE cell_grouping_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Devices read by admins" ON cell_grouping_devices;
CREATE POLICY "Devices read by admins" ON cell_grouping_devices FOR SELECT USING (is_current_user_admin());
-- Changes only through the functions below (no INSERT/UPDATE/DELETE policies).

-- 2. Helpers ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_key_hash(p_key TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_key IS NULL OR p_key !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;
  RETURN encode(extensions.digest(p_key, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION cell_grouping_device_approval_on()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM cell_grouping_devices WHERE status = 'active');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- NULL = allowed; otherwise the reason: NOT_SIGNED_IN, NO_PERMISSION, OFFICE_ONLY, DEVICE_NOT_APPROVED
CREATE OR REPLACE FUNCTION cell_grouping_access_problem(p_device_key TEXT)
RETURNS TEXT AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'NOT_SIGNED_IN';
  END IF;
  IF is_current_user_admin() THEN
    RETURN NULL;
  END IF;
  IF NOT (current_user_has_any_permission('process_grading_reports', 'cell_grouping')
          OR current_user_has_any_permission('manage_grouping_rules', 'cell_grouping')) THEN
    RETURN 'NO_PERMISSION';
  END IF;
  IF NOT cell_grouping_request_from_office() THEN
    RETURN 'OFFICE_ONLY';
  END IF;
  IF cell_grouping_device_approval_on() AND NOT EXISTS (
    SELECT 1 FROM cell_grouping_devices WHERE key_hash = cell_grouping_key_hash(p_device_key) AND status = 'active'
  ) THEN
    RETURN 'DEVICE_NOT_APPROVED';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 3. What the app shows for this browser ------------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_device_status(p_device_key TEXT)
RETURNS JSON AS $$
  SELECT json_build_object(
    'approval_on', cell_grouping_device_approval_on(),
    'status', COALESCE(d.status, 'unknown'),
    'name', d.name,
    'problem', cell_grouping_access_problem(p_device_key)
  )
  FROM (SELECT 1) AS one
  LEFT JOIN cell_grouping_devices d ON d.key_hash = cell_grouping_key_hash(p_device_key);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 4. A device asks for access ------------------------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_request_device(p_device_key TEXT, p_name TEXT, p_user_agent TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  h TEXT := cell_grouping_key_hash(p_device_key);
  existing cell_grouping_devices;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF NOT (is_current_user_admin()
          OR current_user_has_any_permission('process_grading_reports', 'cell_grouping')
          OR current_user_has_any_permission('manage_grouping_rules', 'cell_grouping')) THEN
    RAISE EXCEPTION 'You do not have access to Group cells.';
  END IF;
  IF h IS NULL THEN RAISE EXCEPTION 'Invalid device key.'; END IF;
  IF length(trim(COALESCE(p_name, ''))) = 0 THEN RAISE EXCEPTION 'Give the device a name.'; END IF;

  SELECT * INTO existing FROM cell_grouping_devices WHERE key_hash = h;
  IF FOUND THEN
    -- a revoked/rejected key is never reused: the app makes a new key and asks again
    RETURN json_build_object('status', existing.status);
  END IF;

  INSERT INTO cell_grouping_devices (key_hash, name, user_agent, requested_by, requested_by_email)
  VALUES (h, left(trim(p_name), 120), left(p_user_agent, 300), auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()));
  RETURN json_build_object('status', 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Admin decisions -------------------------------------------------------
-- p_action: 'approve' (pending -> active), 'reject' (pending -> rejected), 'revoke' (active -> revoked)
CREATE OR REPLACE FUNCTION cell_grouping_decide_device(
  p_id UUID, p_action TEXT, p_name TEXT DEFAULT NULL, p_asset_tag TEXT DEFAULT NULL, p_mac_address TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  d cell_grouping_devices;
  me_email TEXT := (SELECT email FROM auth.users WHERE id = auth.uid());
BEGIN
  IF NOT is_current_user_admin() THEN RAISE EXCEPTION 'Only administrators can approve or revoke devices.'; END IF;
  SELECT * INTO d FROM cell_grouping_devices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Device not found.'; END IF;

  IF p_action = 'approve' AND d.status = 'pending' THEN
    UPDATE cell_grouping_devices SET
      status = 'active',
      name = COALESCE(NULLIF(left(trim(p_name), 120), ''), name),
      asset_tag = NULLIF(left(trim(COALESCE(p_asset_tag, '')), 60), ''),
      mac_address = NULLIF(upper(left(trim(COALESCE(p_mac_address, '')), 40)), ''),
      decided_by = auth.uid(), decided_by_email = me_email, decided_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_id;
  ELSIF p_action = 'reject' AND d.status = 'pending' THEN
    UPDATE cell_grouping_devices SET status = 'rejected', decided_by = auth.uid(), decided_by_email = me_email, decided_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_id;
  ELSIF p_action = 'revoke' AND d.status = 'active' THEN
    UPDATE cell_grouping_devices SET status = 'revoked', revoked_by = auth.uid(), revoked_by_email = me_email, revoked_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Cannot % a device that is %.', p_action, d.status;
  END IF;
  RETURN json_build_object('id', p_id, 'action', p_action);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Published rules, checked every time -----------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_published_rules(p_device_key TEXT)
RETURNS TABLE (id UUID, chemistry TEXT, file_name TEXT, yaml_text TEXT, uploaded_by_email TEXT, uploaded_at TIMESTAMP WITH TIME ZONE) AS $$
DECLARE
  problem TEXT := cell_grouping_access_problem(p_device_key);
BEGIN
  IF problem IS NOT NULL THEN
    RAISE EXCEPTION '%', problem USING HINT = 'cell_grouping_access';
  END IF;
  RETURN QUERY
    SELECT DISTINCT ON (r.chemistry) r.id, r.chemistry, r.file_name, r.yaml_text, r.uploaded_by_email, r.uploaded_at
    FROM cell_grouping_rules r
    ORDER BY r.chemistry, r.uploaded_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Direct reads of the rules table: administrators only (operators use the function above).
DROP POLICY IF EXISTS "Rules readable by processors and managers" ON cell_grouping_rules;
CREATE POLICY "Rules readable by processors and managers" ON cell_grouping_rules
  FOR SELECT USING (is_current_user_admin());

-- 7. Record a run, checked every time --------------------------------------
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
    unassigned_count, rejected_count, input_path, report_path
  ) VALUES (
    run_id, auth.uid(), (SELECT email FROM auth.users WHERE id = auth.uid()),
    p_run ->> 'chemistry', NULLIF(p_run ->> 'rules_id', '')::uuid, p_run ->> 'rules_file_name', p_run ->> 'input_kind',
    p_run ->> 'input_file_name', COALESCE((p_run ->> 'input_file_count')::int, 1),
    CASE WHEN jsonb_typeof(p_run -> 'input_file_names') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_run -> 'input_file_names')) END,
    (p_run ->> 'cells_read')::int, COALESCE((p_run ->> 'cells_removed')::int, 0), COALESCE((p_run ->> 'cells_not_converted')::int, 0),
    (p_run ->> 'cells_grouped')::int, COALESCE(p_run -> 'group_counts', '{}'::jsonb),
    COALESCE((p_run ->> 'unassigned_count')::int, 0), COALESCE((p_run ->> 'rejected_count')::int, 0),
    p_run ->> 'input_path', p_run ->> 'report_path'
  );
  RETURN run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Direct inserts are no longer allowed (only through the function above).
DROP POLICY IF EXISTS "Runs added by processors" ON cell_grouping_runs;

-- 8. Run files: only for a run the same user recorded in the last hour ------
CREATE OR REPLACE FUNCTION cell_grouping_run_upload_allowed(p_object_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM cell_grouping_runs r
    WHERE r.id::text = split_part(p_object_name, '/', 3)       -- path: yyyy/mm/<run id>/<kind>/<file>
      AND r.user_id = auth.uid()
      AND r.created_at > TIMEZONE('utc'::text, NOW()) - INTERVAL '1 hour'
      AND p_object_name IN (r.input_path, r.report_path)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "Run files uploaded by processors" ON storage.objects;
CREATE POLICY "Run files uploaded by processors" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'cell-grouping-runs' AND cell_grouping_run_upload_allowed(name)
  );

-- 9. Permissions -------------------------------------------------------------
GRANT EXECUTE ON FUNCTION cell_grouping_device_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cell_grouping_request_device(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cell_grouping_decide_device(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cell_grouping_published_rules(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cell_grouping_record_run(TEXT, JSONB) TO authenticated;

COMMENT ON TABLE cell_grouping_devices IS 'Devices approved for Group cells (hash of a browser key). Approval switches on with the first approved device. Revoke/reject is final for a key.';

SELECT 'cell grouping devices ready' AS status;
