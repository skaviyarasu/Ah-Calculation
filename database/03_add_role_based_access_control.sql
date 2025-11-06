-- ============================================
-- Migration: Add Role-Based Access Control (RBAC)
-- ============================================
-- Version: 3.0.0
-- Date: 2025-01-26
-- 
-- This migration adds role-based access control
-- to the application. Only admin users can manage
-- roles and access permissions.
-- 
-- Instructions:
-- 1. Copy this entire file
-- 2. Go to your Supabase Dashboard → SQL Editor
-- 3. Click "New query"
-- 4. Paste and click "Run"
-- ============================================

-- ============================================
-- 1. CREATE USER ROLES TABLE
-- ============================================

-- User Roles table: Stores role assignments for users
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, role)
);

-- ============================================
-- 2. CREATE ROLE PERMISSIONS TABLE
-- ============================================

-- Role Permissions table: Defines what permissions each role has
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  resource TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(role, permission, resource)
);

-- ============================================
-- 3. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_idx ON user_roles(role);
CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON role_permissions(role);
CREATE INDEX IF NOT EXISTS role_permissions_permission_idx ON role_permissions(permission);

-- ============================================
-- 4. INSERT DEFAULT ROLES AND PERMISSIONS
-- ============================================

-- Default roles: admin, user (standard user)
-- Default permissions for each role
INSERT INTO role_permissions (role, permission, resource, description) VALUES
  -- Admin role - full access
  ('admin', 'manage_users', 'users', 'Manage user accounts and roles'),
  ('admin', 'manage_roles', 'roles', 'Manage roles and permissions'),
  ('admin', 'view_all_jobs', 'jobs', 'View all users jobs'),
  ('admin', 'edit_all_jobs', 'jobs', 'Edit any user job'),
  ('admin', 'delete_all_jobs', 'jobs', 'Delete any user job'),
  ('admin', 'export_all_data', 'data', 'Export all user data'),
  ('admin', 'view_analytics', 'analytics', 'View system analytics'),
  
  -- Standard user role - limited access
  ('user', 'view_own_jobs', 'jobs', 'View own jobs only'),
  ('user', 'edit_own_jobs', 'jobs', 'Edit own jobs only'),
  ('user', 'delete_own_jobs', 'jobs', 'Delete own jobs only'),
  ('user', 'export_own_data', 'data', 'Export own data only'),
  ('user', 'create_jobs', 'jobs', 'Create new jobs')
ON CONFLICT (role, permission, resource) DO NOTHING;

-- ============================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. CREATE HELPER FUNCTIONS FOR POLICIES (BEFORE POLICIES)
-- ============================================

-- Function to check if current user is admin (bypasses RLS to avoid recursion)
-- This function uses SECURITY DEFINER to bypass RLS when checking admin status
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- 7. CREATE SECURITY POLICIES
-- ============================================

-- Drop existing policies if they exist (to allow re-running this migration)
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;

-- User Roles policies
-- Users can view their own role
CREATE POLICY "Users can view own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Only admins can view all roles (including their own)
CREATE POLICY "Admins can view all roles" ON user_roles
  FOR SELECT USING (
    auth.uid() = user_id OR
    is_current_user_admin()
  );

-- Only admins can insert roles
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (
    is_current_user_admin()
  );

-- Only admins can update roles
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (
    is_current_user_admin()
  );

-- Only admins can delete roles
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (
    is_current_user_admin()
  );

-- Role Permissions policies
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Admins can manage permissions" ON role_permissions;

-- Everyone can view role permissions (read-only for transparency)
CREATE POLICY "Anyone can view role permissions" ON role_permissions
  FOR SELECT USING (true);

-- Only admins can manage permissions
CREATE POLICY "Admins can manage permissions" ON role_permissions
  FOR ALL USING (
    is_current_user_admin()
  );

-- ============================================
-- 8. CREATE HELPER FUNCTIONS (for application use)
-- ============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION user_has_role(check_user_id UUID, check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = check_user_id 
    AND role = check_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if current user has a specific role
CREATE OR REPLACE FUNCTION current_user_has_role(check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = check_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has a specific permission
CREATE OR REPLACE FUNCTION user_has_permission(check_user_id UUID, check_permission TEXT, check_resource TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get user's role
  SELECT role INTO user_role
  FROM user_roles
  WHERE user_id = check_user_id
  ORDER BY 
    CASE role 
      WHEN 'admin' THEN 1 
      WHEN 'user' THEN 2 
      ELSE 3 
    END
  LIMIT 1;
  
  -- If no role found, default to 'user'
  IF user_role IS NULL THEN
    user_role := 'user';
  END IF;
  
  -- Check if role has the permission
  RETURN EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role = user_role
    AND permission = check_permission
    AND (check_resource IS NULL OR resource = check_resource)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's role
CREATE OR REPLACE FUNCTION get_user_role(check_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM user_roles
  WHERE user_id = check_user_id
  ORDER BY 
    CASE role 
      WHEN 'admin' THEN 1 
      WHEN 'user' THEN 2 
      ELSE 3 
    END
  LIMIT 1;
  
  -- If no role found, default to 'user'
  RETURN COALESCE(user_role, 'user');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. UPDATE EXISTING POLICIES FOR ROLE-BASED ACCESS
-- ============================================

-- Update battery_optimization_jobs policies to allow admin access
DROP POLICY IF EXISTS "Admins can view all optimization jobs" ON battery_optimization_jobs;
CREATE POLICY "Admins can view all optimization jobs" ON battery_optimization_jobs
  FOR SELECT USING (
    auth.uid() = user_id OR
    is_current_user_admin()
  );

DROP POLICY IF EXISTS "Admins can edit all optimization jobs" ON battery_optimization_jobs;
CREATE POLICY "Admins can edit all optimization jobs" ON battery_optimization_jobs
  FOR UPDATE USING (
    auth.uid() = user_id OR
    is_current_user_admin()
  );

DROP POLICY IF EXISTS "Admins can delete all optimization jobs" ON battery_optimization_jobs;
CREATE POLICY "Admins can delete all optimization jobs" ON battery_optimization_jobs
  FOR DELETE USING (
    auth.uid() = user_id OR
    is_current_user_admin()
  );

-- ============================================
-- 9. CREATE TRIGGER FOR UPDATED_AT
-- ============================================
-- Note: update_updated_at_column function may already exist from schema 01

-- Create function for updating updated_at timestamp (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (to allow re-running this migration)
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_user_roles_updated_at 
  BEFORE UPDATE ON user_roles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Expected result: "Success. No rows returned"
-- 
-- Verification Checklist:
-- [ ] Check Table Editor → user_roles table exists
-- [ ] Check Table Editor → role_permissions table exists
-- [ ] Check that default permissions are inserted
-- [ ] Check Authentication → Policies → RLS policies are enabled
-- [ ] Check Database → Functions → user_has_role, current_user_has_role, etc. exist
-- 
-- Next Steps:
-- 1. Assign admin role to your user account:
--    INSERT INTO user_roles (user_id, role) 
--    SELECT id, 'admin' FROM auth.users WHERE email = 'your-email@example.com';
-- ============================================

