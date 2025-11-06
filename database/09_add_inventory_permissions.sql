-- =====================================================
-- Add Inventory Module Permissions to RBAC
-- Version: 1.0.0
-- Description: Adds inventory management permissions to role-based access control
-- =====================================================

-- Add inventory permissions for different roles
INSERT INTO role_permissions (role, permission, resource, description) VALUES
  -- Admin role - full inventory access
  ('admin', 'view_inventory', 'inventory', 'View all inventory items'),
  ('admin', 'add_inventory_items', 'inventory', 'Add new inventory items'),
  ('admin', 'edit_inventory_items', 'inventory', 'Edit inventory items'),
  ('admin', 'delete_inventory_items', 'inventory', 'Delete inventory items'),
  ('admin', 'manage_inventory_transactions', 'inventory', 'Manage all inventory transactions'),
  ('admin', 'view_inventory_reports', 'inventory', 'View inventory reports and analytics'),
  
  -- Creator role - can manage inventory for job creation
  ('creator', 'view_inventory', 'inventory', 'View all inventory items'),
  ('creator', 'add_inventory_items', 'inventory', 'Add new inventory items'),
  ('creator', 'edit_inventory_items', 'inventory', 'Edit inventory items'),
  ('creator', 'manage_inventory_transactions', 'inventory', 'Create inventory transactions'),
  
  -- Verifier role - can view inventory for verification
  ('verifier', 'view_inventory', 'inventory', 'View all inventory items'),
  ('verifier', 'view_inventory_reports', 'inventory', 'View inventory reports'),
  
  -- Standard user role - limited inventory access
  ('user', 'view_inventory', 'inventory', 'View inventory items'),
  ('user', 'add_inventory_items', 'inventory', 'Add new inventory items'),
  ('user', 'manage_inventory_transactions', 'inventory', 'Create inventory transactions')
ON CONFLICT (role, permission, resource) DO NOTHING;

-- Add comment
COMMENT ON TABLE role_permissions IS 'Updated to include inventory management permissions';

