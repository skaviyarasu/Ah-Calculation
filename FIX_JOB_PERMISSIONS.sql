-- ============================================
-- Quick Fix: Allow User to Save Jobs
-- ============================================
-- This ensures the user can create and save jobs
-- by assigning the 'creator' role and ensuring
-- the role_permissions table has the right permissions
-- ============================================

-- First, ensure 'creator' role permissions exist in role_permissions table
-- (These should already exist if migration 05 was run, but adding for safety)
INSERT INTO role_permissions (role, permission, resource, description) VALUES
  ('creator', 'create_jobs', 'jobs', 'Create new job calculations'),
  ('creator', 'edit_own_jobs', 'jobs', 'Edit own jobs in draft or needs_modification status'),
  ('creator', 'view_own_jobs', 'jobs', 'View own job calculations'),
  ('creator', 'delete_own_draft_jobs', 'jobs', 'Delete own jobs in draft status'),
  ('user', 'create_jobs', 'jobs', 'Create new jobs'),
  ('user', 'edit_own_jobs', 'jobs', 'Edit own jobs only'),
  ('user', 'view_own_jobs', 'jobs', 'View own jobs only'),
  ('user', 'delete_own_jobs', 'jobs', 'Delete own jobs only')
ON CONFLICT (role, permission, resource) DO NOTHING;

-- Assign 'creator' role to user (allows saving jobs)
INSERT INTO user_roles (user_id, role, assigned_by)
VALUES (
  '72d65142-afb1-4fc8-80fb-9453530d6b39'::uuid,
  'creator',
  '72d65142-afb1-4fc8-80fb-9453530d6b39'::uuid
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Also ensure admin role is assigned (admin has all permissions)
INSERT INTO user_roles (user_id, role, assigned_by)
VALUES (
  '72d65142-afb1-4fc8-80fb-9453530d6b39'::uuid,
  'admin',
  '72d65142-afb1-4fc8-80fb-9453530d6b39'::uuid
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Verify roles were assigned
SELECT 
  user_id,
  role,
  created_at
FROM user_roles
WHERE user_id = '72d65142-afb1-4fc8-80fb-9453530d6b39'::uuid
ORDER BY role;

-- Verify permissions exist
SELECT 
  role,
  permission,
  resource
FROM role_permissions
WHERE role IN ('creator', 'user', 'admin')
  AND permission = 'create_jobs'
ORDER BY role;

SELECT 'Roles and permissions configured. User can now save jobs.' AS status;

