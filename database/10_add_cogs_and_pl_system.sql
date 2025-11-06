-- =====================================================
-- COGS and P&L System for Inventory Management
-- Version: 1.0.0
-- Description: Adds Cost of Goods Sold (COGS) tracking and Profit & Loss reporting
-- =====================================================

-- Add cost tracking fields to inventory_items
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS cost_method TEXT DEFAULT 'weighted_average' CHECK (cost_method IN ('fifo', 'lifo', 'weighted_average')),
ADD COLUMN IF NOT EXISTS average_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cost_value NUMERIC DEFAULT 0;

-- Create sales_transactions table for tracking sales and revenue
CREATE TABLE IF NOT EXISTS sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_selling_price NUMERIC NOT NULL CHECK (unit_selling_price >= 0),
  unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0), -- COGS per unit
  total_revenue NUMERIC GENERATED ALWAYS AS (quantity * unit_selling_price) STORED,
  total_cogs NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  gross_profit NUMERIC GENERATED ALWAYS AS ((quantity * unit_selling_price) - (quantity * unit_cost)) STORED,
  gross_profit_margin NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN (quantity * unit_selling_price) > 0 
      THEN ((quantity * unit_selling_price) - (quantity * unit_cost)) / (quantity * unit_selling_price) * 100
      ELSE 0
    END
  ) STORED,
  customer_name TEXT,
  invoice_number TEXT,
  reference_number TEXT, -- Job card, order number, etc.
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create inventory_cost_layers table for FIFO/LIFO cost tracking
CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  purchase_transaction_id UUID REFERENCES inventory_transactions(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
  remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_transactions_item_id ON sales_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_transaction_date ON sales_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_sales_transactions_invoice_number ON sales_transactions(invoice_number);
CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_item_id ON inventory_cost_layers(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_purchase_date ON inventory_cost_layers(purchase_date);

-- Enable Row Level Security
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_cost_layers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sales_transactions
DROP POLICY IF EXISTS "Users can view sales transactions" ON sales_transactions;
CREATE POLICY "Users can view sales transactions"
  ON sales_transactions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert sales transactions" ON sales_transactions;
CREATE POLICY "Authenticated users can insert sales transactions"
  ON sales_transactions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and creators can update sales transactions" ON sales_transactions;
CREATE POLICY "Admins and creators can update sales transactions"
  ON sales_transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

DROP POLICY IF EXISTS "Admins can delete sales transactions" ON sales_transactions;
CREATE POLICY "Admins can delete sales transactions"
  ON sales_transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- RLS Policies for inventory_cost_layers
DROP POLICY IF EXISTS "Users can view cost layers" ON inventory_cost_layers;
CREATE POLICY "Users can view cost layers"
  ON inventory_cost_layers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "System can manage cost layers" ON inventory_cost_layers;
CREATE POLICY "System can manage cost layers"
  ON inventory_cost_layers FOR ALL
  USING (auth.role() = 'authenticated');

-- Function to calculate weighted average cost
CREATE OR REPLACE FUNCTION calculate_weighted_average_cost(p_item_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total_cost NUMERIC := 0;
  v_total_quantity INTEGER := 0;
  v_avg_cost NUMERIC := 0;
BEGIN
  -- Calculate from cost layers (remaining inventory)
  SELECT 
    COALESCE(SUM(remaining_quantity * unit_cost), 0),
    COALESCE(SUM(remaining_quantity), 0)
  INTO v_total_cost, v_total_quantity
  FROM inventory_cost_layers
  WHERE item_id = p_item_id AND remaining_quantity > 0;
  
  IF v_total_quantity > 0 THEN
    v_avg_cost := v_total_cost / v_total_quantity;
  END IF;
  
  RETURN v_avg_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get COGS using FIFO method
CREATE OR REPLACE FUNCTION get_fifo_cogs(p_item_id UUID, p_quantity INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_total_cogs NUMERIC := 0;
  v_remaining_qty INTEGER := p_quantity;
  v_layer RECORD;
BEGIN
  -- Get cost layers ordered by purchase date (FIFO = oldest first)
  FOR v_layer IN
    SELECT * FROM inventory_cost_layers
    WHERE item_id = p_item_id 
      AND remaining_quantity > 0
    ORDER BY purchase_date ASC
  LOOP
    IF v_remaining_qty <= 0 THEN
      EXIT;
    END IF;
    
    IF v_layer.remaining_quantity >= v_remaining_qty THEN
      -- Use entire remaining quantity from this layer
      v_total_cogs := v_total_cogs + (v_remaining_qty * v_layer.unit_cost);
      v_remaining_qty := 0;
    ELSE
      -- Use all from this layer and continue
      v_total_cogs := v_total_cogs + (v_layer.remaining_quantity * v_layer.unit_cost);
      v_remaining_qty := v_remaining_qty - v_layer.remaining_quantity;
    END IF;
  END LOOP;
  
  RETURN v_total_cogs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get COGS using LIFO method
CREATE OR REPLACE FUNCTION get_lifo_cogs(p_item_id UUID, p_quantity INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_total_cogs NUMERIC := 0;
  v_remaining_qty INTEGER := p_quantity;
  v_layer RECORD;
BEGIN
  -- Get cost layers ordered by purchase date DESC (LIFO = newest first)
  FOR v_layer IN
    SELECT * FROM inventory_cost_layers
    WHERE item_id = p_item_id 
      AND remaining_quantity > 0
    ORDER BY purchase_date DESC
  LOOP
    IF v_remaining_qty <= 0 THEN
      EXIT;
    END IF;
    
    IF v_layer.remaining_quantity >= v_remaining_qty THEN
      -- Use entire remaining quantity from this layer
      v_total_cogs := v_total_cogs + (v_remaining_qty * v_layer.unit_cost);
      v_remaining_qty := 0;
    ELSE
      -- Use all from this layer and continue
      v_total_cogs := v_total_cogs + (v_layer.remaining_quantity * v_layer.unit_cost);
      v_remaining_qty := v_remaining_qty - v_layer.remaining_quantity;
    END IF;
  END LOOP;
  
  RETURN v_total_cogs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update cost layers when inventory is purchased
CREATE OR REPLACE FUNCTION update_cost_layers_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process 'in' transactions with unit_price
  IF NEW.transaction_type = 'in' AND NEW.unit_price IS NOT NULL AND NEW.unit_price > 0 THEN
    INSERT INTO inventory_cost_layers (
      item_id,
      purchase_transaction_id,
      quantity,
      unit_cost,
      remaining_quantity,
      purchase_date
    ) VALUES (
      NEW.item_id,
      NEW.id,
      NEW.quantity,
      NEW.unit_price,
      NEW.quantity,
      NEW.created_at
    );
    
    -- Update weighted average cost
    UPDATE inventory_items
    SET average_cost = calculate_weighted_average_cost(NEW.item_id),
        total_cost_value = calculate_weighted_average_cost(NEW.item_id) * current_stock,
        updated_at = NOW()
    WHERE id = NEW.item_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create cost layers on purchase
DROP TRIGGER IF EXISTS trigger_update_cost_layers_on_purchase ON inventory_transactions;
CREATE TRIGGER trigger_update_cost_layers_on_purchase
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_cost_layers_on_purchase();

-- Function to allocate cost layers when inventory is sold (for FIFO/LIFO)
CREATE OR REPLACE FUNCTION allocate_cost_layers_on_sale(
  p_item_id UUID,
  p_quantity INTEGER,
  p_cost_method TEXT
)
RETURNS NUMERIC AS $$
DECLARE
  v_cogs NUMERIC := 0;
  v_remaining_qty INTEGER := p_quantity;
  v_layer RECORD;
  v_order_by TEXT;
BEGIN
  -- Determine sort order based on cost method
  IF p_cost_method = 'fifo' THEN
    v_order_by := 'ASC';
  ELSIF p_cost_method = 'lifo' THEN
    v_order_by := 'DESC';
  ELSE
    -- Weighted average - use current average cost
    SELECT average_cost INTO v_cogs
    FROM inventory_items
    WHERE id = p_item_id;
    
    RETURN COALESCE(v_cogs * p_quantity, 0);
  END IF;
  
  -- Allocate from cost layers
  FOR v_layer IN
    EXECUTE format('
      SELECT * FROM inventory_cost_layers
      WHERE item_id = $1 AND remaining_quantity > 0
      ORDER BY purchase_date %s
      FOR UPDATE
    ', v_order_by)
    USING p_item_id
  LOOP
    IF v_remaining_qty <= 0 THEN
      EXIT;
    END IF;
    
    IF v_layer.remaining_quantity >= v_remaining_qty THEN
      -- Use entire remaining quantity from this layer
      v_cogs := v_cogs + (v_remaining_qty * v_layer.unit_cost);
      
      -- Update layer
      UPDATE inventory_cost_layers
      SET remaining_quantity = remaining_quantity - v_remaining_qty
      WHERE id = v_layer.id;
      
      v_remaining_qty := 0;
    ELSE
      -- Use all from this layer and continue
      v_cogs := v_cogs + (v_layer.remaining_quantity * v_layer.unit_cost);
      
      -- Update layer
      UPDATE inventory_cost_layers
      SET remaining_quantity = 0
      WHERE id = v_layer.id;
      
      v_remaining_qty := v_remaining_qty - v_layer.remaining_quantity;
    END IF;
  END LOOP;
  
  -- Update weighted average cost after sale
  UPDATE inventory_items
  SET average_cost = calculate_weighted_average_cost(p_item_id),
      total_cost_value = calculate_weighted_average_cost(p_item_id) * current_stock,
      updated_at = NOW()
  WHERE id = p_item_id;
  
  RETURN v_cogs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get periodic P&L report
CREATE OR REPLACE FUNCTION get_periodic_pl_report(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  total_revenue NUMERIC,
  total_cogs NUMERIC,
  total_gross_profit NUMERIC,
  gross_profit_margin NUMERIC,
  transaction_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p_start_date,
    p_end_date,
    COALESCE(SUM(st.total_revenue), 0) as total_revenue,
    COALESCE(SUM(st.total_cogs), 0) as total_cogs,
    COALESCE(SUM(st.gross_profit), 0) as total_gross_profit,
    CASE 
      WHEN SUM(st.total_revenue) > 0 
      THEN (SUM(st.gross_profit) / SUM(st.total_revenue)) * 100
      ELSE 0
    END as gross_profit_margin,
    COUNT(*) as transaction_count
  FROM sales_transactions st
  WHERE st.transaction_date >= p_start_date
    AND st.transaction_date <= p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get P&L by item
CREATE OR REPLACE FUNCTION get_pl_by_item(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  item_id UUID,
  item_code TEXT,
  item_name TEXT,
  total_revenue NUMERIC,
  total_cogs NUMERIC,
  total_gross_profit NUMERIC,
  gross_profit_margin NUMERIC,
  quantity_sold INTEGER,
  avg_selling_price NUMERIC,
  avg_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ii.id as item_id,
    ii.item_code,
    ii.item_name,
    COALESCE(SUM(st.total_revenue), 0) as total_revenue,
    COALESCE(SUM(st.total_cogs), 0) as total_cogs,
    COALESCE(SUM(st.gross_profit), 0) as total_gross_profit,
    CASE 
      WHEN SUM(st.total_revenue) > 0 
      THEN (SUM(st.gross_profit) / SUM(st.total_revenue)) * 100
      ELSE 0
    END as gross_profit_margin,
    COALESCE(SUM(st.quantity), 0)::INTEGER as quantity_sold,
    CASE 
      WHEN SUM(st.quantity) > 0 
      THEN SUM(st.total_revenue) / SUM(st.quantity)
      ELSE 0
    END as avg_selling_price,
    CASE 
      WHEN SUM(st.quantity) > 0 
      THEN SUM(st.total_cogs) / SUM(st.quantity)
      ELSE 0
    END as avg_cost
  FROM inventory_items ii
  LEFT JOIN sales_transactions st ON ii.id = st.item_id
    AND st.transaction_date >= p_start_date
    AND st.transaction_date <= p_end_date
  GROUP BY ii.id, ii.item_code, ii.item_name
  HAVING SUM(st.total_revenue) > 0 OR SUM(st.total_cogs) > 0
  ORDER BY total_revenue DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE sales_transactions IS 'Tracks sales transactions with revenue, COGS, and gross profit calculations';
COMMENT ON TABLE inventory_cost_layers IS 'Tracks cost layers for FIFO/LIFO cost allocation methods';
COMMENT ON FUNCTION calculate_weighted_average_cost(UUID) IS 'Calculates weighted average cost for an item';
COMMENT ON FUNCTION get_fifo_cogs(UUID, INTEGER) IS 'Calculates COGS using FIFO method';
COMMENT ON FUNCTION get_lifo_cogs(UUID, INTEGER) IS 'Calculates COGS using LIFO method';
COMMENT ON FUNCTION get_periodic_pl_report(DATE, DATE) IS 'Returns periodic P&L report for a date range';
COMMENT ON FUNCTION get_pl_by_item(DATE, DATE) IS 'Returns P&L breakdown by item for a date range';

