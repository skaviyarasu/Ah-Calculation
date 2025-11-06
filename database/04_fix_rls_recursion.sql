-- ============================================
-- Migration: Fix RLS Infinite Recursion
-- ============================================
-- Version: 3.1.0
-- Date: 2025-01-26
-- 
-- This migration fixes the infinite recursion error
-- in Row Level Security policies for user_roles table.
-- 
-- The issue: Policies checking user_roles table were
-- causing infinite recursion. Solution: Use SECURITY DEFINER
-- function to bypass RLS when checking admin status.
-- 
-- Instructions:
-- 1. Copy this entire file
-- 2. Go to your Supabase Dashboard → SQL Editor
-- 3. Click "New query"
-- 4. Paste and click "Run"
-- ============================================

-- ============================================
-- 1. CREATE HELPER FUNCTION (BYPASSES RLS)
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
-- 2. DROP EXISTING POLICIES
-- ============================================

-- Drop existing policies that cause recursion (including all user_roles policies)
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;
DROP POLICY IF EXISTS "Anyone can view role permissions" ON role_permissions;
DROP POLICY IF EXISTS "Admins can manage permissions" ON role_permissions;
DROP POLICY IF EXISTS "Admins can view all optimization jobs" ON battery_optimization_jobs;
DROP POLICY IF EXISTS "Admins can edit all optimization jobs" ON battery_optimization_jobs;
DROP POLICY IF EXISTS "Admins can delete all optimization jobs" ON battery_optimization_jobs;

-- ============================================
-- 3. RECREATE POLICIES WITH FIXED FUNCTION
-- ============================================

-- User Roles policies (using fixed function)
-- Users can view their own role
CREATE POLICY "Users can view own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Only admins can view all roles (including their own)
CREATE POLICY "Admins can view all roles" ON user_roles
  FOR SELECT USING (
    auth.uid() = user_id OR
    is_current_user_admin()
  );

CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (
    is_current_user_admin()
  );

CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (
    is_current_user_admin()
  );

CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (
    is_current_user_admin()
  );

-- Role Permissions policies
-- Everyone can view role permissions (read-only for transparency)
CREATE POLICY "Anyone can view role permissions" ON role_permissions
  FOR SELECT USING (true);

-- Only admins can manage permissions
CREATE POLICY "Admins can manage permissions" ON role_permissions
  FOR ALL USING (
    is_current_user_admin()
  );

-- Battery Optimization Jobs policies (admin access)
CREATE POLICY "Admins can view all optimization jobs" ON battery_optimization_jobs
  FOR SELECT USING (
    auth.uid() = user_id OR
    is_current_user_admin()
  );

CREATE POLICY "Admins can edit all optimization jobs" ON battery_optimization_jobs
  FOR UPDATE USING (
    auth.uid() = user_id OR
    is_current_user_admin()
  );

CREATE POLICY "Admins can delete all optimization jobs" ON battery_optimization_jobs
  FOR DELETE USING (
    auth.uid() = user_id OR
    is_current_user_admin()
  );

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Expected result: "Success. No rows returned"
-- 
-- Verification Checklist:
-- [ ] Check Database → Functions → is_current_user_admin exists
-- [ ] Check Authentication → Policies → Policies are updated
-- [ ] Test that admin users can access user_roles table
-- [ ] Test that regular users can view their own role
-- [ ] Verify no "infinite recursion" errors
-- ============================================

