-- ============================================
-- Migration: Cell Grouping (grading report processing)
-- ============================================
-- Version: 19
-- Purpose:
--   * New "operator" role that processes grading reports.
--   * Permissions:
--       manage_grouping_rules   (cell_grouping) - upload/publish YAML rules (admin)
--       process_grading_reports (cell_grouping) - run grading reports (admin, operator)
--   * cell_grouping_rules: every published YAML version per chemistry (LFP, NMC, ...).
--     The newest row per chemistry is the one operators use; older rows are history.
--
-- Instructions: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once.
-- ============================================

-- 1. Role ---------------------------------------------------------------
INSERT INTO role_catalog (role, label, description)
VALUES ('operator', 'Operator', 'Processes cell grading reports with the grouping rules published by an administrator.')
ON CONFLICT (role) DO NOTHING;

-- 2. Permissions --------------------------------------------------------
INSERT INTO role_permissions (role, permission, resource, description) VALUES
  ('admin',    'manage_grouping_rules',   'cell_grouping', 'Upload and publish LFP/NMC grouping rules (YAML)'),
  ('admin',    'process_grading_reports', 'cell_grouping', 'Process grading reports with the published rules'),
  ('operator', 'process_grading_reports', 'cell_grouping', 'Process grading reports with the published rules')
ON CONFLICT (role, permission, resource) DO NOTHING;

-- 3. Permission check across ALL of the caller's roles -------------------
-- user_has_permission() only looks at the single highest-precedence role, so a
-- user who is e.g. both creator and operator would be refused. This helper checks
-- every role the current user holds. SECURITY DEFINER avoids RLS recursion.
CREATE OR REPLACE FUNCTION current_user_has_any_permission(check_permission TEXT, check_resource TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = auth.uid()
      AND rp.permission = check_permission
      AND (check_resource IS NULL OR rp.resource = check_resource)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION current_user_has_any_permission(TEXT, TEXT) TO authenticated;

-- 4. Rules table --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cell_grouping_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chemistry TEXT NOT NULL CHECK (length(trim(chemistry)) > 0),
  file_name TEXT NOT NULL,
  yaml_text TEXT NOT NULL CHECK (length(yaml_text) > 0),
  uploaded_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  uploaded_by_email TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS cell_grouping_rules_chemistry_idx
  ON cell_grouping_rules (chemistry, uploaded_at DESC);

ALTER TABLE cell_grouping_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rules readable by processors and managers" ON cell_grouping_rules;
DROP POLICY IF EXISTS "Rules published by managers" ON cell_grouping_rules;
DROP POLICY IF EXISTS "Rules deleted by managers" ON cell_grouping_rules;

CREATE POLICY "Rules readable by processors and managers" ON cell_grouping_rules
  FOR SELECT USING (
    is_current_user_admin()
    OR current_user_has_any_permission('process_grading_reports', 'cell_grouping')
    OR current_user_has_any_permission('manage_grouping_rules', 'cell_grouping')
  );

CREATE POLICY "Rules published by managers" ON cell_grouping_rules
  FOR INSERT WITH CHECK (
    (is_current_user_admin() OR current_user_has_any_permission('manage_grouping_rules', 'cell_grouping'))
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Rules deleted by managers" ON cell_grouping_rules
  FOR DELETE USING (
    is_current_user_admin() OR current_user_has_any_permission('manage_grouping_rules', 'cell_grouping')
  );

-- No UPDATE policy: published versions are immutable; publishing again adds a new version.

COMMENT ON TABLE cell_grouping_rules IS 'Published cell-grouping YAML rules, one row per version; newest per chemistry is active.';

SELECT 'cell grouping ready' AS status;
