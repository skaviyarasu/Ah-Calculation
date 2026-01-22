-- ============================================
-- Quick Fix: Add Status Column to Jobs Table
-- ============================================
-- This adds the status column that the app requires
-- Full migration is in: database/05_add_workflow_status.sql
-- ============================================

-- Add status column (draft, pending_review, needs_modification, approved, rejected)
ALTER TABLE battery_optimization_jobs 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' NOT NULL;

-- Add constraint for valid status values
ALTER TABLE battery_optimization_jobs 
DROP CONSTRAINT IF EXISTS battery_optimization_jobs_status_check;

ALTER TABLE battery_optimization_jobs 
ADD CONSTRAINT battery_optimization_jobs_status_check 
CHECK (status IN ('draft', 'pending_review', 'needs_modification', 'approved', 'rejected'));

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS battery_optimization_jobs_status_idx 
ON battery_optimization_jobs(status);

-- Set default status for existing jobs
UPDATE battery_optimization_jobs
SET status = 'draft'
WHERE status IS NULL;

SELECT 'Status column added successfully. Jobs can now be saved.' AS status;

