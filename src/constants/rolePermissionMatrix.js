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
