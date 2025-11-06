-- =====================================================
-- Inventory Management System
-- Version: 1.0.0
-- Description: Adds inventory tracking for battery cells and components
-- =====================================================

-- Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'battery_cell', -- battery_cell, component, accessory
  unit TEXT NOT NULL DEFAULT 'pcs', -- pcs, kg, m, etc.
  capacity_mah NUMERIC, -- For battery cells
  voltage NUMERIC, -- For battery cells
  manufacturer TEXT,
  supplier TEXT,
  cost_per_unit NUMERIC,
  selling_price NUMERIC,
  min_stock_level INTEGER DEFAULT 0,
  max_stock_level INTEGER,
  current_stock INTEGER DEFAULT 0 NOT NULL,
  location TEXT, -- Warehouse location
  status TEXT DEFAULT 'active', -- active, discontinued, obsolete
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create inventory_transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL, -- in, out, adjustment, transfer
  quantity INTEGER NOT NULL,
  unit_price NUMERIC,
  reference_number TEXT, -- PO number, job card, etc.
  reference_type TEXT, -- purchase_order, job_card, adjustment, transfer
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_item_code ON inventory_items(item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_id ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at ON inventory_transactions(created_at);

-- Enable Row Level Security
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for inventory_items
-- Users can view all active items
DROP POLICY IF EXISTS "Users can view inventory items" ON inventory_items;
CREATE POLICY "Users can view inventory items"
  ON inventory_items FOR SELECT
  USING (true);

-- Only admins and creators can insert items
DROP POLICY IF EXISTS "Admins and creators can insert inventory items" ON inventory_items;
CREATE POLICY "Admins and creators can insert inventory items"
  ON inventory_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

-- Only admins and creators can update items
DROP POLICY IF EXISTS "Admins and creators can update inventory items" ON inventory_items;
CREATE POLICY "Admins and creators can update inventory items"
  ON inventory_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

-- Only admins can delete items
DROP POLICY IF EXISTS "Only admins can delete inventory items" ON inventory_items;
CREATE POLICY "Only admins can delete inventory items"
  ON inventory_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- RLS Policies for inventory_transactions
-- Users can view all transactions
DROP POLICY IF EXISTS "Users can view inventory transactions" ON inventory_transactions;
CREATE POLICY "Users can view inventory transactions"
  ON inventory_transactions FOR SELECT
  USING (true);

-- Only admins and creators can insert transactions
DROP POLICY IF EXISTS "Admins and creators can insert inventory transactions" ON inventory_transactions;
CREATE POLICY "Admins and creators can insert inventory transactions"
  ON inventory_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

-- Only admins can update/delete transactions
DROP POLICY IF EXISTS "Only admins can modify inventory transactions" ON inventory_transactions;
CREATE POLICY "Only admins can modify inventory transactions"
  ON inventory_transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- Function to update inventory stock when transaction is created
CREATE OR REPLACE FUNCTION update_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transaction_type = 'in' THEN
    UPDATE inventory_items
    SET current_stock = current_stock + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.item_id;
  ELSIF NEW.transaction_type = 'out' THEN
    UPDATE inventory_items
    SET current_stock = current_stock - NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.item_id;
  ELSIF NEW.transaction_type = 'adjustment' THEN
    -- For adjustments, quantity can be positive or negative
    UPDATE inventory_items
    SET current_stock = current_stock + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically update stock on transaction
DROP TRIGGER IF EXISTS trigger_update_inventory_stock ON inventory_transactions;
CREATE TRIGGER trigger_update_inventory_stock
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_stock();

-- Function to get low stock items
CREATE OR REPLACE FUNCTION get_low_stock_items()
RETURNS TABLE (
  id UUID,
  item_code TEXT,
  item_name TEXT,
  current_stock INTEGER,
  min_stock_level INTEGER,
  category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ii.id,
    ii.item_code,
    ii.item_name,
    ii.current_stock,
    ii.min_stock_level,
    ii.category
  FROM inventory_items ii
  WHERE ii.status = 'active'
    AND ii.current_stock <= ii.min_stock_level
  ORDER BY (ii.current_stock::NUMERIC / NULLIF(ii.min_stock_level, 0)) ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_inventory_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on inventory_items
DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_items_updated_at();

-- Add comments for documentation
COMMENT ON TABLE inventory_items IS 'Stores inventory items including battery cells and components';
COMMENT ON TABLE inventory_transactions IS 'Tracks all inventory movements (in, out, adjustments)';
COMMENT ON FUNCTION get_low_stock_items() IS 'Returns items that are at or below minimum stock level';

