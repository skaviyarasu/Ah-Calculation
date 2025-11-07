-- ============================================
-- Migration: Create Role Catalog
-- ============================================
-- Version: 15
-- Purpose: Persist role metadata so administrators
--          can create custom roles and retain them
-- ============================================

-- Create catalog table if it doesn't exist
CREATE TABLE IF NOT EXISTS role_catalog (
  role TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Ensure RLS is enabled
ALTER TABLE role_catalog ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so migration is idempotent
DROP POLICY IF EXISTS "Anyone can view role catalog" ON role_catalog;
DROP POLICY IF EXISTS "Admins manage role catalog" ON role_catalog;

-- Allow everyone to read available roles
CREATE POLICY "Anyone can view role catalog" ON role_catalog
  FOR SELECT USING (true);

-- Only admins may insert/update/delete roles
CREATE POLICY "Admins manage role catalog" ON role_catalog
  FOR ALL USING (is_current_user_admin());

-- Seed catalog with existing predefined roles (idempotent)
INSERT INTO role_catalog (role, label, description)
VALUES
  ('admin', 'Administrator', 'Full platform access with the ability to configure other users.'),
  ('accountant', 'Accountant', 'Manages contacts, sales, purchases, banking, and statutory compliance.'),
  ('creator', 'Creator', 'Creates and manages optimization jobs and related data.'),
  ('verifier', 'Verifier', 'Reviews and verifies optimization jobs before approval.'),
  ('user', 'Standard User', 'Access limited to own jobs and assigned modules.')
ON CONFLICT (role) DO NOTHING;

-- Record completion (no-op select)
SELECT 'role_catalog ready' AS status;
