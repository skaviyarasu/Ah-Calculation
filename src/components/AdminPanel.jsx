import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { rbac, auth } from '../lib/supabase';
import UserRegistration from './UserRegistration';
import {
  PERMISSION_MATRIX,
  PERMISSION_COLUMNS,
  ROLE_METADATA,
  PERMISSION_CONFIG_KEYS,
  makePermissionKey
} from '../constants/rolePermissionMatrix';

export default function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [assigningRole, setAssigningRole] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'roles', or 'register'
  const [userStats, setUserStats] = useState({ total: 0, admins: 0, regular: 0 });
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [selectedRoleKey, setSelectedRoleKey] = useState('admin');
  const [rolePermissionsLoading, setRolePermissionsLoading] = useState(false);
  const [permissionBusyKey, setPermissionBusyKey] = useState(null);
  const [expandedPermissionRow, setExpandedPermissionRow] = useState(null);

  const DEFAULT_ROLES = useMemo(() => ['admin', 'creator', 'verifier', 'user'], []);

  const processRolePermissionRows = (rows = []) => {
    const grouped = {};
    rows.forEach((row) => {
      if (!row) return;
      const roleName = row.role || 'user';
      const key = makePermissionKey(row.permission, row.resource);
      if (!grouped[roleName]) grouped[roleName] = {};
      grouped[roleName][key] = row;
    });

    const roleSet = new Set(DEFAULT_ROLES);
    rows.forEach((row) => {
      if (row?.role) roleSet.add(row.role);
    });

    const roleList = Array.from(roleSet).sort((a, b) => a.localeCompare(b));
    const normalised = roleList.reduce((acc, role) => {
      acc[role] = grouped[role] || {};
      return acc;
    }, {});

    setRoles(roleList);
    setRolePermissions(normalised);

    setSelectedRoleKey((prev) => {
      if (prev && roleList.includes(prev)) return prev;
      if (roleList.includes('admin')) return 'admin';
      return roleList[0] || 'admin';
    });
  };

  const refreshRolePermissions = async () => {
    setRolePermissionsLoading(true);
    try {
      const rows = await rbac.getAllRoles();
      processRolePermissionRows(rows);
    } catch (error) {
      console.error('Error loading role permissions:', error);
      alert('Failed to load role permissions: ' + (error.message || 'Unknown error'));
    } finally {
      setRolePermissionsLoading(false);
    }
  };

  const TriStateCheckbox = ({ checked, indeterminate, onChange, disabled, title }) => {
    const checkboxRef = useRef(null);
    useEffect(() => {
      if (checkboxRef.current) {
        checkboxRef.current.indeterminate = indeterminate && !checked;
      }
    }, [indeterminate, checked]);

    return (
      <input
        type="checkbox"
        ref={checkboxRef}
        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        title={title}
      />
    );
  };

  const dedupeEntries = (entries = []) => {
    const map = new Map();
    entries.forEach((entry) => {
      if (!entry?.permission) return;
      const key = makePermissionKey(entry.permission, entry.resource);
      if (!map.has(key)) {
        map.set(key, entry);
      }
    });
    return Array.from(map.values());
  };

  const selectedRolePermissions = rolePermissions[selectedRoleKey] || {};

  const hasEntry = (entry) => {
    if (!entry?.permission) return false;
    return Boolean(selectedRolePermissions[makePermissionKey(entry.permission, entry.resource)]);
  };

  const getFullEntries = (row) => {
    if (!row?.actions) return [];
    if (Array.isArray(row.actions.full) && row.actions.full.length > 0) {
      return row.actions.full;
    }

    const collected = [];
    Object.entries(row.actions).forEach(([key, value]) => {
      if (key === 'full' || !Array.isArray(value)) return;
      value.forEach((entry) => {
        if (!entry?.permission) return;
        if (entry.includeInFull === false) return;
        const entryKey = makePermissionKey(entry.permission, entry.resource);
        if (!collected.find((item) => makePermissionKey(item.permission, item.resource) === entryKey)) {
          collected.push(entry);
        }
      });
    });
    return collected;
  };

  const getEntriesForColumn = (row, columnKey) => {
    if (!row?.actions) return [];
    if (columnKey === 'full') {
      return getFullEntries(row);
    }
    const value = row.actions[columnKey];
    if (!Array.isArray(value)) return [];
    return value;
  };

  const makeBusyKey = (entries = [], enable) => {
    const keys = entries.map((entry) => makePermissionKey(entry.permission, entry.resource)).join('|');
    return `${selectedRoleKey}:${enable ? 'grant' : 'revoke'}:${keys}`;
  };

  const handlePermissionUpdate = async (entries = [], enable) => {
    const deduped = dedupeEntries(entries);
    if (!deduped.length) return;
    const busyKey = makeBusyKey(deduped, enable);
    setPermissionBusyKey(busyKey);
    try {
      if (enable) {
        await Promise.all(
          deduped.map((entry) =>
            rbac.grantRolePermission(selectedRoleKey, entry.permission, entry.resource, entry.description)
          )
        );
      } else {
        await Promise.all(
          deduped.map((entry) => rbac.revokeRolePermission(selectedRoleKey, entry.permission, entry.resource))
        );
      }
      await refreshRolePermissions();
    } catch (error) {
      console.error('Error updating permissions:', error);
      alert('Failed to update permissions: ' + (error.message || 'Unknown error'));
    } finally {
      setPermissionBusyKey(null);
    }
  };

  const permissionBusy = Boolean(permissionBusyKey);

  const isColumnChecked = (row, columnKey) => {
    const entries = getEntriesForColumn(row, columnKey);
    if (!entries.length) return false;
    return entries.every((entry) => hasEntry(entry));
  };

  const isColumnIndeterminate = (row, columnKey) => {
    const entries = getEntriesForColumn(row, columnKey);
    if (!entries.length) return false;
    const someEnabled = entries.some((entry) => hasEntry(entry));
    return someEnabled && !isColumnChecked(row, columnKey);
  };

  const activeCountForEntries = (entries = []) => entries.filter((entry) => hasEntry(entry)).length;

  const unmappedPermissions = useMemo(() => {
    const entries = Object.values(selectedRolePermissions || {});
    return entries.filter(
      (entry) => !PERMISSION_CONFIG_KEYS.has(makePermissionKey(entry.permission, entry.resource))
    );
  }, [selectedRolePermissions]);

  const selectedRoleMeta = ROLE_METADATA[selectedRoleKey] || {
    label: selectedRoleKey,
    description: 'Configure module-level permissions for this role.'
  };

  useEffect(() => {
    checkAdminAccess();
    loadData();
  }, []);

  // Debug: Log active tab
  useEffect(() => {
    console.log('AdminPanel active tab:', activeTab);
  }, [activeTab]);

  useEffect(() => {
    setExpandedPermissionRow(null);
  }, [selectedRoleKey]);

  async function checkAdminAccess() {
    try {
      const user = await auth.getCurrentUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      const admin = await rbac.isAdmin(user.id);
      setIsAdmin(admin);
      setLoading(false);
    } catch (error) {
      console.error('Error checking admin access:', error);
      setIsAdmin(false);
      setLoading(false);
    }
  }

  async function loadData() {
    try {
      setRolePermissionsLoading(true);

      const [usersData, rolePermissionRows] = await Promise.all([
        rbac.getAllUsersWithRoles(),
        rbac.getAllRoles()
      ]);

      setUsers(usersData);
      setExpandedUserId(null);
      processRolePermissionRows(rolePermissionRows);

      const totalUsers = usersData.length;
      const admins = usersData.filter(user => user.roles.includes('admin')).length;
      const regular = Math.max(totalUsers - admins, 0);

      setUserStats({
        total: totalUsers,
        admins,
        regular
      });
    } catch (error) {
      console.error('Error loading admin data:', error);
      alert('Failed to load admin data: ' + (error.message || 'Unknown error'));
    } finally {
      setRolePermissionsLoading(false);
    }
  }

  async function handleAssignRole(userId, role) {
    // Special validation for admin role assignment
    if (role === 'admin') {
      // Count existing admins
      const adminCount = users.filter(u => u.roles.includes('admin')).length;
      
      // Warn about admin privileges
      const adminWarning = `⚠️ WARNING: Admin Role Assignment\n\n` +
        `Admin users have full system access including:\n` +
        `- View and edit all user data\n` +
        `- Manage all user roles\n` +
        `- Bypass all workflow restrictions\n` +
        `- Delete any job\n\n` +
        `Current admin count: ${adminCount}\n\n` +
        `Admin access should be limited to trusted personnel only.\n\n` +
        `Are you absolutely sure you want to assign admin role to this user?`;
      
      if (!confirm(adminWarning)) return;
      
      // Double confirmation for admin
      if (!confirm('This is a FINAL confirmation. Assign admin role?')) return;
    } else {
      // Standard confirmation for other roles
      if (!confirm(`Assign role "${role}" to this user?`)) return;
    }

    setAssigningRole(true);
    try {
      const user = await auth.getCurrentUser();
      await rbac.assignRole(userId, role, user.id);
      alert(`Role "${role}" assigned successfully!`);
      await loadData();
    } catch (error) {
      console.error('Error assigning role:', error);
      alert('Failed to assign role: ' + (error.message || 'Unknown error'));
    }
    setAssigningRole(false);
  }

  async function handleRemoveRole(userId, role) {
    if (!confirm(`Remove role "${role}" from this user?`)) return;

    try {
      await rbac.removeRole(userId, role);
      alert('Role removed successfully!');
      await loadData();
    } catch (error) {
      console.error('Error removing role:', error);
      alert('Failed to remove role: ' + (error.message || 'Unknown error'));
    }
  }

  // Calculate unique users from roles data
  // Filter users based on search query
  const filteredUsers = React.useMemo(() => {
    if (!searchQuery.trim()) return users;

    const query = searchQuery.toLowerCase().trim();
    return users.filter(user => 
      (user.full_name && user.full_name.toLowerCase().includes(query)) ||
      (user.email && user.email.toLowerCase().includes(query)) ||
      (user.id && user.id.toLowerCase().includes(query)) ||
      user.roles.some(role => role.toLowerCase().includes(query))
    );
  }, [users, searchQuery]);

  const usersSortedByName = React.useMemo(() => {
    return [...users].sort((a, b) => {
      const aLabel = (a.full_name || a.email || a.id || '').toLowerCase();
      const bLabel = (b.full_name || b.email || b.id || '').toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [users]);

  const formatDateTime = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
  };

  const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border border-red-200">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You do not have admin privileges to access this panel.</p>
          <p className="text-sm text-gray-500">Only administrators can manage user roles and permissions.</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg p-6 space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
              <p className="text-gray-600 mt-1">User & Role Management System</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">
                Admin
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'users'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              User Management
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'register'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Register User
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'roles'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Role Permissions
            </button>
          </div>

          {/* User Registration Tab */}
          {activeTab === 'register' && (
            <div className="space-y-6 mt-6">
              <UserRegistration onUserCreated={loadData} />
            </div>
          )}

          {/* User Management Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b">
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900">All Users</h2>
                    <p className="text-sm text-gray-500">Manage user roles and account access.</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full font-medium">
                      Users: {filteredUsers.length} / {userStats.total}
                    </span>
                    <button
                      onClick={() => setActiveTab('register')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors"
                    >
                      Invite User
                    </button>
                    <button
                      onClick={loadData}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="px-6 py-4 border-b bg-gray-50">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Users</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by user ID or role"
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        🔍
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 hidden sm:block">Tip: paste a Supabase user UUID to locate quickly.</span>
                  </div>
                </div>

                {/* Table Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
                  <div className="col-span-5">User Details</div>
                  <div className="col-span-3">Last Sign-In</div>
                  <div className="col-span-2">Roles</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {/* Users */}
                {filteredUsers.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">
                    {searchQuery ? 'No users found matching your search.' : 'No users found yet. Invite a user to get started.'}
                  </p>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredUsers.map((user) => {
                      const displayName = user.full_name?.trim() || (user.email ? user.email.split('@')[0] : 'Unnamed User');
                      const displayEmail = user.email || 'Email not available';
                      const initials = user.full_name
                        ? user.full_name.split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()
                        : (user.email ? user.email.slice(0, 2).toUpperCase() : 'US');
                      const truncatedId = user.id ? `${user.id.substring(0, 8)}...${user.id.substring(user.id.length - 4)}` : '';
                      const isActive = !!user.last_sign_in_at;
                      const statusLabel = isActive ? 'Active' : 'Inactive';
                      const lastSignInLabel = formatDateTime(user.last_sign_in_at) || 'Never signed in';
                      const createdLabel = formatDate(user.created_at);
                      return (
                        <div key={user.id} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                            <div className="md:col-span-5 flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-lg">
                                {initials}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">{displayName}</span>
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-600">{displayEmail}</div>
                                {truncatedId && <div className="text-xs font-mono text-gray-400 mt-1">{truncatedId}</div>}
                                <div className="mt-2 text-xs text-gray-500 md:hidden">
                                  Last sign-in: {lastSignInLabel}
                                </div>
                                {createdLabel && (
                                  <div className="text-xs text-gray-400 mt-1 md:hidden">
                                    Account created {createdLabel}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="md:col-span-3">
                              <div className="text-sm text-gray-700">{lastSignInLabel}</div>
                              <div className="mt-1 text-xs text-gray-400">
                                {createdLabel ? `Account created ${createdLabel}` : 'Creation date unavailable'}
                              </div>
                            </div>

                            <div className="md:col-span-2 flex flex-wrap gap-2">
                              {user.roles.length > 0 ? (
                                user.roles.map((role) => (
                                  <span
                                    key={role}
                                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                                      role === 'admin'
                                        ? 'bg-red-100 text-red-700 border border-red-200'
                                        : role === 'creator'
                                        ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                        : role === 'verifier'
                                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                                    }`}
                                  >
                                    {role.toUpperCase()}
                                  </span>
                                ))
                              ) : (
                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                  STANDARD USER
                                </span>
                              )}
                            </div>

                            <div className="md:col-span-3 flex md:justify-end">
                              <button
                                onClick={() => setExpandedUserId(prev => (prev === user.id ? null : user.id))}
                                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                <span className="hidden sm:inline">Manage</span>
                                <span role="img" aria-label="settings">⚙️</span>
                              </button>
                            </div>
                          </div>

                          {expandedUserId === user.id && (
                            <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <span className="text-sm font-semibold text-blue-800">Assign Roles</span>
                                <span className="text-xs text-blue-500">(Current: {user.roles.length > 0 ? user.roles.join(', ') : 'None'})</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleAssignRole(user.id, 'admin')}
                                  disabled={user.roles.includes('admin') || assigningRole}
                                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-semibold"
                                  title="⚠️ Admin role grants full system access"
                                >
                                  {user.roles.includes('admin') ? 'Admin Assigned' : 'Assign Admin'}
                                </button>
                                <button
                                  onClick={() => handleAssignRole(user.id, 'creator')}
                                  disabled={user.roles.includes('creator') || assigningRole}
                                  className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                  {user.roles.includes('creator') ? 'Creator Assigned' : 'Assign Creator'}
                                </button>
                                <button
                                  onClick={() => handleAssignRole(user.id, 'verifier')}
                                  disabled={user.roles.includes('verifier') || assigningRole}
                                  className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                  {user.roles.includes('verifier') ? 'Verifier Assigned' : 'Assign Verifier'}
                                </button>
                                <button
                                  onClick={() => handleAssignRole(user.id, 'user')}
                                  disabled={user.roles.includes('user') || assigningRole}
                                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                  {user.roles.includes('user') ? 'User Assigned' : 'Assign Standard'}
                                </button>
                              </div>

                              {(user.roles.includes('admin') || user.roles.includes('creator') || user.roles.includes('verifier') || user.roles.includes('user')) && (
                                <div className="pt-2 border-t border-blue-100">
                                  <span className="text-xs font-semibold text-blue-800">Remove Roles</span>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {user.roles.includes('admin') && (
                                      <button
                                        onClick={() => handleRemoveRole(user.id, 'admin')}
                                        disabled={assigningRole}
                                        className="px-2.5 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
                                      >
                                        Remove Admin
                                      </button>
                                    )}
                                    {user.roles.includes('creator') && (
                                      <button
                                        onClick={() => handleRemoveRole(user.id, 'creator')}
                                        disabled={assigningRole}
                                        className="px-2.5 py-1 text-xs bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
                                      >
                                        Remove Creator
                                      </button>
                                    )}
                                    {user.roles.includes('verifier') && (
                                      <button
                                        onClick={() => handleRemoveRole(user.id, 'verifier')}
                                        disabled={assigningRole}
                                        className="px-2.5 py-1 text-xs bg-orange-100 text-orange-700 rounded-md hover:bg-orange-200 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
                                      >
                                        Remove Verifier
                                      </button>
                                    )}
                                    {user.roles.includes('user') && (
                                      <button
                                        onClick={() => handleRemoveRole(user.id, 'user')}
                                        disabled={assigningRole}
                                        className="px-2.5 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
                                      >
                                        Remove Standard
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Assign Role to New User */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-blue-800 mb-3">Assign Role to New User</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select User
                    </label>
                    <select
                      value={selectedUser || ''}
                      onChange={(e) => setSelectedUser(e.target.value || null)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="">Choose a user…</option>
                      {usersSortedByName.map((user) => (
                        <option key={user.id} value={user.id}>
                          {(user.full_name?.trim() || 'Unnamed User')}{' '}
                          {user.email ? `• ${user.email}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                      Tip: Register a new user in the “Register User” tab, click Refresh, and they will appear in this list.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                      <p className="text-xs text-red-800 font-medium mb-1">⚠️ Admin Role Restrictions:</p>
                      <p className="text-xs text-red-700">
                        Admin access is restricted. Only assign to trusted personnel. Double confirmation required.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => selectedUser && handleAssignRole(selectedUser, 'admin')}
                        disabled={!selectedUser || assigningRole}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold border-2 border-red-800"
                        title="⚠️ RESTRICTED: Admin role grants full system access"
                      >
                        {assigningRole ? 'Assigning...' : '⚠️ Assign Admin Role'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <p className="text-xs text-gray-600 w-full mb-1">Standard Roles (can be combined):</p>
                      <button
                        onClick={() => selectedUser && handleAssignRole(selectedUser, 'creator')}
                        disabled={!selectedUser || assigningRole}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {assigningRole ? 'Assigning...' : 'Assign Creator Role'}
                      </button>
                      <button
                        onClick={() => selectedUser && handleAssignRole(selectedUser, 'verifier')}
                        disabled={!selectedUser || assigningRole}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {assigningRole ? 'Assigning...' : 'Assign Verifier Role'}
                      </button>
                      <button
                        onClick={() => selectedUser && handleAssignRole(selectedUser, 'user')}
                        disabled={!selectedUser || assigningRole}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {assigningRole ? 'Assigning...' : 'Assign Standard User Role'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Tip: Users can have multiple roles (e.g., Creator + Verifier). Admin role is restricted and should be limited.
                    </p>
                  </div>
                  <p className="text-xs text-gray-600">
                    💡 Tip: Need a new account? Use “Invite User” above, then refresh this view to assign roles.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Role Permissions Tab */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role Name</label>
                    <select
                      value={selectedRoleKey}
                      onChange={(e) => setSelectedRoleKey(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_METADATA[role]?.label || role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      value={selectedRoleMeta.description || ''}
                      readOnly
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700"
                    />
                    <p className="text-xs text-gray-500 mt-2">Descriptions help administrators understand the intended scope for each role.</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div className="text-gray-600">
                    Configure module, page, and functional access for <span className="font-semibold text-gray-800">{selectedRoleMeta.label || selectedRoleKey}</span>.
                  </div>
                  <button
                    onClick={refreshRolePermissions}
                    disabled={rolePermissionsLoading}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Refresh Permissions
                  </button>
                </div>

                {rolePermissionsLoading ? (
                  <div className="py-12 text-center text-sm text-gray-500">Loading permissions…</div>
                ) : (
                  <div className="space-y-6">
                    {PERMISSION_MATRIX.map((module) => (
                      <div key={module.module} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-100 px-4 py-3 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-700">{module.module}</h3>
                            {module.description && <p className="text-xs text-gray-500 mt-1">{module.description}</p>}
                          </div>
                          <div className="text-xs text-gray-500">{module.rows.length} sections</div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Particulars</th>
                                {PERMISSION_COLUMNS.map((column) => (
                                  <th
                                    key={`${module.module}-${column.key}`}
                                    className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center"
                                  >
                                    {column.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                              {module.rows.map((row) => {
                                const rowKey = `${module.module}-${row.key}`;
                                const othersEntries = getEntriesForColumn(row, 'others');
                                const othersActive = activeCountForEntries(othersEntries);
                                const isRowExpanded = expandedPermissionRow === rowKey;

                                return (
                                  <React.Fragment key={rowKey}>
                                    <tr>
                                      <td className="px-4 py-3 font-medium text-gray-800">{row.label}</td>
                                      {PERMISSION_COLUMNS.map((column) => {
                                        const entries = getEntriesForColumn(row, column.key);
                                        const disabled = !entries.length || permissionBusy || rolePermissionsLoading;

                                        if (column.key === 'others') {
                                          return (
                                            <td key={`${rowKey}-${column.key}`} className="px-3 py-3 text-center">
                                              {entries.length === 0 ? (
                                                <span className="text-gray-300">—</span>
                                              ) : (
                                                <button
                                                  onClick={() => setExpandedPermissionRow(isRowExpanded ? null : rowKey)}
                                                  className={`text-xs font-medium underline ${othersActive ? 'text-blue-600' : 'text-gray-600'} hover:text-blue-700`}
                                                >
                                                  {othersActive > 0 ? `${othersActive}/${entries.length} selected` : 'More Permissions'}
                                                </button>
                                              )}
                                            </td>
                                          );
                                        }

                                        if (entries.length === 0) {
                                          return (
                                            <td key={`${rowKey}-${column.key}`} className="px-3 py-3 text-center text-gray-300">—</td>
                                          );
                                        }

                                        const checked = isColumnChecked(row, column.key);
                                        const indeterminate = isColumnIndeterminate(row, column.key);
                                        const title = entries.map((entry) => entry.label || entry.permission).join(', ');

                                        return (
                                          <td key={`${rowKey}-${column.key}`} className="px-3 py-3 text-center">
                                            <TriStateCheckbox
                                              checked={checked}
                                              indeterminate={indeterminate}
                                              onChange={(e) => handlePermissionUpdate(entries, e.target.checked)}
                                              disabled={disabled}
                                              title={title}
                                            />
                                          </td>
                                        );
                                      })}
                                    </tr>

                                    {isRowExpanded && othersEntries.length > 0 && (
                                      <tr className="bg-blue-50/80">
                                        <td colSpan={PERMISSION_COLUMNS.length + 1} className="px-6 py-4">
                                          <div className="space-y-3">
                                            <div className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Additional Permissions</div>
                                            <div className="space-y-3">
                                              {othersEntries.map((entry) => {
                                                const entryKey = makePermissionKey(entry.permission, entry.resource);
                                                const entryChecked = hasEntry(entry);
                                                return (
                                                  <label key={entryKey} className="flex items-start gap-3">
                                                    <input
                                                      type="checkbox"
                                                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                      checked={entryChecked}
                                                      onChange={(e) => handlePermissionUpdate([entry], e.target.checked)}
                                                      disabled={permissionBusy || rolePermissionsLoading}
                                                    />
                                                    <div>
                                                      <div className="text-sm font-medium text-gray-800">{entry.label || entry.permission}</div>
                                                      <div className="text-xs text-gray-500 mt-1">
                                                        {entry.description || 'No description provided.'}
                                                        {entry.resource && <span className="ml-1 text-[11px] uppercase text-gray-400">({entry.resource})</span>}
                                                      </div>
                                                    </div>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {unmappedPermissions.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="text-yellow-500 mt-1">⚠️</div>
                      <div>
                        <h4 className="text-sm font-semibold text-yellow-800">Unmapped Permissions</h4>
                        <p className="text-xs text-yellow-700 mt-1">
                          These permissions exist for this role but are not linked to the matrix above. You can remove them or keep them for advanced scenarios.
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {unmappedPermissions.map((entry) => {
                        const entryKey = makePermissionKey(entry.permission, entry.resource);
                        return (
                          <li key={entryKey} className="flex items-start justify-between gap-3 bg-white border border-yellow-100 rounded-md p-3">
                            <div>
                              <div className="font-semibold text-gray-800">{entry.permission}</div>
                              {entry.resource && <div className="text-xs text-gray-500">Resource: {entry.resource}</div>}
                              {entry.description && <div className="text-xs text-gray-500 mt-1">{entry.description}</div>}
                            </div>
                            <button
                              onClick={() => handlePermissionUpdate([entry], false)}
                              className="text-xs text-red-600 hover:text-red-700"
                              disabled={permissionBusy || rolePermissionsLoading}
                            >
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
            <div className="text-center bg-gray-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-gray-800">{userStats.total}</div>
              <div className="text-sm text-gray-600 mt-1">Total Users</div>
            </div>
            <div className="text-center bg-red-50 rounded-lg p-4 border-2 border-red-200">
              <div className="text-3xl font-bold text-red-600">{userStats.admins}</div>
              <div className="text-sm text-gray-600 mt-1">Admins</div>
              <div className="text-xs text-red-600 mt-1 font-medium">⚠️ Restricted</div>
            </div>
            <div className="text-center bg-purple-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-purple-600">
                {users.filter(u => u.roles.includes('creator')).length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Creators</div>
            </div>
            <div className="text-center bg-orange-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-orange-600">
                {users.filter(u => u.roles.includes('verifier')).length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Verifiers</div>
            </div>
            <div className="text-center bg-blue-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-blue-600">
                {users.filter(u => u.roles.includes('user') || u.roles.length === 0).length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Standard Users</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

