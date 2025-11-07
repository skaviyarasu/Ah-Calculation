-- =====================================================
-- Add Accounting & Banking Permissions to RBAC
-- Version: 1.0.0
-- Description: Seeds role_permissions for accounting modules and updates
--              role precedence functions to recognise the accountant role.
-- =====================================================

-- ============================================
-- 1. UPSERT ACCOUNTING PERMISSIONS (ADMIN)
-- ============================================

INSERT INTO role_permissions (role, permission, resource, description) VALUES
  -- Contacts
  ('admin', 'view_customers', 'contacts', 'View all customer records and account summary information'),
  ('admin', 'create_customers', 'contacts', 'Create new customers for sales'),
  ('admin', 'edit_customers', 'contacts', 'Edit any customer master data'),
  ('admin', 'delete_customers', 'contacts', 'Delete or archive customers'),
  ('admin', 'assign_customer_owner', 'contacts', 'Assign ownership for customer accounts'),
  ('admin', 'manage_customer_transactions', 'contacts', 'Manage customer credits and adjustments'),
  ('admin', 'view_vendors', 'contacts', 'View all vendor records'),
  ('admin', 'create_vendors', 'contacts', 'Create vendor master data'),
  ('admin', 'edit_vendors', 'contacts', 'Edit vendor information'),
  ('admin', 'delete_vendors', 'contacts', 'Delete or archive vendors'),
  ('admin', 'manage_vendor_bank_details', 'contacts', 'Maintain vendor bank details for payouts'),

  -- Sales & Estimates
  ('admin', 'view_estimates', 'estimates', 'View all estimates and proposals'),
  ('admin', 'create_estimates', 'estimates', 'Create estimates for customers'),
  ('admin', 'edit_estimates', 'estimates', 'Edit any estimate details'),
  ('admin', 'delete_estimates', 'estimates', 'Delete or void estimates'),
  ('admin', 'approve_estimates', 'estimates', 'Approve estimates before sharing'),
  ('admin', 'send_estimates', 'estimates', 'Send or email estimates to customers'),
  ('admin', 'convert_estimates', 'estimates', 'Convert estimates into invoices'),
  ('admin', 'view_invoices', 'invoices', 'View invoices and payment status'),
  ('admin', 'create_invoices', 'invoices', 'Create invoices for sales'),
  ('admin', 'edit_invoices', 'invoices', 'Edit invoice details'),
  ('admin', 'delete_invoices', 'invoices', 'Delete or void invoices'),
  ('admin', 'approve_invoices', 'invoices', 'Approve invoices for release'),
  ('admin', 'send_invoices', 'invoices', 'Send invoices to customers'),
  ('admin', 'record_invoice_payments', 'invoices', 'Record customer payments against invoices'),
  ('admin', 'write_off_invoices', 'invoices', 'Write off bad debt or irrecoverable invoices'),
  ('admin', 'view_sales_transactions', 'sales_transactions', 'View sales transactions and revenue entries'),
  ('admin', 'create_sales_transactions', 'sales_transactions', 'Record sales transactions manually'),
  ('admin', 'edit_sales_transactions', 'sales_transactions', 'Edit recorded sales transactions'),
  ('admin', 'delete_sales_transactions', 'sales_transactions', 'Delete or reverse sales transactions'),

  -- Purchases & Bills
  ('admin', 'view_purchase_orders', 'purchase_orders', 'View purchase orders raised to vendors'),
  ('admin', 'create_purchase_orders', 'purchase_orders', 'Create purchase orders'),
  ('admin', 'edit_purchase_orders', 'purchase_orders', 'Edit purchase order details'),
  ('admin', 'delete_purchase_orders', 'purchase_orders', 'Delete or cancel purchase orders'),
  ('admin', 'approve_purchase_orders', 'purchase_orders', 'Approve purchase orders for release'),
  ('admin', 'convert_purchase_orders', 'purchase_orders', 'Convert purchase orders into vendor bills'),
  ('admin', 'view_bills', 'bills', 'View vendor bills and payables'),
  ('admin', 'create_bills', 'bills', 'Capture vendor bills and expenses'),
  ('admin', 'edit_bills', 'bills', 'Edit bill details'),
  ('admin', 'delete_bills', 'bills', 'Delete or void bills'),
  ('admin', 'approve_bills', 'bills', 'Approve bills for payment'),
  ('admin', 'record_bill_payments', 'bills', 'Record vendor payments and settlements'),
  ('admin', 'apply_bill_credits', 'bills', 'Apply vendor credits or debit notes to bills'),

  -- Accounts & Payments
  ('admin', 'view_accounts_receivable', 'accounts', 'View accounts receivable ageing and balances'),
  ('admin', 'record_customer_payments', 'accounts', 'Record receipts against customer balances'),
  ('admin', 'manage_credit_notes', 'accounts', 'Issue and apply customer credit notes'),
  ('admin', 'view_accounts_payable', 'accounts', 'View accounts payable ageing and balances'),
  ('admin', 'record_vendor_payments', 'accounts', 'Record vendor payments or advances'),
  ('admin', 'manage_debit_notes', 'accounts', 'Issue and apply vendor debit notes'),

  -- Banking
  ('admin', 'view_bank_accounts', 'banking', 'View all bank and cash accounts'),
  ('admin', 'create_bank_accounts', 'banking', 'Create bank or cash accounts'),
  ('admin', 'edit_bank_accounts', 'banking', 'Edit bank account metadata'),
  ('admin', 'delete_bank_accounts', 'banking', 'Delete or archive bank accounts'),
  ('admin', 'reconcile_bank_accounts', 'banking', 'Perform bank reconciliations'),
  ('admin', 'view_bank_transactions', 'banking', 'View imported or manual bank transactions'),
  ('admin', 'create_bank_transactions', 'banking', 'Create manual bank transactions'),
  ('admin', 'edit_bank_transactions', 'banking', 'Edit bank transactions'),
  ('admin', 'delete_bank_transactions', 'banking', 'Delete bank transactions'),
  ('admin', 'import_bank_transactions', 'banking', 'Import bank statements or feeds'),

  -- Tax & Compliance
  ('admin', 'view_tax_rates', 'tax', 'View configured tax rates'),
  ('admin', 'create_tax_rates', 'tax', 'Create new tax rates'),
  ('admin', 'edit_tax_rates', 'tax', 'Edit tax rate configuration'),
  ('admin', 'delete_tax_rates', 'tax', 'Delete or deactivate tax rates'),
  ('admin', 'view_tax_categories', 'tax', 'View tax categories'),
  ('admin', 'create_tax_categories', 'tax', 'Create tax categories for items or services'),
  ('admin', 'edit_tax_categories', 'tax', 'Edit tax category settings'),
  ('admin', 'delete_tax_categories', 'tax', 'Delete or deactivate tax categories'),
  ('admin', 'manage_tax_filings', 'tax', 'Prepare and finalise tax filings'),

  -- Reports
  ('admin', 'view_pl_reports', 'reports', 'View profit and loss reports'),
  ('admin', 'view_sales_reports', 'reports', 'View sales performance reports'),
  ('admin', 'view_purchase_reports', 'reports', 'View purchase and spend reports'),
  ('admin', 'view_cashflow_reports', 'reports', 'View cashflow and management reports')
