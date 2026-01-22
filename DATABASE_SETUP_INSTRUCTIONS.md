# Database Setup Instructions

## ⚠️ Current Issue
The error `column user_roles.role does not exist` indicates that the database migrations haven't been run in your Supabase project.

## 🚀 Quick Fix: Run Database Migrations

### Step 1: Run Base Schema
1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns
2. Navigate to **SQL Editor** (left sidebar)
3. Click **"New query"**
4. Open `database/01_battery_optimization_schema.sql` from this project
5. Copy the **entire contents** of the file
6. Paste into the SQL Editor
7. Click **"Run"** (or press Ctrl+Enter)
8. Wait for "Success" message

### Step 2: Run RBAC Migration (Required for user_roles table)
1. In the same SQL Editor, click **"New query"** again
2. Open `database/03_add_role_based_access_control.sql`
3. Copy the **entire contents**
4. Paste and click **"Run"**
5. This creates the `user_roles` table with the `role` column

### Step 3: Fix RLS Recursion (Recommended)
1. Click **"New query"**
2. Open `database/04_fix_rls_recursion.sql`
3. Copy and run it

### Step 4: Run Additional Migrations (Required for Full Features)

**⚠️ IMPORTANT:** The app requires these migrations to work properly. Run them in order:

**Required for Branch/Organization Features:**
- `15_create_role_catalog.sql` - Role catalog (run before 16)
- `16_create_organizations_and_branches.sql` - **REQUIRED** - Creates organizations, branches, and user_branch_map tables

**Required for Inventory Features:**
- `06_add_inventory_management.sql` - Inventory system
- `07_add_inventory_images_and_serial.sql` - Image support
- `08_update_inventory_permissions.sql` - Permission updates
- `09_add_inventory_permissions.sql` - More permissions
- `17_expand_inventory_operations.sql` - More inventory features

**Required for Accounting Features:**
- `10_add_cogs_and_pl_system.sql` - Cost tracking & P&L
- `11_create_accounting_system.sql` - Full accounting system
- `13_add_accounting_permissions.sql` - Accounting permissions

**Optional but Recommended:**
- `05_add_workflow_status.sql` - Job review workflow
- `12_create_user_directory.sql` - User directory for admin panel
- `14_add_voltage_to_cell_capacities.sql` - Voltage tracking

**Quick Fix for Current Error:**
If you're seeing `user_branch_map` table not found error, run:
1. `15_create_role_catalog.sql`
2. `16_create_organizations_and_branches.sql`

### Step 5: Assign Admin Role to Your User
After running the migrations, assign yourself the admin role:

1. Go to **Authentication** → **Users** in Supabase Dashboard
2. Find your user and copy the **User ID** (UUID)
3. Go to **SQL Editor** → **New query**
4. Run this SQL (replace `YOUR_USER_ID` with your actual UUID):

```sql
INSERT INTO user_roles (user_id, role, assigned_by)
VALUES (
  'YOUR_USER_ID'::uuid,
  'admin',
  'YOUR_USER_ID'::uuid
)
ON CONFLICT (user_id, role) DO NOTHING;
```

Or if you know your email:

```sql
INSERT INTO user_roles (user_id, role, assigned_by)
SELECT 
  id as user_id,
  'admin' as role,
  id as assigned_by
FROM auth.users
WHERE email = 'your-email@example.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

## ✅ Verification

After running migrations, verify:

1. **Check Tables:**
   - Go to **Table Editor** in Supabase Dashboard
   - You should see `user_roles` table
   - It should have columns: `id`, `user_id`, `role`, `assigned_by`, `created_at`, `updated_at`

2. **Check RLS Policies:**
   - Go to **Authentication** → **Policies**
   - `user_roles` table should have RLS enabled

3. **Test in App:**
   - Refresh your browser
   - The error should be gone
   - You should be able to log in

## 🔗 Direct Links

- Supabase Dashboard: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns
- SQL Editor: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns/sql/new
- Table Editor: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns/editor

## 📝 Notes

- Run migrations in order (01, 02, 03, etc.)
- Each migration is idempotent (safe to run multiple times)
- If you get errors, check the SQL Editor output for details
- Make sure you're running migrations in the correct Supabase project

