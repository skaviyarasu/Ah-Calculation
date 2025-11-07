const makeEntry = (permission, resource, label, description, options = {}) => ({
  permission,
  resource: resource ?? null,
  label,
  description,
  includeInFull: options.includeInFull !== false
});

export const ROLE_METADATA = {
  admin: {
    label: 'Administrator',
    description: 'Full control over the platform, including system configuration, user management, workflow overrides, and access to all data.'
  },
  creator: {
    label: 'Creator',
    description: 'Prepares job calculations, manages own drafts, submits work for verification, and can maintain supporting inventory records.'
  },
  verifier: {
    label: 'Verifier',
    description: 'Reviews submitted jobs, requests clarifications, and finalises approvals. Limited to oversight capabilities.'
  },
  accountant: {
    label: 'Accountant',
    description: 'Manages day-to-day accounting functions such as contacts, sales, purchases, banking, and statutory compliance.'
  },
  user: {
    label: 'Standard User',
    description: 'Can work on their own records with restricted visibility into broader system data.'
  }
};

export const PERMISSION_COLUMNS = [
  { key: 'full', label: 'Full' },
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
  { key: 'approve', label: 'Approve' },
  { key: 'others', label: 'Others' }
];

export const PERMISSION_MATRIX = [
  {
    module: 'Administration',
    description: 'System-level capabilities and governance controls.',
    rows: [
      {
        key: 'admin_management',
        label: 'User & Role Management',
        actions: {
          view: [
            makeEntry('view_analytics', 'analytics', 'View system analytics', 'Allows viewing platform overview analytics and dashboards.')
          ],
          others: [
            makeEntry('manage_users', 'users', 'Manage users', 'Create, update, or deactivate user accounts.'),
            makeEntry('manage_roles', 'roles', 'Manage roles', 'Assign and configure application roles and permissions.')
          ]
        }
      }
    ]
  },
  {
    module: 'Optimization Jobs',
    description: 'Authoring, reviewing, and governing AH balancer job cards.',
    rows: [
      {
        key: 'jobs_all',
        label: 'Jobs (All Records)',
        actions: {
          view: [makeEntry('view_all_jobs', 'jobs', 'View all jobs', 'Provides visibility into every job regardless of owner.')],
          edit: [makeEntry('edit_all_jobs', 'jobs', 'Edit all jobs', 'Allows editing any job record in the system.')],
          delete: [makeEntry('delete_all_jobs', 'jobs', 'Delete all jobs', 'Allows deleting any job from the system.')],
          approve: [
            makeEntry('verify_jobs', 'jobs', 'Verify jobs', 'Approve or reject job calculations.'),
            makeEntry('request_modification', 'jobs', 'Request modifications', 'Send jobs back to creators with revision notes.')
          ],
          others: [
            makeEntry('bypass_workflow', 'jobs', 'Bypass workflow', 'Override workflow restrictions for urgent corrections.')
          ]
        }
      },
      {
        key: 'jobs_own',
        label: 'Jobs (Own Records)',
        actions: {
          view: [makeEntry('view_own_jobs', 'jobs', 'View own jobs', 'View jobs created by the current user.')],
          create: [makeEntry('create_jobs', 'jobs', 'Create jobs', 'Create new job calculations.')],
          edit: [makeEntry('edit_own_jobs', 'jobs', 'Edit own jobs', 'Edit drafts or jobs requiring modification that were created by the user.')],
          delete: [
            makeEntry('delete_own_jobs', 'jobs', 'Delete own jobs', 'Delete own job records.'),
            makeEntry('delete_own_draft_jobs', 'jobs', 'Delete drafts', 'Delete draft jobs prior to submission.')
          ],
          approve: [makeEntry('submit_for_review', 'jobs', 'Submit for review', 'Submit completed jobs for verifier review.')],
          others: [makeEntry('view_verification_history', 'jobs', 'View verification history', 'Access verification logs and reviewer comments.')]
        }
      },
      {
        key: 'jobs_data',
        label: 'Data Export & Analytics',
        actions: {
          view: [makeEntry('view_analytics', 'analytics', 'View analytics', 'Review analytics specific to job performance.')],
          others: [
            makeEntry('export_all_data', 'data', 'Export all data', 'Export system-wide datasets for analysis.'),
            makeEntry('export_own_data', 'data', 'Export own data', 'Export data authored by the current user.')
          ]
        }
      }
    ]
  },
  {
    module: 'Inventory',
    description: 'Stock, transactions, and traceability controls.',
    rows: [
      {
        key: 'inventory_items',
        label: 'Inventory Items',
        actions: {
          view: [makeEntry('view_inventory', 'inventory', 'View inventory', 'Browse catalogue items and quantities.')],
          create: [makeEntry('add_inventory_items', 'inventory', 'Add inventory items', 'Add new tracked inventory items.')],
          edit: [makeEntry('edit_inventory_items', 'inventory', 'Edit inventory items', 'Update item attributes, cost, or metadata.')],
          delete: [makeEntry('delete_inventory_items', 'inventory', 'Delete inventory items', 'Remove inventory records that are obsolete or duplicated.')]
        }
      },
      {
        key: 'inventory_transactions',
        label: 'Inventory Transactions',
        actions: {
          create: [makeEntry('manage_inventory_transactions', 'inventory', 'Record inventory transactions', 'Create stock movements such as receipts, issues, or adjustments.')]
        }
      },
      {
        key: 'inventory_reports',
        label: 'Inventory Reports',
        actions: {
          view: [makeEntry('view_inventory_reports', 'inventory', 'View inventory reports', 'Access valuation, COGS, and trend reports.')]
        }
      }
    ]
  },
  {
    module: 'Contacts',
    description: 'Centralised customer and vendor master data with ownership tracking.',
    rows: [
      {
        key: 'contacts_customers',
        label: 'Customers',
        actions: {
          view: [makeEntry('view_customers', 'contacts', 'View customers', 'Browse customer directory and account summary overview.')],
          create: [makeEntry('create_customers', 'contacts', 'Create customers', 'Add new customer organisations or individuals.')],
          edit: [makeEntry('edit_customers', 'contacts', 'Edit customers', 'Modify customer profile, billing, and payment settings.')],
          delete: [makeEntry('delete_customers', 'contacts', 'Delete customers', 'Archive or remove customer records when permitted.')],
          others: [
            makeEntry('assign_customer_owner', 'contacts', 'Assign owner', 'Assign responsibility or territory ownership for a customer.'),
            makeEntry('manage_customer_transactions', 'contacts', 'Handle customer transactions', 'Allow applying credits, notes, or statement updates for assigned customers.')
          ]
        }
      },
      {
        key: 'contacts_vendors',
        label: 'Vendors',
        actions: {
          view: [makeEntry('view_vendors', 'contacts', 'View vendors', 'Browse vendor master data.')],
          create: [makeEntry('create_vendors', 'contacts', 'Create vendors', 'Register new vendors and supplier partners.')],
          edit: [makeEntry('edit_vendors', 'contacts', 'Edit vendors', 'Update vendor contact, compliance, or payment instructions.')],
          delete: [makeEntry('delete_vendors', 'contacts', 'Delete vendors', 'Deactivate or remove vendor records.')],
          others: [
            makeEntry('manage_vendor_bank_details', 'contacts', 'Manage bank details', 'Maintain vendor bank accounts for payouts and refunds.')
          ]
        }
      }
    ]
  },
  {
    module: 'Sales & Estimates',
    description: 'Quote-to-cash processes including estimates, invoices, and revenue tracking.',
    rows: [
      {
        key: 'sales_estimates',
        label: 'Estimates',
        actions: {
          view: [makeEntry('view_estimates', 'estimates', 'View estimates', 'Access customer estimates and proposal status.')],
          create: [makeEntry('create_estimates', 'estimates', 'Create estimates', 'Draft new estimates for customers or prospects.')],
          edit: [makeEntry('edit_estimates', 'estimates', 'Edit estimates', 'Update line items, taxes, or validity on estimates.')],
          delete: [makeEntry('delete_estimates', 'estimates', 'Delete estimates', 'Remove estimates no longer required.')],
          approve: [makeEntry('approve_estimates', 'estimates', 'Approve estimates', 'Approve or sign off estimates prior to sharing.')],
          others: [
            makeEntry('send_estimates', 'estimates', 'Send estimates', 'Email or share estimates with customers directly.'),
            makeEntry('convert_estimates', 'estimates', 'Convert to invoice', 'Convert winning estimates into invoices automatically.')
          ]
        }
      },
      {
        key: 'sales_invoices',
        label: 'Invoices',
        actions: {
          view: [makeEntry('view_invoices', 'invoices', 'View invoices', 'View invoices, balances, and payment history.')],
          create: [makeEntry('create_invoices', 'invoices', 'Create invoices', 'Generate invoices for goods or services rendered.')],
          edit: [makeEntry('edit_invoices', 'invoices', 'Edit invoices', 'Update invoice details before or after issuance.')],
          delete: [makeEntry('delete_invoices', 'invoices', 'Delete invoices', 'Void or delete invoices when necessary.')],
          approve: [makeEntry('approve_invoices', 'invoices', 'Approve invoices', 'Authorise invoices for release to customers.')],
          others: [
            makeEntry('send_invoices', 'invoices', 'Send invoices', 'Distribute invoices via email or sharing links.'),
            makeEntry('record_invoice_payments', 'invoices', 'Record payments', 'Capture customer payments and allocate against invoices.'),
            makeEntry('write_off_invoices', 'invoices', 'Write-off invoices', 'Write off irrecoverable balances or bad debt.')
          ]
        }
      },
      {
        key: 'sales_transactions',
        label: 'Sales Transactions',
        actions: {
          view: [makeEntry('view_sales_transactions', 'sales_transactions', 'View sales transactions', 'Review recorded sales and COGS impact.')],
          create: [makeEntry('create_sales_transactions', 'sales_transactions', 'Record sales transactions', 'Record ad-hoc sales or point-of-sale entries.')],
          edit: [makeEntry('edit_sales_transactions', 'sales_transactions', 'Edit sales transactions', 'Amend sales transaction details for accuracy.')],
          delete: [makeEntry('delete_sales_transactions', 'sales_transactions', 'Delete sales transactions', 'Reverse or remove sales entries when required.')]
        }
      }
    ]
  },
  {
    module: 'Purchases & Bills',
    description: 'Procure-to-pay controls for purchase orders, bills, and vendor credits.',
    rows: [
      {
        key: 'purchases_po',
        label: 'Purchase Orders',
        actions: {
          view: [makeEntry('view_purchase_orders', 'purchase_orders', 'View purchase orders', 'Access purchase orders and approval status.')],
          create: [makeEntry('create_purchase_orders', 'purchase_orders', 'Create purchase orders', 'Raise purchase orders for vendor procurement.')],
          edit: [makeEntry('edit_purchase_orders', 'purchase_orders', 'Edit purchase orders', 'Modify quantities, pricing, or delivery schedules.')],
          delete: [makeEntry('delete_purchase_orders', 'purchase_orders', 'Delete purchase orders', 'Cancel or delete unnecessary purchase orders.')],
          approve: [makeEntry('approve_purchase_orders', 'purchase_orders', 'Approve purchase orders', 'Authorise purchase orders for release to vendors.')],
          others: [
            makeEntry('convert_purchase_orders', 'purchase_orders', 'Convert to bills', 'Convert fulfilled purchase orders into bills.')
          ]
        }
      },
      {
        key: 'purchases_bills',
        label: 'Bills & Vendor Invoices',
        actions: {
          view: [makeEntry('view_bills', 'bills', 'View bills', 'Review vendor bills, due dates, and payment status.')],
          create: [makeEntry('create_bills', 'bills', 'Create bills', 'Capture vendor invoices or expenses.')],
          edit: [makeEntry('edit_bills', 'bills', 'Edit bills', 'Update bill line items, taxes, or allocations.')],
          delete: [makeEntry('delete_bills', 'bills', 'Delete bills', 'Void or delete vendor bills when needed.')],
          approve: [makeEntry('approve_bills', 'bills', 'Approve bills', 'Authorise bills for payment processing.')],
          others: [
            makeEntry('record_bill_payments', 'bills', 'Record bill payments', 'Capture vendor payments, advances, or settlements.'),
            makeEntry('apply_bill_credits', 'bills', 'Apply credits', 'Apply debit/credit notes against outstanding bills.')
          ]
        }
      }
    ]
  },
  {
    module: 'Accounts & Payments',
    description: 'Receivables and payables management, reconciliation, and adjustments.',
    rows: [
      {
        key: 'accounts_receivable',
        label: 'Accounts Receivable',
        actions: {
          view: [makeEntry('view_accounts_receivable', 'accounts', 'View receivables', 'View outstanding customer balances and ageing.')],
          others: [
            makeEntry('record_customer_payments', 'accounts', 'Record customer payments', 'Log customer receipts, including partial and advance payments.'),
            makeEntry('manage_credit_notes', 'accounts', 'Manage credit notes', 'Issue and apply customer credit notes to balances.')
          ]
        }
      },
      {
        key: 'accounts_payable',
        label: 'Accounts Payable',
        actions: {
          view: [makeEntry('view_accounts_payable', 'accounts', 'View payables', 'Monitor outstanding vendor balances and due dates.')],
          others: [
            makeEntry('record_vendor_payments', 'accounts', 'Record vendor payments', 'Record vendor payments, part-payments, and retainers.'),
            makeEntry('manage_debit_notes', 'accounts', 'Manage debit notes', 'Create and apply vendor debit notes against bills.')
          ]
        }
      }
    ]
  },
  {
    module: 'Banking',
    description: 'Bank account administration, reconciliations, and statement imports.',
    rows: [
      {
        key: 'banking_accounts',
        label: 'Bank Accounts',
        actions: {
          view: [makeEntry('view_bank_accounts', 'banking', 'View bank accounts', 'Access bank account ledger balances and meta data.')],
          create: [makeEntry('create_bank_accounts', 'banking', 'Create bank accounts', 'Add new bank accounts or cash books.')],
          edit: [makeEntry('edit_bank_accounts', 'banking', 'Edit bank accounts', 'Update account details, default status, or sync settings.')],
          delete: [makeEntry('delete_bank_accounts', 'banking', 'Delete bank accounts', 'Close or archive unused bank accounts.')],
          others: [
            makeEntry('reconcile_bank_accounts', 'banking', 'Reconcile accounts', 'Perform bank reconciliations and lock reconciled periods.')
          ]
        }
      },
      {
        key: 'banking_transactions',
        label: 'Bank Transactions',
        actions: {
          view: [makeEntry('view_bank_transactions', 'banking', 'View bank transactions', 'Review imported or manually recorded bank transactions.')],
          create: [makeEntry('create_bank_transactions', 'banking', 'Create bank transactions', 'Record manual receipts, payments, and transfers.')],
          edit: [makeEntry('edit_bank_transactions', 'banking', 'Edit bank transactions', 'Amend bank entries prior to reconciliation.')],
          delete: [makeEntry('delete_bank_transactions', 'banking', 'Delete bank transactions', 'Remove duplicate or erroneous bank transactions.')],
          others: [
            makeEntry('import_bank_transactions', 'banking', 'Import bank feeds', 'Upload or sync bank statements and feeds.')
          ]
        }
      }
    ]
  },
  {
    module: 'Tax & Compliance',
    description: 'Manage statutory tax rates, categories, and filing preparation.',
    rows: [
      {
        key: 'tax_rates',
        label: 'Tax Rates',
        actions: {
          view: [makeEntry('view_tax_rates', 'tax', 'View tax rates', 'View configured indirect tax rates and validity.')],
          create: [makeEntry('create_tax_rates', 'tax', 'Create tax rates', 'Add new GST/VAT rates or cess components.')],
          edit: [makeEntry('edit_tax_rates', 'tax', 'Edit tax rates', 'Modify rate slabs and associated accounts.')],
          delete: [makeEntry('delete_tax_rates', 'tax', 'Delete tax rates', 'De-activate or delete obsolete tax rates.')]
        }
      },
      {
        key: 'tax_categories',
        label: 'Tax Categories',
        actions: {
          view: [makeEntry('view_tax_categories', 'tax', 'View tax categories', 'Review classification of items and services for tax.')],
          create: [makeEntry('create_tax_categories', 'tax', 'Create tax categories', 'Define new tax categories for items or services.')],
          edit: [makeEntry('edit_tax_categories', 'tax', 'Edit tax categories', 'Update category rules and associated rates.')],
          delete: [makeEntry('delete_tax_categories', 'tax', 'Delete tax categories', 'Remove categories no longer in use.')],
          others: [
            makeEntry('manage_tax_filings', 'tax', 'Manage tax filings', 'Prepare, export, and mark statutory filings (GST, VAT, etc.) as completed.')
          ]
        }
      }
    ]
  },
  {
    module: 'Financial Reports',
    description: 'Business performance dashboards and statutory financial reporting.',
    rows: [
      {
        key: 'reports_pl',
        label: 'Profit & Loss',
        actions: {
          view: [makeEntry('view_pl_reports', 'reports', 'View P&L', 'Access profit and loss reports with drill-down detail.')]
        }
      },
      {
        key: 'reports_sales',
        label: 'Sales Reports',
        actions: {
          view: [makeEntry('view_sales_reports', 'reports', 'View sales reports', 'Review sales performance, revenue trends, and margins.')]
        }
      },
      {
        key: 'reports_purchases',
        label: 'Purchase Reports',
        actions: {
          view: [makeEntry('view_purchase_reports', 'reports', 'View purchase reports', 'Analyse vendor spend and procurement trends.')]
        }
      },
      {
        key: 'reports_cashflow',
        label: 'Cashflow & Other',
        actions: {
          view: [makeEntry('view_cashflow_reports', 'reports', 'View cashflow reports', 'View cashflow, balance sheet, and other management reports.')]
        }
      }
    ]
  }
];

export const PERMISSION_CONFIG_KEYS = (() => {
  const keys = new Set();
  const makeKey = (permission, resource) => `${permission}::${resource ?? 'null'}`;

  PERMISSION_MATRIX.forEach(module => {
    module.rows.forEach(row => {
      Object.values(row.actions).forEach(value => {
        if (!Array.isArray(value)) return;
        value.forEach(entry => {
          if (!entry?.permission) return;
          keys.add(makeKey(entry.permission, entry.resource));
        });
      });
    });
  });

  return keys;
})();

export const makePermissionKey = (permission, resource) => `${permission}::${resource ?? 'null'}`;