ON CONFLICT (role, permission, resource) DO NOTHING;

-- ============================================
-- 2. UPSERT ACCOUNTING PERMISSIONS (ACCOUNTANT)
-- ============================================

INSERT INTO role_permissions (role, permission, resource, description) VALUES
  -- Contacts
  ('accountant', 'view_customers', 'contacts', 'View customer master data for accounting activities'),
  ('accountant', 'create_customers', 'contacts', 'Create customer records during onboarding'),
  ('accountant', 'edit_customers', 'contacts', 'Maintain customer billing and compliance details'),
  ('accountant', 'assign_customer_owner', 'contacts', 'Assign or update customer ownership'),
  ('accountant', 'manage_customer_transactions', 'contacts', 'Apply credits and adjustments for assigned customers'),
  ('accountant', 'view_vendors', 'contacts', 'View vendor master data'),
  ('accountant', 'create_vendors', 'contacts', 'Create vendor accounts for purchasing'),
  ('accountant', 'edit_vendors', 'contacts', 'Maintain vendor payment preferences and compliance data'),
  ('accountant', 'manage_vendor_bank_details', 'contacts', 'Maintain vendor bank details for payouts'),

  -- Sales & Estimates
  ('accountant', 'view_estimates', 'estimates', 'View estimates awaiting invoicing'),
  ('accountant', 'create_estimates', 'estimates', 'Draft or duplicate estimates for customers'),
  ('accountant', 'edit_estimates', 'estimates', 'Edit estimate values prior to approval'),
  ('accountant', 'approve_estimates', 'estimates', 'Approve and freeze estimates before conversion'),
  ('accountant', 'send_estimates', 'estimates', 'Send estimates to customers by email'),
  ('accountant', 'convert_estimates', 'estimates', 'Convert estimates into invoices'),
  ('accountant', 'view_invoices', 'invoices', 'View invoices and outstanding balances'),
  ('accountant', 'create_invoices', 'invoices', 'Generate invoices for billing'),
  ('accountant', 'edit_invoices', 'invoices', 'Edit invoice line items and taxes'),
  ('accountant', 'approve_invoices', 'invoices', 'Approve invoices for release to customers'),
  ('accountant', 'send_invoices', 'invoices', 'Send invoices to customers'),
  ('accountant', 'record_invoice_payments', 'invoices', 'Record payments received against invoices'),
  ('accountant', 'write_off_invoices', 'invoices', 'Write off unpaid balances when authorised'),
  ('accountant', 'view_sales_transactions', 'sales_transactions', 'View recorded sales transactions'),
  ('accountant', 'create_sales_transactions', 'sales_transactions', 'Record manual sales transactions'),
  ('accountant', 'edit_sales_transactions', 'sales_transactions', 'Edit sales transaction details'),

  -- Purchases & Bills
  ('accountant', 'view_purchase_orders', 'purchase_orders', 'View purchase orders for fulfilment'),
  ('accountant', 'create_purchase_orders', 'purchase_orders', 'Raise purchase orders to vendors'),
  ('accountant', 'edit_purchase_orders', 'purchase_orders', 'Edit purchase order quantities or prices'),
  ('accountant', 'approve_purchase_orders', 'purchase_orders', 'Approve purchase orders before dispatch to vendors'),
  ('accountant', 'convert_purchase_orders', 'purchase_orders', 'Convert purchase orders into bills'),
  ('accountant', 'view_bills', 'bills', 'View vendor bills and due dates'),
  ('accountant', 'create_bills', 'bills', 'Record vendor bills and expenses'),
  ('accountant', 'edit_bills', 'bills', 'Edit bill line items and allocations'),
  ('accountant', 'approve_bills', 'bills', 'Approve bills for payment processing'),
  ('accountant', 'record_bill_payments', 'bills', 'Record vendor payments and settlements'),
  ('accountant', 'apply_bill_credits', 'bills', 'Apply credit notes or advances against bills'),

  -- Accounts & Payments
  ('accountant', 'view_accounts_receivable', 'accounts', 'View receivables ageing and balances'),
  ('accountant', 'record_customer_payments', 'accounts', 'Record receipts against customer balances'),
  ('accountant', 'manage_credit_notes', 'accounts', 'Issue and apply customer credit notes'),
  ('accountant', 'view_accounts_payable', 'accounts', 'View payables ageing and balances'),
  ('accountant', 'record_vendor_payments', 'accounts', 'Record vendor payments and settlements'),
  ('accountant', 'manage_debit_notes', 'accounts', 'Issue and apply vendor debit notes'),

  -- Banking
  ('accountant', 'view_bank_accounts', 'banking', 'View bank account balances'),
  ('accountant', 'create_bank_accounts', 'banking', 'Add new bank or cash accounts'),
  ('accountant', 'edit_bank_accounts', 'banking', 'Maintain bank account settings'),
  ('accountant', 'reconcile_bank_accounts', 'banking', 'Perform reconciliations for bank accounts'),
  ('accountant', 'view_bank_transactions', 'banking', 'View bank transactions awaiting categorisation'),
  ('accountant', 'create_bank_transactions', 'banking', 'Record manual bank transactions'),
  ('accountant', 'edit_bank_transactions', 'banking', 'Edit bank transactions prior to reconciliation'),
  ('accountant', 'import_bank_transactions', 'banking', 'Import bank statements or feeds'),

  -- Tax & Compliance
  ('accountant', 'view_tax_rates', 'tax', 'View configured tax rates'),
  ('accountant', 'create_tax_rates', 'tax', 'Create indirect tax rates'),
  ('accountant', 'edit_tax_rates', 'tax', 'Edit tax rate setup'),
  ('accountant', 'view_tax_categories', 'tax', 'View tax categories'),
  ('accountant', 'create_tax_categories', 'tax', 'Create tax categories for items'),
  ('accountant', 'edit_tax_categories', 'tax', 'Edit tax category mapping'),
  ('accountant', 'manage_tax_filings', 'tax', 'Prepare tax filings and mark them complete'),

  -- Reports
  ('accountant', 'view_pl_reports', 'reports', 'View profit and loss reports'),
  ('accountant', 'view_sales_reports', 'reports', 'View sales performance analytics'),
  ('accountant', 'view_purchase_reports', 'reports', 'View procurement analytics'),
  ('accountant', 'view_cashflow_reports', 'reports', 'View cashflow and management reports')
