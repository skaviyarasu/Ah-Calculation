# Role-Based Access Control (RBAC) Setup Guide

## Overview

The AH Balancer application now includes a comprehensive Role-Based Access Control (RBAC) system that allows administrators to manage user roles and permissions. Only admin users can access the admin panel and manage roles.

## Features

- **Two Default Roles:**
  - **Admin** - Full access to all features, can manage users and roles
  - **User** - Standard access to create, edit, and delete own jobs

- **Permission-Based Access:**
  - Granular permissions for different operations
  - Resource-based permissions (jobs, data, analytics, etc.)
  - Automatic permission checking throughout the application

- **Admin Panel:**
  - View all users and their roles
  - Assign/remove roles to users
  - View role permissions
  - User management interface

## Database Setup

### 1. Run the Migration Script

1. Go to your Supabase Dashboard → SQL Editor
2. Copy and paste the entire contents of `database/03_add_role_based_access_control.sql`
3. Click "Run" to execute the migration

This will create:
- `user_roles` table - Stores role assignments for users
- `role_permissions` table - Defines permissions for each role
- Helper functions for role checking
- Row Level Security (RLS) policies

### 2. Assign Your First Admin User

After running the migration, you need to assign the admin role to your user account.

**Option 1: Via Supabase SQL Editor (Recommended)**

1. Go to Supabase Dashboard → Authentication → Users
2. Find your user account and copy the User ID (UUID)
3. Go to SQL Editor and run:

```sql
INSERT INTO user_roles (user_id, role, assigned_by)
SELECT 
  id as user_id,
  'admin' as role,
  id as assigned_by
FROM auth.users
WHERE email = 'your-email@example.com';
```

**Option 2: Via Admin Panel (After First Admin Setup)**

1. If you already have one admin user, they can assign admin role to other users via the Admin Panel

## Default Permissions

### Admin Role Permissions:
- ✅ `manage_users` - Manage user accounts and roles
- ✅ `manage_roles` - Manage roles and permissions
- ✅ `view_all_jobs` - View all users' jobs
- ✅ `edit_all_jobs` - Edit any user's job
- ✅ `delete_all_jobs` - Delete any user's job
- ✅ `export_all_data` - Export all user data
- ✅ `view_analytics` - View system analytics

### User Role Permissions:
- ✅ `view_own_jobs` - View own jobs only
- ✅ `edit_own_jobs` - Edit own jobs only
- ✅ `delete_own_jobs` - Delete own jobs only
- ✅ `export_own_data` - Export own data only
- ✅ `create_jobs` - Create new jobs

## Using the Admin Panel

### Accessing the Admin Panel

1. Log in as an admin user
2. Navigate to the "Admin Panel" tab in the main navigation
3. You'll see:
   - List of all users with their roles
   - Role permissions overview
   - Interface to assign roles to users

### Assigning Roles to Users

1. **Find User ID:**
   - Go to Supabase Dashboard → Authentication → Users
   - Copy the User ID (UUID) of the user you want to assign a role to

2. **Assign Role:**
   - In the Admin Panel, enter the User ID in the "Assign Role to User" section
   - Click "Assign Admin Role" or "Assign User Role"
   - The role will be assigned immediately

### Removing Roles

- Click the "-Admin" button next to a user to remove their admin role
- Users without any role will default to the "user" role

## Application Integration

### Frontend Components

- **`useRole` Hook** - Custom React hook for role checking
  ```javascript
  const { userRole, isAdmin, hasPermission } = useRole();
  ```

- **`AdminPanel` Component** - Admin interface for role management
  - Only accessible to admin users
  - Shows access denied message for non-admin users

- **Permission Checks** - Integrated throughout the application:
  - Job creation/editing/deletion
  - Data viewing and export
  - Admin panel access

### Database Functions

The migration creates several database functions:

- `user_has_role(user_id, role)` - Check if user has specific role
- `current_user_has_role(role)` - Check if current user has role
- `user_has_permission(user_id, permission, resource)` - Check if user has permission
- `get_user_role(user_id)` - Get user's primary role

## Security Features

1. **Row Level Security (RLS):**
   - Users can only view their own roles
   - Admins can view all roles
   - Only admins can modify roles

2. **Permission-Based Access:**
   - All operations check permissions before execution
   - Frontend and backend validation
   - Graceful error handling

3. **Admin-Only Operations:**
   - Role assignment/removal
   - Permission management
   - User management

## Troubleshooting

### "Access Denied" in Admin Panel

- Ensure you've assigned the admin role to your user account
- Check that the migration script ran successfully
- Verify your user ID matches the one in `user_roles` table

### Can't Assign Roles

- Ensure you're logged in as an admin user
- Check that the `user_roles` table exists and has data
- Verify RLS policies are enabled

### Permission Errors

- Check that the user has the required role assigned
- Verify permissions are defined in `role_permissions` table
- Check database function `user_has_permission` is working

## Next Steps

1. **Run the migration** (`03_add_role_based_access_control.sql`)
2. **Assign admin role** to your user account
3. **Test the admin panel** by logging in
4. **Assign roles** to other users as needed
5. **Customize permissions** if needed (modify `role_permissions` table)

## Support

For issues or questions:
1. Check the SQL migration logs for errors
2. Verify RLS policies are enabled
3. Check browser console for JavaScript errors
4. Review Supabase logs for database errors

