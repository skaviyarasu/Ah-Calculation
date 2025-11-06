-- =====================================================
-- Comprehensive Accounting System (Zoho Books-like)
-- Version: 1.0.0
-- Description: Creates complete accounting system with invoicing, purchases, payments, banking, and contacts
-- =====================================================

-- ============================================
-- 1. CONTACTS MANAGEMENT (Customers & Vendors)
-- ============================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_type TEXT NOT NULL CHECK (contact_type IN ('customer', 'vendor')),
  company_name TEXT,
  contact_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'India',
  gstin TEXT, -- GST Identification Number
  pan TEXT, -- PAN Number
  credit_limit NUMERIC DEFAULT 0,
  payment_terms TEXT, -- e.g., "Net 30", "Due on Receipt"
  opening_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0, -- Calculated balance
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- ============================================
-- 2. ESTIMATES SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_number TEXT UNIQUE NOT NULL,
  estimate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  customer_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
  subtotal NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  notes TEXT,
  terms_and_conditions TEXT,
  converted_to_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID REFERENCES estimates(id) ON DELETE CASCADE,
  item_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
  description TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  discount_percent NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  line_total NUMERIC GENERATED ALWAYS AS (
    (quantity * unit_price * (1 - discount_percent / 100)) + tax_amount
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimates_customer ON estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimates_date ON estimates(estimate_date);
CREATE INDEX IF NOT EXISTS idx_estimates_number ON estimates(estimate_number);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate ON estimate_items(estimate_id);

-- ============================================
-- 3. INVOICING SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  customer_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
  sales_transaction_id UUID REFERENCES sales_transactions(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled')),
  subtotal NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  balance_amount NUMERIC GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  currency TEXT DEFAULT 'INR',
  notes TEXT,
  terms_and_conditions TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  item_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
  description TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  discount_percent NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  line_total NUMERIC GENERATED ALWAYS AS (
    (quantity * unit_price * (1 - discount_percent / 100)) + tax_amount
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ============================================
-- 3. INVOICE PAYMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'card', 'online', 'other')),
  payment_amount NUMERIC NOT NULL CHECK (payment_amount > 0),
  bank_account_id UUID, -- Will reference bank_accounts table
  reference_number TEXT, -- Cheque number, transaction ID, etc.
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_date ON invoice_payments(payment_date);

-- ============================================
-- 4. PURCHASE ORDERS & BILLS
-- ============================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  vendor_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'acknowledged', 'received', 'cancelled')),
  subtotal NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  terms_and_conditions TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
  description TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  discount_percent NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  line_total NUMERIC GENERATED ALWAYS AS (
    (quantity * unit_price * (1 - discount_percent / 100)) + tax_amount
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number TEXT UNIQUE NOT NULL,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  vendor_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'paid', 'partial', 'overdue', 'cancelled')),
  subtotal NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  balance_amount NUMERIC GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  currency TEXT DEFAULT 'INR',
  notes TEXT,
  terms_and_conditions TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  item_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
  description TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  discount_percent NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  line_total NUMERIC GENERATED ALWAYS AS (
    (quantity * unit_price * (1 - discount_percent / 100)) + tax_amount
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'card', 'online', 'other')),
  payment_amount NUMERIC NOT NULL CHECK (payment_amount > 0),
  bank_account_id UUID, -- Will reference bank_accounts table
  reference_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_bills_vendor ON bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON bill_payments(bill_id);

-- ============================================
-- 5. BANK ACCOUNTS & TRANSACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name TEXT NOT NULL,
  account_number TEXT,
  bank_name TEXT NOT NULL,
  ifsc_code TEXT,
  branch_name TEXT,
  account_type TEXT NOT NULL CHECK (account_type IN ('savings', 'current', 'credit_card', 'loan', 'other')),
  opening_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'fee', 'interest', 'other')),
  amount NUMERIC NOT NULL,
  balance_after NUMERIC, -- Balance after this transaction
  description TEXT,
  reference_number TEXT,
  category TEXT, -- Income, Expense, Transfer, etc.
  invoice_payment_id UUID REFERENCES invoice_payments(id) ON DELETE SET NULL,
  bill_payment_id UUID REFERENCES bill_payments(id) ON DELETE SET NULL,
  is_reconciled BOOLEAN DEFAULT false,
  reconciled_at TIMESTAMP WITH TIME ZONE,
  reconciled_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
  statement_date DATE NOT NULL,
  statement_balance NUMERIC NOT NULL,
  reconciled_balance NUMERIC NOT NULL,
  difference NUMERIC GENERATED ALWAYS AS (statement_balance - reconciled_balance) STORED,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_reconciled ON bank_transactions(is_reconciled);

