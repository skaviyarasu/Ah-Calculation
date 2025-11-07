-- =====================================================
-- 12_create_user_directory.sql
-- Purpose: Provide admin-only access to basic user directory information
--          (name, email, last sign-in) stored in Supabase auth.users.
--          This enables the Admin Panel to display friendly user details.
-- =====================================================

-- Safety: Ensure function can be re-run without error
DROP FUNCTION IF EXISTS admin_get_all_users();

CREATE OR REPLACE FUNCTION admin_get_all_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  last_sign_in TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id AS user_id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', '') AS full_name,
    u.last_sign_in_at AS last_sign_in,
    u.created_at
  FROM auth.users u
  WHERE EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  )
  ORDER BY u.created_at DESC;
$$;

-- Restrict function usage
REVOKE ALL ON FUNCTION admin_get_all_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_all_users() TO authenticated;

COMMENT ON FUNCTION admin_get_all_users()
IS 'Returns basic directory information (id, email, full_name, last_sign_in) for all Supabase auth users. Restricted to application admins.';