ON CONFLICT (role, permission, resource) DO NOTHING;

-- ============================================
-- 3. UPSERT VIEW-ONLY PERMISSIONS (STANDARD USER)
-- ============================================

INSERT INTO role_permissions (role, permission, resource, description) VALUES
  ('user', 'view_customers', 'contacts', 'Allow standard users to view customers they interact with'),
  ('user', 'view_vendors', 'contacts', 'Allow standard users to view vendors'),
  ('user', 'view_estimates', 'estimates', 'Allow standard users to view estimates shared with them'),
  ('user', 'view_invoices', 'invoices', 'Allow standard users to view invoices shared with them'),
  ('user', 'view_sales_transactions', 'sales_transactions', 'Allow standard users to review their own sales transactions'),
  ('user', 'view_purchase_orders', 'purchase_orders', 'Allow standard users to view relevant purchase orders'),
  ('user', 'view_bills', 'bills', 'Allow standard users to view vendor bills relevant to them'),
  ('user', 'view_accounts_receivable', 'accounts', 'Allow users to see receivables summary'),
  ('user', 'view_accounts_payable', 'accounts', 'Allow users to see payables summary'),
  ('user', 'view_pl_reports', 'reports', 'Allow users to view P&L overview'),
  ('user', 'view_sales_reports', 'reports', 'Allow users to view basic sales reports'),
  ('user', 'view_purchase_reports', 'reports', 'Allow users to view purchase reports'),
  ('user', 'view_cashflow_reports', 'reports', 'Allow users to view cashflow dashboards')
ON CONFLICT (role, permission, resource) DO NOTHING;

-- ============================================
-- 4. UPDATE ROLE PRECEDENCE FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION user_has_permission(check_user_id UUID, check_permission TEXT, check_resource TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM user_roles
  WHERE user_id = check_user_id
  ORDER BY 
    CASE role
      WHEN 'admin' THEN 1
      WHEN 'accountant' THEN 2
      WHEN 'creator' THEN 3
      WHEN 'verifier' THEN 4
      WHEN 'user' THEN 5
      ELSE 10
    END
  LIMIT 1;

  IF user_role IS NULL THEN
    user_role := 'user';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role = user_role
      AND permission = check_permission
      AND (check_resource IS NULL OR resource = check_resource)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_role(check_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM user_roles
  WHERE user_id = check_user_id
  ORDER BY 
    CASE role
      WHEN 'admin' THEN 1
      WHEN 'accountant' THEN 2
      WHEN 'creator' THEN 3
      WHEN 'verifier' THEN 4
      WHEN 'user' THEN 5
      ELSE 10
    END
  LIMIT 1;

  RETURN COALESCE(user_role, 'user');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- End of migration
-- =====================================================
