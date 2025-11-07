-- ============================================
-- Migration: Expand Inventory Operations
-- ============================================
-- Version: 17
-- Purpose: Add suppliers, locations, purchase orders,
--          goods receipts, and multi-location stock control
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. SUPPLIERS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  tax_number TEXT,
  gstin TEXT,
  pan TEXT,
  msme_number TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'India',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  payment_terms TEXT,
  credit_limit NUMERIC,
  payment_method TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,
  rating NUMERIC,
  last_reviewed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(code)
);

ALTER TABLE inventory_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Suppliers are visible" ON inventory_suppliers;
DROP POLICY IF EXISTS "Suppliers managed by admins" ON inventory_suppliers;

CREATE POLICY "Suppliers are visible" ON inventory_suppliers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Suppliers managed by admins" ON inventory_suppliers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'creator')
    )
  );

CREATE INDEX IF NOT EXISTS inventory_suppliers_name_idx ON inventory_suppliers(name);

-- ============================================
-- 2. INVENTORY LOCATIONS & STOCK LEVELS
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(branch_id, code)
);

ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Locations are visible" ON inventory_locations;
DROP POLICY IF EXISTS "Locations managed by admins" ON inventory_locations;

CREATE POLICY "Locations are visible" ON inventory_locations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Locations managed by admins" ON inventory_locations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'creator')
    )
  );

CREATE INDEX IF NOT EXISTS inventory_locations_branch_idx ON inventory_locations(branch_id);

CREATE TABLE IF NOT EXISTS inventory_stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  quantity NUMERIC DEFAULT 0,
  min_stock_level NUMERIC DEFAULT 0,
  max_stock_level NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(item_id, location_id)
);

ALTER TABLE inventory_stock_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stock levels are visible" ON inventory_stock_levels;
DROP POLICY IF EXISTS "Stock levels managed by admins" ON inventory_stock_levels;

CREATE POLICY "Stock levels are visible" ON inventory_stock_levels
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Stock levels managed by admins" ON inventory_stock_levels
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'creator')
    )
  );

CREATE INDEX IF NOT EXISTS inventory_stock_levels_item_idx ON inventory_stock_levels(item_id);
CREATE INDEX IF NOT EXISTS inventory_stock_levels_location_idx ON inventory_stock_levels(location_id);

-- ============================================
-- 3. PURCHASE ORDERS & GOODS RECEIPTS
-- ============================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES inventory_suppliers(id) ON DELETE SET NULL,
  location_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL,
  order_number TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  expected_date DATE,
  reference_number TEXT,
  notes TEXT,
  total_amount NUMERIC DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "POs are visible" ON purchase_orders;
DROP POLICY IF EXISTS "POs managed by admins" ON purchase_orders;

CREATE POLICY "POs are visible" ON purchase_orders
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "POs managed by admins" ON purchase_orders
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'creator')
    )
  );

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC,
  received_quantity NUMERIC DEFAULT 0,
  notes TEXT
);

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE;

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PO items are visible" ON purchase_order_items;
DROP POLICY IF EXISTS "PO items managed by admins" ON purchase_order_items;

CREATE POLICY "PO items are visible" ON purchase_order_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "PO items managed by admins" ON purchase_order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'creator')
    )
  );

CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items(purchase_order_id);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  location_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL,
  receipt_number TEXT UNIQUE,
  reference_number TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Receipts are visible" ON goods_receipts;
DROP POLICY IF EXISTS "Receipts managed by admins" ON goods_receipts;

CREATE POLICY "Receipts are visible" ON goods_receipts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Receipts managed by admins" ON goods_receipts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'creator')
    )
  );

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC,
  batch_code TEXT,
  expiry_date DATE
);

ALTER TABLE goods_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Receipt items are visible" ON goods_receipt_items;
DROP POLICY IF EXISTS "Receipt items managed by admins" ON goods_receipt_items;

CREATE POLICY "Receipt items are visible" ON goods_receipt_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Receipt items managed by admins" ON goods_receipt_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'creator')
    )
  );

CREATE INDEX IF NOT EXISTS goods_receipt_items_receipt_idx ON goods_receipt_items(goods_receipt_id);

-- ============================================
-- 4. UPDATE INVENTORY TRANSACTIONS FOR LOCATIONS
-- ============================================

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES inventory_locations(id),
  ADD COLUMN IF NOT EXISTS target_location_id UUID REFERENCES inventory_locations(id),
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES goods_receipts(id);

