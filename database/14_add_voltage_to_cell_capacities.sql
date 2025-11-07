-- =====================================================
-- Add Voltage Column to Battery Cell Capacities
-- Version: 1.0.0
-- Description: Stores per-cell voltage readings alongside capacity.
-- =====================================================

ALTER TABLE IF EXISTS battery_cell_capacities
  ADD COLUMN IF NOT EXISTS voltage NUMERIC;

COMMENT ON COLUMN battery_cell_capacities.voltage
  IS 'Recorded cell voltage (volts) for each AH measurement.';
