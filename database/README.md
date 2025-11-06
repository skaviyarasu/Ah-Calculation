# Database Schema Management

This directory contains all database schema files for the AH Balancer application.

## 📁 Files

- **`01_battery_optimization_schema.sql`** - Complete database schema (tables, indexes, policies, triggers)
- **`02_add_serial_number_migration.sql`** - Migration to add serial_number column to existing databases
- **`03_add_role_based_access_control.sql`** - Migration to add role-based access control (RBAC) system
- **`04_fix_rls_recursion.sql`** - Fix for RLS infinite recursion error in user_roles policies
- **`05_add_workflow_status.sql`** - Migration to add workflow status tracking and creator/verifier roles
- **`06_add_inventory_management.sql`** - Migration to add inventory management system (items, transactions, stock tracking)
- **`07_add_inventory_images_and_serial.sql`** - Migration to add image_url and serial_number fields for 5S tracking and barcode generation
- **`08_update_inventory_permissions.sql`** - Update permissions to allow all authenticated users to add inventory items
- **`09_add_inventory_permissions.sql`** - Add inventory module permissions to RBAC system
- **`10_add_cogs_and_pl_system.sql`** - Add COGS (Cost of Goods Sold) tracking and P&L (Profit & Loss) reporting system
- **`11_create_accounting_system.sql`** - Comprehensive accounting system (invoicing, purchases, payments, banking, contacts, tax management)
- **`migrations/`** - Version-controlled migration files (if needed in future)

### File Naming Convention

SQL files are prefixed with sequential numbers (`01_`, `02_`, `03_`, etc.) to ensure proper execution order:
- **`01_battery_optimization_schema.sql`** - Initial schema setup (run this first for new databases)
- **`02_add_serial_number_migration.sql`** - Add serial_number column (run this if you have an existing database)
- **`03_add_role_based_access_control.sql`** - Add role-based access control system (run this to enable admin/user roles)
- **`04_fix_rls_recursion.sql`** - Fix infinite recursion error in RLS policies (run this if you get recursion errors)
- **`05_add_workflow_status.sql`** - Add workflow status and creator/verifier roles (run this to enable job review workflow)
- **`06_add_inventory_management.sql`** - Add inventory management system (run this to enable stock tracking and inventory management)
- **`07_add_inventory_images_and_serial.sql`** - Add image and serial number support (run this to enable 5S tracking with images and barcodes)
- **`08_update_inventory_permissions.sql`** - Update permissions (run this to allow all authenticated users to add items and transactions)
- **`09_add_inventory_permissions.sql`** - Add inventory permissions to RBAC (run this to enable role-based inventory access control)
- **`10_add_cogs_and_pl_system.sql`** - Add COGS and P&L system (run this to enable cost tracking, sales transactions, and profit & loss reporting)
- **`11_create_accounting_system.sql`** - Add comprehensive accounting system (run this to enable invoicing, purchases, payments, banking, contacts, and tax management)

This numbering system ensures files are executed in the correct order when running multiple SQL scripts.

## 🚀 Quick Setup

### For New Supabase Projects (Fresh Installation):

1. **Copy the schema:**
   - Open `01_battery_optimization_schema.sql` in this directory
   - Copy the entire contents

2. **Run in Supabase:**
   - Go to your Supabase Dashboard
   - Navigate to **SQL Editor**
   - Click **"New query"**
   - Paste the entire `01_battery_optimization_schema.sql` contents
   - Click **"Run"**

3. **Verify:**
   - Check **Table Editor** → You should see:
     - `battery_optimization_jobs` table
     - `battery_cell_capacities` table
   - Check **Authentication** → **Policies** → RLS policies should be active

## 📊 Database Structure

### Tables

#### `battery_optimization_jobs`
Stores AH optimization project metadata:
- `id` - UUID primary key
- `user_id` - Foreign key to auth.users
- `serial_number` - Unique tracking serial number (format: AH-YYYYMMDD-XXXX)
- `customer_name` - Customer information
- `job_card` - Job card/reference number
- `job_date` - Date of the job
- `battery_spec` - Battery specifications
- `series_count` - Number of series (S)
- `parallel_count` - Number of parallel (P)
- `tolerance` - Tolerance in mAh
- `created_at` - Timestamp
- `updated_at` - Auto-updated timestamp

#### `battery_cell_capacities`
Stores individual cell capacity measurements:
- `id` - UUID primary key
- `optimization_job_id` - Foreign key to battery_optimization_jobs table
- `series_index` - Series position (0-based)
- `parallel_index` - Parallel position (0-based)
- `capacity_mah` - Cell capacity in milliampere-hours (mAh)
- `created_at` - Timestamp

### Security (Row Level Security)

All tables have RLS enabled with policies ensuring:
- Users can only see their own jobs
- Users can only modify their own data
- Automatic data isolation per user

### Indexes

- `battery_optimization_jobs_user_id_idx` - Fast user job queries
- `battery_optimization_jobs_created_at_idx` - Sorted job listings
- `battery_optimization_jobs_serial_number_idx` - Fast serial number lookups
- `battery_cell_capacities_job_id_idx` - Fast cell data retrieval
- `battery_cell_capacities_position_idx` - Optimized grid lookups

### Views

- `battery_optimization_summary` - Aggregated job statistics view

## 🔄 Schema Updates

When making schema changes:

1. **Update `01_battery_optimization_schema.sql`** with new changes (or create new numbered migration files)
2. **Document changes** in this README
3. **Test changes** in a development Supabase project first
4. **Run migration** in production Supabase project

## 📝 Schema Version

**Current Version:** 4.0.0  
**Last Updated:** 2025-01-26  
**Compatible With:** AH Balancer v1.0+  
**Changes:** 
- Added serial_number column for job tracking (v2.0.0)
- Added role-based access control system (v3.0.0)
- Added workflow status tracking and creator/verifier roles (v4.0.0)

## 🔒 Security Notes

- Row Level Security (RLS) is enabled on all tables
- All policies use `auth.uid()` for user isolation
- Foreign key constraints ensure data integrity
- Cascade deletes maintain referential integrity