CREATE INDEX IF NOT EXISTS inventory_transactions_branch_idx ON inventory_transactions(branch_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_location_idx ON inventory_transactions(location_id);

-- ============================================
-- 5. STOCK ADJUSTMENT FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION adjust_stock_level(p_item UUID, p_location UUID, p_delta NUMERIC)
RETURNS VOID AS $$
BEGIN
  IF p_item IS NULL OR p_location IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;

  INSERT INTO inventory_stock_levels (item_id, location_id, quantity, updated_at)
  VALUES (p_item, p_location, p_delta, timezone('utc', now()))
  ON CONFLICT (item_id, location_id)
  DO UPDATE SET
    quantity = inventory_stock_levels.quantity + EXCLUDED.quantity,
    updated_at = timezone('utc', now());

  UPDATE inventory_items
    SET current_stock = COALESCE((
      SELECT SUM(quantity)
      FROM inventory_stock_levels
      WHERE item_id = p_item
    ), 0),
    updated_at = timezone('utc', now())
  WHERE id = p_item;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION apply_inventory_transaction()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transaction_type = 'in' THEN
    PERFORM adjust_stock_level(NEW.item_id, COALESCE(NEW.location_id, NEW.target_location_id), NEW.quantity);
  ELSIF NEW.transaction_type = 'out' THEN
    PERFORM adjust_stock_level(NEW.item_id, COALESCE(NEW.location_id, NEW.target_location_id), NEW.quantity * -1);
  ELSIF NEW.transaction_type = 'transfer' THEN
    PERFORM adjust_stock_level(NEW.item_id, NEW.location_id, NEW.quantity * -1);
    PERFORM adjust_stock_level(NEW.item_id, NEW.target_location_id, NEW.quantity);
  ELSIF NEW.transaction_type = 'adjustment' THEN
    PERFORM adjust_stock_level(NEW.item_id, COALESCE(NEW.location_id, NEW.target_location_id), NEW.quantity);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_inventory_stock ON inventory_transactions;
CREATE TRIGGER trigger_update_inventory_stock
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_transaction();

-- ============================================
-- 6. RPC HELPERS FOR PURCHASE ORDERS & RECEIPTS
-- ============================================

CREATE OR REPLACE FUNCTION ensure_inventory_manager()
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'creator')
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges to manage inventory';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_purchase_order(po_data JSONB, po_items JSONB)
RETURNS UUID AS $$
DECLARE
  new_po_id UUID;
BEGIN
  PERFORM ensure_inventory_manager();

  INSERT INTO purchase_orders (
    branch_id,
    supplier_id,
    location_id,
    order_number,
    status,
    expected_date,
    reference_number,
    notes,
    total_amount,
    created_by
  )
  SELECT
    (po_data->>'branch_id')::UUID,
    (po_data->>'supplier_id')::UUID,
    (po_data->>'location_id')::UUID,
    COALESCE(po_data->>'order_number', 'PO-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4)),
    COALESCE(po_data->>'status', 'draft'),
    (po_data->>'expected_date')::DATE,
    po_data->>'reference_number',
    po_data->>'notes',
    COALESCE((po_data->>'total_amount')::NUMERIC, 0),
    auth.uid()
  RETURNING id INTO new_po_id;

  INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity, unit_price, notes)
  SELECT
    new_po_id,
    (item->>'item_id')::UUID,
    COALESCE((item->>'quantity')::NUMERIC, 0),
    (item->>'unit_price')::NUMERIC,
    item->>'notes'
  FROM jsonb_array_elements(po_items) AS item;

  UPDATE purchase_orders
    SET total_amount = COALESCE((
      SELECT SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0))
      FROM purchase_order_items
      WHERE purchase_order_id = new_po_id
    ), 0)
  WHERE id = new_po_id;

  RETURN new_po_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION record_goods_receipt(gr_data JSONB, gr_items JSONB)
RETURNS UUID AS $$
DECLARE
  new_gr_id UUID;
  po_id UUID;
