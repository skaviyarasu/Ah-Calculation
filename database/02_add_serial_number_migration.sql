-- ============================================
-- Migration: Add Serial Number Column
-- ============================================
-- Version: 2.0.0
-- Date: 2025-01-26
-- 
-- This migration adds the serial_number column
-- to the battery_optimization_jobs table for
-- tracking purposes.
-- 
-- Instructions:
-- 1. Copy this entire file
-- 2. Go to your Supabase Dashboard → SQL Editor
-- 3. Click "New query"
-- 4. Paste and click "Run"
-- ============================================

-- ============================================
-- 1. ADD SERIAL_NUMBER COLUMN
-- ============================================

-- Add serial_number column (allow NULL temporarily for existing records)
ALTER TABLE IF EXISTS battery_optimization_jobs 
ADD COLUMN IF NOT EXISTS serial_number TEXT;

-- ============================================
-- 2. GENERATE SERIAL NUMBERS FOR EXISTING RECORDS
-- ============================================

-- Update existing records with generated serial numbers
-- Format: AH-YYYYMMDD-XXXX (date + sequence number)
DO $$
DECLARE
  job_record RECORD;
  job_date DATE;
  date_str TEXT;
  sequence_num INTEGER;
  serial_num TEXT;
  current_serial_val TEXT;
BEGIN
  -- Loop through all existing jobs
  -- We select all jobs and update those that need serial numbers
  FOR job_record IN 
    SELECT id, created_at, user_id 
    FROM battery_optimization_jobs 
    ORDER BY created_at, id
  LOOP
    -- Extract date from created_at
    job_date := DATE(job_record.created_at);
    date_str := TO_CHAR(job_date, 'YYYYMMDD');
    
    -- Count jobs created on the same date by the same user (already processed)
    -- This ensures we get sequential numbers for jobs created on the same day
    SELECT COALESCE(COUNT(*), 0) + 1 INTO sequence_num
    FROM battery_optimization_jobs
    WHERE user_id = job_record.user_id
      AND DATE(created_at) = job_date
      AND id < job_record.id;
    
    -- Generate serial number
    serial_num := 'AH-' || date_str || '-' || LPAD(sequence_num::TEXT, 4, '0');
    
    -- Update only if serial_number is NULL (using fully dynamic SQL to avoid parsing issues)
    BEGIN
      -- Use dynamic SQL to check serial_number value (avoids parsing errors)
      EXECUTE format('SELECT serial_number FROM battery_optimization_jobs WHERE id = %L', job_record.id)
        INTO current_serial_val;
      
      -- Only update if serial_number is NULL or empty
      IF current_serial_val IS NULL OR current_serial_val = '' THEN
        EXECUTE format('UPDATE battery_optimization_jobs SET serial_number = %L WHERE id = %L', serial_num, job_record.id);
      END IF;
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist yet, skip this record
        NULL;
    END;
  END LOOP;
END $$;

-- ============================================
-- 3. ADD CONSTRAINTS
-- ============================================

-- Make serial_number NOT NULL (now that all records have values)
ALTER TABLE battery_optimization_jobs 
ALTER COLUMN serial_number SET NOT NULL;

-- Add UNIQUE constraint (drop first if exists to avoid errors)
ALTER TABLE battery_optimization_jobs 
DROP CONSTRAINT IF EXISTS battery_optimization_jobs_serial_number_key;

ALTER TABLE battery_optimization_jobs 
ADD CONSTRAINT battery_optimization_jobs_serial_number_key UNIQUE (serial_number);

-- ============================================
-- 4. CREATE INDEX
-- ============================================

-- Create index for fast serial number lookups
CREATE INDEX IF NOT EXISTS battery_optimization_jobs_serial_number_idx 
ON battery_optimization_jobs(serial_number);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Expected result: "Success. No rows returned"
-- 
-- Verification Checklist:
-- [ ] Check Table Editor → battery_optimization_jobs table has serial_number column
-- [ ] Check that all existing records have serial_number values
-- [ ] Check that serial_number column is NOT NULL
-- [ ] Check that serial_number has UNIQUE constraint
-- [ ] Check Database → Indexes → battery_optimization_jobs_serial_number_idx exists
-- ============================================