-- ============================================
-- 6. TAX MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_name TEXT NOT NULL, -- e.g., "GST 18%", "CGST 9%", "SGST 9%"
  tax_code TEXT UNIQUE NOT NULL, -- e.g., "GST18", "CGST9"
  tax_rate NUMERIC NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_type TEXT NOT NULL CHECK (tax_type IN ('gst', 'cgst', 'sgst', 'igst', 'vat', 'cess', 'other')),
  is_compound BOOLEAN DEFAULT false, -- For compound taxes
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_tax_rate_id UUID REFERENCES tax_rates(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link inventory items to tax categories
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS tax_category_id UUID REFERENCES tax_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tax_rates_code ON tax_rates(tax_code);
CREATE INDEX IF NOT EXISTS idx_tax_rates_active ON tax_rates(is_active);

-- ============================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_categories ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. RLS POLICIES - CONTACTS
-- ============================================

DROP POLICY IF EXISTS "Users can view contacts" ON contacts;
CREATE POLICY "Users can view contacts"
  ON contacts FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert contacts" ON contacts;
CREATE POLICY "Authenticated users can insert contacts"
  ON contacts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and creators can update contacts" ON contacts;
CREATE POLICY "Admins and creators can update contacts"
  ON contacts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

DROP POLICY IF EXISTS "Admins can delete contacts" ON contacts;
CREATE POLICY "Admins can delete contacts"
  ON contacts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- ============================================
-- 9. RLS POLICIES - ESTIMATES
-- ============================================

DROP POLICY IF EXISTS "Users can view estimates" ON estimates;
CREATE POLICY "Users can view estimates"
  ON estimates FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert estimates" ON estimates;
CREATE POLICY "Authenticated users can insert estimates"
  ON estimates FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and creators can update estimates" ON estimates;
CREATE POLICY "Admins and creators can update estimates"
  ON estimates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

DROP POLICY IF EXISTS "Admins can delete estimates" ON estimates;
CREATE POLICY "Admins can delete estimates"
  ON estimates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view estimate items" ON estimate_items;
CREATE POLICY "Users can view estimate items"
  ON estimate_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage estimate items" ON estimate_items;
CREATE POLICY "Authenticated users can manage estimate items"
  ON estimate_items FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================
-- 10. RLS POLICIES - INVOICES
-- ============================================

DROP POLICY IF EXISTS "Users can view invoices" ON invoices;
CREATE POLICY "Users can view invoices"
  ON invoices FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON invoices;
CREATE POLICY "Authenticated users can insert invoices"
  ON invoices FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins and creators can update invoices" ON invoices;
CREATE POLICY "Admins and creators can update invoices"
  ON invoices FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

DROP POLICY IF EXISTS "Admins can delete invoices" ON invoices;
CREATE POLICY "Admins can delete invoices"
  ON invoices FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- Similar policies for invoice_items and invoice_payments
DROP POLICY IF EXISTS "Users can view invoice items" ON invoice_items;
CREATE POLICY "Users can view invoice items"
  ON invoice_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage invoice items" ON invoice_items;
CREATE POLICY "Authenticated users can manage invoice items"
  ON invoice_items FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view invoice payments" ON invoice_payments;
CREATE POLICY "Users can view invoice payments"
  ON invoice_payments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage invoice payments" ON invoice_payments;
CREATE POLICY "Authenticated users can manage invoice payments"
  ON invoice_payments FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================
-- 11. RLS POLICIES - PURCHASE ORDERS & BILLS
-- ============================================

DROP POLICY IF EXISTS "Users can view purchase orders" ON purchase_orders;
CREATE POLICY "Users can view purchase orders"
  ON purchase_orders FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage purchase orders" ON purchase_orders;
CREATE POLICY "Authenticated users can manage purchase orders"
  ON purchase_orders FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view purchase order items" ON purchase_order_items;
CREATE POLICY "Users can view purchase order items"
  ON purchase_order_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage purchase order items" ON purchase_order_items;
CREATE POLICY "Authenticated users can manage purchase order items"
  ON purchase_order_items FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view bills" ON bills;
CREATE POLICY "Users can view bills"
  ON bills FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage bills" ON bills;
CREATE POLICY "Authenticated users can manage bills"
  ON bills FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view bill items" ON bill_items;
CREATE POLICY "Users can view bill items"
  ON bill_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage bill items" ON bill_items;
CREATE POLICY "Authenticated users can manage bill items"
  ON bill_items FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view bill payments" ON bill_payments;
CREATE POLICY "Users can view bill payments"
  ON bill_payments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage bill payments" ON bill_payments;
CREATE POLICY "Authenticated users can manage bill payments"
  ON bill_payments FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================
-- 11. RLS POLICIES - BANKING
-- ============================================

DROP POLICY IF EXISTS "Users can view bank accounts" ON bank_accounts;
CREATE POLICY "Users can view bank accounts"
  ON bank_accounts FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins and creators can manage bank accounts" ON bank_accounts;
CREATE POLICY "Admins and creators can manage bank accounts"
  ON bank_accounts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

DROP POLICY IF EXISTS "Users can view bank transactions" ON bank_transactions;
CREATE POLICY "Users can view bank transactions"
  ON bank_transactions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage bank transactions" ON bank_transactions;
CREATE POLICY "Authenticated users can manage bank transactions"
  ON bank_transactions FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view bank reconciliations" ON bank_reconciliations;
CREATE POLICY "Users can view bank reconciliations"
  ON bank_reconciliations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins and creators can manage bank reconciliations" ON bank_reconciliations;
CREATE POLICY "Admins and creators can manage bank reconciliations"
  ON bank_reconciliations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'creator')
    )
  );

