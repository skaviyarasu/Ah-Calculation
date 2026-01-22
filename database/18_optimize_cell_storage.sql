-- ============================================
-- Migration: Optimize Cell Data Storage
-- ============================================
-- Version: 18
-- Purpose: Reduce database size by storing cell data
--          as JSONB instead of individual rows
-- ============================================
-- 
-- This migration:
-- 1. Adds a JSONB column to store all cell data
-- 2. Migrates existing data from rows to JSONB
-- 3. Optionally drops the old table structure
-- ============================================

-- ============================================
-- 1. ENSURE VOLTAGE COLUMN EXISTS
-- ============================================

-- Ensure voltage column exists in battery_cell_capacities (from migration 14)
ALTER TABLE IF EXISTS battery_cell_capacities
  ADD COLUMN IF NOT EXISTS voltage NUMERIC;

-- ============================================
-- 2. ADD JSONB COLUMN TO JOBS TABLE
-- ============================================

-- Add cell_data JSONB column to store the entire grid
ALTER TABLE battery_optimization_jobs
  ADD COLUMN IF NOT EXISTS cell_data JSONB;

-- Add index for JSONB queries
CREATE INDEX IF NOT EXISTS battery_optimization_jobs_cell_data_idx 
  ON battery_optimization_jobs USING GIN (cell_data);

-- ============================================
-- 3. MIGRATE EXISTING DATA
-- ============================================

-- Migrate existing cell capacities to JSONB format
-- Format: { "grid": [[{ah: number, v: number|null}, ...], ...] }
-- Handles cases where voltage column might not have data
UPDATE battery_optimization_jobs job
SET cell_data = (
  SELECT jsonb_build_object(
    'grid',
    jsonb_agg(
      jsonb_build_object(
        'row', series_data.series_index,
        'cells', series_data.cells
      )
      ORDER BY series_data.series_index
    )
  )
  FROM (
    SELECT 
      series_index,
      jsonb_agg(
        CASE 
          WHEN voltage IS NOT NULL THEN
            jsonb_build_object('ah', capacity_mah, 'v', voltage)
          ELSE
            jsonb_build_object('ah', capacity_mah)
        END
        ORDER BY parallel_index
      ) as cells
    FROM battery_cell_capacities
    WHERE optimization_job_id = job.id
    GROUP BY series_index
  ) series_data
)
WHERE EXISTS (
  SELECT 1 FROM battery_cell_capacities 
  WHERE optimization_job_id = job.id
)
AND cell_data IS NULL;

-- ============================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================

-- Function to extract cell data from JSONB
CREATE OR REPLACE FUNCTION get_cell_data_from_jsonb(job_cell_data JSONB)
RETURNS TABLE (
  series_index INTEGER,
  parallel_index INTEGER,
  capacity_mah NUMERIC,
  voltage NUMERIC
) AS $$
DECLARE
  grid_data JSONB;
  row_data JSONB;
  cell_data JSONB;
  s_idx INTEGER := 0;
  p_idx INTEGER;
BEGIN
  IF job_cell_data IS NULL OR job_cell_data->'grid' IS NULL THEN
    RETURN;
  END IF;

  grid_data := job_cell_data->'grid';
  
  FOR row_data IN SELECT * FROM jsonb_array_elements(grid_data)
  LOOP
    p_idx := 0;
    FOR cell_data IN SELECT * FROM jsonb_array_elements(row_data->'cells')
    LOOP
      RETURN QUERY SELECT
        s_idx,
        p_idx,
        (cell_data->>'ah')::NUMERIC,
        CASE 
          WHEN cell_data->>'v' IS NULL OR cell_data->>'v' = 'null' THEN NULL
          ELSE (cell_data->>'v')::NUMERIC
        END;
      p_idx := p_idx + 1;
    END LOOP;
    s_idx := s_idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 5. UPDATE COMMENTS
-- ============================================

COMMENT ON COLUMN battery_optimization_jobs.cell_data IS 
  'Stores entire cell grid as JSONB: {"grid": [{"row": 0, "cells": [{"ah": 100, "v": 3.2}, ...]}, ...]}';

-- ============================================
-- 6. VERIFICATION
-- ============================================

-- Check migration status
SELECT 
  COUNT(*) as total_jobs,
  COUNT(cell_data) as jobs_with_cell_data,
  COUNT(*) - COUNT(cell_data) as jobs_without_cell_data
FROM battery_optimization_jobs;

-- ============================================
-- OPTIONAL: DROP OLD TABLE (Uncomment if you want to remove old structure)
-- ============================================
-- WARNING: Only run this after verifying the migration worked correctly!
-- 
-- DROP TABLE IF EXISTS battery_cell_capacities CASCADE;
-- 
-- ============================================

SELECT 'Cell data storage optimization complete. Old table preserved for safety.' AS status;

