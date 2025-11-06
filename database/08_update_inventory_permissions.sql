-- =====================================================
-- Update Inventory Permissions - Allow All Authenticated Users to Add Items
-- Version: 1.0.0
-- Description: Updates RLS policies to allow all authenticated users to add inventory items
-- =====================================================

-- Drop existing insert policy
DROP POLICY IF EXISTS "Admins and creators can insert inventory items" ON inventory_items;

-- Allow all authenticated users to insert items
CREATE POLICY "Authenticated users can insert inventory items"
  ON inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Drop existing insert policy for transactions
DROP POLICY IF EXISTS "Admins and creators can insert inventory transactions" ON inventory_transactions;

-- Allow all authenticated users to insert transactions
CREATE POLICY "Authenticated users can insert inventory transactions"
  ON inventory_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

