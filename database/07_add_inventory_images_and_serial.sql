-- =====================================================
-- Add Image and Serial Number Support to Inventory
-- Version: 1.0.0
-- Description: Adds image_url and serial_number fields for 5S tracking
-- =====================================================

-- Add image_url column to inventory_items
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add serial_number column to inventory_items (unique identifier for 5S tracking)
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS serial_number TEXT UNIQUE;

-- Create index on serial_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_inventory_items_serial_number ON inventory_items(serial_number);

-- Function to generate serial number for inventory items (format: INV-YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION generate_inventory_serial_number()
RETURNS TEXT AS $$
DECLARE
  today_prefix TEXT;
  sequence_num INTEGER;
  new_serial TEXT;
BEGIN
  -- Get today's date prefix (YYYYMMDD)
  today_prefix := TO_CHAR(NOW(), 'YYYYMMDD');
  
  -- Get the highest sequence number for today
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(serial_number FROM LENGTH('INV-') + 9 FOR 4) AS INTEGER)
  ), 0) + 1
  INTO sequence_num
  FROM inventory_items
  WHERE serial_number LIKE 'INV-' || today_prefix || '-%';
  
  -- Generate new serial number
  new_serial := 'INV-' || today_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN new_serial;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON COLUMN inventory_items.image_url IS 'URL to item image stored in Supabase Storage';
COMMENT ON COLUMN inventory_items.serial_number IS 'Unique serial number for 5S tracking (format: INV-YYYYMMDD-XXXX)';

