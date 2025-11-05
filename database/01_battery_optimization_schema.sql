-- ============================================
-- AH Balancer - Complete Database Schema
-- ============================================
-- Version: 1.0.0
-- Last Updated: 2024-10-26
-- 
-- This schema creates all necessary tables, 
-- indexes, security policies, and triggers
-- for the AH Balancer application.
--
-- Instructions:
-- 1. Copy this entire file
-- 2. Go to your Supabase Dashboard → SQL Editor
-- 3. Click "New query"
-- 4. Paste and click "Run"
-- ============================================

-- ============================================
-- 1. CREATE TABLES
-- ============================================

-- Battery Optimization Jobs table: Stores AH optimization project metadata
CREATE TABLE IF NOT EXISTS battery_optimization_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  serial_number TEXT UNIQUE NOT NULL,
  customer_name TEXT,
  job_card TEXT,
  job_date DATE,
  battery_spec TEXT,
  series_count INTEGER NOT NULL DEFAULT 13,
  parallel_count INTEGER NOT NULL DEFAULT 7,
  tolerance INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Battery Cell Capacities table: Stores individual cell capacity measurements
CREATE TABLE IF NOT EXISTS battery_cell_capacities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  optimization_job_id UUID REFERENCES battery_optimization_jobs(id) ON DELETE CASCADE NOT NULL,
  series_index INTEGER NOT NULL,
  parallel_index INTEGER NOT NULL,
  capacity_mah NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ============================================
-- 2. CREATE INDEXES
-- ============================================
-- Indexes improve query performance

CREATE INDEX IF NOT EXISTS battery_optimization_jobs_user_id_idx ON battery_optimization_jobs(user_id);
CREATE INDEX IF NOT EXISTS battery_optimization_jobs_created_at_idx ON battery_optimization_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS battery_optimization_jobs_serial_number_idx ON battery_optimization_jobs(serial_number);
CREATE INDEX IF NOT EXISTS battery_cell_capacities_job_id_idx ON battery_cell_capacities(optimization_job_id);
CREATE INDEX IF NOT EXISTS battery_cell_capacities_position_idx ON battery_cell_capacities(series_index, parallel_index);

-- ============================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================
-- RLS ensures users can only access their own data

ALTER TABLE battery_optimization_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE battery_cell_capacities ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. CREATE SECURITY POLICIES
-- ============================================

-- Battery Optimization Jobs table policies
CREATE POLICY "Users can view own optimization jobs" ON battery_optimization_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own optimization jobs" ON battery_optimization_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own optimization jobs" ON battery_optimization_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own optimization jobs" ON battery_optimization_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Battery Cell Capacities table policies
CREATE POLICY "Users can view own cell capacities" ON battery_cell_capacities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM battery_optimization_jobs 
      WHERE battery_optimization_jobs.id = battery_cell_capacities.optimization_job_id 
      AND battery_optimization_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own cell capacities" ON battery_cell_capacities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM battery_optimization_jobs 
      WHERE battery_optimization_jobs.id = battery_cell_capacities.optimization_job_id 
      AND battery_optimization_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own cell capacities" ON battery_cell_capacities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM battery_optimization_jobs 
      WHERE battery_optimization_jobs.id = battery_cell_capacities.optimization_job_id 
      AND battery_optimization_jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own cell capacities" ON battery_cell_capacities
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM battery_optimization_jobs 
      WHERE battery_optimization_jobs.id = battery_cell_capacities.optimization_job_id 
      AND battery_optimization_jobs.user_id = auth.uid()
    )
  );

-- ============================================
-- 5. CREATE FUNCTIONS & TRIGGERS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at when optimization jobs are modified
CREATE TRIGGER update_battery_optimization_jobs_updated_at 
  BEFORE UPDATE ON battery_optimization_jobs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. CREATE VIEWS
-- ============================================

-- Battery Optimization Summary View: Provides aggregated statistics for each optimization job
CREATE OR REPLACE VIEW battery_optimization_summary AS
SELECT 
  job.id,
  job.user_id,
  job.customer_name,
  job.job_card,
  job.job_date,
  job.battery_spec,
  job.series_count,
  job.parallel_count,
  job.tolerance,
  job.created_at,
  job.updated_at,
  COUNT(cell.id) as total_cells,
  COALESCE(AVG(cell.capacity_mah), 0) as avg_capacity_mah,
  COALESCE(MIN(cell.capacity_mah), 0) as min_capacity_mah,
  COALESCE(MAX(cell.capacity_mah), 0) as max_capacity_mah
FROM battery_optimization_jobs job
LEFT JOIN battery_cell_capacities cell ON job.id = cell.optimization_job_id
GROUP BY job.id;

-- ============================================
-- SCHEMA SETUP COMPLETE
-- ============================================
-- Expected result: "Success. No rows returned"
-- 
-- Verification Checklist:
-- [ ] Check Table Editor → battery_optimization_jobs table exists
-- [ ] Check Table Editor → battery_cell_capacities table exists
-- [ ] Check Authentication → Policies → RLS enabled
-- [ ] Check Database → Functions → update_updated_at_column exists
-- [ ] Check Database → Views → battery_optimization_summary exists
-- ============================================

