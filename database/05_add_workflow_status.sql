-- ============================================
-- Migration: Add Workflow Status & Creator/Verifier System
-- ============================================
-- Version: 4.0.0
-- Date: 2025-01-26
-- 
-- This migration adds workflow status tracking and creator/verifier
-- roles for job card calculations. Only creators can create and modify,
-- and only verifiers can review and request modifications.
-- 
-- Instructions:
-- 1. Copy this entire file
-- 2. Go to your Supabase Dashboard → SQL Editor
-- 3. Click "New query"
-- 4. Paste and click "Run"
-- ============================================

-- ============================================
-- 1. ADD WORKFLOW FIELDS TO JOBS TABLE
-- ============================================

-- Add status column (draft, pending_review, needs_modification, approved, rejected)
ALTER TABLE battery_optimization_jobs 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' NOT NULL;

-- Add verification tracking fields
ALTER TABLE battery_optimization_jobs 
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id);

ALTER TABLE battery_optimization_jobs 
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

ALTER TABLE battery_optimization_jobs 
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

-- Add constraint for valid status values
ALTER TABLE battery_optimization_jobs 
DROP CONSTRAINT IF EXISTS battery_optimization_jobs_status_check;

ALTER TABLE battery_optimization_jobs 
ADD CONSTRAINT battery_optimization_jobs_status_check 
CHECK (status IN ('draft', 'pending_review', 'needs_modification', 'approved', 'rejected'));

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS battery_optimization_jobs_status_idx 
ON battery_optimization_jobs(status);

CREATE INDEX IF NOT EXISTS battery_optimization_jobs_verified_by_idx 
ON battery_optimization_jobs(verified_by);

-- ============================================
-- 2. ADD CREATOR AND VERIFIER ROLES
-- ============================================

