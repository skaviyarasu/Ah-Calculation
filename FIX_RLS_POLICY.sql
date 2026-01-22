-- ============================================
-- Quick Fix: Update user_branch_map RLS Policy
-- ============================================
-- This allows users to insert their own branch assignments
-- which is needed for the auto-assignment feature
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert own branch map" ON user_branch_map;
DROP POLICY IF EXISTS "Admins manage branch map" ON user_branch_map;
DROP POLICY IF EXISTS "Admins can delete branch map" ON user_branch_map;

-- Allow users to insert their own branch assignments (for auto-assignment)
CREATE POLICY "Users can insert own branch map" ON user_branch_map
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only admins can update branch assignments
CREATE POLICY "Admins manage branch map" ON user_branch_map
  FOR UPDATE USING (is_current_user_admin());

-- Only admins can delete branch assignments
CREATE POLICY "Admins can delete branch map" ON user_branch_map
  FOR DELETE USING (is_current_user_admin());

-- ============================================
-- Also assign admin role to fix admin check
-- ============================================
-- Replace 'your-email@example.com' with your actual email
-- Or use your user ID directly

INSERT INTO user_roles (user_id, role, assigned_by)
SELECT 
  id as user_id,
  'admin' as role,
  id as assigned_by
FROM auth.users
WHERE id = '72d65142-afb1-4fc8-80fb-9453530d6b39'::uuid
ON CONFLICT (user_id, role) DO NOTHING;

SELECT 'RLS policy updated and admin role assigned' AS status;