-- ============================================
-- 12. RLS POLICIES - TAX
-- ============================================

DROP POLICY IF EXISTS "Users can view tax rates" ON tax_rates;
CREATE POLICY "Users can view tax rates"
  ON tax_rates FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage tax rates" ON tax_rates;
CREATE POLICY "Admins can manage tax rates"
  ON tax_rates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view tax categories" ON tax_categories;
CREATE POLICY "Users can view tax categories"
  ON tax_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage tax categories" ON tax_categories;
CREATE POLICY "Admins can manage tax categories"
  ON tax_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- ============================================
-- 13. HELPER FUNCTIONS
-- ============================================

-- Function to generate estimate number
CREATE OR REPLACE FUNCTION generate_estimate_number()
RETURNS TEXT AS $$
DECLARE
  today DATE := CURRENT_DATE;
  date_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  date_prefix := TO_CHAR(today, 'YYYYMMDD');
  
  -- Get next sequence number for today
  SELECT COALESCE(MAX(CAST(SUBSTRING(estimate_number FROM LENGTH(date_prefix) + 2) AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM estimates
  WHERE estimate_number LIKE date_prefix || '-%';
  
  RETURN 'EST-' || date_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  today DATE := CURRENT_DATE;
  date_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  date_prefix := TO_CHAR(today, 'YYYYMMDD');
  
  -- Get next sequence number for today
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM LENGTH(date_prefix) + 2) AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM invoices
  WHERE invoice_number LIKE date_prefix || '-%';
  
  RETURN date_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate PO number
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
  today DATE := CURRENT_DATE;
  date_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  date_prefix := TO_CHAR(today, 'YYYYMMDD');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM LENGTH(date_prefix) + 2) AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM purchase_orders
  WHERE po_number LIKE date_prefix || '-%';
  
  RETURN 'PO-' || date_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate bill number
CREATE OR REPLACE FUNCTION generate_bill_number()
RETURNS TEXT AS $$
DECLARE
  today DATE := CURRENT_DATE;
  date_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  date_prefix := TO_CHAR(today, 'YYYYMMDD');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(bill_number FROM LENGTH(date_prefix) + 2) AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM bills
  WHERE bill_number LIKE date_prefix || '-%';
  
  RETURN 'BILL-' || date_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to update estimate totals
CREATE OR REPLACE FUNCTION update_estimate_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE estimates
  SET 
    subtotal = COALESCE((
      SELECT SUM(quantity * unit_price * (1 - discount_percent / 100))
      FROM estimate_items
      WHERE estimate_id = COALESCE(NEW.estimate_id, OLD.estimate_id)
    ), 0),
    tax_amount = COALESCE((
      SELECT SUM(tax_amount)
      FROM estimate_items
      WHERE estimate_id = COALESCE(NEW.estimate_id, OLD.estimate_id)
    ), 0),
    total_amount = COALESCE((
      SELECT SUM(line_total)
      FROM estimate_items
      WHERE estimate_id = COALESCE(NEW.estimate_id, OLD.estimate_id)
    ), 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.estimate_id, OLD.estimate_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update estimate totals when items change
DROP TRIGGER IF EXISTS trigger_update_estimate_totals ON estimate_items;
CREATE TRIGGER trigger_update_estimate_totals
  AFTER INSERT OR UPDATE OR DELETE ON estimate_items
  FOR EACH ROW
  EXECUTE FUNCTION update_estimate_totals();

-- Function to update invoice totals
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET 
    subtotal = COALESCE((
      SELECT SUM(quantity * unit_price * (1 - discount_percent / 100))
      FROM invoice_items
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    tax_amount = COALESCE((
      SELECT SUM(tax_amount)
      FROM invoice_items
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    total_amount = COALESCE((
      SELECT SUM(line_total)
      FROM invoice_items
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update invoice totals when items change
DROP TRIGGER IF EXISTS trigger_update_invoice_totals ON invoice_items;
CREATE TRIGGER trigger_update_invoice_totals
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_totals();

-- Function to update invoice paid amount
CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET 
    paid_amount = COALESCE((
      SELECT SUM(payment_amount)
      FROM invoice_payments
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    status = CASE
      WHEN COALESCE((
        SELECT SUM(payment_amount)
        FROM invoice_payments
        WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
      ), 0) >= total_amount THEN 'paid'
      WHEN COALESCE((
        SELECT SUM(payment_amount)
        FROM invoice_payments
        WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
      ), 0) > 0 THEN 'partial'
      WHEN due_date < CURRENT_DATE AND status != 'paid' THEN 'overdue'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update invoice paid amount when payments change
DROP TRIGGER IF EXISTS trigger_update_invoice_paid_amount ON invoice_payments;
CREATE TRIGGER trigger_update_invoice_paid_amount
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_paid_amount();

-- Similar functions for bills
CREATE OR REPLACE FUNCTION update_bill_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bills
  SET 
    subtotal = COALESCE((
      SELECT SUM(quantity * unit_price * (1 - discount_percent / 100))
      FROM bill_items
      WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)
    ), 0),
    tax_amount = COALESCE((
      SELECT SUM(tax_amount)
      FROM bill_items
      WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)
    ), 0),
    total_amount = COALESCE((
      SELECT SUM(line_total)
      FROM bill_items
      WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)
    ), 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.bill_id, OLD.bill_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_bill_totals ON bill_items;
CREATE TRIGGER trigger_update_bill_totals
  AFTER INSERT OR UPDATE OR DELETE ON bill_items
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_totals();

CREATE OR REPLACE FUNCTION update_bill_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bills
  SET 
    paid_amount = COALESCE((
      SELECT SUM(payment_amount)
      FROM bill_payments
      WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)
    ), 0),
    status = CASE
      WHEN COALESCE((
        SELECT SUM(payment_amount)
        FROM bill_payments
        WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)
      ), 0) >= total_amount THEN 'paid'
      WHEN COALESCE((
        SELECT SUM(payment_amount)
        FROM bill_payments
        WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)
      ), 0) > 0 THEN 'partial'
      WHEN due_date < CURRENT_DATE AND status != 'paid' THEN 'overdue'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.bill_id, OLD.bill_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_bill_paid_amount ON bill_payments;
CREATE TRIGGER trigger_update_bill_paid_amount
  AFTER INSERT OR UPDATE OR DELETE ON bill_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_bill_paid_amount();

-- Function to update bank account balance
CREATE OR REPLACE FUNCTION update_bank_account_balance()
RETURNS TRIGGER AS $$
DECLARE
  current_bal NUMERIC;
BEGIN
  -- Calculate current balance
  SELECT COALESCE(opening_balance, 0) + COALESCE((
    SELECT SUM(
      CASE 
        WHEN transaction_type IN ('deposit', 'interest') THEN amount
        WHEN transaction_type IN ('withdrawal', 'fee') THEN -amount
        ELSE 0
      END
    )
    FROM bank_transactions
    WHERE bank_account_id = NEW.bank_account_id
  ), 0)
  INTO current_bal
  FROM bank_accounts
  WHERE id = NEW.bank_account_id;
  
  -- Update bank account balance
  UPDATE bank_accounts
  SET current_balance = current_bal,
      updated_at = NOW()
  WHERE id = NEW.bank_account_id;
  
  -- Update transaction balance_after
  UPDATE bank_transactions
  SET balance_after = current_bal
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_bank_account_balance ON bank_transactions;
CREATE TRIGGER trigger_update_bank_account_balance
  AFTER INSERT OR UPDATE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_bank_account_balance();

-- Function to update contact balance
CREATE OR REPLACE FUNCTION update_contact_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    UPDATE contacts
    SET current_balance = COALESCE(opening_balance, 0) + COALESCE((
      SELECT SUM(balance_amount)
      FROM invoices
      WHERE customer_id = NEW.customer_id
        AND status NOT IN ('cancelled', 'paid')
    ), 0),
    updated_at = NOW()
    WHERE id = NEW.customer_id;
  ELSIF TG_TABLE_NAME = 'bills' THEN
    UPDATE contacts
    SET current_balance = COALESCE(opening_balance, 0) - COALESCE((
      SELECT SUM(balance_amount)
      FROM bills
      WHERE vendor_id = NEW.vendor_id
        AND status NOT IN ('cancelled', 'paid')
    ), 0),
    updated_at = NOW()
    WHERE id = NEW.vendor_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 14. REPORTS FUNCTIONS
-- ============================================

-- Function to get Accounts Receivable summary
CREATE OR REPLACE FUNCTION get_accounts_receivable_summary()
RETURNS TABLE (
  customer_id UUID,
  customer_name TEXT,
  total_invoiced NUMERIC,
  total_paid NUMERIC,
  outstanding_amount NUMERIC,
  overdue_amount NUMERIC,
  invoice_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    COALESCE(c.company_name, c.contact_name) as customer_name,
    COALESCE(SUM(i.total_amount), 0) as total_invoiced,
    COALESCE(SUM(i.paid_amount), 0) as total_paid,
    COALESCE(SUM(i.balance_amount), 0) as outstanding_amount,
    COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND i.status != 'paid' THEN i.balance_amount ELSE 0 END), 0) as overdue_amount,
    COUNT(i.id) as invoice_count
  FROM contacts c
  LEFT JOIN invoices i ON c.id = i.customer_id AND i.status != 'cancelled'
  WHERE c.contact_type = 'customer' AND c.status = 'active'
  GROUP BY c.id, c.company_name, c.contact_name
  HAVING COALESCE(SUM(i.balance_amount), 0) > 0
  ORDER BY outstanding_amount DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get Accounts Payable summary
CREATE OR REPLACE FUNCTION get_accounts_payable_summary()
RETURNS TABLE (
  vendor_id UUID,
  vendor_name TEXT,
  total_billed NUMERIC,
  total_paid NUMERIC,
  outstanding_amount NUMERIC,
  overdue_amount NUMERIC,
  bill_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    COALESCE(c.company_name, c.contact_name) as vendor_name,
    COALESCE(SUM(b.total_amount), 0) as total_billed,
    COALESCE(SUM(b.paid_amount), 0) as total_paid,
    COALESCE(SUM(b.balance_amount), 0) as outstanding_amount,
    COALESCE(SUM(CASE WHEN b.due_date < CURRENT_DATE AND b.status != 'paid' THEN b.balance_amount ELSE 0 END), 0) as overdue_amount,
    COUNT(b.id) as bill_count
  FROM contacts c
  LEFT JOIN bills b ON c.id = b.vendor_id AND b.status != 'cancelled'
  WHERE c.contact_type = 'vendor' AND c.status = 'active'
  GROUP BY c.id, c.company_name, c.contact_name
  HAVING COALESCE(SUM(b.balance_amount), 0) > 0
  ORDER BY outstanding_amount DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON TABLE contacts IS 'Stores customer and vendor contact information';
COMMENT ON TABLE invoices IS 'Stores sales invoices with payment tracking';
COMMENT ON TABLE purchase_orders IS 'Stores purchase orders from vendors';
COMMENT ON TABLE bills IS 'Stores vendor bills with payment tracking';
COMMENT ON TABLE bank_accounts IS 'Stores bank account information';
COMMENT ON TABLE bank_transactions IS 'Tracks all bank transactions';
COMMENT ON TABLE tax_rates IS 'Stores tax rate configurations (GST, VAT, etc.)';