-- Insert new roles (if they don't exist)
-- Note: Users can have multiple roles (e.g., creator + verifier)
INSERT INTO role_permissions (role, permission, resource, description) VALUES
  -- Creator role - can create and edit own jobs
  ('creator', 'create_jobs', 'jobs', 'Create new job calculations'),
  ('creator', 'edit_own_jobs', 'jobs', 'Edit own jobs in draft or needs_modification status'),
  ('creator', 'view_own_jobs', 'jobs', 'View own job calculations'),
  ('creator', 'submit_for_review', 'jobs', 'Submit jobs for verification'),
  ('creator', 'delete_own_draft_jobs', 'jobs', 'Delete own jobs in draft status'),
  
  -- Verifier role - can review and approve/reject jobs
  ('verifier', 'view_all_jobs', 'jobs', 'View all jobs for review'),
  ('verifier', 'verify_jobs', 'jobs', 'Approve or reject job calculations'),
  ('verifier', 'request_modification', 'jobs', 'Request modifications from creator'),
  ('verifier', 'view_verification_history', 'jobs', 'View verification history'),
  
  -- Admin can still do everything
  ('admin', 'verify_jobs', 'jobs', 'Admin can verify any job'),
  ('admin', 'request_modification', 'jobs', 'Admin can request modifications'),
  ('admin', 'bypass_workflow', 'jobs', 'Admin can bypass workflow restrictions')
ON CONFLICT (role, permission, resource) DO NOTHING;

-- ============================================
-- 3. UPDATE RLS POLICIES FOR WORKFLOW
-- ============================================

-- Drop existing policies that need updating
DROP POLICY IF EXISTS "Users can view own jobs" ON battery_optimization_jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON battery_optimization_jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON battery_optimization_jobs;
DROP POLICY IF EXISTS "Users can delete own jobs" ON battery_optimization_jobs;
DROP POLICY IF EXISTS "Admins can view all optimization jobs" ON battery_optimization_jobs;
DROP POLICY IF EXISTS "Admins can edit all optimization jobs" ON battery_optimization_jobs;
DROP POLICY IF EXISTS "Admins can delete all optimization jobs" ON battery_optimization_jobs;

-- Helper function to check if user has role
CREATE OR REPLACE FUNCTION user_has_role(check_user_id UUID, check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = check_user_id 
    AND role = check_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to check if current user has role
CREATE OR REPLACE FUNCTION current_user_has_role(check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN user_has_role(auth.uid(), check_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Policy: Creators can view their own jobs
CREATE POLICY "Creators can view own jobs" ON battery_optimization_jobs
  FOR SELECT USING (
    auth.uid() = user_id AND 
    (current_user_has_role('creator') OR current_user_has_role('admin'))
  );

-- Policy: Verifiers can view all jobs for review
CREATE POLICY "Verifiers can view all jobs" ON battery_optimization_jobs
  FOR SELECT USING (
    current_user_has_role('verifier') OR 
    current_user_has_role('admin') OR
    (auth.uid() = user_id AND current_user_has_role('creator'))
  );

-- Policy: Creators can insert their own jobs (status defaults to draft)
CREATE POLICY "Creators can create jobs" ON battery_optimization_jobs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND 
    (current_user_has_role('creator') OR current_user_has_role('admin')) AND
    (status = 'draft' OR current_user_has_role('admin'))
  );

-- Policy: Creators can update their own jobs only if in draft or needs_modification
CREATE POLICY "Creators can edit own jobs" ON battery_optimization_jobs
  FOR UPDATE USING (
    auth.uid() = user_id AND 
    (current_user_has_role('creator') OR current_user_has_role('admin')) AND
    (
      current_user_has_role('admin') OR
      status IN ('draft', 'needs_modification')
    )
  );

-- Policy: Verifiers can update jobs to change status (verify/reject/request modification)
CREATE POLICY "Verifiers can update job status" ON battery_optimization_jobs
  FOR UPDATE USING (
    (current_user_has_role('verifier') OR current_user_has_role('admin')) AND
    status = 'pending_review'
  ) WITH CHECK (
    (current_user_has_role('verifier') OR current_user_has_role('admin')) AND
    (status IN ('approved', 'rejected', 'needs_modification', 'pending_review'))
  );

-- Policy: Creators can delete their own draft jobs
CREATE POLICY "Creators can delete own draft jobs" ON battery_optimization_jobs
  FOR DELETE USING (
    auth.uid() = user_id AND 
    (current_user_has_role('creator') OR current_user_has_role('admin')) AND
    (status = 'draft' OR current_user_has_role('admin'))
  );

-- Policy: Admins can do everything (keep existing admin policies)
CREATE POLICY "Admins can view all jobs" ON battery_optimization_jobs
  FOR SELECT USING (is_current_user_admin());

CREATE POLICY "Admins can edit all jobs" ON battery_optimization_jobs
  FOR UPDATE USING (is_current_user_admin());

CREATE POLICY "Admins can delete all jobs" ON battery_optimization_jobs
  FOR DELETE USING (is_current_user_admin());

-- ============================================
-- 4. CREATE HELPER FUNCTIONS FOR WORKFLOW
-- ============================================

-- Function to submit job for review (only creator can call)
CREATE OR REPLACE FUNCTION submit_job_for_review(job_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  job_user_id UUID;
  current_status TEXT;
BEGIN
  -- Get job details
  SELECT user_id, status INTO job_user_id, current_status
  FROM battery_optimization_jobs
  WHERE id = job_id;
  
  -- Check if job exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Check if user is the creator or admin
  IF auth.uid() != job_user_id AND NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Only the job creator can submit for review';
  END IF;
  
  -- Check if job is in valid state
  IF current_status NOT IN ('draft', 'needs_modification') THEN
    RAISE EXCEPTION 'Job must be in draft or needs_modification status';
  END IF;
  
  -- Update status
  UPDATE battery_optimization_jobs
  SET status = 'pending_review',
      updated_at = NOW()
  WHERE id = job_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify job (only verifier can call)
CREATE OR REPLACE FUNCTION verify_job(
  job_id UUID,
  verification_status TEXT, -- 'approved' or 'rejected'
  notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_status TEXT;
BEGIN
  -- Get job status
  SELECT status INTO current_status
  FROM battery_optimization_jobs
  WHERE id = job_id;
  
  -- Check if job exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Check if user is verifier or admin
  IF NOT current_user_has_role('verifier') AND NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Only verifiers can verify jobs';
  END IF;
  
  -- Check if job is pending review
  IF current_status != 'pending_review' THEN
    RAISE EXCEPTION 'Job must be in pending_review status';
  END IF;
  
  -- Validate verification status
  IF verification_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid verification status. Must be approved or rejected';
  END IF;
  
  -- Update job
  UPDATE battery_optimization_jobs
  SET status = verification_status,
      verified_by = auth.uid(),
      verification_notes = notes,
      verified_at = NOW(),
      updated_at = NOW()
  WHERE id = job_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to request modification (only verifier can call)
CREATE OR REPLACE FUNCTION request_modification(
  job_id UUID,
  notes TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  current_status TEXT;
BEGIN
  -- Get job status
  SELECT status INTO current_status
  FROM battery_optimization_jobs
  WHERE id = job_id;
  
  -- Check if job exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Check if user is verifier or admin
  IF NOT current_user_has_role('verifier') AND NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Only verifiers can request modifications';
  END IF;
  
  -- Check if job is pending review
  IF current_status != 'pending_review' THEN
    RAISE EXCEPTION 'Job must be in pending_review status';
  END IF;
  
  -- Update job to needs_modification
  UPDATE battery_optimization_jobs
  SET status = 'needs_modification',
      verified_by = auth.uid(),
      verification_notes = notes,
      verified_at = NOW(),
      updated_at = NOW()
  WHERE id = job_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. GRANT PERMISSIONS
-- ============================================

-- Grant execute permissions on workflow functions
GRANT EXECUTE ON FUNCTION submit_job_for_review(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_job(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION request_modification(UUID, TEXT) TO authenticated;

-- ============================================
-- 6. UPDATE EXISTING JOBS (SET DEFAULT STATUS)
-- ============================================

-- Set all existing jobs without status to 'draft'
UPDATE battery_optimization_jobs
SET status = 'draft'
WHERE status IS NULL OR status = '';

-- ============================================
-- Migration Complete
-- ============================================
-- 
-- Next steps:
-- 1. Assign 'creator' role to users who create calculations
-- 2. Assign 'verifier' role to users who review calculations
-- 3. Users can have both roles if needed
-- 
-- Example SQL to assign roles:
-- INSERT INTO user_roles (user_id, role) VALUES 
--   ('USER_UUID_HERE', 'creator'),
--   ('USER_UUID_HERE', 'verifier');
-- 
-- Job workflow:
-- 1. Creator creates job (status: 'draft')
-- 2. Creator submits for review (status: 'pending_review')
-- 3. Verifier reviews and either:
--    - Approves (status: 'approved')
--    - Rejects (status: 'rejected')
--    - Requests modification (status: 'needs_modification')
-- 4. If modification needed, creator can edit and resubmit
-- ============================================

