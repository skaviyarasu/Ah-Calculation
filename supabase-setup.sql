-- ============================================
-- AH Balancer - Supabase Database Schema
-- ============================================
-- NOTE: This file is kept for backward compatibility
-- The main schema is now in: database/01_battery_optimization_schema.sql
-- 
-- Instructions:
-- 1. Copy this entire file
-- 2. Go to your Supabase Dashboard
-- 3. Navigate to SQL Editor
-- 4. Click "New query"
-- 5. Paste this entire script
-- 6. Click "Run" button
-- ============================================

-- Create Jobs table for storing AH optimization projects
CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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

-- Create Cell Data table for storing individual cell capacity values
CREATE TABLE IF NOT EXISTS cell_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  series_index INTEGER NOT NULL,
  parallel_index INTEGER NOT NULL,
  capacity_value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS cell_data_job_id_idx ON cell_data(job_id);
CREATE INDEX IF NOT EXISTS cell_data_position_idx ON cell_data(series_index, parallel_index);

-- Enable Row Level Security (RLS) on both tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_data ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Row Level Security Policies
-- ============================================
-- These policies ensure users can only access their own data

-- Jobs table policies
CREATE POLICY "Users can view own jobs" ON jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs" ON jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own jobs" ON jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Cell data table policies
CREATE POLICY "Users can view own cell data" ON cell_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = cell_data.job_id 
      AND jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own cell data" ON cell_data
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = cell_data.job_id 
      AND jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own cell data" ON cell_data
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = cell_data.job_id 
      AND jobs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own cell data" ON cell_data
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = cell_data.job_id 
      AND jobs.user_id = auth.uid()
    )
  );

-- ============================================
-- Automatic Timestamp Updates
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at when jobs are modified
CREATE TRIGGER update_jobs_updated_at 
  BEFORE UPDATE ON jobs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Optional: Job Summary View
-- ============================================
-- This view provides quick access to job statistics

CREATE OR REPLACE VIEW job_summary AS
SELECT 
  j.id,
  j.user_id,
  j.customer_name,
  j.job_card,
  j.job_date,
  j.battery_spec,
  j.series_count,
  j.parallel_count,
  j.tolerance,
  j.created_at,
  j.updated_at,
  COUNT(cd.id) as cell_count,
  COALESCE(AVG(cd.capacity_value), 0) as avg_capacity,
  COALESCE(MIN(cd.capacity_value), 0) as min_capacity,
  COALESCE(MAX(cd.capacity_value), 0) as max_capacity
FROM jobs j
LEFT JOIN cell_data cd ON j.id = cd.job_id
GROUP BY j.id;

-- ============================================
-- Setup Complete!
-- ============================================
-- You should see "Success. No rows returned" message
-- This means all tables, policies, and triggers were created successfully
-- ============================================
