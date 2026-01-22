# Quick Fix: user_branch_map Table Error

## Current Error
```
Could not find the table 'public.user_branch_map' in the schema cache
```

## Solution: Run Required Migrations

### Step 1: Run Migration 15 (Role Catalog)
**Required before migration 16**

1. Go to Supabase SQL Editor: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns/sql/new
2. Open `database/15_create_role_catalog.sql`
3. Copy the **entire contents**
4. Paste into SQL Editor
5. Click **"Run"**
6. Wait for "Success" message

### Step 2: Run Migration 16 (Organizations & Branches)
**This creates the missing tables**

1. In SQL Editor, click **"New query"**
2. Open `database/16_create_organizations_and_branches.sql`
3. Copy the **entire contents**
4. Paste and click **"Run"**
5. This creates:
   - `organizations` table
   - `branches` table
   - `user_branch_map` table ✅ (fixes your error)

### Step 3: Create Default Organization and Branch (Optional)
**Only run this AFTER migration 16 completes successfully**

After migration 16 is done, you can create a default organization and branch:

```sql
-- Create a default organization
INSERT INTO organizations (name, code, is_active)
VALUES ('Default Organization', 'DEFAULT', true)
ON CONFLICT DO NOTHING;

-- Create a default branch
INSERT INTO branches (organization_id, name, code, is_active)
SELECT id, 'Main Branch', 'MAIN', true
FROM organizations
WHERE code = 'DEFAULT'
LIMIT 1
ON CONFLICT DO NOTHING;
```

### Step 4: Verify Tables Exist
1. Go to **Table Editor** in Supabase Dashboard
2. You should see:
   - ✅ `organizations` table
   - ✅ `branches` table
   - ✅ `user_branch_map` table

### Step 5: Refresh Your App
1. Refresh your browser
2. The error should be gone
3. The app will try to auto-assign you to a branch

## ⚠️ Important Notes

- **DO NOT** try to insert into `organizations` table before running migration 16
- Migration 16 must run successfully first
- Run migrations in order (15, then 16)
- Each migration is idempotent (safe to run multiple times)

## Direct Links

- SQL Editor: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns/sql/new
- Table Editor: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns/editor