BEGIN
  PERFORM ensure_inventory_manager();

  po_id := (gr_data->>'purchase_order_id')::UUID;

  INSERT INTO goods_receipts (
    purchase_order_id,
    branch_id,
    location_id,
    receipt_number,
    reference_number,
    received_date,
    notes,
    created_by
  )
  SELECT
    po_id,
    (gr_data->>'branch_id')::UUID,
    (gr_data->>'location_id')::UUID,
    COALESCE(gr_data->>'receipt_number', 'GR-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4)),
    gr_data->>'reference_number',
    COALESCE((gr_data->>'received_date')::DATE, CURRENT_DATE),
    gr_data->>'notes',
    auth.uid()
  RETURNING id INTO new_gr_id;

  INSERT INTO goods_receipt_items (
    goods_receipt_id,
    purchase_order_item_id,
    item_id,
    quantity,
    unit_price,
    batch_code,
    expiry_date
  )
  SELECT
    new_gr_id,
    (item->>'purchase_order_item_id')::UUID,
    (item->>'item_id')::UUID,
    COALESCE((item->>'quantity')::NUMERIC, 0),
    (item->>'unit_price')::NUMERIC,
    item->>'batch_code',
    (item->>'expiry_date')::DATE
  FROM jsonb_array_elements(gr_items) AS item;

  -- Update purchase order line receipts
  UPDATE purchase_order_items poi
  SET received_quantity = COALESCE(received_quantity, 0) + src.quantity
  FROM (
    SELECT
      (item->>'purchase_order_item_id')::UUID AS poi_id,
      COALESCE((item->>'quantity')::NUMERIC, 0) AS quantity
    FROM jsonb_array_elements(gr_items) item
    WHERE item ? 'purchase_order_item_id'
  ) src
  WHERE poi.id = src.poi_id;

  -- Create inventory transactions for each item
  INSERT INTO inventory_transactions (
    item_id,
    transaction_type,
    quantity,
    unit_price,
    reference_number,
    reference_type,
    location_id,
    purchase_order_id,
    goods_receipt_id,
    branch_id,
    created_by
  )
  SELECT
    (item->>'item_id')::UUID,
    'in',
    COALESCE((item->>'quantity')::NUMERIC, 0),
    (item->>'unit_price')::NUMERIC,
    gr_data->>'reference_number',
    'goods_receipt',
    (gr_data->>'location_id')::UUID,
    po_id,
    new_gr_id,
    (gr_data->>'branch_id')::UUID,
    auth.uid()
  FROM jsonb_array_elements(gr_items) AS item;

  -- Update purchase order status
  IF po_id IS NOT NULL THEN
    UPDATE purchase_orders
    SET status = CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM purchase_order_items
        WHERE purchase_order_id = po_id
          AND COALESCE(received_quantity, 0) < COALESCE(quantity, 0)
      ) THEN 'received'
      ELSE 'partial'
    END,
    updated_at = timezone('utc', now())
    WHERE id = po_id;
  END IF;

  RETURN new_gr_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. BRANCH STOCK VIEW
-- ============================================

CREATE OR REPLACE VIEW branch_stock_snapshot AS
SELECT
  isl.item_id,
  isl.location_id,
  il.branch_id,
  isl.quantity,
  isl.updated_at
FROM inventory_stock_levels isl
JOIN inventory_locations il ON il.id = isl.location_id;

CREATE OR REPLACE FUNCTION get_branch_stock(p_branch UUID)
RETURNS TABLE (
  item_id UUID,
  location_id UUID,
  location_name TEXT,
  branch_id UUID,
  quantity NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    isl.item_id,
    isl.location_id,
    il.name,
    il.branch_id,
    isl.quantity
  FROM inventory_stock_levels isl
  JOIN inventory_locations il ON il.id = isl.location_id
  WHERE il.branch_id = p_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. DEFAULT DATA SEEDS
-- ============================================

INSERT INTO inventory_suppliers (name, code)
VALUES ('Default Supplier', 'SUP-DEFAULT')
ON CONFLICT (code) DO NOTHING;

INSERT INTO inventory_locations (branch_id, name, code, is_default)
SELECT b.id, 'Primary Warehouse', 'MAIN', TRUE
FROM branches b
LEFT JOIN inventory_locations il ON il.branch_id = b.id AND il.is_default
WHERE il.id IS NULL;

-- ============================================
-- 9. TIMESTAMP TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_suppliers_set_updated_at ON inventory_suppliers;
CREATE TRIGGER inventory_suppliers_set_updated_at
  BEFORE UPDATE ON inventory_suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS inventory_locations_set_updated_at ON inventory_locations;
CREATE TRIGGER inventory_locations_set_updated_at
  BEFORE UPDATE ON inventory_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON purchase_orders;
CREATE TRIGGER purchase_orders_set_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================
-- COMPLETION
-- ============================================

SELECT 'inventory_expansion_ready' AS status;
